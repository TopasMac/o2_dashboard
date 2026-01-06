<?php
declare(strict_types=1);

namespace App\Repository\NewUnit;

use App\Entity\NewUnit\UnitInventoryItem;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class UnitInventoryItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitInventoryItem::class);
    }
}
