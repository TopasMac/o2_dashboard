<?php

namespace App\Repository;

use App\Entity\UnitPurchaseList;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UnitPurchaseList>
 *
 * @method UnitPurchaseList|null find($id, $lockMode = null, $lockVersion = null)
 * @method UnitPurchaseList|null findOneBy(array $criteria, array $orderBy = null)
 * @method UnitPurchaseList[]    findAll()
 * @method UnitPurchaseList[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class UnitPurchaseListRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitPurchaseList::class);
    }

    /**
     * Returns the latest purchase list for a unit (any status).
     */
    public function findLatestForUnit(int $unitId): ?UnitPurchaseList
    {
        return $this->createQueryBuilder('l')
            ->andWhere('l.unit = :unitId')
            ->setParameter('unitId', $unitId)
            ->orderBy('l.createdAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Returns the current draft purchase list for a unit, if any.
     */
    public function findDraftForUnit(int $unitId): ?UnitPurchaseList
    {
        return $this->createQueryBuilder('l')
            ->andWhere('l.unit = :unitId')
            ->andWhere('l.status = :status')
            ->setParameter('unitId', $unitId)
            ->setParameter('status', UnitPurchaseList::STATUS_DRAFT)
            ->orderBy('l.createdAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Returns all purchase lists for a unit, newest first.
     */
    public function findAllForUnit(int $unitId): array
    {
        return $this->createQueryBuilder('l')
            ->andWhere('l.unit = :unitId')
            ->setParameter('unitId', $unitId)
            ->orderBy('l.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
