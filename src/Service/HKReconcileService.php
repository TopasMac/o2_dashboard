<?php

namespace App\Service;

use App\Entity\HKCleaningsReconcile;
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

        /** @var HKCleaningsReconcile[] $reconRows */
        $reconRows = $this->em->createQueryBuilder()
            ->select('r', 'u')
            ->from(HKCleaningsReconcile::class, 'r')
            ->leftJoin('r.unit', 'u')
            ->where('r.reportMonth = :m')
            ->andWhere('r.city = :c')
            ->setParameter('m', $month)
            ->setParameter('c', $city)
            ->orderBy('r.serviceDate', 'ASC')
            ->addOrderBy('u.unitName', 'ASC')
            ->getQuery()
            ->getResult();

        $sumExpected = 0.0;
        $sumCharged  = 0.0;

        $rows = [];
        foreach ($reconRows as $r) {
            $unitId = $r->getUnit()?->getId();
            $expected = ($unitId && array_key_exists($unitId, $expectedByUnitId))
                ? $expectedByUnitId[$unitId]
                : null;

            $charged = $this->toFloat($r->getTotalCost());
            $expectedF = $expected !== null ? $this->toFloat($expected) : null;

            $diff = ($expectedF !== null) ? ($charged - $expectedF) : null;

            if ($expectedF !== null) {
                $sumExpected += $expectedF;
            }
            $sumCharged += $charged;

            $rows[] = [
                // original fields
                'id'            => $r->getId(),
                'unit_id'       => $unitId,
                'unit_name'     => $r->getUnit()?->getUnitName(),
                'service_date'  => $r->getServiceDate()->format('Y-m-d'),
                'cleaning_cost' => $r->getCleaningCost(),
                'laundry_cost'  => $r->getLaundryCost(),
                'total_cost'    => $r->getTotalCost(),
                'notes'         => $r->getNotes(),

                // computed fields for reconciliation
                'expected_cost' => $expected, // string decimal or null
                'charged_cost'  => $this->fmt2($charged), // string decimal
                'diff'          => $diff !== null ? $this->fmt2($diff) : null,
            ];
        }

        $sumDiff = $sumCharged - $sumExpected;

        return [
            'month' => $month,
            'city' => $city,
            'rows' => $rows,
            'totals' => [
                'expected' => $this->fmt2($sumExpected),
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