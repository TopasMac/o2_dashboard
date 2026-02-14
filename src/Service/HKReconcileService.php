<?php

namespace App\Service;

use App\Entity\HKCleanings;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Builds the HK reconciliation "month view" payload for the UI.
 *
 * Notes:
 * - "Charged" is what the housekeeper reports (cleaning + laundry) from HKCleaningsReconcile.
 * - "Expected" is computed from the system rates for that month (active units + effective rate).
 *
 * We return plain arrays (view-model), intentionally (no DTOs yet).
 */
class HKReconcileService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * @return array{
     *   month: string,
     *   city: string,
     *   rows: array<int, array<string, mixed>>,
     *   totals: array{expected: string, charged: string, diff: string}
     * }
     */
    public function getMonthView(string $month, string $city): array
    {
        // Normalize month to first day.
        $asOf = \DateTimeImmutable::createFromFormat('Y-m-d', $month . '-01');
        if (!$asOf) {
            throw new \InvalidArgumentException('Invalid month (YYYY-MM)');
        }

        $expectedByUnitId = $this->loadExpectedCostsByUnitId($city, $asOf);

        // Load DONE hk_cleanings rows for this month + city.
        // NOTE: Reconciliation is now a view/editor over hk_cleanings (single source of truth).
        $start = $asOf->format('Y-m-01');
        $end   = $asOf->format('Y-m-t');

        // Row-level note data (optional): hk_cleaning_id => ['resolution' => ?, 'status' => ?]
        $rowNotesByCleaningId = $this->loadRowNoteDataByCleaningId($city, $month);

        /** @var HKCleanings[] $cleanings */
        $cleanings = $this->em->createQueryBuilder()
            ->select('hc', 'u')
            ->from(HKCleanings::class, 'hc')
            ->leftJoin('hc.unit', 'u')
            // city may be stored on hk_cleanings or unit; prefer unit when present
            ->andWhere('COALESCE(u.city, hc.city) = :c')
            ->andWhere('hc.checkoutDate BETWEEN :d1 AND :d2')
            ->andWhere('LOWER(COALESCE(hc.status, \'\')) = \'done\'')
            ->setParameter('c', $city)
            ->setParameter('d1', new \DateTimeImmutable($start))
            ->setParameter('d2', new \DateTimeImmutable($end))
            ->orderBy('hc.checkoutDate', 'ASC')
            ->addOrderBy('u.unitName', 'ASC')
            ->getQuery()
            ->getResult();

        $sumCharged = 0.0;
        $sumCost = 0.0;

        $rows = [];
        foreach ($cleanings as $hc) {
            $unitId = $hc->getUnit()?->getId();

            $expected = ($unitId && array_key_exists($unitId, $expectedByUnitId))
                ? $expectedByUnitId[$unitId]
                : null;

            // Charged cost for reconciliation = o2CollectedFee if present, else unit cleaning fee, else 0
            if (method_exists($hc, 'getO2CollectedFee') && $hc->getO2CollectedFee() !== null && $hc->getO2CollectedFee() !== '') {
                $chargedF = $this->toFloat($hc->getO2CollectedFee());
            } elseif ($hc->getUnit() !== null && method_exists($hc->getUnit(), 'getCleaningFee')) {
                $chargedF = $this->toFloat($hc->getUnit()->getCleaningFee());
            } else {
                $chargedF = 0.0;
            }

            // Total cost = cleaning_cost + laundry_cost
            $cleaningCostF = $this->toFloat(method_exists($hc, 'getCleaningCost') ? $hc->getCleaningCost() : null);
            $laundryCostF  = $this->toFloat(method_exists($hc, 'getLaundryCost') ? $hc->getLaundryCost() : null);
            $totalCostF    = $cleaningCostF + $laundryCostF;

            $diff = $chargedF - $totalCostF;

            $sumCharged += $chargedF;
            $sumCost += $totalCostF;

            $serviceDate = $hc->getCheckoutDate();

            $rows[] = [
                // hk_cleanings identifiers
                'id'            => $hc->getId(),
                'hk_cleaning_id'=> $hc->getId(),
                'booking_id'    => method_exists($hc, 'getBookingId') ? $hc->getBookingId() : null,

                // core display fields
                'unit_id'       => $unitId,
                'unit_name'     => $hc->getUnit()?->getUnitName(),
                'service_date'  => $serviceDate?->format('Y-m-d'),
                'cleaning_type' => method_exists($hc, 'getCleaningType') ? $hc->getCleaningType() : null,

                // costs (as stored)
                'cleaning_cost' => method_exists($hc, 'getCleaningCost') ? $hc->getCleaningCost() : null,
                'laundry_cost'  => method_exists($hc, 'getLaundryCost') ? $hc->getLaundryCost() : null,
                'total_cost'    => $this->fmt2($totalCostF),

                // reconciliation meta
                'bill_to'       => method_exists($hc, 'getBillTo') ? $hc->getBillTo() : null,
                'source'        => method_exists($hc, 'getSource') ? $hc->getSource() : null,
                'report_status' => method_exists($hc, 'getReportStatus') ? $hc->getReportStatus() : null,

                'notes'         => method_exists($hc, 'getNotes') ? $hc->getNotes() : null,

                // latest row-level note data (from hk_cleanings_recon_notes)
                'resolution'         => $rowNotesByCleaningId[$hc->getId()]['resolution'] ?? null,
                'resolution_status'  => $rowNotesByCleaningId[$hc->getId()]['status'] ?? null,

                // computed fields for reconciliation
                'expected_cost' => $expected,
                'charged_cost'  => $this->fmt2($chargedF),
                'diff'          => $this->fmt2($diff),
            ];
        }

        $sumDiff = $sumCharged - $sumCost;

        return [
            'month' => $month,
            'city' => $city,
            'rows' => $rows,
            'totals' => [
                'expected' => $this->fmt2(0.0),
                'charged'  => $this->fmt2($sumCharged),
                'diff'     => $this->fmt2($sumDiff),
            ],
        ];
    }

    /**
     * Expected cost per active unit for the given month.
     *
     * Strategy (simple + pragmatic):
     * - Active units are read from `units` (status=Active, city matches).
     * - Expected cost is pulled from `hk_unit_cleaning_rate` if available for that month,
     *   otherwise null.
     *
     * IMPORTANT:
     * - Your current hk_unit_cleaning_rate schema appears to have a single amount per unit,
     *   but the active-units endpoint already returns effective_from/to. We follow that.
     *
     * @return array<int,string|null> unitId => expectedCost (decimal string) or null
     */
    private function loadExpectedCostsByUnitId(string $city, \DateTimeImmutable $asOf): array
    {
        $conn = $this->em->getConnection();

        // Try to follow the same logic you exposed in /api/hk-cleanings/active-units:
        // - select Active units for city
        // - left join the "effective" rate row for the month
        //
        // NOTE: if your table/columns differ slightly, adjust here (controller already did something similar).
        $sql = <<<SQL
SELECT
  u.id AS unit_id,
  u.unit_name,
  u.city,
  u.status,
  u.cleaning_fee AS unit_cleaning_fee,
  r.amount AS cleaning_cost,
  r.effective_from,
  r.effective_to
FROM unit u
LEFT JOIN hk_unit_cleaning_rate r
  ON r.unit_id = u.id
  AND (r.effective_from IS NULL OR r.effective_from <= :asOf)
  AND (r.effective_to   IS NULL OR r.effective_to   >= :asOf)
WHERE u.status = 'Active'
  AND u.city = :city
ORDER BY u.unit_name ASC
SQL;

        $rows = $conn->fetchAllAssociative($sql, [
            'city' => $city,
            'asOf' => $asOf->format('Y-m-d'),
        ]);

        $out = [];
        foreach ($rows as $row) {
            $unitId = (int) ($row['unit_id'] ?? 0);
            if (!$unitId) {
                continue;
            }
            $val = $row['cleaning_cost'] ?? null;
            $out[$unitId] = $val !== null ? $this->fmt2($this->toFloat($val)) : null;
        }

        return $out;
    }

    /**
     * Latest row-level note data per hk_cleaning_id for a given city+month.
     * We only consider rows where hk_cleaning_id IS NOT NULL.
     *
     * @return array<int, array{resolution: string|null, status: string|null}> hk_cleaning_id => data
     */
    private function loadRowNoteDataByCleaningId(string $city, string $month): array
    {
        $conn = $this->em->getConnection();

        $sql = <<<SQL
SELECT hk_cleaning_id, resolution, status, updated_at, created_at
FROM hk_cleanings_recon_notes
WHERE city = :city
  AND month = :month
  AND hk_cleaning_id IS NOT NULL
ORDER BY hk_cleaning_id ASC, COALESCE(updated_at, created_at) DESC
SQL;

        $rows = $conn->fetchAllAssociative($sql, [
            'city' => $city,
            'month' => $month,
        ]);

        $out = [];
        foreach ($rows as $r) {
            $id = (int)($r['hk_cleaning_id'] ?? 0);
            if ($id <= 0) continue;
            if (array_key_exists($id, $out)) {
                // first row per id is the latest due to ordering
                continue;
            }
            $out[$id] = [
                'resolution' => $r['resolution'] !== null ? (string)$r['resolution'] : null,
                'status' => $r['status'] !== null ? (string)$r['status'] : null,
            ];
        }

        return $out;
    }

    private function toFloat(mixed $v): float
    {
        if ($v === null) {
            return 0.0;
        }
        if (is_float($v) || is_int($v)) {
            return (float) $v;
        }
        $s = trim((string) $v);
        if ($s === '') {
            return 0.0;
        }
        // Accept "650,00" or "650.00"
        $s = str_replace([' ', ','], ['', '.'], $s);
        return (float) $s;
    }

    private function fmt2(float $v): string
    {
        return number_format($v, 2, '.', '');
    }
}