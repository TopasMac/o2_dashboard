<?php

namespace App\Repository;

use App\Entity\PurchaseCatalogItem;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<PurchaseCatalogItem>
 *
 * @method PurchaseCatalogItem|null find($id, $lockMode = null, $lockVersion = null)
 * @method PurchaseCatalogItem|null findOneBy(array $criteria, array $orderBy = null)
 * @method PurchaseCatalogItem[]    findAll()
 * @method PurchaseCatalogItem[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class PurchaseCatalogItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, PurchaseCatalogItem::class);
    }

    /**
     * Convenience query used by the “unit setup purchases” generator.
     * Returns items that are either generic (unitType NULL) or match the provided unit type,
     * optionally filtering to only always-needed items.
     */
    public function findForUnitType(?string $unitType, bool $onlyAlwaysNeeded = false): array
    {
        $qb = $this->createQueryBuilder('i');

        if ($onlyAlwaysNeeded) {
            $qb->andWhere('i.isAlwaysNeeded = :yes')
               ->setParameter('yes', true);
        }

        if ($unitType) {
            $qb->andWhere('(i.unitType IS NULL OR i.unitType = :ut)')
               ->setParameter('ut', $unitType);
        } else {
            $qb->andWhere('i.unitType IS NULL');
        }

        $qb->addOrderBy('i.category', 'ASC')
           ->addOrderBy('i.name', 'ASC');

        return $qb->getQuery()->getResult();
    }
}