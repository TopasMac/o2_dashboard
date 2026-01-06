<?php

namespace App\Repository;

use App\Entity\BookingConfig;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<BookingConfig>
 */
class BookingConfigRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, BookingConfig::class);
    }

    public function findLatest(): ?BookingConfig
    {
        return $this->createQueryBuilder('c')
            ->orderBy('c.effectiveDate', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
}