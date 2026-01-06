<?php

namespace App\Service;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;
use DateTimeImmutable;
use DateTimeZone;

class HKCleaningReadService
{
    public function __construct(private Connection $conn)
    {
    }

    /**
     * List hk_cleanings with filters, sorting and pagination.
     *
     * @param array $opts [
     *   'start' => 'YYYY-MM-DD',
     *   'end' => 'YYYY-MM-DD',
     *   'city' => string|null,
     *   'unitId' => int|null,
     *   'status' => 'exists'|'missing'|'any', // exists = hk.exists=true equivalent, missing = false
     *   'search' => string|null, // searches unit name, notes, bookingId
     *   'page' => int, // 1-based
     *   'pageSize' => int,
     *   'sort' => string, // checkout_date|unit_name|city|cleaning_cost|o2_collected_fee|created_at
     *   'dir' => 'asc'|'desc',
     * ]
     *
     * @return array { 'rows' => array, 'total' => int }
     */
    public function list(array $opts): array
    {
        $start = isset($opts['start']) && $opts['start'] !== '' ? $opts['start'] : null;
        $end   = isset($opts['end']) && $opts['end'] !== '' ? $opts['end'] : null;
        $city     = $opts['city']     ?? null;
        $unitId   = $opts['unitId']   ?? null;
        $status   = $opts['status']   ?? 'any';
        $search   = $opts['search']   ?? null;
        $page     = max(1, (int)($opts['page'] ?? 1));
        $rawPageSize = (int)($opts['pageSize'] ?? 50);
        if ($rawPageSize < 0) { $rawPageSize = 0; }
        // pageSize = 0 means: return ALL rows (no LIMIT/OFFSET)
        $pageSize = $rawPageSize === 0 ? 0 : max(1, min(500, $rawPageSize));
        $useLimit = $pageSize !== 0;
        $sort     = $this->sanitizeSort($opts['sort'] ?? 'checkout_date');
        // Default to latest first when not specified
        $dir      = strtolower((string)($opts['dir'] ?? 'desc')) === 'desc' ? 'DESC' : 'ASC';

        $params = [];
        $types  = [];

        $where = [];
        if ($start !== null && $end !== null) {
            $where[] = 'hc.checkout_date BETWEEN :d1 AND :d2';
            $params['d1'] = $start; $types['d1'] = ParameterType::STRING;
            $params['d2'] = $end;   $types['d2'] = ParameterType::STRING;
        } elseif ($start !== null) {
            $where[] = 'hc.checkout_date >= :d1';
            $params['d1'] = $start; $types['d1'] = ParameterType::STRING;
        } elseif ($end !== null) {
            $where[] = 'hc.checkout_date <= :d2';
            $params['d2'] = $end;   $types['d2'] = ParameterType::STRING;
        }

        if ($city !== null && $city !== '') {
            $where[] = 'hc.city = :city';
            $params['city'] = $city; $types['city'] = ParameterType::STRING;
        }
        if ($unitId !== null && $unitId !== '') {
            $where[] = 'hc.unit_id = :unitId';
            $params['unitId'] = (int)$unitId; $types['unitId'] = ParameterType::INTEGER;
        }
        // In this table every row is a real cleaning; 'exists' means no extra filter.
        // If someone asks for 'missing', return none (there are no missing rows in this table).
        if ($status === 'missing') {
            $where[] = '1 = 0';
        }
        if ($search) {
            // simple search across unit name, notes, booking id/reservation code if present in table
            $where[] = '(u.unit_name LIKE :q OR hc.assign_notes LIKE :q OR CAST(hc.booking_id AS CHAR) LIKE :q OR hc.reservation_code LIKE :q)';
            $params['q'] = '%'.$search.'%';
            $types['q']  = ParameterType::STRING;
        }

        $whereSql = $where ? ('WHERE '.implode(' AND ', $where)) : '';

        // Count total
        $countSql = "SELECT COUNT(*) FROM hk_cleanings hc LEFT JOIN unit u ON u.id = hc.unit_id $whereSql";
        $total = (int)$this->conn->executeQuery($countSql, $params, $types)->fetchOne();

        // Page
        $offset = $useLimit ? (($page - 1) * $pageSize) : 0;

        // Data query
        $sql = [];
        $sql[] = "SELECT hc.id, hc.unit_id, COALESCE(u.unit_name, CONCAT('Unit #', hc.unit_id)) AS unit_name, ";
        $sql[] = '       u.id AS unit_table_id, u.status AS unit_status, u.cleaning_fee AS unit_cleaning_fee,';
        $sql[] = '       hc.city, u.city AS unit_city, hc.checkout_date, hc.cleaning_type, hc.status,';
        $sql[] = '       hc.cleaning_cost, hc.o2_collected_fee, hc.booking_id, hc.reservation_code,';
        $sql[] = '       r.amount AS unit_rate_amount,';
        $sql[] = '       hc.assign_notes AS notes, hc.created_at,';
        $sql[] = '       cc.id AS checklist_id, cc.cleaning_id AS checklist_cleaning_id,';
        $sql[] = '       cc.cleaner_id AS checklist_cleaner_id, cc.submitted_at AS checklist_submitted_at,';
        $sql[] = '       e.short_name AS checklist_cleaner_short_name,';
        $sql[] = '       cc.cleaning_notes AS checklist_cleaning_notes';
        $sql[] = 'FROM hk_cleanings hc';
        $sql[] = 'LEFT JOIN unit u ON u.id = hc.unit_id';
        // Join the active HKUnitCleaningRate for this unit/city on the checkout date (latest effective_from before date, within effective_to)
        $sql[] = 'LEFT JOIN hk_unit_cleaning_rate r ON r.unit_id = hc.unit_id AND r.effective_from = ('
                . 'SELECT MAX(r2.effective_from) FROM hk_unit_cleaning_rate r2 '
                . 'WHERE r2.unit_id = hc.unit_id '
                . 'AND r2.effective_from <= hc.checkout_date '
                . 'AND (r2.effective_to IS NULL OR r2.effective_to >= hc.checkout_date)'
                . ')';
        // Join latest checklist row per cleaning (highest id)
        $sql[] = 'LEFT JOIN hk_cleaning_checklist cc ON cc.id = ('
                . 'SELECT MAX(cc2.id) FROM hk_cleaning_checklist cc2 WHERE cc2.cleaning_id = hc.id'
                . ')';
        $sql[] = 'LEFT JOIN employee e ON e.id = cc.cleaner_id';
        $sql[] = $whereSql;
        $sql[] = "ORDER BY $sort $dir, hc.id $dir";
        if ($useLimit) {
            $sql[] = 'LIMIT :limit OFFSET :offset';
            $params['limit']  = $pageSize; $types['limit']  = ParameterType::INTEGER;
            $params['offset'] = $offset;   $types['offset'] = ParameterType::INTEGER;
        }

        $rows = $this->conn->executeQuery(implode("\n", $sql), $params, $types)->fetchAllAssociative();

        // Normalize/shape fields
        foreach ($rows as &$r) {
            // Cast numeric fields
            $r['cleaning_cost'] = isset($r['cleaning_cost']) ? (float)$r['cleaning_cost'] : null;
            $r['o2_collected_fee'] = isset($r['o2_collected_fee']) ? (float)$r['o2_collected_fee'] : null;
            if (array_key_exists('unit_rate_amount', $r)) {
                $r['unit_rate_amount'] = $r['unit_rate_amount'] !== null ? (float)$r['unit_rate_amount'] : null;
            }
            if (array_key_exists('unit_cleaning_fee', $r)) {
                $r['unit_cleaning_fee'] = $r['unit_cleaning_fee'] !== null ? (float)$r['unit_cleaning_fee'] : null;
            }
            // Checklist fields
            if (array_key_exists('checklist_id', $r)) {
                $r['checklist_id'] = $r['checklist_id'] !== null ? (int)$r['checklist_id'] : null;
            }
            if (array_key_exists('checklist_cleaning_id', $r)) {
                $r['checklist_cleaning_id'] = $r['checklist_cleaning_id'] !== null ? (int)$r['checklist_cleaning_id'] : null;
            }
            if (array_key_exists('checklist_cleaner_id', $r)) {
                $r['checklist_cleaner_id'] = $r['checklist_cleaner_id'] !== null ? (int)$r['checklist_cleaner_id'] : null;
            }
            if (array_key_exists('checklist_cleaner_short_name', $r)) {
                $r['checklist_cleaner_short_name'] = $r['checklist_cleaner_short_name'] !== null ? (string)$r['checklist_cleaner_short_name'] : null;
            }
            if (array_key_exists('checklist_submitted_at', $r)) {
                $r['checklist_submitted_at'] = $r['checklist_submitted_at'] !== null
                    ? $this->toCancunDateTime((string) $r['checklist_submitted_at'], 'Y-m-d H:i')
                    : null;
            }
            if (array_key_exists('checklist_cleaning_notes', $r)) {
                $r['checklist_cleaning_notes'] = $r['checklist_cleaning_notes'] !== null ? (string)$r['checklist_cleaning_notes'] : null;
            }
        }
        unset($r);

        // Also provide Active units list for UI dropdowns, with latest unit_rate_amount per unit/city
        $unitsSql = "SELECT 
            u.id,
            u.unit_name,
            u.city,
            u.status,
            u.cleaning_fee,
            (
              SELECT r.amount
              FROM hk_unit_cleaning_rate r
              WHERE r.unit_id = u.id
                AND r.effective_from = (
                  SELECT MAX(r2.effective_from)
                  FROM hk_unit_cleaning_rate r2
                  WHERE r2.unit_id = u.id
                )
            ) AS unit_rate_amount
          FROM unit u
          WHERE u.status = 'Active'
          ORDER BY u.unit_name ASC";
        $units = $this->conn->fetchAllAssociative($unitsSql);
        foreach ($units as &$u) {
            if (isset($u['cleaning_fee'])) {
                $u['cleaning_fee'] = $u['cleaning_fee'] !== null ? (float)$u['cleaning_fee'] : null;
            }
            if (isset($u['unit_rate_amount'])) {
                $u['unit_rate_amount'] = $u['unit_rate_amount'] !== null ? (float)$u['unit_rate_amount'] : null;
            }
        }
        unset($u);

        return [
            'data'  => $rows,
            'rows'  => $rows,
            'total' => $total,
            'page' => $page,
            'pageSize' => $rawPageSize,
            'units' => $units,
        ];
    }

    private function toCancunDateTime(?string $dt, string $format = 'Y-m-d H:i'): ?string
    {
        if ($dt === null || $dt === '') {
            return null;
        }

        try {
            $s = (string) $dt;

            // If DB returns "YYYY-MM-DD HH:MM:SS" without timezone, treat as UTC (our backend standard).
            // If it includes timezone info, DateTimeImmutable will respect it.
            $utc = new DateTimeZone('UTC');
            $cancun = new DateTimeZone('America/Cancun');

            // Create from string assuming UTC when no timezone is present.
            $d = new DateTimeImmutable($s, $utc);
            $d = $d->setTimezone($cancun);

            return $d->format($format);
        } catch (\Throwable $e) {
            // Fallback: return original string unchanged.
            return (string) $dt;
        }
    }

    private function sanitizeSort(string $sort): string
    {
        // whitelist to prevent SQL injection via ORDER BY
        $map = [
            'checkout_date'   => 'hc.checkout_date',
            'unit_name'       => 'u.unit_name',
            'city'            => 'hc.city',
            'cleaning_cost'   => 'hc.cleaning_cost',
            'o2_collected_fee'=> 'hc.o2_collected_fee',
            'created_at'      => 'hc.created_at',
            'id'              => 'hc.id',
        ];
        return $map[$sort] ?? $map['checkout_date'];
    }
}