<?php

namespace App\Repository;

use App\Entity\EmployeeCashLedger;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<EmployeeCashLedger>
 */
class EmployeeCashLedgerRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, EmployeeCashLedger::class);
    }

    /**
     * List all cash ledger entries, optionally filtered.
     *
     * @param int|null $employeeId
     * @param string|null $status
     * @param string|null $type
     * @param string|null $division
     * @param string|null $city
     * @return EmployeeCashLedger[]
     */
    public function search(
        ?int $employeeId,
        ?string $status,
        ?string $type,
        ?string $division,
        ?string $city
    ): array {
        $qb = $this->createQueryBuilder('c');

        if ($employeeId) {
            $qb->andWhere('c.employee = :emp')
               ->setParameter('emp', $employeeId);
        }

        if ($status) {
            $qb->andWhere('c.status = :st')
               ->setParameter('st', $status);
        }

        if ($type) {
            $qb->andWhere('c.type = :tp')
               ->setParameter('tp', $type);
        }

        if ($division) {
            $qb->andWhere('c.division = :div')
               ->setParameter('div', $division);
        }

        if ($city) {
            $qb->andWhere('c.city = :city')
               ->setParameter('city', $city);
        }

        return $qb->orderBy('c.date', 'DESC')
                  ->addOrderBy('c.createdAt', 'DESC')
                  ->getQuery()
                  ->getResult();
    }
}