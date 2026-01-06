<?php

namespace App\Repository;

use App\Entity\CondoContact;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CondoContact>
 */
class CondoContactRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CondoContact::class);
    }

    /**
     * Optional reusable query helper.
     * @return CondoContact[]
     */
    public function findByCondoOrdered(int $condoId): array
    {
        return $this->createQueryBuilder('c')
            ->andWhere('IDENTITY(c.condo) = :condoId')
            ->setParameter('condoId', $condoId)
            ->addOrderBy('c.department', 'ASC')
            ->addOrderBy('c.name', 'ASC')
            ->getQuery()
            ->getResult();
    }
}