<?php

namespace App\Controller\Api;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Doctrine\DBAL\Connection;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\JsonResponse;

final class AirbnbPayoutReconController extends AbstractController
{
    #[Route('/api/payouts/recon-reservations', name: 'api_payouts_recon_reservations', methods: ['GET'])]
    public function reconReservations(Request $request, Connection $db): JsonResponse
    {
        $from = $request->query->get('from'); // YYYY-MM-DD optional
        $to   = $request->query->get('to');   // YYYY-MM-DD optional

        $preDays   = (int) ($request->query->get('pre') ?? 5);
        // By default, include the previous and following month worth of Sent items
        $itemsPre  = (int) ($request->query->get('items_pre') ?? 31);
        $itemsPost = (int) ($request->query->get('items_post') ?? 31);
        $sentOffset = (int) ($request->query->get('sent_offset') ?? 9);
        if ($preDays < 0)   { $preDays = 0; }
        if ($itemsPre < 0)  { $itemsPre = 0; }
        if ($itemsPost < 0) { $itemsPost = 0; }
        if ($sentOffset < 0){ $sentOffset = 0; }

        $params = [];
        if ($from !== null) $params['from'] = $from;
        if ($to !== null) $params['to'] = $to;


        $sql = <<<SQL
WITH bookings AS (
  SELECT
    b.id,
    b.confirmation_code,
    b.check_in,
    b.check_out,
    b.status,
    b.payout,
    b.is_paid,
    b.unit_id
  FROM all_bookings b
  WHERE b.source = 'Airbnb'
    AND COALESCE(b.is_paid, 0) = 0
    AND EXISTS (
      SELECT 1
      FROM unit u
      WHERE u.id = b.unit_id
        AND (u.payment_type IS NULL OR UPPER(u.payment_type) <> 'CLIENT')
    )
    /* Grace window around selected month for check_in */
    AND (
      (:from IS NULL AND :to IS NULL)
      OR (:from IS NOT NULL AND :to IS NOT NULL AND b.check_in BETWEEN DATE_SUB(:from, INTERVAL {$preDays} DAY) AND :to)
      OR (:from IS NOT NULL AND :to IS NULL AND b.check_in >= DATE_SUB(:from, INTERVAL {$preDays} DAY))
      OR (:from IS NULL AND :to IS NOT NULL AND b.check_in <= :to)
    )
    AND (b.status IS NULL OR UPPER(b.status) NOT IN ('CANCELLED','CANCELED'))
),
items AS (
  SELECT
    LOWER(i.confirmation_code) AS cc,
    SUM(CASE WHEN LOWER(i.line_type) = 'reservation' THEN i.amount ELSE 0 END)        AS reservation_amount,
    SUM(CASE WHEN LOWER(i.line_type) = 'host remitted tax' THEN i.amount ELSE 0 END)  AS host_tax_amount,
    SUM(CASE WHEN LOWER(i.line_type) = 'adjustment' THEN i.amount ELSE 0 END)         AS adj_amount,
    SUM(CASE WHEN LOWER(i.line_type) = 'adjustment' THEN COALESCE(i.service_fee, 0) ELSE 0 END) AS service_fee_amount,
    MAX(i.start_date)                            AS start_date,
    MAX(i.end_date)                              AS end_date,
    MAX(i.currency)                              AS currency
  FROM airbnb_payout_item i
  INNER JOIN airbnb_payout p ON p.id = i.payout_id
  WHERE LOWER(i.confirmation_code) IN (SELECT LOWER(b.confirmation_code) FROM bookings b)
    AND (
      (:from IS NULL AND :to IS NULL)
      OR (
        :from IS NOT NULL AND :to IS NOT NULL AND
        COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY))
          BETWEEN DATE_SUB(:from, INTERVAL {$itemsPre} DAY)
              AND DATE_ADD(:to,   INTERVAL {$itemsPost} DAY)
      )
      OR (
        :from IS NOT NULL AND :to IS NULL AND
        COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY))
          >= DATE_SUB(:from, INTERVAL {$itemsPre} DAY)
      )
      OR (
        :from IS NULL AND :to IS NOT NULL AND
        COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY))
          <= DATE_ADD(:to, INTERVAL {$itemsPost} DAY)
      )
    )
  GROUP BY LOWER(i.confirmation_code)
)
SELECT
  b.id                                                   AS booking_id,
  b.confirmation_code                                   AS booking_confirmation,
  b.confirmation_code                                   AS confirmationCode,
  COALESCE(u.unit_name, u.listing_name)                  AS unitName,
  x.start_date                                           AS startDate,
  x.end_date                                             AS endDate,
  (COALESCE(x.reservation_amount,0) + COALESCE(x.host_tax_amount,0) + COALESCE(x.adj_amount,0) + COALESCE(x.service_fee_amount,0)) AS payoutReport,
  COALESCE(x.adj_amount, 0)                              AS adjAmount,
  b.status                                               AS status,
  b.check_in                                             AS checkIn,
  b.check_out                                            AS checkOut,
  b.payout                                               AS payoutSystem,
  x.currency                                             AS currency,
  b.is_paid                                              AS is_paid
FROM bookings b
LEFT JOIN items x ON LOWER(b.confirmation_code) = x.cc
LEFT JOIN unit u   ON u.id = b.unit_id
ORDER BY b.check_in, b.confirmation_code
SQL;

        $rows = $db->fetchAllAssociative($sql, $params);

        // Auto-flip matched reservations to paid (is_paid = 1)
        // Criteria: confirmation code present in all_bookings, start & end dates match, and payout difference within tolerance (≤ 1.00)
        $MONEY_TOLERANCE = 1.00;
        $db->beginTransaction();
        try {
            foreach ($rows as $r) {
                $ccBase   = $r['confirmationcode'] ?? $r['confirmationCode'] ?? $r['booking_confirmation'] ?? null; // from base
                $ccBook   = $r['booking_confirmation'] ?? null; // presence indicates a joined all_bookings row
                $startRep = $r['startdate'] ?? $r['startDate'] ?? null;
                $endRep   = $r['enddate'] ?? $r['endDate'] ?? null;
                $startSys = $r['checkin'] ?? $r['checkIn'] ?? null;
                $endSys   = $r['checkout'] ?? $r['checkOut'] ?? null;
                $repAmt   = $r['payoutReport'] ?? null;
                $sysAmt   = $r['payoutsystem'] ?? $r['payoutSystem'] ?? null;

                if (!$ccBase || !$ccBook) { continue; } // only flip when booking exists
                if (!$startRep || !$endRep || !$startSys || !$endSys) { continue; }
                // Require exact date match (string compare is fine as dates come normalized from SQL)
                if ((string)$startRep !== (string)$startSys) { continue; }
                if ((string)$endRep   !== (string)$endSys)   { continue; }

                // Amounts must be numeric and within tolerance
                if ($repAmt === null || $sysAmt === null) { continue; }
                $diff = (float)$repAmt - (float)$sysAmt;
                if (abs($diff) > $MONEY_TOLERANCE) { continue; }

                // Flip is_paid to 1 only if currently null/0
                $ccParam = strtolower((string)$ccBase);
                $db->executeStatement(
                    'UPDATE all_bookings SET is_paid = 1 WHERE LOWER(confirmation_code) = :cc AND (is_paid IS NULL OR is_paid = 0)',
                    ['cc' => $ccParam]
                );
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            // We do not fail the response if the flip fails; we proceed to return the data.
        }

        // Normalize null numeric fields to string decimals where appropriate
        $data = array_map(function(array $r) {
            // ensure numeric strings for consistency with other endpoints
            foreach (['payoutReport','adjAmount'] as $k) {
                if (array_key_exists($k, $r)) {
                    if ($r[$k] === null) $r[$k] = '0.00';
                    else $r[$k] = number_format((float)$r[$k], 2, '.', '');
                }
            }
            return [
                'confirmationCode' => $r['confirmationcode'] ?? $r['confirmationCode'] ?? $r['booking_confirmation'] ?? null,
                'unitName'         => $r['unitname'] ?? $r['unitName'] ?? null,
                'bookingId'        => $r['booking_id'] ?? null,
                'startDate'        => $r['startdate'] ?? $r['startDate'] ?? null,
                'endDate'          => $r['enddate'] ?? $r['endDate'] ?? null,
                'payoutReport'     => $r['payoutReport'],
                'adjAmount'        => $r['adjAmount'],
                'status'           => $r['status'] ?? null,
                'checkIn'          => $r['checkin'] ?? $r['checkIn'] ?? null,
                'checkOut'         => $r['checkout'] ?? $r['checkOut'] ?? null,
                'payoutSystem'     => $r['payoutsystem'] ?? $r['payoutSystem'] ?? null,
                'currency'         => $r['currency'] ?? null,
                'isPaid'           => isset($r['is_paid']) ? (bool)$r['is_paid'] : false,
            ];
        }, $rows);

        $meta = [
            'from' => $from,
            'to' => $to,
            'pre' => $preDays,
            'itemsPre' => $itemsPre,
            'itemsPost' => $itemsPost,
            'sentOffset' => $sentOffset,
        ];
        return $this->json(['success' => true, 'count' => count($data), 'data' => $data, 'meta' => $meta]);
    }

    #[Route('/api/payouts/recon-banks', name: 'api_payouts_recon_banks', methods: ['GET'])]
    public function reconBanks(Request $request, Connection $db): JsonResponse
    {
        $from = $request->query->get('from'); // YYYY-MM-DD optional
        $to   = $request->query->get('to');   // YYYY-MM-DD optional

        $includeChecked = (bool) ($request->query->get('includeChecked') ?? true);

        // Matching window around Arrives date (defaults broadened): pre = 14 days before, post = 10 days after
        $preDays  = (int) ($request->query->get('pre')  ?? 14);
        $postDays = (int) ($request->query->get('post') ?? 10);
        $sentOffset = (int) ($request->query->get('sent_offset') ?? 9);
        if ($preDays < 0)  { $preDays = 0; }
        if ($postDays < 0) { $postDays = 0; }
        if ($sentOffset < 0) { $sentOffset = 0; }

        $params = [];
        $where = [];
        if ($from) { $where[] = 'COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL ' . $sentOffset . ' DAY)) >= :from'; $params['from'] = $from; }
        if ($to)   { $where[] = 'COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL ' . $sentOffset . ' DAY)) <= :to';   $params['to']   = $to; }
        if (!$includeChecked) {
            $where[] = 'p.recon_checked_at IS NULL';
        }
        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        // We compute a normalized method from the Details field and look for a best match
        // in accountant_entry within a ± window around arriving_by (fallback payout_date).
        // We allow ≤ 1.00 amount difference and pick the closest by amount then by date.
        $sql = <<<SQL
SELECT
  p.id,
  p.reference_code           AS referenceCode,
  p.payout_date              AS payoutDate,
  p.arriving_by              AS arrivingBy,
  COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)) AS sentDate,
  p.amount                   AS amount,
  p.currency                 AS currency,
  p.payout_method            AS payoutMethodRaw,
  (p.recon_checked_at IS NOT NULL)          AS isChecked,
  p.recon_checked_at                      AS reconCheckedAt,
  DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY) AS windowFrom,
  DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY) AS windowTo,
  /* Normalize method */
  CASE
    WHEN p.payout_method LIKE '%Sasanero Coordinadora de Servicios%' THEN 'Espiral'
    WHEN p.payout_method LIKE '%Transfer to ANTONIO PEDRO%' THEN 'Santander'
    WHEN p.payout_method LIKE '%Santander%' THEN 'Santander'
    WHEN p.payout_method LIKE '%Espiral%' THEN 'Espiral'
    ELSE NULL
  END                        AS methodNormalized,
  /* Suggested match (id), using accountant_entry for Espiral and santander_entry for Santander */
  CASE
    WHEN p.payout_method LIKE '%Sasanero Coordinadora de Servicios%' OR p.payout_method LIKE '%Espiral%' THEN (
      SELECT ae.id
      FROM accountant_entry ae
      WHERE ae.deposito > 0
        AND ae.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                            AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
        AND ABS(ae.deposito - p.amount) <= 1.00
      ORDER BY ABS(ae.deposito - p.amount) ASC,
               ABS(DATEDIFF(ae.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
      LIMIT 1
    )
    WHEN p.payout_method LIKE '%Transfer to ANTONIO PEDRO%' OR p.payout_method LIKE '%Santander%' THEN (
      SELECT se.id
      FROM santander_entry se
      WHERE se.deposito > 0
        AND se.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                            AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
        AND ABS(se.deposito - p.amount) <= 1.00
      ORDER BY ABS(se.deposito - p.amount) ASC,
               ABS(DATEDIFF(se.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
      LIMIT 1
    )
    ELSE NULL
  END                          AS bestEntryId,
  /* Pull selected fields from the best match via correlated subselects, per method */
  CASE
    WHEN p.payout_method LIKE '%Sasanero Coordinadora de Servicios%' OR p.payout_method LIKE '%Espiral%' THEN (
      SELECT ae.fecha_on FROM accountant_entry ae WHERE ae.id = (
        SELECT ae2.id
        FROM accountant_entry ae2
        WHERE ae2.deposito > 0
          AND ae2.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                                  AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
          AND ABS(ae2.deposito - p.amount) <= 1.00
        ORDER BY ABS(ae2.deposito - p.amount) ASC,
                 ABS(DATEDIFF(ae2.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
        LIMIT 1
      )
    )
    WHEN p.payout_method LIKE '%Transfer to ANTONIO PEDRO%' OR p.payout_method LIKE '%Santander%' THEN (
      SELECT se.fecha_on FROM santander_entry se WHERE se.id = (
        SELECT se2.id
        FROM santander_entry se2
        WHERE se2.deposito > 0
          AND se2.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                                  AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
          AND ABS(se2.deposito - p.amount) <= 1.00
        ORDER BY ABS(se2.deposito - p.amount) ASC,
                 ABS(DATEDIFF(se2.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
        LIMIT 1
      )
    )
    ELSE NULL
  END                          AS bestFechaOn,
  CASE
    WHEN p.payout_method LIKE '%Sasanero Coordinadora de Servicios%' OR p.payout_method LIKE '%Espiral%' THEN (
      SELECT ae.concepto FROM accountant_entry ae WHERE ae.id = (
        SELECT ae2.id
        FROM accountant_entry ae2
        WHERE ae2.deposito > 0
          AND ae2.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                                  AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
          AND ABS(ae2.deposito - p.amount) <= 1.00
        ORDER BY ABS(ae2.deposito - p.amount) ASC,
                 ABS(DATEDIFF(ae2.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
        LIMIT 1
      )
    )
    WHEN p.payout_method LIKE '%Transfer to ANTONIO PEDRO%' OR p.payout_method LIKE '%Santander%' THEN (
      SELECT se.concept FROM santander_entry se WHERE se.id = (
        SELECT se2.id
        FROM santander_entry se2
        WHERE se2.deposito > 0
          AND se2.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                                  AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
          AND ABS(se2.deposito - p.amount) <= 1.00
        ORDER BY ABS(se2.deposito - p.amount) ASC,
                 ABS(DATEDIFF(se2.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
        LIMIT 1
      )
    )
    ELSE NULL
  END                          AS bestConcepto,
  CASE
    WHEN p.payout_method LIKE '%Sasanero Coordinadora de Servicios%' OR p.payout_method LIKE '%Espiral%' THEN (
      SELECT ae.deposito FROM accountant_entry ae WHERE ae.id = (
        SELECT ae2.id
        FROM accountant_entry ae2
        WHERE ae2.deposito > 0
          AND ae2.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                                  AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
          AND ABS(ae2.deposito - p.amount) <= 1.00
        ORDER BY ABS(ae2.deposito - p.amount) ASC,
                 ABS(DATEDIFF(ae2.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
        LIMIT 1
      )
    )
    WHEN p.payout_method LIKE '%Transfer to ANTONIO PEDRO%' OR p.payout_method LIKE '%Santander%' THEN (
      SELECT se.deposito FROM santander_entry se WHERE se.id = (
        SELECT se2.id
        FROM santander_entry se2
        WHERE se2.deposito > 0
          AND se2.fecha_on BETWEEN DATE_SUB(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$preDays} DAY)
                                  AND DATE_ADD(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)), INTERVAL {$postDays} DAY)
          AND ABS(se2.deposito - p.amount) <= 1.00
        ORDER BY ABS(se2.deposito - p.amount) ASC,
                 ABS(DATEDIFF(se2.fecha_on, COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL {$sentOffset} DAY)))) ASC
        LIMIT 1
      )
    )
    ELSE NULL
  END                          AS bestDeposito
FROM airbnb_payout p
{$whereSql}
ORDER BY sentDate DESC, p.reference_code DESC
SQL;

        $rows = $db->fetchAllAssociative($sql, $params);

        $data = array_map(function(array $r) {
            // Basic diff and status
            $match = null;
            if ($r['bestDeposito'] !== null) {
                $diff = (float)$r['amount'] - (float)$r['bestDeposito'];
                $match = [
                    'entryId'   => $r['bestEntryId'],
                    'fechaOn'   => $r['bestFechaOn'],
                    'concepto'  => $r['bestConcepto'],
                    'deposito'  => number_format((float)$r['bestDeposito'], 2, '.', ''),
                    'diff'      => number_format((float)$diff, 2, '.', ''),
                    'withinTol' => abs($diff) <= 1.00,
                ];
            }

            return [
                'id'              => (int)$r['id'],
                'referenceCode'   => $r['referenceCode'],
                'payoutDate'      => $r['payoutDate'],
                'arrivingBy'      => $r['arrivingBy'],
                'amount'          => number_format((float)$r['amount'], 2, '.', ''),
                'currency'        => $r['currency'],
                'payoutMethod'    => $r['payoutMethodRaw'],
                'methodNormalized'=> $r['methodNormalized'],
                'isChecked'       => (bool)$r['isChecked'],
                'reconCheckedAt'  => $r['reconCheckedAt'] ?? null,
                'match'           => $match,
                'windowFrom'      => $r['windowFrom'] ?? null,
                'windowTo'        => $r['windowTo']   ?? null,
            ];
        }, $rows);

        return $this->json(['success' => true, 'count' => count($data), 'data' => $data]);
    }

    #[Route('/api/payouts/recon-banks/check', name: 'api_payouts_recon_banks_check', methods: ['POST'])]
    public function checkBankRecon(Request $request, Connection $db): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '{}', true);
        $payoutId = (int)($payload['payoutId'] ?? 0);
        $entryId  = (int)($payload['entryId']  ?? 0);
        if ($payoutId <= 0 || $entryId <= 0) {
            return $this->json(['success' => false, 'error' => 'Missing payoutId or entryId'], 400);
        }

        // Fetch payout & determine method (Espiral vs Santander)
        $payout = $db->fetchAssociative('SELECT id, payout_method FROM airbnb_payout WHERE id = ?', [$payoutId]);
        if (!$payout) {
            return $this->json(['success' => false, 'error' => 'Payout not found'], 404);
        }

        $pm = (string)($payout['payout_method'] ?? '');
        $isEspiral = stripos($pm, 'Sasanero Coordinadora de Servicios') !== false || stripos($pm, 'Espiral') !== false;
        $isSantander = stripos($pm, 'Transfer to ANTONIO PEDRO') !== false || stripos($pm, 'Santander') !== false;

        if (!$isEspiral && !$isSantander) {
            return $this->json(['success' => false, 'error' => 'Only Espiral or Santander payouts can be checked (for now)'], 400);
        }

        // Fetch the corresponding entry depending on the method
        if ($isEspiral) {
            $entry = $db->fetchAssociative('SELECT id, tipo_movimiento FROM accountant_entry WHERE id = ?', [$entryId]);
            if (!$entry) {
                return $this->json(['success' => false, 'error' => 'Accountant entry not found'], 404);
            }
            if (strcasecmp((string)$entry['tipo_movimiento'], 'Abono') !== 0) {
                return $this->json(['success' => false, 'error' => 'Only Abono entries can be checked'], 400);
            }
        } else {
            // Santander: entries live in santander_entry; we only require that they exist
            $entry = $db->fetchAssociative('SELECT id, deposito FROM santander_entry WHERE id = ?', [$entryId]);
            if (!$entry) {
                return $this->json(['success' => false, 'error' => 'Santander entry not found'], 404);
            }
        }

        $userId = null;
        if (method_exists($this, 'getUser') && $this->getUser()) {
            $u = $this->getUser();
            if (is_object($u) && method_exists($u, 'getId')) { $userId = (int)$u->getId(); }
        }

        $db->beginTransaction();
        try {
            $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

            // Always mark the payout as checked and store the linked entry id
            $db->update('airbnb_payout', [
                'recon_checked_at' => $now,
                'recon_checked_by' => $userId,
                'recon_accountant_entry_id' => $entryId,
            ], ['id' => $payoutId]);

            if ($isEspiral) {
                // Espiral: update accountant_entry linkage fields
                $db->update('accountant_entry', [
                    'recon_checked_at' => $now,
                    'recon_checked_by' => $userId,
                    'recon_payout_id'  => $payoutId,
                ], ['id' => $entryId]);
            } elseif ($isSantander) {
                // Santander: mark the santander_entry row as checked
                $db->update('santander_entry', [
                    'checked'    => 1,
                    'updated_at' => $now,
                ], ['id' => $entryId]);
            }

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            return $this->json(['success' => false, 'error' => 'Failed to check payout: '.$e->getMessage()], 500);
        }

        return $this->json(['success' => true]);
    }

    #[Route('/api/payouts/recon-unmatched-abonos', name: 'api_payouts_recon_unmatched_abonos', methods: ['GET'])]
    public function reconUnmatchedAbonos(Request $request, Connection $db): JsonResponse
    {
        $from = $request->query->get('from'); // YYYY-MM-DD optional
        $to   = $request->query->get('to');   // YYYY-MM-DD optional

        // Window around Abono date to look for payout sent dates (mirror of recon-banks)
        $preDays    = (int) ($request->query->get('pre')  ?? 14);
        $postDays   = (int) ($request->query->get('post') ?? 10);
        $sentOffset = (int) ($request->query->get('sent_offset') ?? 9);
        $tol        = (float)($request->query->get('tol') ?? 1.00);
        if ($preDays < 0)    { $preDays = 0; }
        if ($postDays < 0)   { $postDays = 0; }
        if ($sentOffset < 0) { $sentOffset = 0; }
        if ($tol < 0)        { $tol = 0.0; }

        $params = [
            'pre' => $preDays,
            'post' => $postDays,
            'sentOffset' => $sentOffset,
            'tol' => $tol,
        ];

        $where = ['ae.deposito > 0', 'ae.recon_payout_id IS NULL'];
        if ($from) { $where[] = 'ae.fecha_on >= :from'; $params['from'] = $from; }
        if ($to)   { $where[] = 'ae.fecha_on <= :to';   $params['to']   = $to; }
        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        // Build the main query. For each Abono (unmatched), we compute a JSON array of up to 3 payout candidates
        // whose computed Sent date (payout_date or arriving_by - sent_offset) is within [fecha_on - pre, fecha_on + post]
        // and whose amount is within ±tol. We exclude payouts already checked/linked.
        $sql = <<<SQL
SELECT
  ae.id,
  ae.fecha_on                                   AS fechaOn,
  ae.concepto                                   AS concepto,
  ae.deposito                                   AS deposito,
  DATE_SUB(ae.fecha_on, INTERVAL :sentOffset DAY) AS windowSentStart,
  (
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
             'payoutId',     cand.id,
             'reference',    cand.reference_code,
             'sentDate',     DATE_FORMAT(cand.sent_date, '%Y-%m-%d'),
             'arrives',      DATE_FORMAT(cand.arriving_by, '%Y-%m-%d'),
             'amount',       CAST(cand.amount AS CHAR),
             'diff',         CAST(cand.diff AS CHAR)
           ))
    FROM (
      SELECT
        p.id,
        p.reference_code,
        COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL :sentOffset DAY)) AS sent_date,
        p.arriving_by,
        p.amount,
        ABS(p.amount - ae.deposito) AS diff
      FROM airbnb_payout p
      WHERE p.recon_checked_at IS NULL
        AND p.recon_accountant_entry_id IS NULL
        AND ABS(p.amount - ae.deposito) <= :tol
        AND COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL :sentOffset DAY)) BETWEEN DATE_SUB(ae.fecha_on, INTERVAL :pre DAY)
                                                                                          AND     DATE_ADD(ae.fecha_on, INTERVAL :post DAY)
      ORDER BY diff ASC,
               ABS(DATEDIFF(COALESCE(p.payout_date, DATE_SUB(p.arriving_by, INTERVAL :sentOffset DAY)), ae.fecha_on)) ASC
      LIMIT 3
    ) AS cand
  ) AS approxCandidates
FROM accountant_entry ae
{$whereSql}
ORDER BY ae.fecha_on DESC, ae.id DESC
LIMIT 500
SQL;

        $rows = $db->fetchAllAssociative($sql, $params);

        // Normalize/parse JSON and amounts
        $data = array_map(function(array $r) {
            $candidates = $r['approxCandidates'] ?? null;
            if (is_string($candidates)) {
                // MySQL JSON_ARRAYAGG returns a JSON string; decode to array
                $decoded = json_decode($candidates, true);
                if (is_array($decoded)) {
                    $candidates = array_slice($decoded, 0, 3);
                } else {
                    $candidates = [];
                }
            } elseif (!is_array($candidates)) {
                $candidates = [];
            }
            return [
                'id' => (int)$r['id'],
                'fechaOn' => $r['fechaOn'],
                'windowSentStart' => $r['windowSentStart'],
                'concepto' => $r['concepto'],
                'deposito' => number_format((float)$r['deposito'], 2, '.', ''),
                // removed 'currency' => $r['currency'],
                // removed 'methodNormalized'
                'approx' => $candidates,
            ];
        }, $rows);

        $meta = [
            'from' => $from,
            'to' => $to,
            'pre' => $preDays,
            'post' => $postDays,
            'sentOffset' => $sentOffset,
            'tol' => $tol,
        ];

        return $this->json(['success' => true, 'count' => count($data), 'data' => $data, 'meta' => $meta]);
    }
}
