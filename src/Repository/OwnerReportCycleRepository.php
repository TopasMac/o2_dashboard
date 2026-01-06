<?php

namespace App\Repository;

use Doctrine\DBAL\Connection;

/**
 * Lightweight repository for owner_report_cycle backed by DBAL.
 * Autowire-safe; no Doctrine entity is required.
 */
class OwnerReportCycleRepository
{
    public function __construct(private Connection $conn) {}

    /**
     * Fetch all rows for a given month (YYYY-MM).
     * @return array<int, array<string,mixed>>
     */
    public function fetchByMonth(string $yearMonth): array
    {
        $sql = <<<SQL
            SELECT id, unit_id, report_month, report_issued_at, payment_status, email_status
            FROM owner_report_cycle
            WHERE report_month = :ym
        SQL;

        return $this->conn->fetchAllAssociative($sql, ['ym' => $yearMonth]);
    }

    /**
     * Convenience map keyed by unit_id.
     * @return array<int, array<string,mixed>>
     */
    public function fetchMapByMonth(string $yearMonth): array
    {
        $rows = $this->fetchByMonth($yearMonth);
        $map = [];
        foreach ($rows as $r) {
            $uid = (int) ($r['unit_id'] ?? 0);
            if ($uid > 0) {
                $map[$uid] = $r;
            }
        }
        return $map;
    }
}