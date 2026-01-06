<?php

namespace App\Repository;

use App\Entity\UnitPurchaseListLine;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UnitPurchaseListLine>
 *
 * @method UnitPurchaseListLine|null find($id, $lockMode = null, $lockVersion = null)
 * @method UnitPurchaseListLine|null findOneBy(array $criteria, array $orderBy = null)
 * @method UnitPurchaseListLine[]    findAll()
 * @method UnitPurchaseListLine[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class UnitPurchaseListLineRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitPurchaseListLine::class);
    }

    /**
     * Returns all lines for a purchase list, sorted by sortOrder then id.
     */
    public function findByListId(int $listId): array
    {
        return $this->createQueryBuilder('l')
            ->andWhere('l.purchaseList = :listId')
            ->setParameter('listId', $listId)
            ->orderBy('l.sortOrder', 'ASC')
            ->addOrderBy('l.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Deletes all lines for a purchase list.
     */
    public function deleteByListId(int $listId): int
    {
        return $this->createQueryBuilder('l')
            ->delete()
            ->andWhere('l.purchaseList = :listId')
            ->setParameter('listId', $listId)
            ->getQuery()
            ->execute();
    }
}