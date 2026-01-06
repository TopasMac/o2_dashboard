<?php

namespace App\Repository;

use App\Entity\UnitMaintenanceSchedule;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class UnitMaintenanceScheduleRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitMaintenanceSchedule::class);
    }

    /**
     * @return UnitMaintenanceSchedule[]
     */
    public function findDueSchedules(\DateTimeImmutable $asOf): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.isEnabled = :enabled')
            ->andWhere('s.nextDueAt IS NOT NULL')
            ->andWhere('s.nextDueAt <= :asOf')
            ->setParameter('enabled', true)
            ->setParameter('asOf', $asOf)
            ->getQuery()
            ->getResult();
    }
}