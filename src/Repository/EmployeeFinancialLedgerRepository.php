<?php

namespace App\Repository;

use App\Entity\EmployeeFinancialLedger;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<EmployeeFinancialLedger>
 *
 * @method EmployeeFinancialLedger|null find($id, $lockMode = null, $lockVersion = null)
 * @method EmployeeFinancialLedger|null findOneBy(array $criteria, array $orderBy = null)
 * @method EmployeeFinancialLedger[]    findAll()
 * @method EmployeeFinancialLedger[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class EmployeeFinancialLedgerRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, EmployeeFinancialLedger::class);
    }

    /**
     * Fetch all ledger rows belonging to a specific employee.
     */
    public function findByEmployee(int $employeeId): array
    {
        return $this->createQueryBuilder('l')
            ->andWhere('l.employee = :emp')
            ->setParameter('emp', $employeeId)
            ->orderBy('l.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Flexible search with optional filters.
     *
     * @param int|null                   $employeeId  Limit to a specific employee, or null for all
     * @param string[]|null              $types       Limit to a set of types (e.g. ["Expense", "CashAdvance"])
     * @param string|null                $costCentre  Exact cost centre code, or null for all
     * @param \DateTimeInterface|null   $from        Created at >= from (inclusive)
     * @param \DateTimeInterface|null   $to          Created at <= to (inclusive)
     *
     * @return EmployeeFinancialLedger[]
     */
    public function search(
        ?int $employeeId,
        ?array $types,
        ?string $costCentre,
        ?\DateTimeInterface $from,
        ?\DateTimeInterface $to
    ): array {
        $qb = $this->createQueryBuilder('l');

        if ($employeeId !== null) {
            $qb
                ->andWhere('l.employee = :emp')
                ->setParameter('emp', $employeeId);
        }

        if (!empty($types)) {
            $qb
                ->andWhere('l.type IN (:types)')
                ->setParameter('types', $types);
        }

        if ($costCentre !== null && $costCentre !== '') {
            $qb
                ->andWhere('l.costCentre = :cc')
                ->setParameter('cc', $costCentre);
        }

        if ($from !== null) {
            $qb
                ->andWhere('l.createdAt >= :from')
                ->setParameter('from', $from);
        }

        if ($to !== null) {
            $qb
                ->andWhere('l.createdAt <= :to')
                ->setParameter('to', $to);
        }

        return $qb
            ->orderBy('l.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
