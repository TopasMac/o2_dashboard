<?php

namespace App\Repository;

use App\Entity\AllBookings;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AllBookings>
 *
 * @method AllBookings|null find($id, $lockMode = null, $lockVersion = null)
 * @method AllBookings|null findOneBy(array $criteria, array $orderBy = null)
 * @method AllBookings[]    findAll()
 * @method AllBookings[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class AllBookingsRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AllBookings::class);
    }

    // Add custom methods if needed later
}