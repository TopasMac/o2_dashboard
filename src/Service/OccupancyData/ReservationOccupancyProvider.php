<?php

namespace App\Service\OccupancyData;

use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\DBAL\Connection;

/**
 * Doctrine-based occupancy provider that reads from the pre-sliced
 * `booking_month_slice` table and returns total booked nights for a unit/month.
 *
 * Supports an optional city filter via `setCity()` when your slice table has
 * a `city` column.
 */
class ReservationOccupancyProvider
{
    /** @var string|null */
    private ?string $city = null;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function setCity(?string $city): self
    {
        $this->city = $city ?: null;
        return $this;
    }

    /**
     * Count booked nights overlapping the given month range.
     */
    public function countBookedNights(Unit $unit, \DateTimeImmutable $monthStart, \DateTimeImmutable $monthEndExclusive): int
    {
        // We rely on the pre-sliced monthly table `booking_month_slice`.
        // Expected columns: unit_id, year_month (e.g. "2025-10"), nights_in_month (and optional city)
        $conn = $this->em->getConnection();

        $unitId = $this->unitId($unit);
        if (!$unitId) {
            return 0;
        }

        $ym = $monthStart->format('Y-m');

        $sql = 'SELECT COALESCE(SUM(`nights_in_month`), 0) AS nights
                FROM `booking_month_slice`
                WHERE `unit_id` = :unitId
                  AND `year_month` = :ym';
        if ($this->city) {
            $sql .= ' AND `city` = :city';
        }

        $params = ['unitId' => $unitId, 'ym' => $ym];
        if ($this->city) {
            $params['city'] = $this->city;
        }
        $stmt = $conn->prepare($sql);
        $result = $stmt->executeQuery($params);
        $row = $result->fetchAssociative();

        return isset($row['nights']) ? (int)$row['nights'] : 0;
    }

    private function unitId(Unit $unit): ?int
    {
        return method_exists($unit, 'getId') ? $unit->getId() : null;
    }

    private static function toImmutable($dt): ?\DateTimeImmutable
    {
        if ($dt instanceof \DateTimeImmutable) return $dt;
        if ($dt instanceof \DateTime) return \DateTimeImmutable::createFromMutable($dt);
        return null;
    }
}