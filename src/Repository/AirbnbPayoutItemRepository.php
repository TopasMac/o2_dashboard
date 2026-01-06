<?php

namespace App\Repository;

use App\Entity\Payouts\AirbnbPayoutItem;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AirbnbPayoutItem>
 */
class AirbnbPayoutItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AirbnbPayoutItem::class);
    }
}