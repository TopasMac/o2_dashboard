<?php

namespace App\Repository;

use App\Entity\EmployeeTaskAttachment;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<EmployeeTaskAttachment>
 *
 * Repository for task attachments.
 */
class EmployeeTaskAttachmentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, EmployeeTaskAttachment::class);
    }

    /**
     * Returns attachments for a specific task ordered by createdAt ascending.
     *
     * @param int $taskId
     * @return EmployeeTaskAttachment[]
     */
    public function findByTaskOrdered(int $taskId): array
    {
        return $this->createQueryBuilder('a')
            ->andWhere('a.task = :tid')
            ->setParameter('tid', $taskId)
            ->orderBy('a.createdAt', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
