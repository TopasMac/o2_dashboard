<?php

namespace App\Repository;

use Doctrine\DBAL\Connection;

class UnitBalanceLedgerRepository
{
    public function __construct(private Connection $conn) {}

    /**
     * Closing balances for a given month (YYYY-MM) restricted to entry_type = 'Month Report'.
     * @return array<int,float>  [unit_id => balance_after]
     */
    public function fetchClosingBalancesForMonth(string $yearMonth): array
    {
        $sql = <<<SQL
            SELECT unit_id, balance_after
            FROM unit_balance_ledger
            WHERE yearmonth = :ym
              AND entry_type = 'Month Report'
        SQL;

        $rows = $this->conn->fetchAllAssociative($sql, ['ym' => $yearMonth]);
        $map = [];
        foreach ($rows as $r) {
            $map[(int)$r['unit_id']] = (float)$r['balance_after'];
        }
        return $map;
    }
    /**
     * Latest balance (balance_after) BEFORE the given month (YYYY-MM) for a unit,
     * regardless of entry_type. Uses yearmonth and falls back to id ordering for tie-breaks.
     * Returns null if none exists.
     */
    public function findLatestBalanceBeforeMonth(int $unitId, string $currentYearMonth): ?float
    {
        $sql = <<<SQL
            SELECT balance_after
            FROM unit_balance_ledger
            WHERE unit_id = :uid
              AND yearmonth < :ym
            ORDER BY yearmonth DESC, id DESC
            LIMIT 1
        SQL;

        $row = $this->conn->fetchAssociative($sql, [
            'uid' => $unitId,
            'ym'  => $currentYearMonth,
        ]);

        if (!$row) {
            return null;
        }

        return (float) $row['balance_after'];
    }

    /**
     * Opening balance to use for a given reporting month (YYYY-MM).
     *
     * Ledger rules:
     * - Month Report entries belong to their report month via yearmonth.
     * - Report payments belong to the report month they settle via yearmonth.
     * - Partial/ad-hoc payments belong to the month when they happened via txn_date.
     * - Unit Balance entries are treated as manual balance adjustments and belong to txn_date.
     */
    public function findOpeningBalanceForMonth(int $unitId, string $currentYearMonth): ?float
    {
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $currentYearMonth . '-01');
        if ($dt === false) {
            return null;
        }

        $monthStart = $dt->format('Y-m-d');

        $sql = <<<SQL
            SELECT COALESCE(SUM(CASE
                WHEN (
                    entry_type = 'Month Report'
                    AND yearmonth < :ym
                )
                OR (
                    entry_type IN ('O2 Report Payment', 'Client Report Payment')
                    AND yearmonth < :ym
                )
                OR (
                    entry_type IN ('O2 Partial Payment', 'Client Partial Payment', 'Unit Balance')
                    AND txn_date < :monthStart
                )
                THEN amount ELSE 0 END), 0) AS opening_balance
            FROM unit_balance_ledger
            WHERE unit_id = :uid
        SQL;

        $value = $this->conn->fetchOne($sql, [
            'uid'        => $unitId,
            'ym'         => $currentYearMonth,
            'monthStart' => $monthStart,
        ]);

        return $value === false ? null : (float) $value;
    }
}