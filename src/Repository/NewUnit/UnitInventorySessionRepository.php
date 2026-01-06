<?php
declare(strict_types=1);

namespace App\Repository\NewUnit;

use App\Entity\NewUnit\UnitInventorySession;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class UnitInventorySessionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitInventorySession::class);
    }
}
