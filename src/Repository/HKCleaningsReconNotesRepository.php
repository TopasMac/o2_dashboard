<?php

namespace App\Repository;

use App\Entity\HKCleaningsReconNotes;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<HKCleaningsReconNotes>
 */
class HKCleaningsReconNotesRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, HKCleaningsReconNotes::class);
    }

    /**
     * @return HKCleaningsReconNotes[]
     */
    public function findByCityAndMonth(string $city, string $month): array
    {
        return $this->createQueryBuilder('n')
            ->andWhere('n.city = :city')
            ->setParameter('city', $city)
            ->andWhere('n.month = :month')
            ->setParameter('month', $month)
            ->orderBy('n.createdAt', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return HKCleaningsReconNotes[]
     */
    public function findOpenByCityAndMonth(string $city, string $month): array
    {
        return $this->createQueryBuilder('n')
            ->andWhere('n.city = :city')
            ->setParameter('city', $city)
            ->andWhere('n.month = :month')
            ->setParameter('month', $month)
            ->andWhere('n.status = :status')
            ->setParameter('status', 'open')
            ->orderBy('n.createdAt', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return HKCleaningsReconNotes[]
     */
    public function findByCityMonthAndOptionalCleaning(string $city, string $month, ?int $hkCleaningId = null): array
    {
        $qb = $this->createQueryBuilder('n')
            ->andWhere('n.city = :city')
            ->setParameter('city', $city)
            ->andWhere('n.month = :month')
            ->setParameter('month', $month)
            ->orderBy('n.createdAt', 'ASC');

        if ($hkCleaningId !== null) {
            $qb->andWhere('n.hkCleaningId = :hkCleaningId')
               ->setParameter('hkCleaningId', $hkCleaningId);
        }

        return $qb->getQuery()->getResult();
    }
}