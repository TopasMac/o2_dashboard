<?php

namespace App\Repository;

use App\Entity\Payouts\AirbnbPayout;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AirbnbPayout>
 */
class AirbnbPayoutRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AirbnbPayout::class);
    }
}