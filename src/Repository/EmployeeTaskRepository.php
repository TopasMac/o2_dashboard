<?php

namespace App\Repository;

use App\Entity\EmployeeTask;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<EmployeeTask>
 *
 * Custom query helpers for employee tasks.
 */
class EmployeeTaskRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, EmployeeTask::class);
    }

    /**
     * Returns all tasks assigned to a specific employee,
     * optionally filtered by status or due date.
     *
     * @param int      $employeeId
     * @param string[] $statuses
     * @return EmployeeTask[]
     */
    public function findByEmployee(
        int $employeeId,
        array $statuses = [],
        ?\DateTimeInterface $dueBefore = null
    ): array {
        $qb = $this->createQueryBuilder('t')
            ->andWhere('t.employee = :eid')
            ->setParameter('eid', $employeeId)
            ->orderBy('t.createdAt', 'DESC');

        if (!empty($statuses)) {
            $qb->andWhere('t.status IN (:st)')
                ->setParameter('st', $statuses);
        }

        if ($dueBefore) {
            $qb->andWhere('t.dueDate <= :dueBefore')
                ->setParameter('dueBefore', $dueBefore);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * All tasks for admin/manager view, with optional filters.
     *
     * @return EmployeeTask[]
     */
    public function findAdminFiltered(
        array $employeeIds = [],
        array $statuses = [],
        ?\DateTimeInterface $from = null,
        ?\DateTimeInterface $to = null
    ): array {
        $qb = $this->createQueryBuilder('t')
            ->orderBy('t.createdAt', 'DESC');

        if (!empty($employeeIds)) {
            $qb->andWhere('t.employee IN (:eids)')
                ->setParameter('eids', $employeeIds);
        }

        if (!empty($statuses)) {
            $qb->andWhere('t.status IN (:sts)')
                ->setParameter('sts', $statuses);
        }

        if ($from) {
            $qb->andWhere('t.createdAt >= :from')
                ->setParameter('from', $from);
        }

        if ($to) {
            $qb->andWhere('t.createdAt <= :to')
                ->setParameter('to', $to);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Tasks that are overdue (dueDate < today) and not completed/reviewed.
     *
     * @return EmployeeTask[]
     */
    public function findOverdue(): array
    {
        $today = new \DateTimeImmutable('today');

        return $this->createQueryBuilder('t')
            ->andWhere('t.dueDate IS NOT NULL')
            ->andWhere('t.dueDate < :today')
            ->andWhere('t.status NOT IN (:finished)')
            ->setParameter('today', $today)
            ->setParameter('finished', [
                EmployeeTask::STATUS_COMPLETED,
                EmployeeTask::STATUS_REVIEWED,
                EmployeeTask::STATUS_ARCHIVED,
            ])
            ->orderBy('t.dueDate', 'ASC')
            ->getQuery()
            ->getResult();
    }
}