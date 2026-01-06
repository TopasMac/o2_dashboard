<?php

namespace App\Repository;

use App\Entity\EmployeeTaskComment;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<EmployeeTaskComment>
 *
 * Repository for task comments. For now it just extends the default
 * behavior, but this is a good place later for:
 *  - Loading comments for a given task ordered by createdAt
 *  - Limiting comments for mobile views, etc.
 */
class EmployeeTaskCommentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, EmployeeTaskComment::class);
    }

    /**
     * Returns comments for a specific task ordered by creation time ascending.
     *
     * @param int $taskId
     * @return EmployeeTaskComment[]
     */
    public function findByTaskOrdered(int $taskId): array
    {
        return $this->createQueryBuilder('c')
            ->andWhere('c.task = :tid')
            ->setParameter('tid', $taskId)
            ->orderBy('c.createdAt', 'ASC')
            ->getQuery()
            ->getResult();
    }
}