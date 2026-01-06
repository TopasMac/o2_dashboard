<?php

namespace App\Service\Reports;

use Doctrine\DBAL\Connection;

/**
 * Builds a normalized data payload for Unit Purchase List preview/PDF.
 *
 * Intentionally uses DBAL (not Doctrine entities) to keep it lightweight and stable
 * for reporting (similar philosophy to UnitMonthlyReportService).
 */
class UnitPurchaseListReportService
{
    public function __construct(
        private readonly Connection $db,
    ) {}

    /**
     * Build report data by purchase list id.
     *
     * @return array{
     *   ok: bool,
     *   list: array<string,mixed>,
     *   unit: array<string,mixed>,
     *   client: array<string,mixed>,
     *   lines: array<int,array<string,mixed>>,
     *   totals: array<string,mixed>
     * }
     */
    public function buildByListId(int $purchaseListId): array
    {
        if ($purchaseListId <= 0) {
            return [
                'ok' => false,
                'list' => [],
                'unit' => [],
                'client' => [],
                'lines' => [],
                'totals' => [
                    'itemsCount' => 0,
                    'totalSellPrice' => '0.00',
                    'totalCost' => '0.00',
                ],
            ];
        }

        $list = $this->db->fetchAssociative(
            'SELECT id, unit_id, status, created_at, sent_at, approved_at, last_reviewed_at, charged_year_month, list_reference, notes, total_cost, total_sell_price
               FROM unit_purchase_list
              WHERE id = :id
              LIMIT 1',
            ['id' => $purchaseListId]
        );

        if (!$list) {
            return [
                'ok' => false,
                'list' => [],
                'unit' => [],
                'client' => [],
                'lines' => [],
                'totals' => [
                    'itemsCount' => 0,
                    'totalSellPrice' => '0.00',
                    'totalCost' => '0.00',
                ],
            ];
        }

        $unitId = (int) ($list['unit_id'] ?? 0);
        // NOTE: table is `unit` (not `units`) in this project.
        // We select * to avoid column-name mismatches across environments, then map defensively below.
        $unit = $this->db->fetchAssociative(
            'SELECT *
               FROM unit
              WHERE id = :id
              LIMIT 1',
            ['id' => $unitId]
        ) ?: [];

        // Fetch client (unit has client_id; client table may use numeric `id` or string client_id)
        $client = [];
        $unitClientIdRaw = $unit['client_id'] ?? ($unit['clientId'] ?? null);

        if ($unitClientIdRaw !== null && trim((string) $unitClientIdRaw) !== '') {
            $cidStr = trim((string) $unitClientIdRaw);

            // If numeric, try by primary key first
            if (ctype_digit($cidStr)) {
                $client = $this->db->fetchAssociative(
                    'SELECT *
                       FROM client
                      WHERE id = :id
                      LIMIT 1',
                    ['id' => (int) $cidStr]
                ) ?: [];
            }

            // Fallback: try by client_id (string identifier)
            if (!$client) {
                $client = $this->db->fetchAssociative(
                    'SELECT *
                       FROM client
                      WHERE client_id = :cid
                      LIMIT 1',
                    ['cid' => $cidStr]
                ) ?: [];
            }
        }

        // Normalize unit bed config (stored as JSON string in DB)
        $bedConfig = [];
        $bedConfigRaw = $unit['bed_config'] ?? ($unit['bedConfig'] ?? null);
        if (!empty($bedConfigRaw)) {
            $decoded = json_decode((string) $bedConfigRaw, true);
            if (is_array($decoded)) {
                $bedConfig = $decoded;
            }
        }

        // NOTE: select * to avoid column-name mismatches across environments.
        // Join purchase_catalog to expose catalog_category and resolved category.
        $rawLines = $this->db->fetchAllAssociative(
            'SELECT l.*,
                    c.category AS catalog_category,
                    COALESCE(NULLIF(TRIM(l.category), \'\'), c.category) AS category_resolved
               FROM unit_purchase_list_line l
               LEFT JOIN purchase_catalog_item c ON c.id = l.catalog_item_id
              WHERE l.purchase_list_id = :pid
              ORDER BY COALESCE(l.sort_order, 999999) ASC, l.id ASC',
            ['pid' => $purchaseListId]
        );

        $lines = [];
        $itemsCount = 0;
        $sumSell = '0.00';
        $sumCost = '0.00';

        foreach ($rawLines as $ln) {
            $qty = (int) ($ln['qty'] ?? 0);
            $existing = (int) ($ln['existing_qty'] ?? 0);

            // Prefer persisted needed_qty if present (generator writes it), otherwise derive.
            $neededQty = null;
            if (array_key_exists('needed_qty', $ln) && $ln['needed_qty'] !== null) {
                $neededQty = max(0, (int) $ln['needed_qty']);
            } else {
                $neededQty = max(0, $qty - $existing);
            }

            // Do not include rows where there is nothing to buy (needed_qty == 0).
            if ($neededQty <= 0) {
                continue;
            }

            // Prefer line totals if present; else compute (sell only)
            $unitSell = $this->moneyStr($ln['unit_sell_price'] ?? null);
            $unitCost = $this->moneyStr($ln['unit_cost'] ?? null, null);

            // Different schemas may store line totals under different column names.
            $lineTotalSellRaw = $ln['line_total_sell_price']
                ?? ($ln['total_sell_price'] ?? ($ln['sell_total'] ?? null));
            $lineTotalSell = $this->moneyStr($lineTotalSellRaw, null);
            if ($lineTotalSell === null) {
                $lineTotalSell = $this->moneyMul($neededQty, $unitSell);
            }

            $lineTotalCostRaw = $ln['line_total_cost']
                ?? ($ln['total_cost'] ?? ($ln['cost_total'] ?? null));
            $lineTotalCost = $this->moneyStr($lineTotalCostRaw, null);
            if ($lineTotalCost === null && $unitCost !== null) {
                $lineTotalCost = $this->moneyMul($neededQty, $unitCost);
            }

            $lines[] = [
                'id' => (int) ($ln['id'] ?? 0),
                '_sortOrder' => (int) ($ln['sort_order'] ?? 999999),
                'category' => $ln['category_resolved'] ?? ($ln['category'] ?? ($ln['catalog_category'] ?? null)),
                'description' => $ln['description'] ?? '',
                'catalogItemId' => $ln['catalog_item_id'] !== null ? (int) $ln['catalog_item_id'] : null,
                'qty' => $qty,
                'existingQty' => $existing,
                'neededQty' => $neededQty,
                'notes' => $ln['notes'] ?? null,
                'purchaseSource' => $ln['purchase_source'] ?? null,
                'purchaseUrl' => $ln['purchase_url'] ?? null,
                'unitSellPrice' => $unitSell,
                'unitCost' => $unitCost,
                'lineTotalSellPrice' => $lineTotalSell,
                'lineTotalCost' => $lineTotalCost,
            ];

            $itemsCount++;

            // Accumulate totals (sell always; cost only if available)
            $sumSell = $this->moneyAdd($sumSell, $lineTotalSell);
            if ($lineTotalCost !== null) {
                $sumCost = $this->moneyAdd($sumCost, $lineTotalCost);
            }
        }

        // If list totals are already stored and non-zero, keep them as authoritative.
        $storedSell = $this->moneyStr($list['total_sell_price'] ?? null, null);
        $storedCost = $this->moneyStr($list['total_cost'] ?? null, null);

        $totals = [
            'itemsCount' => $itemsCount,
            'totalSellPrice' => ($storedSell !== null ? $storedSell : $sumSell),
            'totalCost' => ($storedCost !== null ? $storedCost : $sumCost),
        ];

        // Sort by category A–Z, with "Other" always last; preserve line order within category.
        usort($lines, function (array $a, array $b): int {
            $catA = trim((string) ($a['category'] ?? ''));
            $catB = trim((string) ($b['category'] ?? ''));
            if ($catA === '') { $catA = 'Other'; }
            if ($catB === '') { $catB = 'Other'; }

            $isOtherA = strcasecmp($catA, 'Other') === 0;
            $isOtherB = strcasecmp($catB, 'Other') === 0;

            if ($isOtherA && !$isOtherB) { return 1; }
            if (!$isOtherA && $isOtherB) { return -1; }

            $cmp = strcasecmp($catA, $catB);
            if ($cmp !== 0) { return $cmp; }

            $sa = (int) ($a['_sortOrder'] ?? 999999);
            $sb = (int) ($b['_sortOrder'] ?? 999999);
            if ($sa !== $sb) { return $sa <=> $sb; }

            return ((int) ($a['id'] ?? 0)) <=> ((int) ($b['id'] ?? 0));
        });

        return [
            'ok' => true,
            'list' => [
                'id' => (int) $list['id'],
                'unitId' => $unitId,
                'status' => (string) ($list['status'] ?? ''),
                'createdAt' => $list['created_at'] ?? null,
                'sentAt' => $list['sent_at'] ?? null,
                'approvedAt' => $list['approved_at'] ?? null,
                'lastReviewedAt' => $list['last_reviewed_at'] ?? null,
                'chargedYearMonth' => $list['charged_year_month'] ?? null,
                'listReference' => $list['list_reference'] ?? null,
                'notes' => $list['notes'] ?? null,
                'totalCost' => $this->moneyStr($list['total_cost'] ?? null, '0.00'),
                'totalSellPrice' => $this->moneyStr($list['total_sell_price'] ?? null, '0.00'),
                // Convenience copies for Twig (avoid having to dereference nested arrays)
                'clientName' => ($client['name'] ?? ($client['full_name'] ?? null)),
                'clientLanguage' => ($client['language'] ?? ($client['lang'] ?? ($client['locale'] ?? null))),
            ],
            'unit' => [
                'id' => (int) ($unit['id'] ?? 0),
                'unitId' => $unit['unit_id'] ?? null,
                'clientId' => $unit['client_id'] ?? null,
                // Some schemas use `unit_name`, others use `name`.
                'name' => ($unit['unit_name'] ?? $unit['name'] ?? null),
                'city' => $unit['city'] ?? null,
                'type' => $unit['type'] ?? null,
                'pax' => isset($unit['pax']) ? (int) $unit['pax'] : null,
                'baths' => isset($unit['baths']) ? (int) $unit['baths'] : null,
                'beds' => isset($unit['beds']) ? (int) $unit['beds'] : null,
                'bedConfig' => $bedConfig,
            ],
            'client' => [
                'id' => isset($client['id']) ? (int) $client['id'] : null,
                'clientId' => $client['client_id'] ?? null,
                // Some schemas use `name`, others may use `full_name`
                'name' => ($client['name'] ?? ($client['full_name'] ?? null)),
                // language field: accept common variants
                'language' => ($client['language'] ?? ($client['lang'] ?? ($client['locale'] ?? null))),
            ],
            // Top-level conveniences for Twig templates
            'clientName' => ($client['name'] ?? ($client['full_name'] ?? null)),
            'clientLanguage' => ($client['language'] ?? ($client['lang'] ?? ($client['locale'] ?? null))),
            'lines' => $lines,
            'totals' => $totals,
        ];
    }

    /**
     * Money normalization: returns "0.00" by default, or null if $defaultNull is null.
     */
    private function moneyStr(mixed $v, ?string $defaultNull = '0.00'): ?string
    {
        if ($v === null) {
            return $defaultNull;
        }
        $s = trim((string) $v);
        if ($s === '') {
            return $defaultNull;
        }
        // Ensure numeric
        $n = (float) $s;
        if (!is_finite($n) || $n < 0) {
            return $defaultNull;
        }
        return number_format($n, 2, '.', '');
    }

    private function moneyAdd(string $a, string $b): string
    {
        // bcmath optional; fallback to float
        if (function_exists('bcadd')) {
            return bcadd($a, $b, 2);
        }
        $n = (float) $a + (float) $b;
        return number_format($n, 2, '.', '');
    }

    private function moneyMul(int $qty, string $unit): string
    {
        if (function_exists('bcmul')) {
            return bcmul((string) $qty, $unit, 2);
        }
        $n = ((float) $qty) * ((float) $unit);
        return number_format($n, 2, '.', '');
    }
}