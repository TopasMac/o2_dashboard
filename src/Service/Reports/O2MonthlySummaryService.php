<?php

namespace App\Service\Reports;

use Doctrine\DBAL\Connection;
use DateTimeImmutable;
use DateTimeZone;

/**
 * Lightweight service to expose a simple monthly snapshot for the frontend.
 * It returns two flat lists: bookings overlapping the month, and all month slices for that yearMonth.
 */
class O2MonthlySummaryService
{
    private Connection $db;

    public function __construct(Connection $db)
    {
        $this->db = $db;
    }

    /**
     * @return array{
     *   year:int,
     *   month:int,
     *   yearMonth:string,
     *   window:{start:string,end:string},
     *   bookings:list<array{id:int,unit_name:string,unit_id:int,source:string,city:string,guests:int,check_in:string,check_out:string}>,
     *   slices:list<array{id:int,booking_id:int,unit_id:int,year_month:string,room_fee_in_month:float,o2_commission_in_month:float,owner_payout_in_month:float}>,
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
    public function getMonthlySummary(int $year, int $month): array
    {
        // Bound month to a safe range
        if ($month < 1 || $month > 12) {
            throw new \InvalidArgumentException('Month must be 1..12');
        }

        $tz = new DateTimeZone('UTC');
        $start = new DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $year, $month), $tz);
        $end = $start->modify('last day of this month')->setTime(23, 59, 59);
        $yearMonth = $start->format('Y-m');

        // BOOKINGS overlapping the month window
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

        // MONTH SLICES for the exact year-month
        $slicesSql = <<<SQL
            SELECT
                `id`,
                `booking_id`,
                `unit_id`,
                `year_month`,
                `room_fee_in_month`,
                `o2_commission_in_month`,
                `owner_payout_in_month`
            FROM `booking_month_slice`
            WHERE `year_month` = :yearMonth
            ORDER BY `id` ASC
        SQL;

        $slices = $this->db->fetchAllAssociative($slicesSql, [
            'yearMonth' => $yearMonth,
        ]);

        // TRANSACTIONS for the exact year-month
        $transactionsSql = <<<SQL
            SELECT
                t.`id`,
                t.`category_id`,
                t.`cost_centre`,
                t.`type`,
                t.`description`,
                t.`amount`,
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

        // EMPLOYEE FINANCIAL LEDGER (salaries for Owners2, overlapping the month)
        $employeeLedgerSql = <<<SQL
            SELECT
                l.`id`,
                l.`employee_id`,
                e.`short_name` AS employee_shortname,
                l.`type`,
                l.`amount`,
                DATE_FORMAT(l.`period_start`, '%Y-%m-%d') AS period_start,
                DATE_FORMAT(l.`period_end`, '%Y-%m-%d')   AS period_end,
                l.`division`,
                l.`city`,
                l.`cost_centre`
            FROM `employee_financial_ledger` l
            LEFT JOIN `employee` e ON l.`employee_id` = e.`id`
            WHERE l.`division` = 'Owners2'
              AND l.`type` = 'salary'
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
        $bookings = array_map(function(array $row) {
            $row['id'] = (int)$row['id'];
            $row['unit_id'] = isset($row['unit_id']) ? (int)$row['unit_id'] : null;
            $row['guests'] = isset($row['guests']) ? (int)$row['guests'] : null;
            return $row;
        }, $bookings);

        $slices = array_map(function(array $row) {
            $row['id'] = (int)$row['id'];
            $row['booking_id'] = (int)$row['booking_id'];
            $row['unit_id'] = (int)$row['unit_id'];
            $row['room_fee_in_month'] = isset($row['room_fee_in_month']) ? (float)$row['room_fee_in_month'] : 0.0;
            $row['o2_commission_in_month'] = isset($row['o2_commission_in_month']) ? (float)$row['o2_commission_in_month'] : 0.0;
            $row['owner_payout_in_month'] = isset($row['owner_payout_in_month']) ? (float)$row['owner_payout_in_month'] : 0.0;
            return $row;
        }, $slices);

        return [
            'year' => $year,
            'month' => $month,
            'yearMonth' => $yearMonth,
            'window' => [
                'start' => $start->format('Y-m-d'),
                'end' => $end->format('Y-m-d'),
            ],
            'bookings' => $bookings,
            'slices' => $slices,
            'transactions' => $transactions,
            'employeeLedger' => $employeeLedger,
            'count' => [
                'bookings' => count($bookings),
                'slices' => count($slices),
            ],
        ];
    }
}
