<?php

namespace App\Controller\Api;

use App\Service\AirbnbPayoutImportService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

use Doctrine\ORM\EntityManagerInterface;
use App\Repository\AirbnbPayoutRepository;
use App\Repository\AirbnbPayoutItemRepository;
use App\Entity\Payouts\AirbnbPayout;
use App\Entity\Payouts\AirbnbPayoutItem;
use Doctrine\DBAL\Connection;

class AirbnbPayoutImportController extends AbstractController
{
    public function __construct(private readonly AirbnbPayoutImportService $importService) {}

    #[Route('/api/payouts/import-report', name: 'api_payouts_import_report', methods: ['POST'])]
    public function importReport(Request $request): JsonResponse
    {
        $file = $request->files->get('file');
        if (!$file) {
            return new JsonResponse(['success' => false, 'error' => 'No CSV file uploaded'], 400);
        }

        $path = $file->getPathname();
        try {
            $result = $this->importService->importPayoutReport($path);
            return new JsonResponse(['success' => true, 'result' => $result]);
        } catch (\Throwable $e) {
            return new JsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/payouts/import-transaction-history', name: 'api_payouts_import_transaction_history', methods: ['POST'])]
    public function importTransactionHistory(Request $request): JsonResponse
    {
        $file = $request->files->get('file');
        if (!$file) {
            return new JsonResponse(['success' => false, 'error' => 'No CSV file uploaded'], 400);
        }

        $path = $file->getPathname();
        try {
            $enriched = $this->importService->importTransactionHistory($path);
            return new JsonResponse(['success' => true, 'enriched' => $enriched]);
        } catch (\Throwable $e) {
            return new JsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/payouts', name: 'api_payouts_list', methods: ['GET'])]
    public function listPayouts(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $limit = max(1, min(200, (int) $request->query->get('limit', 50)));
        $offset = max(0, (int) $request->query->get('offset', 0));

        $qb = $em->createQueryBuilder()
            ->select('p AS payout, COUNT(i.id) AS itemsCount')
            ->from(AirbnbPayout::class, 'p')
            ->leftJoin('p.items', 'i')
            ->groupBy('p.id')
            ->orderBy('p.payoutDate', 'DESC')
            ->addOrderBy('p.id', 'DESC')
            ->setFirstResult($offset)
            ->setMaxResults($limit);

        $rows = $qb->getQuery()->getResult();

        $data = array_map(function ($row) {
            /** @var AirbnbPayout $p */
            $p = $row['payout'];
            $itemsCount = (int) $row['itemsCount'];
            return [
                'id' => $p->getId(),
                'referenceCode' => $p->getReferenceCode(),
                'payoutDate' => $p->getPayoutDate()?->format('Y-m-d'),
                'arrivingBy' => $p->getArrivingBy()?->format('Y-m-d'),
                'amount' => $p->getAmount(),
                'currency' => $p->getCurrency(),
                'payoutMethod' => $p->getPayoutMethod(),
                'payoutDestination' => $p->getPayoutDestination(),
                'itemsCount' => $itemsCount,
            ];
        }, $rows);

        return new JsonResponse(['success' => true, 'data' => $data, 'limit' => $limit, 'offset' => $offset]);
    }

    #[Route('/api/payouts/{id}/items', name: 'api_payouts_items', requirements: ['id' => '\\d+'], methods: ['GET'])]
    public function listPayoutItems(int $id, EntityManagerInterface $em, Connection $db): JsonResponse
    {
        $payout = $em->getRepository(AirbnbPayout::class)->find($id);
        if (!$payout) {
            return new JsonResponse(['success' => false, 'error' => 'Payout not found'], 404);
        }

        $sql = <<<SQL
SELECT
  i.id,
  i.line_type        AS lineType,
  i.confirmation_code AS confirmationCode,
  i.listing,
  i.guest_name       AS guestName,
  DATE_FORMAT(i.start_date, '%Y-%m-%d') AS startDate,
  DATE_FORMAT(i.end_date,   '%Y-%m-%d') AS endDate,
  i.nights,
  i.amount,
  i.gross_earnings   AS grossEarnings,
  i.cleaning_fee     AS cleaningFee,
  i.service_fee      AS serviceFee,
  i.tax_amount       AS taxAmount,
  i.currency,
  u.unit_name        AS unitName
FROM airbnb_payout_item i
LEFT JOIN all_bookings b ON LOWER(b.confirmation_code) = LOWER(i.confirmation_code)
LEFT JOIN unit u         ON u.id = b.unit_id
WHERE i.payout_id = :payoutId
ORDER BY i.start_date ASC, i.id ASC
SQL;
        $rows = $db->fetchAllAssociative($sql, ['payoutId' => $payout->getId()]);

        $data = array_map(function(array $r) use ($payout) {
            $isAdjustment = (stripos((string)$r['lineType'], 'adjustment') !== false);
            return [
                'id' => (int)$r['id'],
                'lineType' => $r['lineType'],
                'confirmationCode' => $r['confirmationCode'],
                'listing' => $r['listing'],
                'unitName' => $r['unitName'] ?? null,
                'guestName' => $r['guestName'],
                'startDate' => $r['startDate'],
                'endDate' => $r['endDate'],
                'nights' => $r['nights'] !== null ? (int)$r['nights'] : null,
                'amount' => $r['amount'],
                'adjAmount' => $isAdjustment ? $r['amount'] : null,
                'grossEarnings' => $r['grossEarnings'],
                'cleaningFee' => $r['cleaningFee'],
                'serviceFee' => $r['serviceFee'],
                'taxAmount' => $r['taxAmount'],
                'currency' => $r['currency'],
                // Parent payout linkage
                'payoutId' => $payout->getId(),
                'referenceCode' => $payout->getReferenceCode(),
            ];
        }, $rows);

        return new JsonResponse(['success' => true, 'data' => $data, 'payout' => [
            'id' => $payout->getId(),
            'referenceCode' => $payout->getReferenceCode(),
            'payoutDate' => $payout->getPayoutDate()?->format('Y-m-d'),
        ]]);
    }

    #[Route('/api/payouts/summary', name: 'api_payouts_summary', methods: ['GET'])]
    public function listReservationSummary(Request $request, Connection $db): JsonResponse
    {
        $from = $request->query->get('from'); // YYYY-MM-DD or null
        $to = $request->query->get('to');     // YYYY-MM-DD or null

        // Build optional date filters on Reservation start/end dates
        $where = [];
        $params = [];
        if ($from) { $where[] = 'r.start_date >= :from'; $params['from'] = $from; }
        if ($to)   { $where[] = 'r.end_date   <= :to';   $params['to']   = $to;   }
        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        // Native SQL for clarity and performance
        $sql = <<<SQL
SELECT
  u.unit_name            AS unitName,
  r.listing              AS listing,
  r.confirmation_code    AS confirmationCode,
  r.guest_name           AS guestName,
  DATE_FORMAT(r.start_date, '%Y-%m-%d') AS startDate,
  DATE_FORMAT(r.end_date,   '%Y-%m-%d') AS endDate,
  r.nights               AS nights,
  r.gross_earnings       AS grossEarnings,
  r.cleaning_fee         AS cleaningFee,
  r.service_fee          AS serviceFee,
  r.tax_amount           AS taxAmount,
  r.amount               AS reservationAmount,
  COALESCE(ht.amount, 0) AS hostRemittedTaxAmount,
  COALESCE(adj.sum_amount, 0) AS adjAmount,
  (COALESCE(r.amount,0) + COALESCE(ht.amount,0) + COALESCE(adj.sum_amount,0)) AS payoutTotal,
  r.currency             AS currency
FROM airbnb_payout_item r
LEFT JOIN (
  SELECT confirmation_code, SUM(amount) AS amount
  FROM airbnb_payout_item
  WHERE LOWER(line_type) = 'host remitted tax'
  GROUP BY confirmation_code
) ht
  ON ht.confirmation_code = r.confirmation_code
LEFT JOIN (
  SELECT confirmation_code, SUM(amount) AS sum_amount
  FROM airbnb_payout_item
  WHERE LOWER(line_type) = 'adjustment'
  GROUP BY confirmation_code
) adj
  ON adj.confirmation_code = r.confirmation_code
LEFT JOIN unit u
  ON UPPER(u.listing_name) = UPPER(r.listing)
$whereSql
AND r.line_type = 'Reservation'
ORDER BY r.start_date ASC, r.id ASC
SQL;

        // When there is no WHERE above, we still need a valid WHERE for the final AND.
        // So if empty, convert to WHERE 1=1 and keep the AND condition intact.
        if (!$where) {
            $sql = str_replace("$whereSql\nAND", "WHERE 1=1\nAND", $sql);
        }

        $rows = $db->fetchAllAssociative($sql, $params);

        return new JsonResponse([
            'success' => true,
            'count' => count($rows),
            'data' => array_map(static function(array $r) {
                // Ensure numeric strings remain strings where appropriate
                return [
                    'unitName' => $r['unitName'] ?? null,
                    'listing' => $r['listing'] ?? null,
                    'confirmationCode' => $r['confirmationCode'] ?? null,
                    'guestName' => $r['guestName'] ?? null,
                    'startDate' => $r['startDate'] ?? null,
                    'endDate' => $r['endDate'] ?? null,
                    'nights' => $r['nights'] !== null ? (int)$r['nights'] : null,
                    'grossEarnings' => $r['grossEarnings'],
                    'cleaningFee' => $r['cleaningFee'],
                    'serviceFee' => $r['serviceFee'],
                    'taxAmount' => $r['taxAmount'],
                    'reservationAmount' => $r['reservationAmount'],
                    'hostRemittedTaxAmount' => $r['hostRemittedTaxAmount'],
                    'adjAmount' => $r['adjAmount'],
                    'payoutTotal' => $r['payoutTotal'],
                    'currency' => $r['currency'] ?? null,
                ];
            }, $rows),
        ]);
    }
}
