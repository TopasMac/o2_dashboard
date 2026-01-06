<?php

namespace App\Repository;

use App\Entity\UnitMedia;
use App\Entity\Unit;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UnitMedia>
 *
 * @method UnitMedia|null find($id, $lockMode = null, $lockVersion = null)
 * @method UnitMedia|null findOneBy(array $criteria, array $orderBy = null)
 * @method UnitMedia[]    findAll()
 * @method UnitMedia[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class UnitMediaRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitMedia::class);
    }

    /**
     * Returns media items for a specific unit ordered by sortOrder.
     *
     * @param Unit $unit
     * @return UnitMedia[]
     */
    public function findByUnitOrdered(Unit $unit): array
    {
        return $this->createQueryBuilder('um')
            ->andWhere('um.unit = :unit')
            ->setParameter('unit', $unit)
            ->orderBy('um.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Returns published media items for a specific unit ordered by sortOrder.
     *
     * @param Unit $unit
     * @return UnitMedia[]
     */
    public function findPublishedByUnit(Unit $unit): array
    {
        return $this->createQueryBuilder('um')
            ->andWhere('um.unit = :unit')
            ->andWhere('um.isPublished = :published')
            ->setParameter('unit', $unit)
            ->setParameter('published', true)
            ->orderBy('um.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Returns media items for a specific unit where isCover is true.
     *
     * @param Unit $unit
     * @return UnitMedia[]
     */
    public function findCoversOnly(Unit $unit): array
    {
        return $this->createQueryBuilder('um')
            ->andWhere('um.unit = :unit')
            ->andWhere('um.isCover = :isCover')
            ->setParameter('unit', $unit)
            ->setParameter('isCover', true)
            ->getQuery()
            ->getResult();
    }
}