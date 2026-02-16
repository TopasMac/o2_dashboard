<?php

namespace App\Service\Reports;

use Doctrine\DBAL\Connection;
use DateTimeImmutable;
use DateTimeZone;

/**
 * HKMonthlySummaryService (reset)
 *
 * For now we only expose hktransactions rows in a simple, report-friendly shape.
 */
class HKMonthlySummaryService
{
    public function __construct(private readonly Connection $db)
    {
    }

    /**
     * Return HK transactions rows for a month.
     *
     * Output columns:
     *  - id
     *  - unit_id
     *  - unit_name
     *  - date
     *  - category_id
     *  - category_name
     *  - cost_centre
     *  - description
     *  - paid
     *  - charged
     *  - allocation_target
     *  - city
     *  - report_status
     */
    public function getCleaningsByMonth(int $year, int $month, ?string $city = null): array
    {
        $start = sprintf('%04d-%02d-01', $year, $month);

        $sql = "
            SELECT
              hk.id AS id,
              hk.unit_id AS unit_id,
              u.unit_name AS unit_name,
              DATE(hk.`date`) AS `date`,
              hk.category_id AS category_id,
              tc.name AS category_name,
              hk.cost_centre AS cost_centre,
              hk.description AS description,
              CAST(COALESCE(hk.paid, 0) AS DECIMAL(10,2)) AS paid,
              CAST(COALESCE(hk.charged, 0) AS DECIMAL(10,2)) AS charged,
              hk.allocation_target AS allocation_target,
              hk.city AS city,
              hc.report_status AS report_status
            FROM hktransactions hk
            LEFT JOIN unit u ON u.id = hk.unit_id
            LEFT JOIN transaction_category tc ON tc.id = hk.category_id
            LEFT JOIN hk_cleanings hc ON hc.id = hk.hk_cleaning_id
            WHERE DATE(hk.`date`) BETWEEN :start AND LAST_DAY(:start)
        ";

        $params = ['start' => $start];

        if ($city !== null && $city !== '' && strtolower($city) !== 'all') {
            $sql .= " AND LOWER(COALESCE(u.city, hk.city, '')) = LOWER(:city)";
            $params['city'] = $city;
        }

        $sql .= " ORDER BY DATE(hk.`date`) ASC, hk.id ASC";

        return $this->db->fetchAllAssociative($sql, $params);
    }


    /**
     * Return HR ledger rows (salary + advance, optionally deduction) for HK cost centres for a month.
     *
     * Output columns:
     *  - id
     *  - employee_id
     *  - employee_shortname
     *  - type (salary|advance|deduction)
     *  - amount
     *  - period_start
     *  - period_end
     *  - cost_centre (HK_General|HK_Playa|HK_Tulum)
     *  - area
     *  - city
     */
    public function getHrByMonth(int $year, int $month, bool $includeDeductions = false): array
    {
        if ($month < 1 || $month > 12) {
            throw new \InvalidArgumentException('Month must be 1..12');
        }

        $tz = new DateTimeZone('UTC');
        $start = new DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $year, $month), $tz);
        $end = $start->modify('last day of this month')->setTime(23, 59, 59);

        $types = $includeDeductions
            ? "'salary','advance','deduction'"
            : "'salary','advance'";

        $sql = <<<SQL
            SELECT
              l.`id` AS id,
              l.`employee_id` AS employee_id,
              e.`short_name` AS employee_shortname,
              l.`type` AS type,
              CAST(COALESCE(l.`amount`, 0) AS DECIMAL(10,2)) AS amount,
              DATE_FORMAT(l.`period_start`, '%Y-%m-%d') AS period_start,
              DATE_FORMAT(l.`period_end`, '%Y-%m-%d') AS period_end,
              l.`cost_centre` AS cost_centre,
              l.`area` AS area,
              l.`city` AS city
            FROM `employee_financial_ledger` l
            LEFT JOIN `employee` e ON e.`id` = l.`employee_id`
            WHERE l.`type` IN ($types)
              AND l.`cost_centre` IN ('HK_General', 'HK_Playa', 'HK_Tulum')
              AND l.`period_start` <= :end
              AND l.`period_end` >= :start
            ORDER BY l.`period_start` ASC, l.`id` ASC
        SQL;

        return $this->db->fetchAllAssociative($sql, [
            'start' => $start->format('Y-m-d H:i:s'),
            'end' => $end->format('Y-m-d H:i:s'),
        ]);
    }
}