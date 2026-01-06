<?php

namespace App\Repository;

use App\Entity\HKTransactions;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<HKTransactions>
 */
class HKTransactionsRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, HKTransactions::class);
    }

    public function findAll(): array
    {
        return $this->createQueryBuilder('t')
            ->orderBy('t.date', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find transactions by unit ID
     */
    public function findByUnit(int $unitId): array
    {
        return $this->createQueryBuilder('t')
            ->andWhere('t.unit = :unitId')
            ->setParameter('unitId', $unitId)
            ->orderBy('t.date', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find transactions by category
     */
    public function findByCategory(int $categoryId): array
    {
        return $this->createQueryBuilder('t')
            ->andWhere('t.categoryId = :categoryId')
            ->setParameter('categoryId', $categoryId)
            ->orderBy('t.date', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find transactions by cost centre
     */
    public function findByCostCentre(string $costCentre): array
    {
        return $this->createQueryBuilder('t')
            ->andWhere('t.costCentre = :costCentre')
            ->setParameter('costCentre', $costCentre)
            ->orderBy('t.date', 'DESC')
            ->getQuery()
            ->getResult();
    }
    /**
     * Find transactions by city
     */
    public function findByCity(string $city): array
    {
        return $this->createQueryBuilder('t')
            ->join('t.unit', 'u')
            ->andWhere('u.city = :city')
            ->setParameter('city', $city)
            ->orderBy('t.date', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find transactions for a unit within a date range and costCentre (defaults to 'Client').
     */
    public function findByFiltersClient(
        ?int $unitId,
        ?\DateTimeInterface $fromDate,
        ?\DateTimeInterface $toDate,
        ?string $costCentre = 'Client'
    ): array {
        $qb = $this->createQueryBuilder('t')
            ->leftJoin('t.unit', 'u')
            ->addSelect('u')
            ->orderBy('t.date', 'ASC');

        if ($unitId !== null) {
            $qb->andWhere('u.id = :unitId')
               ->setParameter('unitId', $unitId);
        }

        if ($fromDate !== null) {
            $qb->andWhere('t.date >= :fromDate')
               ->setParameter('fromDate', $fromDate->format('Y-m-d'));
        }

        if ($toDate !== null) {
            $qb->andWhere('t.date <= :toDate')
               ->setParameter('toDate', $toDate->format('Y-m-d'));
        }

        if ($costCentre !== null && $costCentre !== '') {
            $qb->andWhere('t.costCentre = :costCentre')
               ->setParameter('costCentre', $costCentre);
        }

        return $qb->getQuery()->getResult();
    }
}