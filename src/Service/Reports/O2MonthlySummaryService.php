<?php

namespace App\Service\Reports;

use Doctrine\DBAL\Connection;
use App\Service\Reports\BookingMonthSliceMetricsService;
use DateTimeImmutable;
use DateTimeZone;

/**
 * Lightweight service to expose a simple monthly snapshot for the frontend.
 * It returns two flat lists: bookings overlapping the month, and all month slices for that yearMonth.
 */
class O2MonthlySummaryService
{
    private Connection $db;
    private BookingMonthSliceMetricsService $metrics;

    public function __construct(
        Connection $db,
        BookingMonthSliceMetricsService $metrics
    ) {
        $this->db = $db;
        $this->metrics = $metrics;
    }

    /**
     * @return array{
     *   year:int,
     *   month:int,
     *   yearMonth:string,
     *   window:{start:string,end:string},
     *   bookings:list<array{id:int,unit_name:string,unit_id:int,source:string,city:string,guests:int,check_in:string,check_out:string}>,
     *   slices:list<array{id:int,booking_id:int,unit_id:int,year_month:string,room_fee_in_month:float,o2_commission_in_month:float,net_payout_in_month:float,owner_payout_in_month:float}>,
     *   commissionByUnit:list<array{unit_id:int|null,unit_name:string|null,city:string|null,o2_commission:float}>,
     *   commissionByCity:list<array{city:string|null,o2_commission:float}>,
     *   commissionBySource:list<array{source:string|null,o2_commission:float}>,
     *   commissionBySourceCity:list<array{city:string|null,source:string|null,o2_commission:float}>,
     *   payoutByCity:list<array{city:string|null,net_payout:float,owner_payout:float}>,
     *   payoutTotals:array{net_payout:float,owner_payout:float},
     *   transactions:list<array{id:int,category_id:int,cost_centre:string,type:string,description:string,amount:float,category_name:string}>,
     *   employeeLedger:list<array{
     *     id:int,
     *     employee_id:int|null,
     *     employee_shortname:string|null,
     *     type:string,
     *     amount:float,
     *     period_start:string,
     *     period_end:string,
     *     division:string|null,
     *     city:string|null,
     *     cost_centre:string|null
     *   }>,
     *   count:array{bookings:int,slices:int}
     * }
     */
    public function getMonthlySummary(int $year, int $month, array $options = []): array
    {
        // Bound month to a safe range
        if ($month < 1 || $month > 12) {
            throw new \InvalidArgumentException('Month must be 1..12');
        }

        $tz = new DateTimeZone('UTC');
        $start = new DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $year, $month), $tz);
        $end = $start->modify('last day of this month')->setTime(23, 59, 59);
        $yearMonth = $start->format('Y-m');

        $includeBookings = (bool)($options['includeBookings'] ?? false);

        // BOOKINGS overlapping the month window (optional; can be large)
        $bookings = [];
        if ($includeBookings) {
            $bookingsSql = <<<SQL
                SELECT
                    `id`,
                    `unit_name`,
                    `unit_id`,
                    `source`,
                    `city`,
                    `guests`,
                    DATE_FORMAT(`check_in`, '%Y-%m-%d')   AS `check_in`,
                    DATE_FORMAT(`check_out`, '%Y-%m-%d')  AS `check_out`
                FROM `all_bookings`
                WHERE `check_in` <= :end AND `check_out` >= :start
                ORDER BY `check_in` ASC, `id` ASC
            SQL;

            $bookings = $this->db->fetchAllAssociative($bookingsSql, [
                'start' => $start->format('Y-m-d H:i:s'),
                'end'   => $end->format('Y-m-d H:i:s'),
            ]);
        }

        // MONTH SLICES for the exact year-month
        $slicesSql = <<<SQL
            SELECT
                `id`,
                `booking_id`,
                `unit_id`,
                `year_month`,
                `room_fee_in_month`,
                `o2_commission_in_month`,
                `net_payout_in_month`,
                `owner_payout_in_month`
            FROM `booking_month_slice`
            WHERE `year_month` = :yearMonth
            ORDER BY `id` ASC
        SQL;

        $slices = $this->db->fetchAllAssociative($slicesSql, [
            'yearMonth' => $yearMonth,
        ]);

        // COMMISSIONS + PAYOUTS via shared metrics service
        $commissionByUnit = $this->metrics->getCommissionByUnit($yearMonth);
        $commissionByCity = $this->metrics->getCommissionByCity($yearMonth);
        $commissionBySource = $this->metrics->getCommissionBySource($yearMonth);
        $commissionBySourceCity = $this->metrics->getCommissionBySourceCity($yearMonth);

        $payoutByCity = $this->metrics->getPayoutByCity($yearMonth);
        $payoutTotals = $this->metrics->getPayoutTotals($yearMonth);

        // A compact structure for the UI: per-city units list like
        // [ { city: 'Playa del Carmen', units: [ {unit_id, unit_name, amount}, ... ] }, ... ]
        // Keeps `commissionByUnit` intact for other consumers.
        $commissionByCityUnits = [];
        $commissionTotals = [
            'overall' => 0.0,
            'byCity' => [],
        ];

        foreach ($commissionByUnit as $row) {
            $city = (string)($row['city'] ?? '');
            $cityKey = $city !== '' ? $city : 'Unknown';

            $unitId = isset($row['unit_id']) ? (int)$row['unit_id'] : null;
            $unitName = (string)($row['unit_name'] ?? '');
            $amount = isset($row['o2_commission']) ? (float)$row['o2_commission'] : 0.0;

            if (!isset($commissionByCityUnits[$cityKey])) {
                $commissionByCityUnits[$cityKey] = [
                    'city' => $cityKey,
                    'units' => [],
                ];
            }

            $commissionByCityUnits[$cityKey]['units'][] = [
                'unit_id' => $unitId,
                'unit_name' => $unitName,
                'amount' => $amount,
            ];

            $commissionTotals['overall'] += $amount;
            if (!isset($commissionTotals['byCity'][$cityKey])) {
                $commissionTotals['byCity'][$cityKey] = 0.0;
            }
            $commissionTotals['byCity'][$cityKey] += $amount;
        }

        // sort units within each city by unit_name (stable UI ordering)
        foreach ($commissionByCityUnits as &$bucket) {
            usort($bucket['units'], static function (array $a, array $b): int {
                return strcmp((string)($a['unit_name'] ?? ''), (string)($b['unit_name'] ?? ''));
            });
        }
        unset($bucket);

        // convert map to list ordered by city
        $commissionByCityUnits = array_values($commissionByCityUnits);
        usort($commissionByCityUnits, static function (array $a, array $b): int {
            return strcmp((string)($a['city'] ?? ''), (string)($b['city'] ?? ''));
        });

        // round totals for consistent API output
        $commissionTotals['overall'] = round((float)$commissionTotals['overall'], 2);
        foreach ($commissionTotals['byCity'] as $k => $v) {
            $commissionTotals['byCity'][$k] = round((float)$v, 2);
        }

        // TRANSACTIONS for the exact year-month
        $transactionsSql = <<<SQL
            SELECT
                t.`id`,
                t.`category_id`,
                t.`cost_centre`,
                t.`type`,
                t.`description`,
                t.`amount`,
                DATE_FORMAT(t.`date`, '%Y-%m-%d') AS `date`,
                c.`name` AS category_name
            FROM `o2transactions` t
            LEFT JOIN `transaction_category` c ON t.`category_id` = c.`id`
            WHERE DATE_FORMAT(t.`date`, '%Y-%m') = :yearMonth
            ORDER BY t.`id` ASC
        SQL;
        $transactions = $this->db->fetchAllAssociative($transactionsSql, [
            'yearMonth' => $yearMonth,
        ]);
        $transactions = array_map(function(array $row) {
            $row['id'] = (int)$row['id'];
            $row['category_id'] = isset($row['category_id']) ? (int)$row['category_id'] : null;
            $row['amount'] = isset($row['amount']) ? (float)$row['amount'] : 0.0;
            return $row;
        }, $transactions);

        // EMPLOYEE FINANCIAL LEDGER (salaries + advances for Owners2, overlapping the month)
        $employeeLedgerSql = <<<SQL
            SELECT
                l.`id`,
                l.`employee_id`,
                e.`short_name` AS employee_shortname,
                l.`type`,
                l.`amount`,
                DATE_FORMAT(l.`entry_date`, '%Y-%m-%d')   AS entry_date,
                DATE_FORMAT(l.`period_start`, '%Y-%m-%d') AS period_start,
                DATE_FORMAT(l.`period_end`, '%Y-%m-%d')   AS period_end,
                l.`division`,
                l.`city`,
                l.`cost_centre`
            FROM `employee_financial_ledger` l
            LEFT JOIN `employee` e ON l.`employee_id` = e.`id`
            WHERE l.`division` = 'Owners2'
              AND l.`type` IN ('salary', 'advance')
              AND l.`period_start` <= :end
              AND l.`period_end`   >= :start
            ORDER BY l.`period_start` ASC, l.`id` ASC
        SQL;

        $employeeLedger = $this->db->fetchAllAssociative($employeeLedgerSql, [
            'start' => $start->format('Y-m-d H:i:s'),
            'end'   => $end->format('Y-m-d H:i:s'),
        ]);

        $employeeLedger = array_map(function (array $row) {
            $row['id'] = (int)$row['id'];
            $row['employee_id'] = isset($row['employee_id']) ? (int)$row['employee_id'] : null;
            $row['amount'] = isset($row['amount']) ? (float)$row['amount'] : 0.0;
            $row['division'] = $row['division'] ?? null;
            $row['city'] = $row['city'] ?? null;
            $row['cost_centre'] = $row['cost_centre'] ?? null;
            return $row;
        }, $employeeLedger);

        // Cast numeric strings to floats/ints where applicable
        if ($includeBookings) {
            $bookings = array_map(function(array $row) {
                $row['id'] = (int)$row['id'];
                $row['unit_id'] = isset($row['unit_id']) ? (int)$row['unit_id'] : null;
                $row['guests'] = isset($row['guests']) ? (int)$row['guests'] : null;
                return $row;
            }, $bookings);
        }

        $slices = array_map(function(array $row) {
            $row['id'] = (int)$row['id'];
            $row['booking_id'] = (int)$row['booking_id'];
            $row['unit_id'] = (int)$row['unit_id'];
            $row['room_fee_in_month'] = isset($row['room_fee_in_month']) ? (float)$row['room_fee_in_month'] : 0.0;
            $row['o2_commission_in_month'] = isset($row['o2_commission_in_month']) ? (float)$row['o2_commission_in_month'] : 0.0;
            $row['net_payout_in_month'] = isset($row['net_payout_in_month']) ? (float)$row['net_payout_in_month'] : 0.0;
            $row['owner_payout_in_month'] = isset($row['owner_payout_in_month']) ? (float)$row['owner_payout_in_month'] : 0.0;
            return $row;
        }, $slices);

        return [
            '_meta' => [
                'includeBookings' => $includeBookings,
            ],
            'year' => $year,
            'month' => $month,
            'yearMonth' => $yearMonth,
            'window' => [
                'start' => $start->format('Y-m-d'),
                'end' => $end->format('Y-m-d'),
            ],
            'bookings' => $bookings,
            'slices' => $slices,
            'commissionByUnit' => $commissionByUnit,
            'commissionByCity' => $commissionByCity,
            'commissionBySource' => $commissionBySource,
            'commissionBySourceCity' => $commissionBySourceCity,
            'commissionByCityUnits' => $commissionByCityUnits,
            'commissionTotals' => $commissionTotals,
            'payoutByCity' => $payoutByCity,
            'payoutTotals' => $payoutTotals,
            'transactions' => $transactions,
            'employeeLedger' => $employeeLedger,
            'count' => [
                'bookings' => count($bookings),
                'slices' => count($slices),
            ],
        ];
    }
}
