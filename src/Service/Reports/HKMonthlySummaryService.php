<?php

namespace App\Service\Reports;

use Doctrine\DBAL\Connection;

class HKMonthlySummaryService
{
    public function __construct(private readonly Connection $db)
    {
    }

    /**
     * Fetch all hktransactions with selected columns.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getAllTransactions(): array
    {
        $sql = "
            SELECT
              hk.id,
              hk.unit_id,
              u.unit_name,
              u.status AS unit_status,
              hk.transaction_code,
              hk.`date`,
              hk.category_id,
              tc.name AS category_name,
              tc.type AS category_type,
              tc.allow_hk,
              hk.cost_centre,
              hk.description,
              hk.paid,
              hk.charged,
              hk.city,
              hk.allocation_target,
              NULL AS source
            FROM hktransactions hk
            LEFT JOIN unit u ON u.id = hk.unit_id
            LEFT JOIN transaction_category tc ON tc.id = hk.category_id
            ORDER BY hk.id ASC
        ";

        return $this->db->fetchAllAssociative($sql);
    }

    /**
     * Build synthetic HK income rows from booking cleaning fees for bookings
     * with check_out in the selected month.
     *
     * @return array<int, array<string,mixed>>
     */
    private function getCleaningIncomeRowsByCheckoutMonth(int $year, int $month): array
    {
        $start = sprintf('%04d-%02d-01', $year, $month);

        $sql = "
            SELECT
              CONCAT('CLEAN-', ab.id)                    AS id,
              ab.unit_id                                 AS unit_id,
              ab.source                                  AS source,
              u.unit_name                                AS unit_name,
              u.status                                   AS unit_status,
              CONCAT('CLEAN-', ab.id)                    AS transaction_code,
              DATE(ab.check_out)                         AS `date`,
              NULL                                       AS category_id,
              'Cleaning fee'                             AS category_name,
              'Income'                                   AS category_type,
              0                                          AS allow_hk,
              'Owners2'                                  AS cost_centre,
              CONCAT('Cleaning fee (', u.unit_name, ')')  AS description,
              CAST(ab.cleaning_fee AS DECIMAL(10,2))      AS paid,
              CAST(ab.cleaning_fee AS DECIMAL(10,2))      AS charged,
              u.city                                     AS city,
              'Income'                                   AS allocation_target
            FROM all_bookings ab
            LEFT JOIN unit u ON u.id = ab.unit_id
            WHERE DATE(ab.check_out) BETWEEN :start AND LAST_DAY(:start)
              AND COALESCE(ab.status, '') NOT IN ('Cancelled', 'Expired')
              AND COALESCE(ab.cleaning_fee, 0) > 0
            ORDER BY DATE(ab.check_out) ASC, ab.id ASC
        ";

        return $this->db->fetchAllAssociative($sql, ['start' => $start]);
    }

    /**
     * Fetch hktransactions limited to a given month window (inclusive).
     *
     * @param int $year  e.g., 2025
     * @param int $month 1-12
     * @return array<int, array<string,mixed>>
     */
    public function getTransactionsByMonth(int $year, int $month): array
    {
        // Compute boundaries (YYYY-MM-01 .. last day of month)
        $start = sprintf('%04d-%02d-01', $year, $month);
        // Use MySQL LAST_DAY to avoid PHP date math, but we’ll bind :start
        $sql = "
            SELECT
              hk.id,
              hk.unit_id,
              u.unit_name,
              u.status AS unit_status,
              hk.transaction_code,
              hk.`date`,
              hk.category_id,
              tc.name AS category_name,
              tc.type AS category_type,
              tc.allow_hk,
              hk.cost_centre,
              hk.description,
              hk.paid,
              hk.charged,
              hk.city,
              hk.allocation_target,
              NULL AS source
            FROM hktransactions hk
            LEFT JOIN unit u ON u.id = hk.unit_id
            LEFT JOIN transaction_category tc ON tc.id = hk.category_id
            WHERE DATE(hk.`date`) BETWEEN :start AND LAST_DAY(:start)
            ORDER BY hk.`date` ASC, hk.id ASC
        ";

        $hkRows = $this->db->fetchAllAssociative($sql, ['start' => $start]);
        $incomeRows = $this->getCleaningIncomeRowsByCheckoutMonth($year, $month);

        $rows = array_merge($hkRows, $incomeRows);

        usort($rows, static function ($a, $b) {
            $da = (string)($a['date'] ?? '');
            $db = (string)($b['date'] ?? '');
            if ($da === $db) {
                return (int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0);
            }
            return strcmp($da, $db);
        });

        return $rows;
    }
}