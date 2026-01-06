<?php

namespace App\Service;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use App\Repository\UnitBalanceLedgerRepository;

/**
 * Builds a normalized data payload for rendering the Owner PDF report.
 *
 * Usage:
 *   $payload = $reportDataBuilder->build($unitId, 'YYYY-MM');
 *   // Pass $payload to a Twig template that renders the PDF
 */
class ReportDataBuilder
{
    public function __construct(
        private Connection $conn,
        private UnitBalanceLedgerRepository $ledgerRepo,
    ) {
    }

    /**
     * Build the report payload for a specific Unit and Year-Month (YYYY-MM).
     *
     * @param int    $unitId     The Unit ID
     * @param string $yearMonth  Format YYYY-MM
     *
     * @return array{
     *   meta: array{monthLabel: string, yearMonth: string, closingBalance: float},
     *   company: array{logoUrl: string|null},
     *   unit: array{id:int, name:?string},
     *   client: array{name:?string,email:?string,bankName:?string,bankAccount:?string},
     *   totals: array{
     *     payoutReservas:string, gastosTotalClient:string, abonosTotalClient:string,
     *     monthlyEarnings:string, unitBalanceStart:string, closingBalance:string
     *   },
     *   comments: string|null,
     *   reservas: list<array<string,mixed>>,
     *   gastos: list<array<string,mixed>>,
     *   abonos: list<array<string,mixed>>
     * }
     */
    public function build(int $unitId, string $yearMonth): array
    {
        $ym = substr($yearMonth, 0, 7);
        if (!preg_match('/^\\d{4}-\\d{2}$/', $ym)) {
            throw new \InvalidArgumentException('yearMonth must be in YYYY-MM format');
        }

        // Month boundaries (always use America/Cancun timezone to avoid drift)
        [$yStr, $mStr] = explode('-', $ym);
        $tz = new \DateTimeZone('America/Cancun');
        $start = new DateTimeImmutable(sprintf('%s-%s-01', $yStr, $mStr), $tz);
        $end   = $start->modify('last day of this month');
        $monthLabel = $start->format('F Y'); // e.g., "August 2025"

        // Company (logo can be configured via parameter env APP_COMPANY_LOGO_URL or similar)
        $logoUrl = $_ENV['APP_COMPANY_LOGO_URL'] ?? null;

        // -------------------------
        // Core lookups
        // -------------------------
        $unitRow = $this->conn->createQueryBuilder()
            ->select('u.`id`, u.`unit_name`, u.`client_id`, u.`payment_type`')
            ->from('`unit`', 'u')
            ->where('u.`id` = :unitId')
            ->setParameter('unitId', $unitId)
            ->executeQuery()
            ->fetchAssociative() ?: [];

        $clientRow = [];
        if (!empty($unitRow['client_id'])) {
            // Try to pull the client; columns may differ across installs, so guard with defaults
            try {
                $clientRow = $this->conn->createQueryBuilder()
                    ->select(
                        'c.`id`',
                        'c.`name`',
                        'c.`email`',
                        'c.`language`',
                        // best-effort column guesses for bank info
                        'c.`bank_name`',
                        'c.`bank_account`'
                    )
                    ->from('`client`', 'c')
                    ->where('c.`id` = :cid')
                    ->setParameter('cid', (int) $unitRow['client_id'])
                    ->executeQuery()
                    ->fetchAssociative() ?: [];
            } catch (\Throwable) {
                // Table/columns might not exist; keep clientRow empty
                $clientRow = [];
            }
        }

        // Normalize client language to two-letter code for templates (default: 'es')
        $clientLang = null;
        if (!empty($clientRow['language'])) {
            $clientLang = strtolower(trim((string)$clientRow['language']));
        }
        $langNorm = match ($clientLang) {
            'en', 'eng', 'english'   => 'en',
            'es', 'spa', 'spanish', 'español' => 'es',
            default => 'es',
        };

        // -------------------------
        // Totals (payout/gastos/abonos & balances)
        // Determine unit payment type early so we can shape totals below
        $paymentType = strtoupper((string)($unitRow['payment_type'] ?? ''));
        // -------------------------
        // Payout Reservas: from booking_month_slice. Use the resolved $paymentType to choose the correct column.
        $payoutReservas = '0.00';
        try {
            $qbP = $this->conn->createQueryBuilder();
            if ($paymentType === 'CLIENT') {
                $qbP->select('COALESCE(SUM(b.`payout_in_month`), 0) AS total');
            } else {
                // Default OWNERS2 behavior
                $qbP->select('COALESCE(SUM(b.`owner_payout_in_month`), 0) AS total');
            }
            $qbP->from('`booking_month_slice`', 'b')
                ->where('b.`unit_id` = :unitId')
                ->andWhere('b.`year_month` = :ym')
                ->setParameter('unitId', $unitId)
                ->setParameter('ym', $ym);
            $row = $qbP->executeQuery()->fetchAssociative();
            if ($row && isset($row['total'])) {
                $payoutReservas = number_format((float) $row['total'], 2, '.', '');
            }
        } catch (\Throwable) {
            // leave as 0.00
        }

        // Owners2 Commission (from booking_month_slice.o2_commission_in_month)
        $o2Commission = 0.0;
        try {
            $row = $this->conn->createQueryBuilder()
                ->select('COALESCE(SUM(b.`o2_commission_in_month`), 0) AS total')
                ->from('`booking_month_slice`', 'b')
                ->where('b.`unit_id` = :unitId')
                ->andWhere('b.`year_month` = :ym')
                ->setParameter('unitId', $unitId)
                ->setParameter('ym', $ym)
                ->executeQuery()
                ->fetchAssociative();
            if ($row && isset($row['total'])) {
                $o2Commission = (float) $row['total'];
            }
        } catch (\Throwable) {
            // leave as 0.0
        }

        // Cleaning fees (from booking_month_slice.cleaning_fee_in_month)
        $cleaningTotal = 0.0;
        try {
            $row = $this->conn->createQueryBuilder()
                ->select('COALESCE(SUM(b.`cleaning_fee_in_month`), 0) AS total')
                ->from('`booking_month_slice`', 'b')
                ->where('b.`unit_id` = :unitId')
                ->andWhere('b.`year_month` = :ym')
                ->setParameter('unitId', $unitId)
                ->setParameter('ym', $ym)
                ->executeQuery()
                ->fetchAssociative();
            if ($row && isset($row['total'])) {
                $cleaningTotal = (float) $row['total'];
            }
        } catch (\Throwable) {
            // leave as 0.0
        }

        // Breakdowns by source
        $o2CommissionAirbnb = 0.0;
        $cleaningAirbnb = 0.0;
        $ownerPayoutPrivate = 0.0;
        try {
            $row = $this->conn->createQueryBuilder()
                ->select(
                    "COALESCE(SUM(CASE WHEN UPPER(b.`source`) = 'AIRBNB' THEN b.`o2_commission_in_month` ELSE 0 END), 0) AS o2_airbnb",
                    "COALESCE(SUM(CASE WHEN UPPER(b.`source`) = 'AIRBNB' THEN b.`cleaning_fee_in_month` ELSE 0 END), 0) AS clean_airbnb",
                    "COALESCE(SUM(CASE WHEN UPPER(b.`source`) = 'PRIVATE' THEN b.`owner_payout_in_month` ELSE 0 END), 0) AS owner_payout_private"
                )
                ->from('`booking_month_slice`', 'b')
                ->where('b.`unit_id` = :unitId')
                ->andWhere('b.`year_month` = :ym')
                ->setParameter('unitId', $unitId)
                ->setParameter('ym', $ym)
                ->executeQuery()
                ->fetchAssociative();
            if ($row) {
                $o2CommissionAirbnb = (float) ($row['o2_airbnb'] ?? 0);
                $cleaningAirbnb     = (float) ($row['clean_airbnb'] ?? 0);
                $ownerPayoutPrivate = (float) ($row['owner_payout_private'] ?? 0);
            }
        } catch (\Throwable) {
            // keep zeros
        }

        // Gastos & Abonos: best-effort from unit_transactions, hktransactions, o2transactions (Client CC)
        // Keep HK (cleaning) in the list, but for OWNERS2 units exclude HK from gastos total used for monthly result.
        $gUT = 0.0;   // unit_transactions (Client)
        $gHK = 0.0;   // hktransactions charged (cleaning/housekeeping)
        $gO2 = 0.0;   // o2transactions (Client)
        $abonos = 0.0;

        try {
            // unit_transactions (client-facing)
            $qbUT = $this->conn->createQueryBuilder();
            $qbUT->select(
                "COALESCE(SUM(CASE WHEN UPPER(t.`type`) = 'GASTO' THEN t.`amount` ELSE 0 END),0) AS g",
                "COALESCE(SUM(CASE WHEN UPPER(t.`type`) = 'INGRESO' THEN t.`amount` ELSE 0 END),0) AS a"
            )
                ->from('`unit_transactions`', 't')
                ->where('t.`unit_id` = :unitId')
                ->andWhere('t.`date` BETWEEN :start AND :end')
                ->andWhere("t.`cost_center` = 'Client'")
                ->setParameter('unitId', $unitId)
                ->setParameter('start', $start->format('Y-m-d'))
                ->setParameter('end', $end->format('Y-m-d'));
            $r = $qbUT->executeQuery()->fetchAssociative();
            if ($r) {
                $gUT += (float) ($r['g'] ?? 0);
                $abonos += (float) ($r['a'] ?? 0);
            }
        } catch (\Throwable) {
            // table may not exist; ignore
        }

        // Rule: Exclude Limpieza (category_id=7); Include Limpieza_extra (category_id=8). Only cost_centre='Client'.
        try {
            // hktransactions (housekeeping)
            $qbHK = $this->conn->createQueryBuilder();
            $qbHK->select(
                "COALESCE(SUM(h.`charged`),0) AS g",
                "COALESCE(SUM(h.`paid`),0) AS a"
            )
                ->from('`hktransactions`', 'h')
                ->where('h.`unit_id` = :unitId')
                ->andWhere('h.`date` BETWEEN :start AND :end')
                ->andWhere("h.`cost_centre` = 'Client'")
                ->andWhere('(h.`category_id` IS NULL OR h.`category_id` <> 7)')
                ->andWhere('h.`charged` > 0')
                ->setParameter('unitId', $unitId)
                ->setParameter('start', $start->format('Y-m-d'))
                ->setParameter('end', $end->format('Y-m-d'));
            $r2 = $qbHK->executeQuery()->fetchAssociative();
            if ($r2) {
                $gHK += (float) ($r2['g'] ?? 0);
                // $abonos no longer includes HK
            }
        } catch (\Throwable) {
            // table may not exist; ignore
        }

        try {
            // o2transactions (Owners2 ops) – only Client cost centre
            $qbO2 = $this->conn->createQueryBuilder();
            $qbO2->select(
                "COALESCE(SUM(CASE WHEN UPPER(o2.`type`) = 'GASTO' THEN o2.`amount` ELSE 0 END),0) AS g",
                "COALESCE(SUM(CASE WHEN UPPER(o2.`type`) = 'ABONO' THEN o2.`amount` ELSE 0 END),0) AS a"
            )
                ->from('`o2transactions`', 'o2')
                ->where('o2.`unit_id` = :unitId')
                ->andWhere('o2.`date` BETWEEN :start AND :end')
                ->andWhere("o2.`cost_centre` = 'Client'")
                ->setParameter('unitId', $unitId)
                ->setParameter('start', $start->format('Y-m-d'))
                ->setParameter('end', $end->format('Y-m-d'));
            $r3 = $qbO2->executeQuery()->fetchAssociative();
            if ($r3) {
                $gO2 += (float) ($r3['g'] ?? 0);
                // $abonos no longer includes O2
            }
        } catch (\Throwable) {
            // table may not exist; ignore
        }

        // Compute gastos total:
        // Include HK except Limpieza (category_id=7). Limpieza_extra (id=8) and others are included.
        // Applies to both OWNERS2 and CLIENT units.
        $gastos = $gUT + $gHK + $gO2;
        $gastosTotalClient = number_format($gastos, 2, '.', '');
        $abonosTotalClient = number_format($abonos, 2, '.', '');

        // Opening balance — align with service logic: repository helper with next-month cutoff rules
        $carryOver = 0.00;
        try {
            $found = $this->ledgerRepo->findOpeningBalanceForMonth($unitId, $ym);
            if ($found !== null) {
                $carryOver = (float) $found;
            }
            @error_log(sprintf('[ReportDataBuilder] opening probe unit=%d ym=%s found=%s carryOver=%0.2f',
                $unitId, $ym, var_export($found, true), $carryOver
            ));
        } catch (\Throwable) {
            // keep default 0.00
        }

        // Monthly earnings & closing
        $payoutFloat = (float) $payoutReservas;
        if ($paymentType === 'CLIENT') {
            // Business rule:
            // Client Credit  = Private client pay (owner_payout_in_month where source=Private) + Abonos
            // Client Debit   = Airbnb O2 commission + Airbnb Cleaning + Gastos
            $clientCreditTotal = $ownerPayoutPrivate + (float) $abonosTotalClient;
            $clientDebitTotal  = $o2CommissionAirbnb + $cleaningAirbnb + (float) $gastosTotalClient;
            // Monthly result shown to client is negative when they owe O2:
            $monthlyEarnings   = - ( $clientDebitTotal - $clientCreditTotal );
        } else {
            // OWNERS2 flow (unchanged): net to unit ledger
            $clientCreditTotal = null;
            $clientDebitTotal  = null;
            $monthlyEarnings   = $payoutFloat + (float) $abonosTotalClient - (float) $gastosTotalClient;
        }
        $closingBalance = $carryOver + $monthlyEarnings;

        // Comments: latest REPORT note for this unit & month from client_unit_note
        $comments = null;
        try {
            $noteRow = $this->conn->createQueryBuilder()
                ->select('n.`note_comment`')
                ->from('`client_unit_note`', 'n')
                ->where('n.`unit_id` = :unitId')
                ->andWhere("n.`entry_type` = 'REPORT'")
                ->andWhere('n.`note_year_month` = :ym')
                ->orderBy('n.`created_at`', 'DESC')
                ->setMaxResults(1)
                ->setParameter('unitId', $unitId)
                ->setParameter('ym', $ym)
                ->executeQuery()
                ->fetchOne();

            if ($noteRow !== false && $noteRow !== null) {
                $comments = (string) $noteRow;
            }
        } catch (\Throwable) {
            // leave as null if table/columns missing
        }

        // Lists (best-effort)
        $reservas = [];
        try {
            $reservas = $this->conn->createQueryBuilder()
                ->select(
                    'b.`id`',
                    'b.`source`',
                    'ab.`guest_name` AS guestName',
                    'ab.`check_in` AS checkIn',
                    'ab.`check_out` AS checkOut',
                    'b.`nights_in_month` AS nightsInMonth',
                    'b.`net_payout_in_month` AS netPayoutInMonth',
                    'b.`commission_base_in_month` AS commissionBaseInMonth',
                    'b.`cleaning_fee_in_month` AS cleaningFeeInMonth',
                    'b.`o2_commission_in_month` AS o2CommissionInMonth',
                    'b.`owner_payout_in_month` AS ownerPayoutInMonth',
                    'ab.`status` AS status',
                    'ab.`tax_percent` AS taxPercent',
                    'ab.`payment_method` AS paymentMethod',
                    'ab.`commission_percent` AS commissionPercent',
                    'ab.`cleaning_fee` AS cleaningFee'
                )
                ->from('`booking_month_slice`', 'b')
                ->innerJoin('b', '`all_bookings`', 'ab', 'ab.`id` = b.`booking_id`')
                ->where('b.`unit_id` = :unitId')
                ->andWhere('b.`year_month` = :ym')
                ->orderBy('ab.`check_in`', 'ASC')
                ->setParameter('unitId', $unitId)
                ->setParameter('ym', $ym)
                ->executeQuery()
                ->fetchAllAssociative();
        } catch (\Throwable) {
            $reservas = [];
        }

        // Filter out any cancelled/canceled bookings (do not include them in reports)
        if (isset($reservas) && is_array($reservas)) {
            $reservas = array_values(array_filter($reservas, function(array $r): bool {
                $status = strtolower(trim((string)($r['status'] ?? '')));
                return $status !== 'cancelled' && $status !== 'canceled';
            }));
        }

        // Ensure cancelled bookings do not contribute cleaning, nights, or room-fee base in aggregates
        if (isset($reservas) && is_array($reservas)) {
            foreach ($reservas as &$r) {
                $status = strtoupper((string)($r['status'] ?? ''));
                if ($status === 'CANCELLED') {
                    // No cleaning fee for cancelled
                    $r['cleaningFeeInMonth'] = 0.0;
                    // Do not count nights (affects Occupancy %)
                    if (array_key_exists('nightsInMonth', $r)) {
                        $r['nightsInMonth'] = 0;
                    }
                    // Do not count room fee base in Avg Room Fee per Night
                    // (netPayoutInMonth is NOT zeroed for display)
                    if (array_key_exists('commissionBaseInMonth', $r)) {
                        $r['commissionBaseInMonth'] = 0.0;
                    }
                }
            }
            unset($r);
        }


        // Build detailed lists
        $gastosListUT = [];
        try {
            $gastosListUT = $this->conn->createQueryBuilder()
                ->select(
                    't.`id`',
                    't.`date`',
                    't.`description` AS concept',
                    't.`amount`',
                    't.`type`',
                    't.`category_id`',
                    't.`comments`'
                )
                ->from('`unit_transactions`', 't')
                ->where('t.`unit_id` = :unitId')
                ->andWhere('t.`date` BETWEEN :start AND :end')
                ->andWhere("UPPER(t.`type`) = 'GASTO'")
                ->andWhere("t.`cost_center` = 'Client'")
                ->orderBy('t.`date`', 'ASC')
                ->setParameter('unitId', $unitId)
                ->setParameter('start', $start->format('Y-m-d'))
                ->setParameter('end', $end->format('Y-m-d'))
                ->executeQuery()
                ->fetchAllAssociative();
        } catch (\Throwable) { $gastosListUT = []; }

        $gastosListHK = $this->conn->createQueryBuilder()
            ->select(
                'h.`id`',
                'h.`date`',
                'h.`description` AS concept',
                'h.`charged` AS amount',
                'h.`category_id`',
                "'HK_GASTO' AS type"
            )
            ->from('`hktransactions`', 'h')
            ->where('h.`unit_id` = :unitId')
            ->andWhere('h.`date` BETWEEN :start AND :end')
            ->andWhere("h.`cost_centre` = 'Client'")
            ->andWhere('(h.`category_id` IS NULL OR h.`category_id` <> 7)')
            ->andWhere('h.`charged` > 0')
            ->orderBy('h.`date`', 'ASC')
            ->setParameter('unitId', $unitId)
            ->setParameter('start', $start->format('Y-m-d'))
            ->setParameter('end', $end->format('Y-m-d'))
            ->executeQuery()
            ->fetchAllAssociative();

        // o2transactions gastos (client)
        $gastosListO2 = [];
        try {
            $gastosListO2 = $this->conn->createQueryBuilder()
                ->select(
                    'o2.`id`',
                    'o2.`date`',
                    'o2.`description` AS concept',
                    'o2.`amount`',
                    'o2.`category_id`',
                    "'O2_GASTO' AS type"
                )
                ->from('`o2transactions`', 'o2')
                ->where('o2.`unit_id` = :unitId')
                ->andWhere('o2.`date` BETWEEN :start AND :end')
                ->andWhere("UPPER(o2.`type`) = 'GASTO'")
                ->andWhere("o2.`cost_centre` = 'Client'")
                ->orderBy('o2.`date`', 'ASC')
                ->setParameter('unitId', $unitId)
                ->setParameter('start', $start->format('Y-m-d'))
                ->setParameter('end', $end->format('Y-m-d'))
                ->executeQuery()
                ->fetchAllAssociative();
        } catch (\Throwable) { $gastosListO2 = []; }

        // Resolve category names safely without referencing missing tables
        $dbName = $this->conn->createQueryBuilder()->select('DATABASE() as db')->executeQuery()->fetchOne();
        $tableExists = function(string $table) use ($dbName) : bool {
            try {
                $q = $this->conn->createQueryBuilder()
                    ->select('COUNT(*)')
                    ->from('information_schema.TABLES')
                    ->where('TABLE_SCHEMA = :db AND TABLE_NAME = :t')
                    ->setParameter('db', $dbName)
                    ->setParameter('t', $table)
                    ->executeQuery()
                    ->fetchOne();
                return (int)$q > 0;
            } catch (\Throwable) { return false; }
        };

        $fetchCategoryNames = function(string $table, array $ids) {
            if (empty($ids)) return [];
            $qb = $this->conn->createQueryBuilder();
            $qb->select('c.`id`, c.`name`')->from('`'.$table.'`', 'c')->where('c.`id` IN (:ids)')->setParameter('ids', array_values(array_unique($ids)), Connection::PARAM_INT_ARRAY);
            try { return $qb->executeQuery()->fetchAllAssociativeIndexed(); } catch (\Throwable) { return []; }
        };

        // Owners2 categories (explicit list first)
        $utIds = array_values(array_filter(array_column($gastosListUT, 'category_id')));
        $utNames = [];
        foreach (['transaction_category','unit_transaction_category','category'] as $t) {
            if ($tableExists($t)) { $tmp = $fetchCategoryNames($t, $utIds); if ($tmp) { $utNames = $tmp; break; } }
        }
        // Fallback: discover any table with id+name columns that contains these IDs
        if (!$utNames && $utIds) {
            try {
                $candidates = $this->conn->createQueryBuilder()
                    ->select('c.TABLE_NAME')
                    ->from('information_schema.COLUMNS', 'c')
                    ->where('c.TABLE_SCHEMA = :db')
                    ->andWhere('c.COLUMN_NAME IN ("id","name")')
                    ->groupBy('c.TABLE_NAME')
                    ->having('COUNT(DISTINCT c.COLUMN_NAME) = 2')
                    ->setParameter('db', $dbName)
                    ->executeQuery()->fetchFirstColumn();
                // Prioritize category-ish tables
                usort($candidates, function($a,$b){
                    $ra = (int) (preg_match('/category|cat/i', $a) ? 0 : 1);
                    $rb = (int) (preg_match('/category|cat/i', $b) ? 0 : 1);
                    return $ra <=> $rb;
                });
                foreach ($candidates as $t) {
                    $tmp = $fetchCategoryNames($t, $utIds);
                    if ($tmp) { $utNames = $tmp; break; }
                }
            } catch (\Throwable) { /* ignore */ }
        }

        // HK categories (explicit list first)
        $hkIds = array_values(array_filter(array_column($gastosListHK, 'category_id')));
        $hkNames = [];
        foreach (['hk_category','hk_categories','category'] as $t) {
            if ($tableExists($t)) { $tmp = $fetchCategoryNames($t, $hkIds); if ($tmp) { $hkNames = $tmp; break; } }
        }
        // Fallback: dynamic discovery of table with id+name columns
        if (!$hkNames && $hkIds) {
            try {
                $candidates = $this->conn->createQueryBuilder()
                    ->select('c.TABLE_NAME')
                    ->from('information_schema.COLUMNS', 'c')
                    ->where('c.TABLE_SCHEMA = :db')
                    ->andWhere('c.COLUMN_NAME IN ("id","name")')
                    ->groupBy('c.TABLE_NAME')
                    ->having('COUNT(DISTINCT c.COLUMN_NAME) = 2')
                    ->setParameter('db', $dbName)
                    ->executeQuery()->fetchFirstColumn();
                // Prefer hk/category-ish tables
                usort($candidates, function($a,$b){
                    $score = function($x){
                        $s = 0;
                        if (preg_match('/hk/i', $x)) $s -= 2;
                        if (preg_match('/category|cat/i', $x)) $s -= 1;
                        return $s;
                    };
                    return $score($a) <=> $score($b);
                });
                foreach ($candidates as $t) {
                    $tmp = $fetchCategoryNames($t, $hkIds);
                    if ($tmp) { $hkNames = $tmp; break; }
                }
            } catch (\Throwable) { /* ignore */ }
        }

        // O2 categories (explicit and dynamic discovery, reuse Owners2 preference)
        $o2Ids = array_values(array_filter(array_column($gastosListO2, 'category_id')));
        $o2Names = [];
        foreach (['o2_category','transaction_category','category'] as $t) {
            if ($tableExists($t)) { $tmp = $fetchCategoryNames($t, $o2Ids); if ($tmp) { $o2Names = $tmp; break; } }
        }
        if (!$o2Names && $o2Ids) {
            try {
                $candidates = $this->conn->createQueryBuilder()
                    ->select('c.TABLE_NAME')
                    ->from('information_schema.COLUMNS', 'c')
                    ->where('c.TABLE_SCHEMA = :db')
                    ->andWhere('c.COLUMN_NAME IN ("id","name")')
                    ->groupBy('c.TABLE_NAME')
                    ->having('COUNT(DISTINCT c.COLUMN_NAME) = 2')
                    ->setParameter('db', $dbName)
                    ->executeQuery()->fetchFirstColumn();
                usort($candidates, function($a,$b){
                    $ra = (int) (preg_match('/o2|owners2/i', $a) ? 0 : (preg_match('/category|cat/i', $a) ? 1 : 2));
                    $rb = (int) (preg_match('/o2|owners2/i', $b) ? 0 : (preg_match('/category|cat/i', $b) ? 1 : 2));
                    return $ra <=> $rb;
                });
                foreach ($candidates as $t) {
                    $tmp = $fetchCategoryNames($t, $o2Ids);
                    if ($tmp) { $o2Names = $tmp; break; }
                }
            } catch (\Throwable) { /* ignore */ }
        }

        foreach ($gastosListO2 as &$rowO2) {
            if (!empty($rowO2['category_id']) && isset($o2Names[$rowO2['category_id']])) {
                // use the same key as Owners2 so Twig prints it via g.category
                $rowO2['category'] = $o2Names[$rowO2['category_id']]['name'] ?? null;
            }
        }
        unset($rowO2);

        // Attach resolved names
        foreach ($gastosListUT as &$rowUT) {
            if (empty($rowUT['category']) && !empty($rowUT['category_id']) && isset($utNames[$rowUT['category_id']])) {
                $rowUT['category'] = $utNames[$rowUT['category_id']]['name'] ?? null;
            }
        }
        unset($rowUT);
        foreach ($gastosListHK as &$rowHK) {
            if (!empty($rowHK['category_id']) && isset($hkNames[$rowHK['category_id']])) {
                $rowHK['name'] = $hkNames[$rowHK['category_id']]['name'] ?? null;
            }
        }
        unset($rowHK);

        $abonosListUT = [];
        try {
            $abonosListUT = $this->conn->createQueryBuilder()
                ->select(
                    't.`id`',
                    't.`unit_id`',
                    't.`date`',
                    't.`description` AS concept',
                    't.`amount`',
                    't.`comments`',
                    't.`type`',
                    't.`cost_center`',
                    't.`category_id`'
                )
                ->from('`unit_transactions`', 't')
                ->where('t.`unit_id` = :unitId')
                ->andWhere('t.`date` BETWEEN :start AND :end')
                ->andWhere("UPPER(t.`type`) = 'INGRESO'")
                ->andWhere("t.`cost_center` = 'Client'")
                ->orderBy('t.`date`', 'ASC')
                ->setParameter('unitId', $unitId)
                ->setParameter('start', $start->format('Y-m-d'))
                ->setParameter('end', $end->format('Y-m-d'))
                ->executeQuery()
                ->fetchAllAssociative();
        } catch (\Throwable) { $abonosListUT = []; }

        // Resolve category names for Abonos similar to Gastos Owners2
        $abIds = array_values(array_filter(array_column($abonosListUT, 'category_id')));
        $abNames = [];
        foreach (['transaction_category','unit_transaction_category','category'] as $t) {
            if ($tableExists($t)) { $tmp = $fetchCategoryNames($t, $abIds); if ($tmp) { $abNames = $tmp; break; } }
        }
        // Fallback: discover any table with id+name columns that contains these IDs
        if (!$abNames && $abIds) {
            try {
                $candidates = $this->conn->createQueryBuilder()
                    ->select('c.TABLE_NAME')
                    ->from('information_schema.COLUMNS', 'c')
                    ->where('c.TABLE_SCHEMA = :db')
                    ->andWhere('c.COLUMN_NAME IN ("id","name")')
                    ->groupBy('c.TABLE_NAME')
                    ->having('COUNT(DISTINCT c.COLUMN_NAME) = 2')
                    ->setParameter('db', $dbName)
                    ->executeQuery()->fetchFirstColumn();
                // Prioritize category-ish tables
                usort($candidates, function($a,$b){
                    $ra = (int) (preg_match('/category|cat/i', $a) ? 0 : 1);
                    $rb = (int) (preg_match('/category|cat/i', $b) ? 0 : 1);
                    return $ra <=> $rb;
                });
                foreach ($candidates as $t) {
                    $tmp = $fetchCategoryNames($t, $abIds);
                    if ($tmp) { $abNames = $tmp; break; }
                }
            } catch (\Throwable) { /* ignore */ }
        }
        // Attach resolved names to abonosListUT
        foreach ($abonosListUT as &$rowAb) {
            if (!empty($rowAb['category_id']) && isset($abNames[$rowAb['category_id']])) {
                // Use the same key as Gastos so Twig reads a.category
                $rowAb['category'] = $abNames[$rowAb['category_id']]['name'] ?? null;
            }
        }
        unset($rowAb);

        $abonosListHK = [];
        $abonosListO2 = [];

        // Merge all sources so the template sees complete lists
        $gastosList = array_merge($gastosListUT, $gastosListHK, $gastosListO2);

        $gastosList = array_map(function(array $row) {
            if (isset($row['amount'])) { $row['amount'] = (float) $row['amount']; }
            // Keep original description/concept as-is
            $base = $row['description'] ?? $row['concept'] ?? '';
            $row['description'] = (string) $base;
            // Ensure keys and drop comments so templates cannot render them
            if (!array_key_exists('category', $row)) { $row['category'] = null; }
            if (!array_key_exists('name', $row)) { $row['name'] = null; }
            if (array_key_exists('comments', $row)) { unset($row['comments']); }
            return $row;
        }, $gastosList);

        // --- Group & sort gastos ---
        // Build groups using category_id when available; fallback to label. Label comes from
        // `category` (UT/O2) or `name` (HK). Default label is 'Otros'.
        $groupBuckets = [];
        foreach ($gastosList as $row) {
            $label = $row['category'] ?? $row['name'] ?? 'Otros';
            $catId = $row['category_id'] ?? null;
            if ($catId === null && $label === 'Otros') {
                $catId = 15; // conventional id for 'Otros' when missing
            }
            $key = $catId !== null ? ('#'.$catId) : $label;
            if (!isset($groupBuckets[$key])) {
                $groupBuckets[$key] = [
                    'id'    => is_numeric($catId) ? (int)$catId : null,
                    'label' => (string)$label,
                    'items' => [],
                ];
            }
            $groupBuckets[$key]['items'][] = $row;
        }

        // Sort items inside each group chronologically (date ASC)
        foreach ($groupBuckets as &$g) {
            usort($g['items'], function(array $a, array $b) {
                $da = (string)($a['date'] ?? '');
                $db = (string)($b['date'] ?? '');
                return strcmp($da, $db);
            });
        }
        unset($g);

        // Convert to ordered list: alphabetically by label, but push 'Otros' (id=15) to the end
        $gastosGrouped = array_values($groupBuckets);
        usort($gastosGrouped, function(array $a, array $b) {
            $aIsOtros = ((int)($a['id'] ?? 0) === 15) || (strcasecmp($a['label'] ?? '', 'Otros') === 0);
            $bIsOtros = ((int)($b['id'] ?? 0) === 15) || (strcasecmp($b['label'] ?? '', 'Otros') === 0);
            if ($aIsOtros && !$bIsOtros) return 1;   // a after b
            if ($bIsOtros && !$aIsOtros) return -1;  // b after a
            return strcasecmp($a['label'] ?? '', $b['label'] ?? '');
        });

        $abonosList = array_map(function(array $row) {
            if (isset($row['amount'])) { $row['amount'] = (float) $row['amount']; }
            $base = $row['description'] ?? $row['concept'] ?? '';
            $row['description'] = (string) $base;
            if (!array_key_exists('category', $row)) { $row['category'] = null; }
            if (!array_key_exists('name', $row)) { $row['name'] = null; }
            if (array_key_exists('comments', $row)) { unset($row['comments']); }
            return $row;
        }, $abonosListUT);

        $payload = [
            'meta' => [
                'monthLabel' => $monthLabel,
                'yearMonth'  => $ym,
                'closingBalance' => $closingBalance,
                'language' => $langNorm,
                'timezone' => 'America/Cancun',
            ],
            'company' => [
                'logoUrl' => $logoUrl,
            ],
            'unit' => [
                'id'           => $unitRow['id'] ?? $unitId,
                'name'         => $unitRow['unit_name'] ?? null,
                'payment_type' => $unitRow['payment_type'] ?? null,
                'paymentType'  => $unitRow['payment_type'] ?? null, // alias for Twig parity
            ],
            'client' => [
                'name'        => $clientRow['name'] ?? null,
                'email'       => $clientRow['email'] ?? null,
                'language'    => $langNorm,
                'bankName'    => $clientRow['bank_name'] ?? null,
                'bankAccount' => $clientRow['bank_account'] ?? null,
            ],
            'totals' => [
                'payoutReservas'   => number_format($payoutFloat, 2, '.', ''),
                'o2Commission'     => number_format($o2Commission, 2, '.', ''),
                'cleaningTotal'    => number_format($cleaningTotal, 2, '.', ''),
                'gastosTotalClient'=> number_format((float) $gastosTotalClient, 2, '.', ''),
                'abonosTotalClient'=> number_format((float) $abonosTotalClient, 2, '.', ''),
                'monthlyEarnings'  => number_format($monthlyEarnings, 2, '.', ''),
                'unitBalanceStart' => number_format($carryOver, 2, '.', ''),
                'closingBalance'   => number_format($closingBalance, 2, '.', ''),
                'o2CommissionAirbnb' => number_format($o2CommissionAirbnb, 2, '.', ''),
                'cleaningAirbnb'     => number_format($cleaningAirbnb, 2, '.', ''),
                'ownerPayoutPrivate' => number_format($ownerPayoutPrivate, 2, '.', ''),
            ],
            'clientCredit' => [
                'total'   => $paymentType === 'CLIENT' ? number_format($clientCreditTotal, 2, '.', '') : null,
                'payouts' => $paymentType === 'CLIENT' ? number_format($ownerPayoutPrivate, 2, '.', '') : null,
                'credits' => $paymentType === 'CLIENT' ? number_format((float) $abonosTotalClient, 2, '.', '') : null,
            ],
            'clientDebit' => [
                'total'   => $paymentType === 'CLIENT' ? number_format($clientDebitTotal, 2, '.', '') : null,
            ],
            'comments' => $comments,
            'reservas' => $reservas,
            'gastos'   => $gastosList,
            'gastosGrouped' => $gastosGrouped, // ordered groups with items
            'abonos'   => $abonosList,
        ];
        // Deterministic signature to verify Preview vs PDF payload equality
        try { $payload['meta']['payloadSignature'] = hash('sha256', json_encode($payload)); } catch (\Throwable) { /* ignore */ }
        return $payload;
    }
}
