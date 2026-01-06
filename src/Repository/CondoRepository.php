<?php

namespace App\Repository;

use App\Entity\Condo;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Condo>
 */
class CondoRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Condo::class);
    }

    // You can add custom queries here, e.g.:
    // public function findByCity(string $city): array
    // {
    //     return $this->createQueryBuilder('c')
    //         ->andWhere('c.city = :val')
    //         ->setParameter('val', $city)
    //         ->orderBy('c.name', 'ASC')
    //         ->getQuery()
    //         ->getResult();
    // }
}