<?php

namespace App\Service\Reports;

use App\Repository\UnitRepository;
use App\Repository\UnitBalanceLedgerRepository;
use Doctrine\DBAL\Connection;

/**
 * UnitMonthlyReportService
 *
 * Aggregates all data needed by the Unit Monthly Report page into a single
 * normalized payload. This acts as the backend-for-frontend (BFF) layer so the
 * frontend performs just one request per unit/month.
 *
 * You can progressively enrich this service by injecting additional
 * repositories/services and filling the corresponding sections.
 */
class UnitMonthlyReportService
{
    public function __construct(
        private readonly UnitRepository $units,
        private readonly Connection $db,
        private readonly UnitBalanceLedgerRepository $ledgerRepo,
        // TODO: Inject additional services as needed, e.g.:
        // private readonly AllBookingsRepository $allBookings,
        // private readonly UnitTransactionsRepository $unitTx,
        // private readonly LedgerService $ledger,
    ) {}

    /**
     * Build a consolidated report payload for a given unit and year-month.
     *
     * @param int    $unitId     Unit ID
     * @param string $yearMonth  Normalized YYYY-MM string
     * @return array             Structured payload used by the frontend
     */
    public function build(int $unitId, string $yearMonth): array
    {
        $unit = $this->units->find($unitId);


        $unitBlock = [
            'id' => $unitId,
            'unitName' => method_exists($unit, 'getUnitName') ? $unit?->getUnitName() : null,
            'city' => method_exists($unit, 'getCity') ? $unit?->getCity() : null,
            'status' => method_exists($unit, 'getStatus') ? $unit?->getStatus() : null,
            'paymentType' => method_exists($unit, 'getPaymentType') ? $unit?->getPaymentType() : null,
            'ccEmail' => method_exists($unit, 'getCcEmail') ? $unit?->getCcEmail() : null,
        ];

        // --- Client block (owner info for report header) ---
        $clientBlock = null;
        try {
            $sqlClient = <<<SQL
SELECT c.id, c.name, c.email, c.bank_name, c.bank_owner, c.bank_account, c.language, c.cc_email
FROM unit u
LEFT JOIN client c ON c.id = u.client_id
WHERE u.id = :unit
LIMIT 1
SQL;
            $cRow = $this->db->fetchAssociative($sqlClient, ['unit' => $unitId]);
            if (is_array($cRow)) {
                $clientBlock = [
                    'id'          => isset($cRow['id']) ? (int)$cRow['id'] : null,
                    'name'        => $cRow['name']        ?? null,
                    'email'       => $cRow['email']       ?? null,
                    'bank_name'   => $cRow['bank_name']   ?? null,
                    'bank_owner'  => $cRow['bank_owner']  ?? null,
                    'bank_account'=> $cRow['bank_account']?? null,
                    'language'    => $cRow['language']    ?? null,
                    'cc_email'    => $cRow['cc_email']    ?? null,
                ];
            }
        } catch (\Throwable $e) {
            // keep clientBlock as null on any error
            $clientBlock = null;
        }

        // Payment-related configuration pulled from Unit (for "Expected Payments" UI)
        $paymentsConfig = [
            'hoa' => [
                'enabled' => method_exists($unit, 'isHoa') ? (bool) $unit?->isHoa()
                           : (method_exists($unit, 'getHoa') ? (bool) $unit?->getHoa() : false),
                'amount'  => method_exists($unit, 'getHoaAmount') ? ($unit?->getHoaAmount() ?? null) : null,
            ],
            'internet' => [
                'enabled' => method_exists($unit, 'isInternet') ? (bool) $unit?->isInternet()
                           : (method_exists($unit, 'getInternet') ? (bool) $unit?->getInternet() : false),
                'cost'    => method_exists($unit, 'getInternetCost') ? ($unit?->getInternetCost() ?? null) : null,
            ],
            'water' => [
                'enabled' => method_exists($unit, 'isWater') ? (bool) $unit?->isWater()
                           : (method_exists($unit, 'getWater') ? (bool) $unit?->getWater() : false),
            ],
            'cfe' => [
                'enabled'       => method_exists($unit, 'isCfe') ? (bool) $unit?->isCfe()
                                 : (method_exists($unit, 'getCfe') ? (bool) $unit?->getCfe() : false),
                'period'        => method_exists($unit, 'getCfePeriod') ? ($unit?->getCfePeriod() ?? null) : null,
                'paymentDay'    => method_exists($unit, 'getCfePaymentDay') ? ($unit?->getCfePaymentDay() ?? null) : null,
                'startingMonth' => method_exists($unit, 'getCfeStartingMonth') ? ($unit?->getCfeStartingMonth() ?? null) : null,
            ],
        ];

        // --- Opening / Monthly / Closing ---
        // Opening = latest balance_after BEFORE this month (if any). Monthly will be computed later.
        $opening = 0.00;
        $monthly = 0.00;
        $closing = 0.00;

        // Opening = repository-derived latest relevant balance before/at month boundary
        try {
            $opening = (float) ($this->ledgerRepo->findOpeningBalanceForMonth($unitId, $yearMonth) ?? 0.0);
        } catch (\Throwable $e) {
            $opening = 0.0;
        }

        // Closing depends on monthly; keep placeholder until monthly is computed
        $closing = $opening + $monthly;

        // --- Sections (bookings/expenses/abonos/notes) ---
        // BOOKING SLICES for this unit & month
        $bookingsRows = [];
        $bookingsTotals = [
            'nights' => 0,
            'payout' => 0.0,              // sum of payout_in_month
            'commissionBase' => 0.0,      // sum of commission_base_in_month
            'cleaningFee' => 0.0,         // sum of cleaning_fee_in_month
            'o2Commission' => 0.0,        // sum of o2_commission_in_month
            'ownerPayout' => 0.0,         // sum of owner_payout_in_month
        ];

        // Accumulators by source for CLIENT logic
        $ownerPayoutPrivate = 0.0;   // only owner_payout from Private source
        $o2CommissionAirbnb = 0.0;   // only o2_commission from Airbnb source
        $cleaningAirbnb     = 0.0;   // only cleaning_fee from Airbnb source

        $sqlSlices = <<<SQL
SELECT
  s.id                        AS slice_id,
  s.booking_id               AS booking_id,
  s.unit_id                  AS unit_id,
  u.status                   AS unit_status,
  u.payment_type            AS unit_payment_type,
  s.source                   AS source,
  s.payment_method           AS payment_method,
  b.payment_method           AS booking_payment_method,
  s.year_month               AS slice_year_month,
  s.nights_in_month          AS nights_in_month,
  s.payout_in_month          AS payout_in_month,
  s.commission_base_in_month AS commission_base_in_month,
  s.cleaning_fee_in_month    AS cleaning_fee_in_month,
  s.o2_commission_in_month   AS o2_commission_in_month,
  s.owner_payout_in_month    AS owner_payout_in_month,
  b.payout                   AS booking_payout,
  b.tax_percent              AS tax_percent,
  b.commission_percent       AS commission_percent,
  b.room_fee                 AS room_fee,
  b.cleaning_fee            AS cleaning_fee,
  b.guest_name              AS guest_name,
  b.guests                  AS guests,
  b.check_in                AS check_in,
  b.check_out               AS check_out,
  b.is_paid                AS is_paid
  , b.status               AS status
  , b.notes                AS booking_notes
  , b.check_in_notes       AS check_in_notes
  , b.check_out_notes      AS check_out_notes
FROM booking_month_slice s
LEFT JOIN all_bookings b ON b.id = s.booking_id
LEFT JOIN unit u ON u.id = s.unit_id
WHERE s.unit_id = :unit AND s.year_month = :ym AND u.status = 'ACTIVE'
ORDER BY s.id ASC
SQL;

        $sliceRows = $this->db->fetchAllAssociative($sqlSlices, [
            'unit' => $unitId,
            'ym'   => $yearMonth,
        ]);

        foreach ($sliceRows as $r) {
            // Normalise basic fields used for filtering
            $src = strtoupper((string)($r['source'] ?? ''));
            $statusRaw = (string)($r['status'] ?? '');
            $status = strtoupper(trim($statusRaw));
            $isCancelled = $this->isCancelledStatus($status);
            $payoutInMonth = isset($r['payout_in_month']) ? (float) $r['payout_in_month'] : 0.0;

            // Treat non-Airbnb sources as "private" for cancellation filtering.
            // We have seen variants like PRIVATE, OWNERS2, DIRECT, etc.
            $isNonAirbnbPrivateSource = ($src !== 'AIRBNB');

            // 3) If non-Airbnb (private/owners2/etc) AND status is any "cancelled" variant -> always ignore in calculations
            if ($isNonAirbnbPrivateSource && $isCancelled) {
                continue;
            }

            // 1) If source: Airbnb AND status cancelled AND payout_in_month == 0 -> ignore
            if ($src === 'AIRBNB' && $isCancelled && abs($payoutInMonth) < 0.00001) {
                continue;
            }

            // 2) If source: Airbnb AND status cancelled AND payout_in_month != 0
            //    keep it, but add a note in front of the guest name so it is visible in the UI
            $guestName = $r['guest_name'] ?? null;
            if ($src === 'AIRBNB' && $isCancelled && abs($payoutInMonth) >= 0.00001) {
                $guestName = '(Cancel) ' . (string) $guestName;
            }

            $row = [
                // identifiers
                'sliceId' => $r['slice_id'] ?? null,
                'bookingId' => $r['booking_id'] ?? null,
                'unitId' => $r['unit_id'] ?? null,
                'unitStatus' => $r['unit_status'] ?? null,
                'unitPaymentType' => $r['unit_payment_type'] ?? null,
                'bookingPaymentMethod' => $r['booking_payment_method'] ?? null,
                // booking-level fields
                'payout' => isset($r['booking_payout']) ? (float) $r['booking_payout'] : null,
                'taxPercent' => isset($r['tax_percent']) ? (float) $r['tax_percent'] : null,
                'commissionPercent' => isset($r['commission_percent']) ? (float) $r['commission_percent'] : null,
                'roomFee' => isset($r['room_fee']) ? (float) $r['room_fee'] : null,
                'cleaningFee' => isset($r['cleaning_fee']) ? (float) $r['cleaning_fee'] : null,
                'status' => $r['status'] ?? null,
                'guestName' => $guestName,
                'guests' => isset($r['guests']) ? (int) $r['guests'] : null,
                'checkIn' => $r['check_in'] ?? null,
                'checkOut' => $r['check_out'] ?? null,
                'isPaid' => isset($r['is_paid']) ? (bool) $r['is_paid'] : null,
                'notes' => $r['booking_notes'] ?? null,
                'checkInNotes' => $r['check_in_notes'] ?? null,
                'checkOutNotes' => $r['check_out_notes'] ?? null,
                // slice-level fields
                'source' => $r['source'] ?? null,
                'paymentMethod' => $r['payment_method'] ?? null,
                'yearMonth' => $r['slice_year_month'] ?? null,
                'nightsInMonth' => isset($r['nights_in_month']) ? (int) $r['nights_in_month'] : 0,
                'payoutInMonth' => $payoutInMonth,
                'commissionBaseInMonth' => isset($r['commission_base_in_month']) ? (float) $r['commission_base_in_month'] : 0.0,
                'cleaningFeeInMonth' => isset($r['cleaning_fee_in_month']) ? (float) $r['cleaning_fee_in_month'] : 0.0,
                'o2CommissionInMonth' => isset($r['o2_commission_in_month']) ? (float) $r['o2_commission_in_month'] : 0.0,
                'ownerPayoutInMonth' => isset($r['owner_payout_in_month']) ? (float) $r['owner_payout_in_month'] : 0.0,
            ];
            $bookingsRows[] = $row;

            // accumulate totals only for rows that pass the filters above
            $bookingsTotals['nights'] += $row['nightsInMonth'];
            $bookingsTotals['payout'] += $row['payoutInMonth'];
            $bookingsTotals['commissionBase'] += $row['commissionBaseInMonth'];
            $bookingsTotals['cleaningFee'] += $row['cleaningFeeInMonth'];
            $bookingsTotals['o2Commission'] += $row['o2CommissionInMonth'];
            $bookingsTotals['ownerPayout'] += $row['ownerPayoutInMonth'];

            // Source-specific sums for CLIENT units
            if ($src !== 'AIRBNB') {
                // Any non-Airbnb source is treated as "private" for CLIENT payout-credit rules
                $ownerPayoutPrivate += (float) $row['ownerPayoutInMonth'];
            } elseif ($src === 'AIRBNB') {
                $o2CommissionAirbnb += (float) $row['o2CommissionInMonth'];
                $cleaningAirbnb     += (float) $row['cleaningFeeInMonth'];
            }
        }

        // --- Sort bookings rows for display ---
        // Desired ordering:
        // 1) Non-cancelled (past/ongoing/confirmed/etc.) sorted by check-in ASC
        // 2) Cancelled rows at the bottom, also sorted by check-in ASC
        $normalRows = [];
        $cancelledRows = [];

        foreach ($bookingsRows as $br) {
            $st = strtoupper(trim((string)($br['status'] ?? '')));
            if ($this->isCancelledStatus($st)) {
                $cancelledRows[] = $br;
            } else {
                $normalRows[] = $br;
            }
        }

        $sortByCheckInAsc = static function (array $a, array $b): int {
            $ai = (string)($a['checkIn'] ?? '');
            $bi = (string)($b['checkIn'] ?? '');

            // Put empty dates last within each group
            if ($ai === '' && $bi === '') {
                return 0;
            }
            if ($ai === '') {
                return 1;
            }
            if ($bi === '') {
                return -1;
            }

            // Dates are YYYY-MM-DD so string compare works
            if ($ai === $bi) {
                // Stable-ish tie-breaker
                $as = (int)($a['sliceId'] ?? 0);
                $bs = (int)($b['sliceId'] ?? 0);
                return $as <=> $bs;
            }
            return strcmp($ai, $bi);
        };

        usort($normalRows, $sortByCheckInAsc);
        usort($cancelledRows, $sortByCheckInAsc);

        $bookingsRows = array_merge($normalRows, $cancelledRows);

        $bookings = [
            'rows' => $bookingsRows,
            'totals' => $bookingsTotals,
        ];

        // --- KPIs / Metrics (Occ %, Nights, Avg Room Fee) ---
        $daysInMonth = 0;
        try {
            $dtMonth = \DateTimeImmutable::createFromFormat('Y-m', $yearMonth);
            if ($dtMonth !== false) {
                $daysInMonth = (int) $dtMonth->format('t'); // days in month
            }
        } catch (\Throwable $e) {
            $daysInMonth = 0;
        }

        $bookedNights = (int) ($bookingsTotals['nights'] ?? 0);
        $occPct = ($daysInMonth > 0)
            ? round(($bookedNights / $daysInMonth) * 100, 2)
            : null;

        // Average Room Fee: use all_bookings.room_fee per row in month; ignore zeros/nulls
        $sumRoomFee = 0.0;
        $countRoomFee = 0;
        foreach ($bookingsRows as $br) {
            $rf = $br['roomFee'] ?? null; // from all_bookings.room_fee
            if ($rf !== null && (float)$rf > 0) {
                $sumRoomFee += (float) $rf;
                $countRoomFee += 1;
            }
        }
        $avgRoomFee = ($countRoomFee > 0) ? ($sumRoomFee / $countRoomFee) : null;

        $metrics = [
            'daysInMonth' => $daysInMonth,
            'nights'      => $bookedNights,
            'occPct'      => $occPct,
            'avgRoomFee'  => $avgRoomFee,
        ];

        // --- Expenses (Gastos) ---
        // Pull unit_transactions for this unit/month limited to Client cost center and Gasto type
        $sqlExpenses = <<<SQL
SELECT
  ut.id,
  ut.unit_id,
  ut.date,
  ut.description,
  ut.amount,
  ut.comments,
  ut.type,
  ut.cost_center,
  ut.category_id,
  tc.name AS category_name,
  tc.allow_unit AS category_allow_unit,
  tc.allow_hk   AS category_allow_hk
FROM unit_transactions ut
LEFT JOIN transaction_category tc ON tc.id = ut.category_id
WHERE ut.unit_id = :unit
  AND ut.type = 'Gasto'
  AND ut.cost_center = 'Client'
  AND DATE_FORMAT(ut.date, '%Y-%m') = :ym
ORDER BY ut.date ASC, ut.id ASC
SQL;

        $expenseRows = $this->db->fetchAllAssociative($sqlExpenses, [
            'unit' => $unitId,
            'ym'   => $yearMonth,
        ]);

        $expensesRows = [];
        $expensesTotals = [
            'count'  => 0,
            'amount' => 0.00,
        ];

        foreach ($expenseRows as $er) {
            $row = [
                'id'          => $er['id'] ?? null,
                'unitId'      => $er['unit_id'] ?? null,
                'date'        => $er['date'] ?? null,
                'description' => $er['description'] ?? null,
                'amount'      => isset($er['amount']) ? (float) $er['amount'] : 0.0,
                'comments'    => $er['comments'] ?? null,
                'type'        => $er['type'] ?? null,
                'costCenter'  => $er['cost_center'] ?? null,
                'categoryId'  => $er['category_id'] ?? null,
                'categoryName' => $er['category_name'] ?? null,
                'categoryAllowUnit' => isset($er['category_allow_unit']) ? (bool) $er['category_allow_unit'] : null,
                'categoryAllowHk'   => isset($er['category_allow_hk']) ? (bool) $er['category_allow_hk'] : null,
            ];
            $expensesRows[] = $row;
            $expensesTotals['count'] += 1;
            $expensesTotals['amount'] += (float) $row['amount'];
        }

        $expenses = [
            'rows'   => $expensesRows,
            'totals' => $expensesTotals,
        ];

        // --- Housekeeping Transactions (HK) --- (client-billed only: allocation_target = 'Client')
        $sqlHK = <<<SQL
SELECT
  hk.id,
  hk.unit_id,
  hk.date,
  hk.category_id,
  hk.allocation_target,
  hk.description,
  hk.notes,
  hk.charged,
  hk.paid,
  tc.name AS category_name,
  tc.allow_unit AS category_allow_unit,
  tc.allow_hk   AS category_allow_hk
FROM hktransactions hk
LEFT JOIN transaction_category tc ON tc.id = hk.category_id
WHERE hk.unit_id = :unit
  AND hk.allocation_target = 'Client'
  AND DATE_FORMAT(hk.date, '%Y-%m') = :ym
ORDER BY hk.date ASC, hk.id ASC
SQL;

        $hkRowsRaw = $this->db->fetchAllAssociative($sqlHK, [
            'unit' => $unitId,
            'ym'   => $yearMonth,
        ]);

        $hkRows = [];
        $hkTotals = [
            'count'   => 0,
            'charged' => 0.00,
        ];

        foreach ($hkRowsRaw as $hr) {
            $row = [
                'id'          => $hr['id'] ?? null,
                'unitId'      => $hr['unit_id'] ?? null,
                'date'        => $hr['date'] ?? null,
                'categoryId'  => $hr['category_id'] ?? null,
                'categoryName' => $hr['category_name'] ?? null,
                'categoryAllowUnit' => isset($hr['category_allow_unit']) ? (bool) $hr['category_allow_unit'] : null,
                'categoryAllowHk'   => isset($hr['category_allow_hk']) ? (bool) $hr['category_allow_hk'] : null,
                'allocationTarget' => $hr['allocation_target'] ?? null,
                'description' => $hr['description'] ?? null,
                'notes'       => $hr['notes'] ?? null,
                'charged'     => isset($hr['charged']) ? (float) $hr['charged'] : 0.0,
                'paid'        => isset($hr['paid']) ? (float) $hr['paid'] : 0.0,
            ];
            $hkRows[] = $row;
            $hkTotals['count'] += 1;
            $hkTotals['charged'] += (float) $row['charged'];
        }

        $housekeeping = [
            'rows'   => $hkRows,
            'totals' => $hkTotals,
        ];

        // --- Abonos (Ingresos) ---
        // Pull unit_transactions for this unit/month limited to Client cost center and Ingreso type
        $sqlAbonos = <<<SQL
SELECT
  ut.id,
  ut.unit_id,
  ut.date,
  ut.description,
  ut.amount,
  ut.comments,
  ut.type,
  ut.cost_center,
  ut.category_id,
  tc.name AS category_name
FROM unit_transactions ut
LEFT JOIN transaction_category tc ON tc.id = ut.category_id
WHERE ut.unit_id = :unit
  AND ut.type = 'Ingreso'
  AND ut.cost_center = 'Client'
  AND DATE_FORMAT(ut.date, '%Y-%m') = :ym
ORDER BY ut.date ASC, ut.id ASC
SQL;

        $abonoRows = $this->db->fetchAllAssociative($sqlAbonos, [
            'unit' => $unitId,
            'ym'   => $yearMonth,
        ]);

        $abonosRows = [];
        $abonosTotals = [
            'count'  => 0,
            'amount' => 0.00,
        ];

        foreach ($abonoRows as $ar) {
            $row = [
                'id'           => $ar['id'] ?? null,
                'unitId'       => $ar['unit_id'] ?? null,
                'date'         => $ar['date'] ?? null,
                'description'  => $ar['description'] ?? null,
                'amount'       => isset($ar['amount']) ? (float) $ar['amount'] : 0.0,
                'comments'     => $ar['comments'] ?? null,
                'type'         => $ar['type'] ?? null,
                'costCenter'   => $ar['cost_center'] ?? null,
                'categoryId'   => $ar['category_id'] ?? null,
                'categoryName' => $ar['category_name'] ?? null,
            ];
            $abonosRows[] = $row;
            $abonosTotals['count'] += 1;
            $abonosTotals['amount'] += (float) $row['amount'];
        }

        $abonos = [
            'rows'   => $abonosRows,
            'totals' => $abonosTotals,
        ];

        // --- Monthly Result & Closing ---
        $sumClientPayout = (float) ($bookings['totals']['ownerPayout'] ?? 0.0);
        $sumGastos       = (float) ($expenses['totals']['amount'] ?? 0.0);
        $sumHKCharged    = (float) ($housekeeping['totals']['charged'] ?? 0.0);
        $sumAbonos       = (float) ($abonos['totals']['amount'] ?? 0.0);

        $paymentType = strtoupper((string)($unitBlock['paymentType'] ?? ''));

        if ($paymentType === 'CLIENT') {
            // Business rules for CLIENT units:
            // Client Credit = Private owner payout + Abonos
            // Client Debit  = Airbnb O2 commission + Airbnb Cleaning + Gastos (including HK)
            $clientCreditPayouts = (float) $ownerPayoutPrivate;
            $clientCreditCredits = (float) $sumAbonos;
            $clientCreditTotal   = $clientCreditPayouts + $clientCreditCredits;

            $gastosClient        = (float) $sumGastos + (float) $sumHKCharged; // treat HK as gastos for debit
            $clientDebitTotal    = (float) $o2CommissionAirbnb + (float) $cleaningAirbnb + $gastosClient;

            // Monthly result is negative when the client owes Owners2
            $monthly = - ( $clientDebitTotal - $clientCreditTotal );
        } else {
            // OWNERS2 (default) behavior: net to client ledger
            $monthly = $sumClientPayout - ($sumGastos + $sumHKCharged) + $sumAbonos;
        }

        $closing = $opening + $monthly;

        // --- Notes --- (report-only for the selected unit and month)
        $notes = [
            'report' => [],
            'checkIn' => [],
            'checkOut' => [],
        ];

        $sql = 'SELECT id, note_comment FROM client_unit_note WHERE unit_id = :unit AND note_year_month = :ym AND entry_type = :type ORDER BY id ASC';
        $rows = $this->db->fetchAllAssociative($sql, [
            'unit' => $unitId,
            'ym'   => $yearMonth,
            'type' => 'report',
        ]);
        foreach ($rows as $r) {
            $comment = $r['note_comment'] ?? null;
            $id = $r['id'] ?? null;
            if ($comment === null || $comment === '') {
                continue;
            }
            // Return structured items (id + text) so the UI can edit in place
            $notes['report'][] = [
                'id' => $id,
                'note_comment' => $comment,
            ];
        }

        // --- Ledger (unit_balance_ledger) ---
        $sqlLedger = <<<SQL
SELECT
  id,
  unit_id,
  yearmonth,
  entry_type,
  amount,
  balance_after,
  payment_method,
  reference,
  note,
  created_at,
  created_by,
  txn_date
FROM unit_balance_ledger
WHERE unit_id = :unit AND yearmonth = :ym
ORDER BY COALESCE(txn_date, created_at) ASC, id ASC
SQL;

        $ledgerRowsRaw = $this->db->fetchAllAssociative($sqlLedger, [
            'unit' => $unitId,
            'ym'   => $yearMonth,
        ]);

        // Prefetch any report attachments for these ledger rows (fallback if cycle.report_url is null)
        $ledgerIds = [];
        foreach ($ledgerRowsRaw as $lridRow) {
            if (isset($lridRow['id'])) {
                $ledgerIds[] = (int)$lridRow['id'];
            }
        }
        $attachUrlByLedgerId = [];
        if (!empty($ledgerIds)) {
            try {
                $in = implode(',', array_map('intval', $ledgerIds));
                $sqlAttach = <<<SQL
SELECT
    a.target_id AS ledger_id,
    d.s3_url    AS doc_url
FROM unit_document_attachment a
INNER JOIN unit_document d ON d.id = a.document_id
WHERE a.target_id IN ($in)
  AND d.unit_id = :unit
ORDER BY a.id DESC
SQL;
                $attRows = $this->db->fetchAllAssociative($sqlAttach, ['unit' => $unitId]);
                foreach ($attRows as $arow) {
                    $lid = isset($arow['ledger_id']) ? (int)$arow['ledger_id'] : 0;
                    $u   = $arow['doc_url'] ?? null;
                    if ($lid > 0 && $u && !isset($attachUrlByLedgerId[$lid])) {
                        $attachUrlByLedgerId[$lid] = $u;
                    }
                }
            } catch (\Throwable $e) {
                $attachUrlByLedgerId = [];
            }
        }


        $ledger = [];
        foreach ($ledgerRowsRaw as $lr) {
            $ledger[] = [
                'id'            => $lr['id'] ?? null,
                'unitId'        => $lr['unit_id'] ?? null,
                'yearMonth'     => $lr['yearmonth'] ?? null,
                'entryType'     => $lr['entry_type'] ?? null,
                'amount'        => isset($lr['amount']) ? (float) $lr['amount'] : null,
                'balanceAfter'  => isset($lr['balance_after']) ? (float) $lr['balance_after'] : null,
                'paymentMethod' => $lr['payment_method'] ?? null,
                'reference'     => $lr['reference'] ?? null,
                'note'          => $lr['note'] ?? null,
                'createdAt'     => $lr['created_at'] ?? null,
                'createdBy'     => $lr['created_by'] ?? null,
                'txnDate'       => $lr['txn_date'] ?? null,
                'reportUrl'     => ($lr['entry_type'] ?? '') === 'Month Report'
                    ? ($attachUrlByLedgerId[(int)($lr['id'] ?? 0)] ?? null)
                    : null,
                'paymentUrl'    => in_array(($lr['entry_type'] ?? ''), ['O2 Report Payment','Client Report Payment'], true)
                    ? ($attachUrlByLedgerId[(int)($lr['id'] ?? 0)] ?? null)
                    : null,
            ];
        }

        // Helper: compute next month (YYYY-MM) for fallback txn_date checks
        $ymNext = null;
        try {
            $dtYM = \DateTimeImmutable::createFromFormat('Y-m', $yearMonth);
            if ($dtYM !== false) {
                $ymNext = $dtYM->modify('first day of next month')->format('Y-m');
            }
        } catch (\Throwable $e) {
            $ymNext = null;
        }

        // --- Workflow status (Report/Payment/Email) ---
        // SINGLE SOURCE OF TRUTH: owner_report_cycle
        $reportIssued = false;
        $paymentIssued = false;
        $emailSent = false;
        $paymentDetails = [
            'state'  => 'PENDING',
            'status' => 'PENDING',
            'amount' => 0.0,
            'ref'    => '',
            'method' => '',
            'at'     => null,
            'by'     => '',
        ];

        try {
            $sqlCycle = <<<SQL
SELECT
  report_issued_at,
  report_url,
  payment_status,
  payment_amount,
  payment_ref,
  payment_method,
  payment_at,
  payment_by,
  email_status,
  email_message_id,
  email_at
FROM owner_report_cycle
WHERE unit_id = :unit AND report_month = :ym
ORDER BY id DESC
LIMIT 1
SQL;
            $cycleRow = $this->db->fetchAssociative($sqlCycle, [
                'unit' => $unitId,
                'ym'   => $yearMonth,
            ]);

            if (is_array($cycleRow)) {
                // Report flag
                $reportIssued = !empty($cycleRow['report_issued_at']) || !empty($cycleRow['report_url']);

                // Payment flag
                $pstat = strtoupper((string)($cycleRow['payment_status'] ?? ''));
                $paymentIssued = (
                    in_array($pstat, ['ISSUED','PAID','SENT','DONE'], true) ||
                    !empty($cycleRow['payment_at']) ||
                    !empty($cycleRow['payment_ref']) ||
                    (isset($cycleRow['payment_amount']) && (float)$cycleRow['payment_amount'] != 0.0)
                );

                // Email flag
                $estat = strtoupper((string)($cycleRow['email_status'] ?? ''));
                $emailSent = (
                    in_array($estat, ['SENT','DELIVERED','DONE'], true) ||
                    !empty($cycleRow['email_message_id']) ||
                    !empty($cycleRow['email_at'])
                );

                // Payment details (from cycle only)
                $paymentDetails = [
                    'state'  => $paymentIssued ? 'PAID' : 'PENDING',
                    'status' => $paymentIssued ? 'PAID' : 'PENDING',
                    'amount' => isset($cycleRow['payment_amount']) ? (float)$cycleRow['payment_amount'] : 0.0,
                    'ref'    => $cycleRow['payment_ref'] ?? '',
                    'method' => $cycleRow['payment_method'] ?? '',
                    'at'     => $cycleRow['payment_at'] ?? null,
                    'by'     => $cycleRow['payment_by'] ?? '',
                ];
            }
        } catch (\Throwable $e) {
            // keep defaults
        }

        $progress = ($reportIssued ? 1 : 0) + ($paymentIssued ? 1 : 0) + ($emailSent ? 1 : 0);

        $workflow = [
            'reportIssued'  => $reportIssued,
            'paymentIssued' => $paymentIssued,
            'emailSent'     => $emailSent,
            'progress'      => sprintf('%d/3', $progress),
        ];

        // --- Expected Payments: CFE ---
        $cfeEnabled = (bool)($paymentsConfig['cfe']['enabled'] ?? false);
        $cfePeriod = $paymentsConfig['cfe']['period'] ?? null;          // 'Monthly' or 'BiMonthly'
        $cfeStart  = isset($paymentsConfig['cfe']['startingMonth']) ? (int)$paymentsConfig['cfe']['startingMonth'] : null; // 1..12

        // Determine if CFE is expected in the selected month
        $selectedMonth = (int) substr($yearMonth, 5, 2); // YYYY-MM
        $cfeExpectedThisMonth = false;
        if ($cfeEnabled) {
            if ($cfePeriod === 'Monthly') {
                $cfeExpectedThisMonth = true;
            } elseif ($cfePeriod === 'BiMonthly') {
                if ($cfeStart && $selectedMonth >= $cfeStart) {
                    $cfeExpectedThisMonth = ((($selectedMonth - $cfeStart) % 2) === 0);
                } else {
                    $cfeExpectedThisMonth = false;
                }
            }
        }

        // Found amount paid this month for CFE (category id = 1 or name = 'Pago de Servicios') AND description exactly 'CFE'
        $cfeFoundAmount = 0.0;
        if (!empty($expensesRows)) {
            foreach ($expensesRows as $erow) {
                $catId   = $erow['categoryId']   ?? null;
                $catName = $erow['categoryName'] ?? '';
                $desc    = isset($erow['description']) ? trim((string)$erow['description']) : '';

                $matchesCategory = ($catId === 1) || (is_string($catName) && strcasecmp($catName, 'Pago de Servicios') === 0);
                $matchesDesc     = (strcasecmp($desc, 'CFE') === 0);

                if ($matchesCategory && $matchesDesc) {
                    $cfeFoundAmount += (float) ($erow['amount'] ?? 0.0);
                }
            }
        }

        // Build CFE status
        if (!$cfeEnabled) {
            $expectedPayments = [
                'cfe' => [
                    'key' => 'CFE',
                    'enabled' => false,
                    'expectedThisMonth' => false,
                    'expectedAmount' => null,
                    'foundAmount' => 0.0,
                    'status' => 'NOT_OUR_RESPONSIBILITY',
                    'message' => 'Not our responsability',
                ],
            ];
        } elseif (!$cfeExpectedThisMonth) {
            $expectedPayments = [
                'cfe' => [
                    'key' => 'CFE',
                    'enabled' => true,
                    'expectedThisMonth' => false,
                    'expectedAmount' => null,
                    'foundAmount' => $cfeFoundAmount,
                    'status' => 'OK_NOT_EXPECTED',
                    'message' => 'Not expected this month',
                ],
            ];
        } else {
            $expectedPayments = [
                'cfe' => [
                    'key' => 'CFE',
                    'enabled' => true,
                    'expectedThisMonth' => true,
                    'expectedAmount' => null,
                    'foundAmount' => $cfeFoundAmount,
                    'status' => ($cfeFoundAmount > 0 ? 'OK' : 'MISSING'),
                    'message' => ($cfeFoundAmount > 0 ? 'OK' : 'Missing Payment'),
                ],
            ];
        }

        // --- Expected Payments: WATER (Agua) ---
        $waterEnabled = (bool)($paymentsConfig['water']['enabled'] ?? false);
        $waterExpectedThisMonth = false;
        $waterFoundAmount = 0.0;

        if (!$waterEnabled) {
            // Not our responsibility
            $expectedWater = [
                'key' => 'Agua',
                'enabled' => false,
                'expectedThisMonth' => false,
                'expectedAmount' => null,
                'foundAmount' => 0.0,
                'status' => 'NOT_OUR_RESPONSIBILITY',
                'message' => 'Not our responsability',
            ];
        } else {
            // Water is monthly; always expected when enabled
            $waterExpectedThisMonth = true;

            if (!empty($expensesRows)) {
                foreach ($expensesRows as $erow) {
                    $catId   = $erow['categoryId']   ?? null;
                    $catName = $erow['categoryName'] ?? '';
                    $desc    = isset($erow['description']) ? trim((string)$erow['description']) : '';

                    $isPagoServicios = ($catId === 1) || (is_string($catName) && strcasecmp($catName, 'Pago de Servicios') === 0);
                    $isAguakanExact = (strcasecmp($desc, 'Aguakan') === 0);

                    if ($isPagoServicios && $isAguakanExact) {
                        $waterFoundAmount += (float) ($erow['amount'] ?? 0.0);
                    }
                }
            }

            $expectedWater = [
                'key' => 'Agua',
                'enabled' => true,
                'expectedThisMonth' => $waterExpectedThisMonth,
                'expectedAmount' => null,
                'foundAmount' => $waterFoundAmount,
                'status' => ($waterFoundAmount > 0 ? 'OK' : 'MISSING'),
                'message' => ($waterFoundAmount > 0 ? 'OK' : 'Missing Payment'),
            ];
        }


        // Attach to expectedPayments alongside CFE
        $expectedPayments['water'] = $expectedWater;

        // --- Expected Payments: HOA ---
        $hoaEnabled = (bool)($paymentsConfig['hoa']['enabled'] ?? false);
        $hoaExpectedThisMonth = false; // Monthly when enabled
        $hoaExpectedAmount = isset($paymentsConfig['hoa']['amount']) ? (float)$paymentsConfig['hoa']['amount'] : null;
        $hoaFoundAmount = 0.0;

        if (!$hoaEnabled) {
            $expectedHoa = [
                'key' => 'HOA',
                'enabled' => false,
                'expectedThisMonth' => false,
                'expectedAmount' => $hoaExpectedAmount,
                'foundAmount' => 0.0,
                'status' => 'NOT_OUR_RESPONSIBILITY',
                'message' => 'Not our responsability',
            ];
        } else {
            // HOA is monthly when enabled
            $hoaExpectedThisMonth = true;

            if (!empty($expensesRows)) {
                foreach ($expensesRows as $erow) {
                    $catId   = $erow['categoryId']   ?? null;
                    $catName = $erow['categoryName'] ?? '';
                    $desc    = isset($erow['description']) ? trim((string)$erow['description']) : '';

                    $isPagoServicios = ($catId === 1) || (is_string($catName) && strcasecmp($catName, 'Pago de Servicios') === 0);
                    $isExactHOA      = (strcasecmp($desc, 'HOA') === 0);

                    if ($isPagoServicios && $isExactHOA) {
                        $hoaFoundAmount += (float) ($erow['amount'] ?? 0.0);
                    }
                }
            }

            // Decide status
            if ($hoaFoundAmount <= 0.0) {
                $expectedHoa = [
                    'key' => 'HOA',
                    'enabled' => true,
                    'expectedThisMonth' => $hoaExpectedThisMonth,
                    'expectedAmount' => $hoaExpectedAmount,
                    'foundAmount' => $hoaFoundAmount,
                    'status' => 'MISSING',
                    'message' => 'Expected',
                ];
            } else {
                // If we know expected amount, compare; otherwise treat as OK
                $matches = ($hoaExpectedAmount !== null) ? (abs($hoaFoundAmount - (float)$hoaExpectedAmount) < 0.01) : true;
                $expectedHoa = [
                    'key' => 'HOA',
                    'enabled' => true,
                    'expectedThisMonth' => $hoaExpectedThisMonth,
                    'expectedAmount' => $hoaExpectedAmount,
                    'foundAmount' => $hoaFoundAmount,
                    'status' => $matches ? 'OK' : 'OK_MISMATCH',
                    'message' => $matches ? 'OK' : ('Expected payment was ' . number_format((float)$hoaExpectedAmount, 2, '.', '')),
                ];
            }
        }

        $expectedPayments['hoa'] = $expectedHoa;

        // --- Expected Payments: INTERNET ---
        $internetEnabled = (bool)($paymentsConfig['internet']['enabled'] ?? false);
        $internetExpectedThisMonth = false; // Monthly when enabled
        $internetExpectedAmount = isset($paymentsConfig['internet']['cost']) ? (float)$paymentsConfig['internet']['cost'] : null;
        $internetFoundAmount = 0.0;

        if (!$internetEnabled) {
            $expectedInternet = [
                'key' => 'Internet',
                'enabled' => false,
                'expectedThisMonth' => false,
                'expectedAmount' => $internetExpectedAmount,
                'foundAmount' => 0.0,
                'status' => 'NOT_OUR_RESPONSIBILITY',
                'message' => 'Not our responsability',
            ];
        } else {
            // Internet is monthly when enabled
            $internetExpectedThisMonth = true;

            if (!empty($expensesRows)) {
                foreach ($expensesRows as $erow) {
                    $catId   = $erow['categoryId']   ?? null;
                    $catName = $erow['categoryName'] ?? '';
                    $desc    = isset($erow['description']) ? trim((string)$erow['description']) : '';

                    $isPagoServicios = ($catId === 1) || (is_string($catName) && strcasecmp($catName, 'Pago de Servicios') === 0);
                    $isExactInternet = (strcasecmp($desc, 'Internet') === 0);

                    if ($isPagoServicios && $isExactInternet) {
                        $internetFoundAmount += (float) ($erow['amount'] ?? 0.0);
                    }
                }
            }

            if ($internetFoundAmount <= 0.0) {
                $expectedInternet = [
                    'key' => 'Internet',
                    'enabled' => true,
                    'expectedThisMonth' => $internetExpectedThisMonth,
                    'expectedAmount' => $internetExpectedAmount,
                    'foundAmount' => $internetFoundAmount,
                    'status' => 'MISSING',
                    'message' => 'Expected',
                ];
            } else {
                $matches = ($internetExpectedAmount !== null) ? (abs($internetFoundAmount - (float)$internetExpectedAmount) < 0.01) : true;
                $expectedInternet = [
                    'key' => 'Internet',
                    'enabled' => true,
                    'expectedThisMonth' => $internetExpectedThisMonth,
                    'expectedAmount' => $internetExpectedAmount,
                    'foundAmount' => $internetFoundAmount,
                    'status' => $matches ? 'OK' : 'OK_MISMATCH',
                    'message' => $matches ? 'OK' : ('Expected payment was ' . number_format((float)$internetExpectedAmount, 2, '.', '')),
                ];
            }
        }

        $expectedPayments['internet'] = $expectedInternet;

        // --- Aggregates for cards: Client Credit / Client Debit / Total O2 ---
        $payoutsSum = (float) ($bookingsTotals['ownerPayout'] ?? 0.0);
        $creditsSum = (float) ($abonosTotals['amount'] ?? 0.0);
        $gastosSum  = (float) ($expensesTotals['amount'] ?? 0.0);
        $hkSum      = (float) ($hkTotals['charged'] ?? 0.0);
        $o2Sum      = (float) ($bookingsTotals['o2Commission'] ?? 0.0);
        $cleaningSum= (float) ($bookingsTotals['cleaningFee'] ?? 0.0);

        if ($paymentType === 'CLIENT') {
            // Follow CLIENT rules for the summary cards
            $clientCredit = [
                'total'   => $ownerPayoutPrivate + $creditsSum,
                'payouts' => $ownerPayoutPrivate,
                'credits' => $creditsSum,
            ];
            $clientDebit = [
                'total' => $o2CommissionAirbnb + $cleaningAirbnb + $gastosSum + $hkSum,
            ];
            // Total O2 for CLIENT focuses on Airbnb-derived amounts
            $totalO2 = [
                'total'      => $o2CommissionAirbnb + $cleaningAirbnb,
                'commission' => $o2CommissionAirbnb,
                'cleaning'   => $cleaningAirbnb,
            ];
        } else {
            // Default/OWNERS2 cards
            $clientCredit = [
                'total'   => $payoutsSum + $creditsSum,
                'payouts' => $payoutsSum,
                'credits' => $creditsSum,
            ];
            $clientDebit = [
                'total' => $gastosSum + $hkSum,
            ];
            $totalO2 = [
                'total'      => $o2Sum + $cleaningSum,
                'commission' => $o2Sum,
                'cleaning'   => $cleaningSum,
            ];
        }

        // --- Final enforcement of opening/closing using repository rule (with SQL fallback) ---
        $openingRepo = null;
        try {
            $openingRepo = $this->ledgerRepo->findOpeningBalanceForMonth($unitId, $yearMonth);
        } catch (\Throwable $e) {
            $openingRepo = null;
        }

        if ($openingRepo === null || (!is_numeric($openingRepo) || abs((float)$openingRepo) < 0.00001)) {
            // Fallback: compute using cutoff at first day of next month and skip same-month Month Report
            try {
                $dt = \DateTimeImmutable::createFromFormat('Y-m', $yearMonth);
                if ($dt !== false) {
                    $cutoff = $dt->modify('first day of next month')->setTime(0, 0, 0)->format('Y-m-d 00:00:00');

                    // Latest row strictly before cutoff
                    $sqlLatest = <<<SQL
SELECT id, yearmonth, entry_type, balance_after, COALESCE(txn_date, created_at) AS sort_dt
FROM unit_balance_ledger
WHERE unit_id = :unit AND COALESCE(txn_date, created_at) < :cutoff
ORDER BY sort_dt DESC, id DESC
LIMIT 1
SQL;
                    $latest = $this->db->fetchAssociative($sqlLatest, [
                        'unit'   => $unitId,
                        'cutoff' => $cutoff,
                    ]);

                    if (is_array($latest) && $latest) {
                        $isSameMonthReport = (
                            isset($latest['entry_type'], $latest['yearmonth']) &&
                            $latest['entry_type'] === 'Month Report' &&
                            $latest['yearmonth'] === $yearMonth
                        );

                        if ($isSameMonthReport) {
                            // Fetch the previous row
                            $sqlPrev = <<<SQL
SELECT balance_after
FROM unit_balance_ledger
WHERE unit_id = :unit AND COALESCE(txn_date, created_at) < :sortdt
ORDER BY COALESCE(txn_date, created_at) DESC, id DESC
LIMIT 1
SQL;
                            $prev = $this->db->fetchAssociative($sqlPrev, [
                                'unit'   => $unitId,
                                'sortdt' => $latest['sort_dt'],
                            ]);
                            $opening = isset($prev['balance_after']) ? (float)$prev['balance_after'] : 0.0;
                        } else {
                            $opening = isset($latest['balance_after']) ? (float)$latest['balance_after'] : 0.0;
                        }
                    } else {
                        $opening = 0.0;
                    }
                }
            } catch (\Throwable $e) {
                // keep whatever opening was previously
            }
        } else {
            $opening = (float)$openingRepo;
        }

        // Ensure closing reflects the enforced opening + monthly
        $closing = $opening + $monthly;

        return [
            'unit' => $unitBlock,
            'client' => $clientBlock,
            'paymentsConfig' => $paymentsConfig,
            'expectedPayments' => $expectedPayments,
            'period' => $yearMonth,
            'openingBalance' => $opening,
            'monthlyResult' => $monthly,
            'closingBalance' => $closing,
            'metrics' => $metrics,
            'bookings' => $bookings,
            'expenses' => $expenses,
            'housekeeping' => $housekeeping,
            'abonos' => $abonos,
            'clientCredit' => $clientCredit,
            'clientDebit'  => $clientDebit,
            'totalO2'      => $totalO2,
            'notes' => $notes,
            'ledger' => $ledger,
            'workflow' => $workflow,
            'warnings' => [],
            'version' => 1,
        ];
    }
    /**
     * Normalize whether a booking status should be treated as cancelled.
     *
     * We see multiple variants across sources (Cancelled/Canceled, by guest/host, etc.).
     */
    private function isCancelledStatus(string $statusUpper): bool
    {
        $s = strtoupper(trim($statusUpper));
        if ($s === '') {
            return false;
        }

        // Common exact values
        if (in_array($s, ['CANCELLED', 'CANCELED', 'CANCELLED_BY_GUEST', 'CANCELED_BY_GUEST', 'CANCELLED_BY_HOST', 'CANCELED_BY_HOST'], true)) {
            return true;
        }

        // Common descriptive strings
        if (str_contains($s, 'CANCELLED') || str_contains($s, 'CANCELED')) {
            return true;
        }

        return false;
    }
    /**
     * Returns an associative array for the existing REPORT_POSTING ledger row, or null if none.
     */
    public function findExistingReportPosting(int $unitId, string $yearMonth): ?array
    {
        try {
            $sql = <<<SQL
SELECT id, unit_id, yearmonth, entry_type, amount, balance_after, payment_method, reference, note, created_at, created_by, txn_date
FROM unit_balance_ledger
WHERE unit_id = :unit AND yearmonth = :ym AND entry_type IN ('REPORT_POSTING','Month Report')
ORDER BY COALESCE(txn_date, created_at) DESC, id DESC
LIMIT 1
SQL;
            $row = $this->db->fetchAssociative($sql, [
                'unit' => $unitId,
                'ym'   => $yearMonth,
            ]);
            return $row ?: null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Compute report numbers and upsert a REPORT_POSTING row.
     *
     * @return array { ledgerId, replaced, reference, amount, balanceAfter, txnDate, s3Url }
     */
    public function generateAndUpsertReportPosting(int $unitId, string $yearMonth, bool $replace = true, ?string $createdBy = 'system'): array
    {
        // Build once to compute Month Result and Closing Balance consistently with the UI
        $data = $this->build($unitId, $yearMonth);
        $openingBalance = (float) ($data['openingBalance'] ?? 0.0);
        $monthlyResult  = (float) ($data['monthlyResult'] ?? 0.0);        // Month Result (delta)
        $closingBalance = (float) ($data['closingBalance'] ?? ($openingBalance + $monthlyResult));

        // Ledger semantics:
        // - amount is the MONTHLY delta (monthlyResult)
        // - balance_after is the running balance after applying the delta (closingBalance)
        $amount = $monthlyResult;
        $balanceAfter = $closingBalance;

        // TEMP debug: helps confirm what values were used during /api/unit-monthly/generate
        @error_log(sprintf('[UnitMonthlyReportService.generateAndUpsertReportPosting] unit=%d ym=%s opening=%.2f monthly=%.2f closing=%.2f', $unitId, $yearMonth, $openingBalance, $monthlyResult, $closingBalance));

        // Reference: Client Report YYMM
        $yy = substr($yearMonth, 2, 2);
        $mm = substr($yearMonth, 5, 2);
        $reference = sprintf('Client Report %s%s', $yy, $mm);
        $txnDate = $this->firstDayOfNextMonth($yearMonth);

        // Optionally: link to S3 (not handled here yet)
        $s3Url = null;

        $existing = $this->findExistingReportPosting($unitId, $yearMonth);
        $now = (new \DateTimeImmutable())->format('Y-m-d H:i:s');

        if ($existing) {
            if (!$replace) {
                // Nothing to do; return existing snapshot
                return [
                    'ledgerId'     => (int) $existing['id'],
                    'replaced'     => false,
                    'reference'    => $existing['reference'] ?? $reference,
                    'amount'       => (float) ($existing['amount'] ?? 0.0),
                    'balanceAfter' => (float) ($existing['balance_after'] ?? 0.0),
                    'txnDate'      => $existing['txn_date'] ?? $txnDate,
                    's3Url'        => $s3Url,
                ];
            }
            // UPDATE existing row
            $this->db->update('unit_balance_ledger', [
                'amount'        => $amount,
                'balance_after' => $balanceAfter,
                'reference'     => $reference,
                'txn_date'      => $txnDate,
                'yearmonth'     => $yearMonth,
                'entry_type'    => 'Month Report',
                'created_by'    => ($createdBy && trim((string)$createdBy) !== '') ? (string)$createdBy : 'system',
                // You may store a URL in `note` until a dedicated column exists
                // 'note' => $s3Url,
            ], [ 'id' => (int) $existing['id'] ]);

            // Prepare response values after UPDATE
            $ledgerId = (int) $existing['id'];
            $wasReplaced = true;
            $retReference = $reference;
            $retAmount = $amount;
            $retBalanceAfter = $balanceAfter;
            $retTxnDate = $txnDate;
            $retS3Url = $s3Url;
            // (continue; we'll upsert owner_report_cycle below and return once)
        } else {
            // INSERT new row
            $this->db->insert('unit_balance_ledger', [
                'unit_id'       => $unitId,
                'yearmonth'     => $yearMonth,
                'entry_type'    => 'Month Report',
                'amount'        => $amount,
                'balance_after' => $balanceAfter,
                'payment_method'=> null,
                'reference'     => $reference,
                'note'          => null,
                'created_at'    => $now,
                'created_by'    => ($createdBy && trim((string)$createdBy) !== '') ? (string)$createdBy : 'system',
                'txn_date'      => $txnDate,
            ]);
            $ledgerId = (int) $this->db->lastInsertId();
            $wasReplaced = false;
            $retReference = $reference;
            $retAmount = $amount;
            $retBalanceAfter = $balanceAfter;
            $retTxnDate = $txnDate;
            $retS3Url = $s3Url;
        }

        // --- Upsert owner_report_cycle (mark report issued) ---
        try {
            $cycleRow = $this->db->fetchAssociative(
                'SELECT id FROM owner_report_cycle WHERE unit_id = :unit AND report_month = :ym ORDER BY id DESC LIMIT 1',
                ['unit' => $unitId, 'ym' => $yearMonth]
            );
            if ($cycleRow && isset($cycleRow['id'])) {
                $this->db->update('owner_report_cycle', [
                    'report_issued_at' => $now,
                    'report_issued_by' => $createdBy ?? 'system',
                    // keep report_url untouched here; another flow can set it
                    'updated_at'       => $now,
                ], ['id' => (int)$cycleRow['id']]);
            } else {
                $this->db->insert('owner_report_cycle', [
                    'unit_id'         => $unitId,
                    'report_month'    => $yearMonth,
                    'report_issued_at'=> $now,
                    'report_issued_by'=> $createdBy ?? 'system',
                    'payment_status'  => 'PENDING',
                    'email_status'    => 'PENDING',
                    'created_at'      => $now,
                    'updated_at'      => $now,
                ]);
            }
        } catch (\Throwable $e) {
            // Non-fatal; report issuance should not fail because of cycle upsert
        }

        return [
            'ledgerId'     => (int) $ledgerId,
            'replaced'     => (bool) $wasReplaced,
            'reference'    => $retReference,
            'amount'       => $retAmount,
            'balanceAfter' => $retBalanceAfter,
            'txnDate'      => $retTxnDate,
            's3Url'        => $retS3Url,
            'debug'        => [
                'openingBalance' => $openingBalance,
                'monthlyResult'  => $monthlyResult,
                'closingBalance' => $closingBalance,
            ],
        ];
    }

    /**
     * Return the first day of the next month for a given yearMonth (YYYY-MM).
     */
    private function firstDayOfNextMonth(string $yearMonth): string
    {
        $dt = \DateTimeImmutable::createFromFormat('Y-m', $yearMonth) ?: new \DateTimeImmutable('first day of this month');
        $next = $dt->modify('first day of next month')->setTime(0, 0, 0);
        return $next->format('Y-m-d');
    }
    /**
     * Get workflow/report/payment/email status for a unit and yearMonth.
     *
     * @param int $unitId
     * @param string $yearMonth
     * @return array
     */
    public function getStatus(int $unitId, string $yearMonth): array
    {
        // SINGLE SOURCE OF TRUTH: owner_report_cycle
        $reportIssued = false;
        $paymentIssued = false;
        $emailSent = false;
        $paymentDetails = [
            'state'  => 'PENDING',
            'status' => 'PENDING',
            'amount' => 0.0,
            'ref'    => '',
            'method' => '',
            'at'     => null,
            'by'     => '',
        ];

        try {
            $sqlCycle = <<<SQL
SELECT
  report_issued_at,
  report_url,
  payment_status,
  payment_amount,
  payment_ref,
  payment_method,
  payment_at,
  payment_by,
  email_status,
  email_message_id,
  email_at
FROM owner_report_cycle
WHERE unit_id = :unit AND report_month = :ym
ORDER BY id DESC
LIMIT 1
SQL;
            $cycleRow = $this->db->fetchAssociative($sqlCycle, [
                'unit' => $unitId,
                'ym'   => $yearMonth,
            ]);

            if (is_array($cycleRow)) {
                $reportIssued = !empty($cycleRow['report_issued_at']) || !empty($cycleRow['report_url']);

                $pstat = strtoupper((string)($cycleRow['payment_status'] ?? ''));
                $paymentIssued = (
                    in_array($pstat, ['ISSUED','PAID','SENT','DONE'], true) ||
                    !empty($cycleRow['payment_at']) ||
                    !empty($cycleRow['payment_ref']) ||
                    (isset($cycleRow['payment_amount']) && (float)$cycleRow['payment_amount'] != 0.0)
                );

                $estat = strtoupper((string)($cycleRow['email_status'] ?? ''));
                $emailSent = (
                    in_array($estat, ['SENT','DELIVERED','DONE'], true) ||
                    !empty($cycleRow['email_message_id']) ||
                    !empty($cycleRow['email_at'])
                );

                $paymentDetails = [
                    'state'  => $paymentIssued ? 'PAID' : 'PENDING',
                    'status' => $paymentIssued ? 'PAID' : 'PENDING',
                    'amount' => isset($cycleRow['payment_amount']) ? (float)$cycleRow['payment_amount'] : 0.0,
                    'ref'    => $cycleRow['payment_ref'] ?? '',
                    'method' => $cycleRow['payment_method'] ?? '',
                    'at'     => $cycleRow['payment_at'] ?? null,
                    'by'     => $cycleRow['payment_by'] ?? '',
                ];
            }
        } catch (\Throwable $e) {
            // keep defaults
        }

        $progress = (int)$reportIssued + (int)$paymentIssued + (int)$emailSent;

        return [
            'progress' => [
                'count' => $progress,
                'total' => 3,
                'label' => sprintf('%d/3', $progress),
            ],
            'report'   => ['status' => $reportIssued ? 'ISSUED' : 'PENDING'],
            'payment'  => $paymentDetails,
            'email'    => [
                'status' => $emailSent ? 'SENT' : 'PENDING',
                'meta'   => $emailSent ? ['at' => $paymentDetails['at']] : null,
            ],
        ];
    }
    /**
     * Get all units that are candidates for a payment request for a given yearMonth.
     *
     * A unit/month is considered a candidate when:
     *  - the unit is ACTIVE
     *  - the report has been issued (owner_report_cycle or workflow flag)
     *  - the closing balance is positive
     *  - the payment has not been issued/marked paid yet
     *
     * The result also exposes the payment_status and payment_requested flags from
     * owner_report_cycle so the UI can pre-select previously requested units.
     *
     * @param string $yearMonth Normalized YYYY-MM string
     * @return array<int, array<string,mixed>>
     */
    public function getPaymentCandidates(string $yearMonth): array
    {
        $candidates = [];

        // Fetch all ACTIVE units; we can also filter further in the loop if needed
        $sqlUnits = <<<SQL
SELECT id, unit_name
FROM unit
WHERE status = 'ACTIVE'
ORDER BY unit_name ASC
SQL;

        try {
            $units = $this->db->fetchAllAssociative($sqlUnits);
        } catch (\Throwable $e) {
            return [];
        }

        foreach ($units as $urow) {
            $unitId = isset($urow['id']) ? (int) $urow['id'] : null;
            if (!$unitId) {
                continue;
            }

            // Build the per-unit/month report once so closing balance & workflow
            // are consistent with what the Unit Monthly page shows.
            try {
                $data = $this->build($unitId, $yearMonth);
            } catch (\Throwable $e) {
                continue;
            }

            $closing = (float) ($data['closingBalance'] ?? 0.0);
            if ($closing <= 0.0) {
                // Only positive balances are candidates for payment
                continue;
            }

            $workflow = $data['workflow'] ?? [];
            $reportIssued = (bool)($workflow['reportIssued'] ?? false);
            $paymentIssued = (bool)($workflow['paymentIssued'] ?? false);

            if (!$reportIssued) {
                // Require an issued report
                continue;
            }

            if ($paymentIssued) {
                // Skip units where payment was already issued/marked paid
                continue;
            }

            // Load owner_report_cycle flags for this unit/month, including payment_status and payment_requested
            $paymentStatus = 'PENDING';
            $paymentRequested = false;

            try {
                $sqlCycle = <<<SQL
SELECT
  payment_status,
  payment_requested,
  report_issued_at,
  report_url
FROM owner_report_cycle
WHERE unit_id = :unit AND report_month = :ym
ORDER BY id DESC
LIMIT 1
SQL;
                $cycleRow = $this->db->fetchAssociative($sqlCycle, [
                    'unit' => $unitId,
                    'ym'   => $yearMonth,
                ]);

                if (is_array($cycleRow)) {
                    $paymentStatus = strtoupper((string)($cycleRow['payment_status'] ?? 'PENDING'));
                    $paymentRequested = (bool)($cycleRow['payment_requested'] ?? false);
                }
            } catch (\Throwable $e) {
                // keep defaults
            }

            // As an extra guard, skip if payment_status already indicates a completed flow
            if (in_array($paymentStatus, ['ISSUED','PAID','SENT','DONE'], true)) {
                continue;
            }

            $unitBlock = $data['unit'] ?? [];
            $clientBlock = $data['client'] ?? [];

            // Only include units where the client has a bank account configured
            $bankAccount = $clientBlock['bank_account'] ?? null;
            if ($bankAccount === null || trim((string) $bankAccount) === '') {
                continue;
            }

            $candidates[] = [
                'unitId'           => $unitId,
                'unitName'         => $unitBlock['unitName'] ?? ($urow['unit_name'] ?? null),
                'closingBalance'   => $closing,
                'paymentStatus'    => $paymentStatus,
                'paymentRequested' => $paymentRequested,
                'reportIssued'     => $reportIssued,
                'paymentIssued'    => $paymentIssued,
                'bankOwner'        => $clientBlock['bank_owner']   ?? null,
                'bankName'         => $clientBlock['bank_name']    ?? null,
                'bankAccount'      => $bankAccount,
                'clientName'       => $clientBlock['name']         ?? null,
            ];
        }

        return $candidates;
    }

    /**
     * Build the data payload (meta + rows) used by the unit_report_pay_request.pdf.twig template.
     *
     * @param string $yearMonth Normalized YYYY-MM string
     * @param array<int,int> $unitIds List of unit IDs to include (if empty, include all candidates)
     * @return array{meta: array<string,mixed>, rows: array<int,array<string,mixed>>}
     */
    public function buildPaymentRequestRows(string $yearMonth, array $unitIds): array
    {
        // Normalise the list of unit IDs (ints, > 0, unique)
        $unitIds = array_values(array_unique(array_filter(array_map('intval', $unitIds), static function (int $id): bool {
            return $id > 0;
        })));

        // Get all candidate units for this month
        $candidates = $this->getPaymentCandidates($yearMonth);

        // Compute YYMM label suffix from the yearMonth (e.g. 2025-11 -> 2511)
        $labelYm = null;
        try {
            $dt = \DateTimeImmutable::createFromFormat('Y-m', $yearMonth);
            if ($dt !== false) {
                $labelYm = $dt->format('ym');
            }
        } catch (\Throwable $e) {
            $labelYm = null;
        }

        $rows = [];

        foreach ($candidates as $c) {
            $cid = isset($c['unitId']) ? (int) $c['unitId'] : null;
            if (!$cid) {
                continue;
            }

            // If a specific subset was requested, skip units not in that subset
            if (!empty($unitIds) && !in_array($cid, $unitIds, true)) {
                continue;
            }

            $unitName = $c['unitName'] ?? ('Unit #' . $cid);

            $paymentLabel = null;
            if ($labelYm !== null) {
                $paymentLabel = sprintf('Pago Reporte %s_%s', $unitName, $labelYm);
            }

            $rows[] = [
                'unitName'     => $unitName,
                'paymentLabel' => $paymentLabel,
                'bankOwner'    => $c['bankOwner']   ?? null,
                'bankName'     => $c['bankName']    ?? null,
                'bankAccount'  => $c['bankAccount'] ?? null,
                'amount'       => isset($c['closingBalance']) ? (float) $c['closingBalance'] : 0.0,
            ];
        }

        // Meta block for the PDF template
        try {
            $tz = new \DateTimeZone('America/Cancun');
        } catch (\Throwable $e) {
            $tz = new \DateTimeZone('UTC');
        }

        $generatedAt = new \DateTimeImmutable('now', $tz);

        $meta = [
            'yearMonth'   => $yearMonth,
            // Let the template fall back to yearMonth when monthLabel is null/empty
            'monthLabel'  => null,
            'generatedAt' => $generatedAt,
            // Default language; controller may override if needed
            'language'    => 'es',
        ];

        return [
            'meta' => $meta,
            'rows' => $rows,
        ];
    }
}