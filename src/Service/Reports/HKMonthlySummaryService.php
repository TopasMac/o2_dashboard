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
              hk.allocation_target
            FROM hktransactions hk
            LEFT JOIN unit u ON u.id = hk.unit_id
            LEFT JOIN transaction_category tc ON tc.id = hk.category_id
            ORDER BY hk.id ASC
        ";

        return $this->db->fetchAllAssociative($sql);
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
              hk.allocation_target
            FROM hktransactions hk
            LEFT JOIN unit u ON u.id = hk.unit_id
            LEFT JOIN transaction_category tc ON tc.id = hk.category_id
            WHERE DATE(hk.`date`) BETWEEN :start AND LAST_DAY(:start)
            ORDER BY hk.`date` ASC, hk.id ASC
        ";

        return $this->db->fetchAllAssociative($sql, ['start' => $start]);
    }
}