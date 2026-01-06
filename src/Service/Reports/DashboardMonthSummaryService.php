<?php

namespace App\Service\Reports;

use DateInterval;
use DateTimeImmutable;
use Doctrine\DBAL\Connection;

/**
 * Aggregates "Month Summary" metrics in ONE pass for the dashboard cards.
 *
 * Data sources (table/columns expected):
 * - unit(id, status, city, client_id)
 * - client(id)
 * - booking_month_slice(yearmonth, o2_commission_in_month, city, booking_id)
 * - all_bookings(id, city, check_in, check_out, guests)
 * - review_action(id, reservation_id, status)  -- where status='made' means posted
 *
 * All queries use DBAL for speed and to avoid entity overhead.
 */
class DashboardMonthSummaryService
{
    public function __construct(private Connection $db) {}

    /**
     * Build a compact payload for the dashboard:
     *  - For year 2025: September, October, November, December
     *  - For years &gt; 2025: January through December
     *  - YTD (from Jan 1 to end of $yearMonth)
     *
     * @param string $yearMonth YYYY-MM
     */
    public function getDashboardMonthSummary(string $yearMonth): array
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            throw new \InvalidArgumentException('yearMonth must be in YYYY-MM format');
        }

        [$y, $m] = array_map('intval', explode('-', $yearMonth));
        $base = new DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m));

        // For 2025 we only care about the "high season" window (Sep–Dec).
        // For later years we show the full year (Jan–Dec).
        $startMonth = ($y === 2025) ? 9 : 1;

        $periods = [];
        for ($monthNum = $startMonth; $monthNum <= 12; $monthNum++) {
            $monthDate = new DateTimeImmutable(sprintf('%04d-%02d-01', $y, $monthNum));
            // Use short month name as key (jan, feb, mar, ...) to keep keys stable but
            // consumers typically just care about the ordered values.
            $key = strtolower($monthDate->format('M'));
            $periods[$key] = $this->buildMonth($monthDate);
        }

        // Always append a YTD aggregate up to the requested base month.
        $periods['ytd'] = $this->buildYtd($base);

        return [
            'ok'        => true,
            'year'      => (int)$y,
            'baseMonth' => $base->format('Y-m'),
            'periods'   => $periods,
        ];
    }

    /**
     * Return total O2 commissions per month starting from a given YYYY-MM.
     *
     * @param string $startYearMonth YYYY-MM (inclusive)
     * @return array<int, array{year_month: string, commissions: float}>
     */
    public function getMonthlyCommissionsFrom(string $startYearMonth): array
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $startYearMonth)) {
            throw new \InvalidArgumentException('startYearMonth must be in YYYY-MM format');
        }

        $sql = <<<SQL
            SELECT
                year_month,
                COALESCE(SUM(o2_commission_in_month), 0) AS commissions
            FROM booking_month_slice
            WHERE year_month >= :startYm
            GROUP BY year_month
            ORDER BY year_month ASC
        SQL;

        $rows = $this->db->fetchAllAssociative($sql, ['startYm' => $startYearMonth]);

        return array_map(static function (array $row): array {
            return [
                'year_month'  => (string) $row['year_month'],
                'commissions' => (float) $row['commissions'],
            ];
        }, $rows);
    }


    /**
     * Compute a bottom-trimmed mean.
     *
     * - Sorts ascending and trims the bottom $bottomTrimRatio (e.g. 0.10 = 10%).
     * - Returns null if there are no usable values.
     *
     * @param float[] $values
     */
    private function trimmedMeanWithCutoff(array $values, float $bottomTrimRatio = 0.10, float $cutoff = 0.0): ?float
    {
        // Filter out nulls
        $filtered = [];
        foreach ($values as $v) {
            if ($v === null) {
                continue;
            }
            $filtered[] = (float) $v;
        }

        $n = count($filtered);
        if ($n === 0) {
            return null;
        }

        sort($filtered); // ascending

        $trim = (int) floor($n * $bottomTrimRatio);
        if ($trim >= $n) {
            // If trimming would remove everything, fall back to simple mean
            return array_sum($filtered) / $n;
        }

        $slice = array_slice($filtered, $trim);
        if (count($slice) === 0) {
            $slice = $filtered;
        }

        return array_sum($slice) / count($slice);
    }

    /** -------- helpers -------- */


    private function buildMonth(DateTimeImmutable $month): array
    {
        $ym   = $month->format('Y-m');
        $from = $month->format('Y-m-01 00:00:00');
        $to   = $month->add(new DateInterval('P1M'))->format('Y-m-01 00:00:00');

        // Units & clients active during this month window
        // Active-in-window means:
        //  - (date_ended IS NULL OR date_ended >= :from)
        //  - AND (date_started IS NULL OR date_started < :to)
        //  - AND status NOT IN ('Inactive','Onboarding','Alor','Internal') (case-insensitive)
        $units = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM unit
             WHERE (date_ended IS NULL OR date_ended >= :from)
               AND (date_started IS NULL OR date_started < :to)
               AND LOWER(COALESCE(status,'')) NOT IN ('inactive','onboarding','alor','internal')",
            ['from' => $from, 'to' => $to]
        );

        $unitsPlaya = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM unit
             WHERE (date_ended IS NULL OR date_ended >= :from)
               AND (date_started IS NULL OR date_started < :to)
               AND LOWER(COALESCE(status,'')) NOT IN ('inactive','onboarding','alor','internal')
               AND city = 'Playa del Carmen'",
            ['from' => $from, 'to' => $to]
        );

        $unitsTulum = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM unit
             WHERE (date_ended IS NULL OR date_ended >= :from)
               AND (date_started IS NULL OR date_started < :to)
               AND LOWER(COALESCE(status,'')) NOT IN ('inactive','onboarding','alor','internal')
               AND city = 'Tulum'",
            ['from' => $from, 'to' => $to]
        );

        $clients = (int)$this->db->fetchOne(
            "SELECT COUNT(DISTINCT client_id) FROM unit
             WHERE client_id IS NOT NULL
               AND (date_ended IS NULL OR date_ended >= :from)
               AND (date_started IS NULL OR date_started < :to)
               AND LOWER(COALESCE(status,'')) NOT IN ('inactive','onboarding','alor','internal')",
            ['from' => $from, 'to' => $to]
        );

        // Commissions (booking_month_slice is already month-sliced)
        $commissions = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(o2_commission_in_month),0)
             FROM `booking_month_slice`
             WHERE `year_month` = :ym",
            ['ym' => $ym]
        );

        $commissionsPlaya = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(o2_commission_in_month),0)
             FROM `booking_month_slice`
             WHERE `year_month` = :ym
               AND `city` = 'Playa del Carmen'",
            ['ym' => $ym]
        );

        $commissionsTulum = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(o2_commission_in_month),0)
             FROM `booking_month_slice`
             WHERE `year_month` = :ym
               AND `city` = 'Tulum'",
            ['ym' => $ym]
        );

        // Gross earnings for Owners2-managed units (sum of payout_in_month)
        $grossEarnings = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(b.payout_in_month),0)
             FROM `booking_month_slice` b
               INNER JOIN `unit` u ON u.`id` = b.`unit_id`
             WHERE b.`year_month` = :ym
               AND u.`payment_type` = 'Owners2'",
            ['ym' => $ym]
        );

        // O2Transactions net (Ingresos - Gastos) for this month
        $o2Net = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(
                 CASE
                   WHEN type = 'Ingreso' THEN amount
                   WHEN type = 'Gasto'   THEN -amount
                   ELSE 0
                 END
             ), 0)
             FROM `o2transactions`
             WHERE `date` >= :from AND `date` < :to",
            ['from' => $from, 'to' => $to]
        );

        // Employee financial ledger (Owners2 division, salary entries) – positive amount but represents expense
        // We consider salary rows whose period range overlaps the month window.
        $employeeNet = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(amount),0)
             FROM `employee_financial_ledger`
             WHERE `type` = 'salary'
               AND `division` = 'Owners2'
               AND `period_start` < :to
               AND `period_end` >= :from",
            ['from' => $from, 'to' => $to]
        );

        // Net result = commissions + o2 net + employee net (employeeNet is an expense, so we subtract it)
        $netResult = $commissions + $o2Net - $employeeNet;

        // Reservations & Guests (check_in month = column month)
        $resGuests = $this->db->fetchAssociative(
            "SELECT COUNT(*) AS reservations, COALESCE(SUM(guests),0) AS guests
             FROM `all_bookings`
             WHERE `check_in` >= :from
               AND `check_in` < :to
               AND `status` <> 'Cancelled'",
            ['from' => $from, 'to' => $to]
        ) ?: ['reservations' => 0, 'guests' => 0];

        $reservations = (int)$resGuests['reservations'];
        $guests       = (int)$resGuests['guests'];

        // Reservations by source (Airbnb vs Private), same month window and status filter
        $reservationsAirbnb = (int)$this->db->fetchOne(
            "SELECT COUNT(*)
             FROM `all_bookings`
             WHERE `check_in` >= :from
               AND `check_in` < :to
               AND `status` <> 'Cancelled'
               AND `source` = 'Airbnb'",
            ['from' => $from, 'to' => $to]
        );

        $reservationsPrivate = (int)$this->db->fetchOne(
            "SELECT COUNT(*)
             FROM `all_bookings`
             WHERE `check_in` >= :from
               AND `check_in` < :to
               AND `status` <> 'Cancelled'
               AND `source` = 'Private'",
            ['from' => $from, 'to' => $to]
        );

        // Reviews (eligible = check_out in month; made = review_action.status='made')
        $reviewsTotal = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `all_bookings`
             WHERE `check_out` >= :from AND `check_out` < :to
               AND `source` = 'Airbnb'
               AND `status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        $reviewsMade = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `review_action` ra
               INNER JOIN `all_bookings` b ON b.`id` = ra.`reservation_id`
             WHERE ra.`status` = 'made'
               AND b.`check_out` >= :from AND b.`check_out` < :to
               AND b.`source` = 'Airbnb'
               AND b.`status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        $reviewsSkipped = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `review_action` ra
               INNER JOIN `all_bookings` b ON b.`id` = ra.`reservation_id`
             WHERE ra.`status` = 'skipped'
               AND b.`check_out` >= :from AND b.`check_out` < :to
               AND b.`source` = 'Airbnb'
               AND b.`status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        $reviewsTimeout = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `review_action` ra
               INNER JOIN `all_bookings` b ON b.`id` = ra.`reservation_id`
             WHERE ra.`status` = 'timeout'
               AND b.`check_out` >= :from AND b.`check_out` < :to
               AND b.`source` = 'Airbnb'
               AND b.`status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        // Booking status counts (by check-in month)
        $statusRows = $this->db->fetchAllAssociative(
            "SELECT `status`, COUNT(*) AS cnt
             FROM `all_bookings`
             WHERE `check_in` >= :from AND `check_in` < :to
             GROUP BY `status`",
            ['from' => $from, 'to' => $to]
        );
        $statusCounts = [];
        foreach ($statusRows as $row) {
            $k = strtolower((string)($row['status'] ?? ''));
            $statusCounts[$k !== '' ? $k : 'unknown'] = (int)$row['cnt'];
        }

        // Occupancy per unit (using booking_month_slice nights_in_month)
        $daysInMonth = (int) $month->format('t');

        $occRows = $this->db->fetchAllAssociative(
            "SELECT
                 u.id   AS unit_id,
                 u.city AS city,
                 COALESCE(SUM(bms.nights_in_month), 0) AS nights_in_month
             FROM `unit` u
             LEFT JOIN `booking_month_slice` bms
               ON bms.`unit_id` = u.`id`
              AND bms.`year_month` = :ym
             WHERE (u.`date_ended` IS NULL OR u.`date_ended` >= :from)
               AND (u.`date_started` IS NULL OR u.`date_started` < :to)
               AND LOWER(COALESCE(u.`status`,'')) NOT IN ('inactive','onboarding','alor','internal')
             GROUP BY u.id, u.city",
            ['ym' => $ym, 'from' => $from, 'to' => $to]
        );

        $occOverall = [];
        $occPlaya   = [];
        $occTulum   = [];

        if ($daysInMonth > 0) {
            foreach ($occRows as $row) {
                $nights = (float) ($row['nights_in_month'] ?? 0);
                $occ    = $nights / $daysInMonth; // 0–1 scale

                $occOverall[] = $occ;

                $city = (string) ($row['city'] ?? '');
                if ($city === 'Playa del Carmen') {
                    $occPlaya[] = $occ;
                } elseif ($city === 'Tulum') {
                    $occTulum[] = $occ;
                }
            }
        }

        $occupancyOverall = $this->trimmedMeanWithCutoff($occOverall, 0.10, 0.05);
        $occupancyPlaya   = $this->trimmedMeanWithCutoff($occPlaya, 0.10, 0.05);
        $occupancyTulum   = $this->trimmedMeanWithCutoff($occTulum, 0.10, 0.05);

        return [
            'label'        => $ym,
            'units'        => $units,
            'clients'      => $clients,
            'unitsPlaya'   => $unitsPlaya,
            'unitsTulum'   => $unitsTulum,
            'commissions'  => round($commissions, 2),
            'commissionsPlaya'  => round($commissionsPlaya, 2),
            'commissionsTulum'  => round($commissionsTulum, 2),
            'grossEarnings' => round($grossEarnings, 2),
            'netResult'    => round($netResult, 2),
            'reservations' => $reservations,
            'reservationsAirbnb'  => $reservationsAirbnb,
            'reservationsPrivate' => $reservationsPrivate,
            'guests'       => $guests,
            'reviews'      => [
                'total'   => $reviewsTotal,
                'made'    => $reviewsMade,
                'skipped' => $reviewsSkipped,
                'timeout' => $reviewsTimeout,
            ],
            'status'      => $statusCounts,
            'occupancy'   => [
                'overall' => $occupancyOverall,
                'playa'   => $occupancyPlaya,
                'tulum'   => $occupancyTulum,
            ],
        ];
    }

    private function buildYtd(DateTimeImmutable $untilMonthInclusive): array
    {
        $year = (int)$untilMonthInclusive->format('Y');

        // For 2025 we only want YTD to cover Sep–Dec.
        // For other years, YTD covers Jan–Dec as usual.
        if ($year === 2025) {
            $fromDate = new DateTimeImmutable(sprintf('%04d-09-01 00:00:00', $year));
            $startYm  = sprintf('%04d-09', $year);
        } else {
            $fromDate = new DateTimeImmutable(sprintf('%04d-01-01 00:00:00', $year));
            $startYm  = sprintf('%04d-01', $year);
        }

        $from = $fromDate->format('Y-m-d H:i:s');
        $to   = $untilMonthInclusive->add(new DateInterval('P1M'))->format('Y-m-01 00:00:00');

        // Units & clients active as of the end of the YTD window
        $units = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM unit
             WHERE status = 'Active'
               AND (date_started IS NULL OR date_started < :to)",
            ['to' => $to]
        );

        $unitsPlaya = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM unit
             WHERE status = 'Active'
               AND (date_started IS NULL OR date_started < :to)
               AND city = 'Playa del Carmen'",
            ['to' => $to]
        );

        $unitsTulum = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM unit
             WHERE status = 'Active'
               AND (date_started IS NULL OR date_started < :to)
               AND city = 'Tulum'",
            ['to' => $to]
        );

        $clients = (int)$this->db->fetchOne(
            "SELECT COUNT(DISTINCT client_id) FROM unit
             WHERE status = 'Active'
               AND client_id IS NOT NULL
               AND (date_started IS NULL OR date_started < :to)",
            ['to' => $to]
        );

        $ymEnd = $untilMonthInclusive->format('Y-m');
        $commissions = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(o2_commission_in_month),0)
             FROM `booking_month_slice`
             WHERE `year_month` >= :startYm AND `year_month` <= :endYm",
            ['startYm' => $startYm, 'endYm' => $ymEnd]
        );

        $commissionsPlaya = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(o2_commission_in_month),0)
             FROM `booking_month_slice`
             WHERE `year_month` >= :startYm AND `year_month` <= :endYm
               AND `city` = 'Playa del Carmen'",
            ['startYm' => $startYm, 'endYm' => $ymEnd]
        );

        $commissionsTulum = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(o2_commission_in_month),0)
             FROM `booking_month_slice`
             WHERE `year_month` >= :startYm AND `year_month` <= :endYm
               AND `city` = 'Tulum'",
            ['startYm' => $startYm, 'endYm' => $ymEnd]
        );

        $grossEarnings = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(b.payout_in_month),0)
             FROM `booking_month_slice` b
               INNER JOIN `unit` u ON u.`id` = b.`unit_id`
             WHERE b.`year_month` >= :startYm AND b.`year_month` <= :endYm
               AND u.`payment_type` = 'Owners2'",
            ['startYm' => $startYm, 'endYm' => $ymEnd]
        );

        // O2Transactions net (Ingresos - Gastos) over the YTD window
        $o2Net = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(
                 CASE
                   WHEN type = 'Ingreso' THEN amount
                   WHEN type = 'Gasto'   THEN -amount
                   ELSE 0
                 END
             ), 0)
             FROM `o2transactions`
             WHERE `date` >= :from AND `date` < :to",
            ['from' => $from, 'to' => $to]
        );

        // Employee financial ledger (Owners2 division, salary entries) – positive amount but expense
        // Consider rows whose salary period overlaps the YTD window.
        $employeeNet = (float)$this->db->fetchOne(
            "SELECT COALESCE(SUM(amount),0)
             FROM `employee_financial_ledger`
             WHERE `type` = 'salary'
               AND `division` = 'Owners2'
               AND `period_start` < :to
               AND `period_end` >= :from",
            ['from' => $from, 'to' => $to]
        );

        $netResult = $commissions + $o2Net - $employeeNet;

        $resGuests = $this->db->fetchAssociative(
            "SELECT COUNT(*) AS reservations, COALESCE(SUM(guests),0) AS guests
             FROM `all_bookings`
             WHERE `check_in` >= :from
               AND `check_in` < :to
               AND `status` <> 'Cancelled'",
            ['from' => $from, 'to' => $to]
        ) ?: ['reservations' => 0, 'guests' => 0];

        $reservationsAirbnb = (int)$this->db->fetchOne(
            "SELECT COUNT(*)
             FROM `all_bookings`
             WHERE `check_in` >= :from
               AND `check_in` < :to
               AND `status` <> 'Cancelled'
               AND `source` = 'Airbnb'",
            ['from' => $from, 'to' => $to]
        );

        $reservationsPrivate = (int)$this->db->fetchOne(
            "SELECT COUNT(*)
             FROM `all_bookings`
             WHERE `check_in` >= :from
               AND `check_in` < :to
               AND `status` <> 'Cancelled'
               AND `source` = 'Private'",
            ['from' => $from, 'to' => $to]
        );

        $reviewsTotal = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `all_bookings`
             WHERE `check_out` >= :from AND `check_out` < :to
               AND `source` = 'Airbnb'
               AND `status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        $reviewsMade = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `review_action` ra
               INNER JOIN `all_bookings` b ON b.`id` = ra.`reservation_id`
             WHERE ra.`status` = 'made'
               AND b.`check_out` >= :from AND b.`check_out` < :to
               AND b.`source` = 'Airbnb'
               AND b.`status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        $reviewsSkipped = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `review_action` ra
               INNER JOIN `all_bookings` b ON b.`id` = ra.`reservation_id`
             WHERE ra.`status` = 'skipped'
               AND b.`check_out` >= :from AND b.`check_out` < :to
               AND b.`source` = 'Airbnb'
               AND b.`status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        $reviewsTimeout = (int)$this->db->fetchOne(
            "SELECT COUNT(*) FROM `review_action` ra
               INNER JOIN `all_bookings` b ON b.`id` = ra.`reservation_id`
             WHERE ra.`status` = 'timeout'
               AND b.`check_out` >= :from AND b.`check_out` < :to
               AND b.`source` = 'Airbnb'
               AND b.`status` = 'Past'",
            ['from' => $from, 'to' => $to]
        );

        // YTD occupancy per unit using booking_month_slice (sum nights_in_month over YTD window)
        $interval = $fromDate->diff($untilMonthInclusive->add(new DateInterval('P1M')));
        $daysInWindow = (int) $interval->days;

        $occYtdRows = $this->db->fetchAllAssociative(
            "SELECT
                 u.id   AS unit_id,
                 u.city AS city,
                 COALESCE(SUM(bms.nights_in_month), 0) AS nights_in_window
             FROM `unit` u
             LEFT JOIN `booking_month_slice` bms
               ON bms.`unit_id` = u.`id`
              AND bms.`year_month` >= :startYm
              AND bms.`year_month` <= :endYm
             WHERE (u.`date_ended` IS NULL OR u.`date_ended` >= :from)
               AND (u.`date_started` IS NULL OR u.`date_started` < :to)
               AND LOWER(COALESCE(u.`status`,'')) NOT IN ('inactive','onboarding','alor','internal')
             GROUP BY u.id, u.city",
            ['startYm' => $startYm, 'endYm' => $ymEnd, 'from' => $from, 'to' => $to]
        );

        $occYtdOverall = [];
        $occYtdPlaya   = [];
        $occYtdTulum   = [];

        if ($daysInWindow > 0) {
            foreach ($occYtdRows as $row) {
                $nights = (float) ($row['nights_in_window'] ?? 0);
                $occ    = $nights / $daysInWindow; // 0–1 scale over the YTD window

                $occYtdOverall[] = $occ;

                $city = (string) ($row['city'] ?? '');
                if ($city === 'Playa del Carmen') {
                    $occYtdPlaya[] = $occ;
                } elseif ($city === 'Tulum') {
                    $occYtdTulum[] = $occ;
                }
            }
        }

        $occupancyYtdOverall = $this->trimmedMeanWithCutoff($occYtdOverall, 0.10, 0.05);
        $occupancyYtdPlaya   = $this->trimmedMeanWithCutoff($occYtdPlaya, 0.10, 0.05);
        $occupancyYtdTulum   = $this->trimmedMeanWithCutoff($occYtdTulum, 0.10, 0.05);

        return [
            'label'        => sprintf('%04d-YTD', $year),
            'units'        => $units,
            'clients'      => $clients,
            'unitsPlaya'   => $unitsPlaya,
            'unitsTulum'   => $unitsTulum,
            'commissions'  => round($commissions, 2),
            'grossEarnings' => round($grossEarnings, 2),
            'netResult'    => round($netResult, 2),
            'commissionsPlaya'  => round($commissionsPlaya, 2),
            'commissionsTulum'  => round($commissionsTulum, 2),
            'reservations' => (int)$resGuests['reservations'],
            'reservationsAirbnb'  => $reservationsAirbnb,
            'reservationsPrivate' => $reservationsPrivate,
            'guests'       => (int)$resGuests['guests'],
            'reviews'      => [
                'total'   => $reviewsTotal,
                'made'    => $reviewsMade,
                'skipped' => $reviewsSkipped,
                'timeout' => $reviewsTimeout,
            ],
            'occupancy'    => [
                'overall' => $occupancyYtdOverall,
                'playa'   => $occupancyYtdPlaya,
                'tulum'   => $occupancyYtdTulum,
            ],
        ];
    }


}