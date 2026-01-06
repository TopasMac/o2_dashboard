<?php

namespace App\Repository;

use App\Entity\AirbnbPayoutReconState;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class AirbnbPayoutReconStateRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AirbnbPayoutReconState::class);
    }
}