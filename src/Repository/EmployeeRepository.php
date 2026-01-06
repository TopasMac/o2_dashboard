<?php

namespace App\Repository;

use App\Entity\Employee;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Employee>
 */
class EmployeeRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Employee::class);
    }

    /**
     * @return Employee[] Returns an array of Employee objects filtered by optional criteria
     */
    public function findByFilters(?string $division = null, ?string $area = null, ?string $city = null, ?string $status = null): array
    {
        $qb = $this->createQueryBuilder('e');

        if ($division) {
            $qb->andWhere('e.division = :division')->setParameter('division', $division);
        }
        if ($area) {
            $qb->andWhere('e.area = :area')->setParameter('area', $area);
        }
        if ($city) {
            $qb->andWhere('e.city = :city')->setParameter('city', $city);
        }
        if ($status) {
            $qb->andWhere('e.status = :status')->setParameter('status', $status);
        }

        return $qb->orderBy('e.name', 'ASC')->getQuery()->getResult();
    }
}