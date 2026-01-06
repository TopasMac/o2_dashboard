<?php

namespace App\Repository;

use App\Entity\HKUnitCleaningRate;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<HKUnitCleaningRate>
 */
class HKUnitCleaningRateRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, HKUnitCleaningRate::class);
    }

    /**
     * Return the rate active on a given date for a (unit, city).
     * Active means: effective_from <= :on AND (effective_to IS NULL OR effective_to >= :on)
     */
    public function findActiveRate(int $unitId, string $city, \DateTimeInterface $on): ?HKUnitCleaningRate
    {
        return $this->createQueryBuilder('r')
            ->andWhere('IDENTITY(r.unit) = :unitId')
            ->andWhere('r.city = :city')
            ->andWhere('r.effectiveFrom <= :on')
            ->andWhere('(r.effectiveTo IS NULL OR r.effectiveTo >= :on)')
            ->setParameter('unitId', $unitId)
            ->setParameter('city', $city)
            ->setParameter('on', $on->format('Y-m-d'))
            ->orderBy('r.effectiveFrom', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Find the latest (most recent effective_from) rate for a (unit, city), regardless of end.
     */
    public function findLatestRate(int $unitId, string $city): ?HKUnitCleaningRate
    {
        return $this->createQueryBuilder('r')
            ->andWhere('IDENTITY(r.unit) = :unitId')
            ->andWhere('r.city = :city')
            ->orderBy('r.effectiveFrom', 'DESC')
            ->setMaxResults(1)
            ->setParameter('unitId', $unitId)
            ->setParameter('city', $city)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Close all open rates (effective_to IS NULL) ending the day before $newFrom.
     * Returns number of affected rows.
     */
    public function closeOpenRates(int $unitId, string $city, \DateTimeInterface $newFrom): int
    {
        $em = $this->getEntityManager();
        $conn = $em->getConnection();
        return $conn->executeStatement(
            'UPDATE hk_unit_cleaning_rate 
             SET effective_to = DATE_SUB(:from, INTERVAL 1 DAY)
             WHERE unit_id = :uid
               AND (
                 city = :city
                 OR (city IS NULL AND :city = \'\')
               )
               AND effective_to IS NULL',
            [
                'from' => $newFrom->format('Y-m-d'),
                'uid'  => $unitId,
                'city' => $city,
            ]
        );
    }

    /**
     * Convenience: create a new rate record (does not close previous). Caller can close via closeOpenRates().
     */
    public function add(HKUnitCleaningRate $rate, bool $flush = true): void
    {
        $this->getEntityManager()->persist($rate);
        if ($flush) {
            $this->getEntityManager()->flush();
        }
    }

    /**
     * Set a new rate effective from a given date:
     * - Close any currently open rates (effective_to IS NULL) by setting effective_to = fromDate - 1 day
     * - Insert a new HKUnitCleaningRate row
     */
    public function setRateFromDate(int $unitId, string $city, float $amount, \DateTimeInterface $fromDate, ?string $notes = null): HKUnitCleaningRate
    {
        $em = $this->getEntityManager();

        $city = trim((string) $city);

        // Close existing open rates
        $this->closeOpenRates($unitId, $city, $fromDate);

        // Create new rate
        $rate = new HKUnitCleaningRate();
        $unitRef = $em->getReference('App\\Entity\\Unit', $unitId);
        $rate->setUnit($unitRef);
        $rate->setCity($city);
        $rate->setAmount($amount);
        $rate->setEffectiveFrom($fromDate);
        $rate->setEffectiveTo(null);
        $rate->setNotes($notes);

        $em->persist($rate);
        $em->flush();

        return $rate;
    }

    public function findLatestForUnit(int $unitId): ?HKUnitCleaningRate
    {
        return $this->createQueryBuilder('r')
            ->andWhere('IDENTITY(r.unit) = :unitId')
            ->orderBy('r.effectiveFrom', 'DESC')
            ->setMaxResults(1)
            ->setParameter('unitId', $unitId)
            ->getQuery()
            ->getOneOrNullResult();
    }
}