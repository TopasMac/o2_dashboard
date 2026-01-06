<?php

namespace App\Repository;

use App\Entity\OccupancyData\OccupancyNote;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<OccupancyNote>
 */
class OccupancyNoteRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OccupancyNote::class);
    }
}