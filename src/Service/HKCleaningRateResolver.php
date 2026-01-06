<?php

namespace App\Service;

use App\Repository\HKUnitCleaningRateRepository;

class HKCleaningRateResolver
{
    public function __construct(private HKUnitCleaningRateRepository $rates)
    {
    }

    /**
     * Resolve the cleaning rate amount for a given unit/city/date.
     * Returns a float amount if found, otherwise null.
     */
    public function resolveAmount(int $unitId, string $city, \DateTimeInterface $onDate): ?float
    {
        $rate = $this->rates->findActiveRate($unitId, $city, $onDate);
        if (!$rate) {
            return null;
        }
        // Amount stored as string decimal in entity; cast to float for consumers
        return (float) $rate->getAmount();
    }

    /**
     * Convenience helper: resolve amount for a Y-m-d string date.
     */
    public function resolveAmountForDateStr(int $unitId, string $city, string $dateYmd): ?float
    {
        $on = \DateTimeImmutable::createFromFormat('Y-m-d', $dateYmd) ?: new \DateTimeImmutable($dateYmd);
        return $this->resolveAmount($unitId, $city, $on);
    }
    /**
     * Create a new cleaning rate effective from a given date.
     * This closes any currently open rate for the unit/city and inserts a new one.
     */
    public function setRate(int $unitId, string $city, float $amount, \DateTimeInterface $fromDate, ?string $notes = null)
    {
        return $this->rates->setRateFromDate($unitId, $city, $amount, $fromDate, $notes);
    }
    /**
     * Fetch the most recent cleaning rate row for a unit from hk_unit_cleaning_rate.
     */
    public function getLatestForUnit(int $unitId): ?array
    {
        $qb = $this->rates->createQueryBuilder('r')
            ->innerJoin('r.unit', 'u')
            ->andWhere('u.id = :unitId')
            ->setParameter('unitId', $unitId)
            ->orderBy('r.effectiveFrom', 'DESC')
            ->setMaxResults(1);
        $result = $qb->getQuery()->getArrayResult();
        return $result[0] ?? null;
    }

    public function getLatestForUnitCity(int $unitId, string $city): ?array
    {
        $qb = $this->rates->createQueryBuilder('r')
            ->innerJoin('r.unit', 'u')
            ->andWhere('u.id = :unitId')
            ->andWhere('r.city = :city')
            ->setParameter('unitId', $unitId)
            ->setParameter('city', $city)
            ->orderBy('r.effectiveFrom', 'DESC')
            ->setMaxResults(1);
        $result = $qb->getQuery()->getArrayResult();
        return $result[0] ?? null;
    }
}