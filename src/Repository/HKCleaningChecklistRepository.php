<?php

namespace App\Repository;

use App\Entity\HKCleaningChecklist;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<HKCleaningChecklist>
 *
 * @method HKCleaningChecklist|null find($id, $lockMode = null, $lockVersion = null)
 * @method HKCleaningChecklist|null findOneBy(array $criteria, array $orderBy = null)
 * @method HKCleaningChecklist[]    findAll()
 * @method HKCleaningChecklist[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class HKCleaningChecklistRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, HKCleaningChecklist::class);
    }

    /**
     * Find a checklist by the linked cleaning id (hk_cleanings.id).
     */
    public function findOneByCleaningId(int $cleaningId): ?HKCleaningChecklist
    {
        return $this->createQueryBuilder('c')
            ->andWhere('c.cleaningId = :cleaningId')
            ->setParameter('cleaningId', $cleaningId)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Find checklists that have issues (hasIssues = true), newest first.
     *
     * @return HKCleaningChecklist[]
     */
    public function findIssues(int $limit = 50): array
    {
        return $this->createQueryBuilder('c')
            ->andWhere('c.hasIssues = :flag')
            ->setParameter('flag', true)
            ->orderBy('c.submittedAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Get recent checklists for a given cleaner.
     *
     * @return HKCleaningChecklist[]
     */
    public function findRecentByCleaner(int $cleanerId, int $limit = 50): array
    {
        return $this->createQueryBuilder('c')
            ->join('c.cleaner', 'e')
            ->andWhere('e.id = :cleanerId')
            ->setParameter('cleanerId', $cleanerId)
            ->orderBy('c.submittedAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }
}
