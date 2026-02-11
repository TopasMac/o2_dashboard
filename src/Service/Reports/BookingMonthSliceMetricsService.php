<?php

declare(strict_types=1);

namespace App\Service\Reports;

use Doctrine\DBAL\Connection;

/**
 * Centralized metrics computed from booking_month_slice for a given year-month.
 *
 * This is intentionally a thin DBAL-based service so that multiple report services
 * (DashboardMonthSummaryService, O2MonthlySummaryService, etc.) share the exact
 * same definitions for commissions and payouts.
 */
class BookingMonthSliceMetricsService
{
    public function __construct(
        private readonly Connection $db,
    ) {
    }

    private function assertYearMonth(string $yearMonth): void
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            throw new \InvalidArgumentException('yearMonth must be in YYYY-MM format');
        }
    }

    /**
     * Alias: some callers may prefer this name.
     */
    public function getMonthMetrics(string $yearMonth): array
    {
        return $this->getMetrics($yearMonth);
    }

    /**
     * Alias: explicit naming.
     */
    public function getMetricsForYearMonth(string $yearMonth): array
    {
        return $this->getMetrics($yearMonth);
    }

    /**
     * Convenience method used by dashboard/report services.
     *
     * @return array{
     *   commissionByUnit: list<array{unit_id:int,unit_name:string|null,city:string|null,o2_commission:float}>,
     *   commissionByCity: list<array{city:string|null,o2_commission:float}>,
     *   commissionBySource: list<array{source:string|null,o2_commission:float}>,
     *   commissionBySourceCity: list<array{city:string|null,source:string|null,o2_commission:float}>,
     *   payoutByCity: list<array{city:string|null,net_payout:float,owner_payout:float}>,
     *   payoutTotals: array{net_payout:float,owner_payout:float}
     * }
     */
    public function getMetrics(string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);

        return [
            'commissionByUnit' => $this->getCommissionByUnit($yearMonth),
            'commissionByCity' => $this->getCommissionByCity($yearMonth),
            'commissionBySource' => $this->getCommissionBySource($yearMonth),
            'commissionBySourceCity' => $this->getCommissionBySourceCity($yearMonth),
            'payoutByCity' => $this->getPayoutByCity($yearMonth),
            'payoutTotals' => $this->getPayoutTotals($yearMonth),
        ];
    }

    /**
     * @return list<array{unit_id:int,unit_name:string|null,city:string|null,o2_commission:float}>
     */
    public function getCommissionByUnit(string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);

        $sql = <<<SQL
            SELECT
                bms.`unit_id` AS `unit_id`,
                u.`unit_name` AS `unit_name`,
                u.`city` AS `city`,
                COALESCE(SUM(bms.`o2_commission_in_month`),0) AS `o2_commission`
            FROM `booking_month_slice` bms
            LEFT JOIN `unit` u ON u.`id` = bms.`unit_id`
            WHERE bms.`year_month` = :yearMonth
            GROUP BY bms.`unit_id`, u.`unit_name`, u.`city`
            ORDER BY u.`city` ASC, u.`unit_name` ASC, bms.`unit_id` ASC
        SQL;

        $rows = $this->db->fetchAllAssociative($sql, ['yearMonth' => $yearMonth]);

        return array_map(static function (array $row): array {
            return [
                'unit_id' => (int)($row['unit_id'] ?? 0),
                'unit_name' => $row['unit_name'] ?? null,
                'city' => $row['city'] ?? null,
                'o2_commission' => isset($row['o2_commission']) ? (float)$row['o2_commission'] : 0.0,
            ];
        }, $rows);
    }

    /**
     * @return list<array{city:string|null,o2_commission:float}>
     */
    public function getCommissionByCity(string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);

        $sql = <<<SQL
            SELECT
                u.`city` AS `city`,
                COALESCE(SUM(bms.`o2_commission_in_month`),0) AS `o2_commission`
            FROM `booking_month_slice` bms
            LEFT JOIN `unit` u ON u.`id` = bms.`unit_id`
            WHERE bms.`year_month` = :yearMonth
            GROUP BY u.`city`
            ORDER BY u.`city` ASC
        SQL;

        $rows = $this->db->fetchAllAssociative($sql, ['yearMonth' => $yearMonth]);

        return array_map(static function (array $row): array {
            return [
                'city' => $row['city'] ?? null,
                'o2_commission' => isset($row['o2_commission']) ? (float)$row['o2_commission'] : 0.0,
            ];
        }, $rows);
    }

    /**
     * Commission by booking source (Airbnb/Private/Owners2/etc.)
     * Source lives on all_bookings, so we join by booking_id.
     *
     * @return list<array{source:string|null,o2_commission:float}>
     */
    public function getCommissionBySource(string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);

        $sql = <<<SQL
            SELECT
                ab.`source` AS `source`,
                COALESCE(SUM(bms.`o2_commission_in_month`),0) AS `o2_commission`
            FROM `booking_month_slice` bms
            LEFT JOIN `all_bookings` ab ON ab.`id` = bms.`booking_id`
            WHERE bms.`year_month` = :yearMonth
            GROUP BY ab.`source`
            ORDER BY ab.`source` ASC
        SQL;

        $rows = $this->db->fetchAllAssociative($sql, ['yearMonth' => $yearMonth]);

        return array_map(static function (array $row): array {
            return [
                'source' => $row['source'] ?? null,
                'o2_commission' => isset($row['o2_commission']) ? (float)$row['o2_commission'] : 0.0,
            ];
        }, $rows);
    }

    /**
     * @return list<array{city:string|null,source:string|null,o2_commission:float}>
     */
    public function getCommissionBySourceCity(string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);

        $sql = <<<SQL
            SELECT
                u.`city` AS `city`,
                ab.`source` AS `source`,
                COALESCE(SUM(bms.`o2_commission_in_month`),0) AS `o2_commission`
            FROM `booking_month_slice` bms
            LEFT JOIN `unit` u ON u.`id` = bms.`unit_id`
            LEFT JOIN `all_bookings` ab ON ab.`id` = bms.`booking_id`
            WHERE bms.`year_month` = :yearMonth
            GROUP BY u.`city`, ab.`source`
            ORDER BY u.`city` ASC, ab.`source` ASC
        SQL;

        $rows = $this->db->fetchAllAssociative($sql, ['yearMonth' => $yearMonth]);

        return array_map(static function (array $row): array {
            return [
                'city' => $row['city'] ?? null,
                'source' => $row['source'] ?? null,
                'o2_commission' => isset($row['o2_commission']) ? (float)$row['o2_commission'] : 0.0,
            ];
        }, $rows);
    }

    /**
     * @return list<array{city:string|null,net_payout:float,owner_payout:float}>
     */
    public function getPayoutByCity(string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);

        $sql = <<<SQL
            SELECT
                u.`city` AS `city`,
                COALESCE(SUM(bms.`net_payout_in_month`),0) AS `net_payout`,
                COALESCE(SUM(bms.`owner_payout_in_month`),0) AS `owner_payout`
            FROM `booking_month_slice` bms
            LEFT JOIN `unit` u ON u.`id` = bms.`unit_id`
            WHERE bms.`year_month` = :yearMonth
            GROUP BY u.`city`
            ORDER BY u.`city` ASC
        SQL;

        $rows = $this->db->fetchAllAssociative($sql, ['yearMonth' => $yearMonth]);

        return array_map(static function (array $row): array {
            return [
                'city' => $row['city'] ?? null,
                'net_payout' => isset($row['net_payout']) ? (float)$row['net_payout'] : 0.0,
                'owner_payout' => isset($row['owner_payout']) ? (float)$row['owner_payout'] : 0.0,
            ];
        }, $rows);
    }

    /**
     * @return array{net_payout:float,owner_payout:float}
     */
    public function getPayoutTotals(string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);

        $sql = <<<SQL
            SELECT
                COALESCE(SUM(bms.`net_payout_in_month`),0) AS `net_payout`,
                COALESCE(SUM(bms.`owner_payout_in_month`),0) AS `owner_payout`
            FROM `booking_month_slice` bms
            WHERE bms.`year_month` = :yearMonth
        SQL;

        $row = $this->db->fetchAssociative($sql, ['yearMonth' => $yearMonth]) ?: [];

        return [
            'net_payout' => isset($row['net_payout']) ? (float)$row['net_payout'] : 0.0,
            'owner_payout' => isset($row['owner_payout']) ? (float)$row['owner_payout'] : 0.0,
        ];
    }
}