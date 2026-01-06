<?php

namespace App\Service;

use Doctrine\DBAL\Connection;

/**
 * Read-side aggregation for Housekeepers (counts, income, expenses, reconciliation).
 *
 * Data sources assumed:
 *  - hk_cleanings(unit_id, city, checkout_date, expected_fee, o2_collected_fee, cleaning_type)
 *  - housekeepers_all(date, city, unit_id, allocation, description, amount)
 *
 * Notes:
 *  - Income proxy = SUM(COALESCE(o2_collected_fee, expected_fee)) within range.
 *  - Expenses = SUM(amount) from housekeepers_all within range, optionally
 *    broken down by allocation (e.g., 'Limpieza', 'Lavanderia', 'Suministros').
 *  - Counts derived from hk_cleanings rows (cleaning_type='checkout' by default).
 */
class HousekeepingQueryService
{
    public function __construct(private Connection $conn)
    {
    }

    /**
     * High-level summary used by dashboards.
     *
     * @param string      $start  Inclusive YYYY-MM-DD
     * @param string      $end    Inclusive YYYY-MM-DD
     * @param string|null $city   Optional city filter (e.g., 'Tulum', 'Playa del Carmen')
     */
    public function getSummary(string $start, string $end, ?string $city = null): array
    {
        $counts = $this->getCleaningCounts($start, $end, $city);
        $income = $this->getIncomeFromO2CleaningFees($start, $end, $city);
        $expenses = $this->getExpensesBreakdown($start, $end, $city);
        $expected = $this->getExpectedFromCleanings($start, $end, $city);
        $paid = $expenses['total'];

        return [
            'range' => ['start' => $start, 'end' => $end, 'city' => $city],
            'counts' => $counts,
            'income' => [
                'cleaningFeesO2' => (float) $income,
            ],
            'expenses' => $expenses,
            'reconciliation' => [
                'expectedFromCleanings' => (float) $expected,
                'paidFromLedger' => (float) $paid,
                'variance' => (float) ($expected - $paid),
            ],
        ];
    }

    /**
     * Counts of cleanings by city and total using hk_cleanings.
     */
    public function getCleaningCounts(string $start, string $end, ?string $city = null): array
    {
        $sql = [];
        $sql[] = 'SELECT city, COUNT(*) AS cnt';
        $sql[] = 'FROM hk_cleanings';
        $sql[] = "WHERE checkout_date BETWEEN :d1 AND :d2";
        $sql[] = "  AND cleaning_type = 'checkout'";
        if ($city) {
            $sql[] = '  AND city = :city';
        }
        $sql[] = 'GROUP BY city';

        $stmt = $this->conn->prepare(implode("\n", $sql));
        $stmt->bindValue(':d1', $start);
        $stmt->bindValue(':d2', $end);
        if ($city) { $stmt->bindValue(':city', $city); }
        $rows = $stmt->executeQuery()->fetchAllAssociative();

        $out = ['total' => 0];
        foreach ($rows as $r) {
            $out[$r['city']] = (int) $r['cnt'];
            $out['total'] += (int) $r['cnt'];
        }
        return $out;
    }

    /**
     * Income proxy from Owners2 for cleaning fees: SUM(COALESCE(o2_collected_fee, expected_fee)).
     */
    public function getIncomeFromO2CleaningFees(string $start, string $end, ?string $city = null): float
    {
        $sql = [];
        $sql[] = 'SELECT SUM(COALESCE(o2_collected_fee, expected_fee)) AS total';
        $sql[] = 'FROM hk_cleanings';
        $sql[] = 'WHERE checkout_date BETWEEN :d1 AND :d2';
        $sql[] = "  AND cleaning_type = 'checkout'";
        if ($city) { $sql[] = '  AND city = :city'; }

        $stmt = $this->conn->prepare(implode("\n", $sql));
        $stmt->bindValue(':d1', $start);
        $stmt->bindValue(':d2', $end);
        if ($city) { $stmt->bindValue(':city', $city); }
        $val = $stmt->executeQuery()->fetchOne();
        return (float) ($val ?? 0);
    }

    /**
     * Expected from cleanings (snapshot) = SUM(expected_fee) in hk_cleanings.
     */
    public function getExpectedFromCleanings(string $start, string $end, ?string $city = null): float
    {
        $sql = [];
        $sql[] = 'SELECT SUM(expected_fee) AS total';
        $sql[] = 'FROM hk_cleanings';
        $sql[] = 'WHERE checkout_date BETWEEN :d1 AND :d2';
        $sql[] = "  AND cleaning_type = 'checkout'";
        if ($city) { $sql[] = '  AND city = :city'; }

        $stmt = $this->conn->prepare(implode("\n", $sql));
        $stmt->bindValue(':d1', $start);
        $stmt->bindValue(':d2', $end);
        if ($city) { $stmt->bindValue(':city', $city); }
        $val = $stmt->executeQuery()->fetchOne();
        return (float) ($val ?? 0);
    }

    /**
     * Expenses breakdown from housekeepers_all ledger.
     *
     * If your allocations differ, adjust the CASE statements below.
     */
    public function getExpensesBreakdown(string $start, string $end, ?string $city = null): array
    {
        $sql = [];
        $sql[] = 'SELECT';
        $sql[] = "  SUM(amount) AS total,";
        $sql[] = "  SUM(CASE WHEN allocation IN ('Limpieza','Limpieza_extra') THEN amount ELSE 0 END) AS cleaning,";
        $sql[] = "  SUM(CASE WHEN allocation IN ('Lavanderia','Lavandería extra') THEN amount ELSE 0 END) AS laundry,";
        $sql[] = "  SUM(CASE WHEN allocation IN ('Productos limpieza','Suministros','Menage','Menaje') THEN amount ELSE 0 END) AS supplies";
        $sql[] = 'FROM housekeepers_all';
        $sql[] = 'WHERE date BETWEEN :d1 AND :d2';
        if ($city) { $sql[] = '  AND city = :city'; }

        $stmt = $this->conn->prepare(implode("\n", $sql));
        $stmt->bindValue(':d1', $start);
        $stmt->bindValue(':d2', $end);
        if ($city) { $stmt->bindValue(':city', $city); }
        $row = $stmt->executeQuery()->fetchAssociative() ?: [];

        return [
            'total' => (float) ($row['total'] ?? 0),
            'tulumPerCleaning' => null, // can be derived if you tag Tulum per-cleaning specifically
            'playaSalaries' => null,    // set if you keep salaries as separate allocation/description
            'supplies' => (float) ($row['supplies'] ?? 0),
            'laundry' => (float) ($row['laundry'] ?? 0),
            'cleaning' => (float) ($row['cleaning'] ?? 0),
        ];
    }
}