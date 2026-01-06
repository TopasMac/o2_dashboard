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
     * Rule: use the latest ledger row up to the first day of the next month;
     * EXCEPT if the latest row is a Month Report for the same yearmonth, then skip it.
     */
    public function findOpeningBalanceForMonth(int $unitId, string $currentYearMonth): ?float
    {
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $currentYearMonth . '-01');
        if ($dt === false) {
            return null;
        }
        $cutoff = $dt->modify('+1 month')->setTime(0, 0, 0)->format('Y-m-d H:i:s');

        $sql = <<<SQL
            SELECT balance_after
            FROM unit_balance_ledger
            WHERE unit_id = :uid
              AND COALESCE(txn_date, created_at) < :cutoff
            ORDER BY COALESCE(txn_date, created_at) DESC, id DESC
            LIMIT 1
        SQL;

        $row = $this->conn->fetchAssociative($sql, [
            'uid'    => $unitId,
            'cutoff' => $cutoff,
        ]);

        return $row ? (float) $row['balance_after'] : null;
    }
}