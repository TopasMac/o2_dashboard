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
              COALESCE(u.city, hk.city) AS city,
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
     * Build HK income rows for cleaning fees using hk_cleanings (checkout rows).
     *
     * We treat hk_cleanings as the source of truth for "a checkout cleaning exists".
     * The income amount is the cleaning fee collected from the guest.
     *
     * We prefer hc.o2_collected_fee when present; otherwise fall back to all_bookings.cleaning_fee.
     *
     * @return array<int, array<string,mixed>>
     */
    private function getCleaningIncomeRowsByCheckoutMonth(int $year, int $month): array
    {
        $start = sprintf('%04d-%02d-01', $year, $month);

        $sql = "
            SELECT
              CONCAT('CLEAN-', COALESCE(hc.booking_id, hc.id))        AS id,
              hc.unit_id                                             AS unit_id,
              COALESCE(hc.source, ab.source)                         AS source,
              u.unit_name                                            AS unit_name,
              u.status                                               AS unit_status,
              CONCAT('CLEAN-', COALESCE(hc.booking_id, hc.id))        AS transaction_code,
              DATE(hc.checkout_date)                                 AS `date`,
              NULL                                                   AS category_id,
              'Cleaning fee'                                         AS category_name,
              'Income'                                               AS category_type,
              0                                                      AS allow_hk,
              'Owners2'                                              AS cost_centre,
              CONCAT('Cleaning fee (', u.unit_name, ')')              AS description,
              CAST(COALESCE(hc.o2_collected_fee, ab.cleaning_fee, 0) AS DECIMAL(10,2)) AS paid,
              CAST(COALESCE(hc.o2_collected_fee, ab.cleaning_fee, 0) AS DECIMAL(10,2)) AS charged,
              COALESCE(u.city, hc.city, ab.city, 'Unknown')           AS city,
              'Income'                                               AS allocation_target
            FROM hk_cleanings hc
            LEFT JOIN unit u ON u.id = hc.unit_id
            LEFT JOIN all_bookings ab ON ab.id = hc.booking_id
            WHERE hc.cleaning_type = 'checkout'
              AND DATE(hc.checkout_date) BETWEEN :start AND LAST_DAY(:start)
              AND (hc.status IS NULL OR LOWER(hc.status) <> 'cancelled')
              AND COALESCE(hc.o2_collected_fee, ab.cleaning_fee, 0) > 0
            ORDER BY DATE(hc.checkout_date) ASC, hc.id ASC
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
              COALESCE(u.city, hk.city) AS city,
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
                $ida = $a['id'] ?? 0;
                $idb = $b['id'] ?? 0;

                $na = 0;
                $nb = 0;

                if (is_numeric($ida)) {
                    $na = (int)$ida;
                } elseif (is_string($ida) && preg_match('/(\d+)/', $ida, $m)) {
                    $na = (int)$m[1];
                }

                if (is_numeric($idb)) {
                    $nb = (int)$idb;
                } elseif (is_string($idb) && preg_match('/(\d+)/', $idb, $m)) {
                    $nb = (int)$m[1];
                }

                return $na <=> $nb;
            }
            return strcmp($da, $db);
        });

        return $rows;
    }
}