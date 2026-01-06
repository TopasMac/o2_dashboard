<?php

namespace App\Repository;

use App\Entity\UnitTransactions;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UnitTransactions>
 *
 * @method UnitTransactions|null find($id, $lockMode = null, $lockVersion = null)
 * @method UnitTransactions|null findOneBy(array $criteria, array $orderBy = null)
 * @method UnitTransactions[]    findAll()
 * @method UnitTransactions[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class UnitTransactionsRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitTransactions::class);
    }

    public function generateUniqueTransactionCode(): string
    {
        do {
            $code = 'O2T' . str_pad((string)random_int(1, 99999), 5, '0', STR_PAD_LEFT);
            $existing = $this->findOneBy(['transactionCode' => $code]);
        } while ($existing !== null);

        return $code;
    }
    public function findAllWithCategory(): array
    {
        return $this->createQueryBuilder('t')
            ->leftJoin('t.unit', 'u')
            ->leftJoin('t.category', 'c')
            ->leftJoin('t.unitDocuments', 'd')
            ->addSelect([
                't.id AS id',
                't.date AS date',
                't.description AS description',
                't.amount AS amount',
                't.comments AS comments',
                't.type AS type',
                't.costCenter AS costCenter',
                't.transactionCode AS transactionCode',
                'u.id AS unitId',
                'u.unitName AS unitName',
                'c.id AS categoryId',
                'c.name AS categoryName',
                'd.s3Url AS documentUrl'
            ])
            ->getQuery()
            ->getArrayResult();
    }
    public function findByFiltersWithCategory(
        ?int $unitId,
        ?\DateTimeInterface $fromDate,
        ?\DateTimeInterface $toDate,
        ?string $type,
        ?string $costCenter
    ): array {
        $qb = $this->createQueryBuilder('t')
            ->leftJoin('t.unit', 'u')
            ->leftJoin('t.category', 'c')
            ->leftJoin('t.unitDocuments', 'd')
            ->addSelect([
                't.id AS id',
                't.date AS date',
                't.description AS description',
                't.amount AS amount',
                't.comments AS comments',
                't.type AS type',
                't.costCenter AS costCenter',
                't.transactionCode AS transactionCode',
                'u.id AS unitId',
                'u.unitName AS unitName',
                'c.id AS categoryId',
                'c.name AS categoryName',
                'd.s3Url AS documentUrl',
            ])
            ->orderBy('t.date', 'ASC');

        if ($unitId !== null) {
            $qb->andWhere('u.id = :unitId')
               ->setParameter('unitId', $unitId);
        }

        if ($fromDate !== null) {
            // Compare only by date part to be safe
            $qb->andWhere('t.date >= :fromDate')
               ->setParameter('fromDate', $fromDate->format('Y-m-d'));
        }

        if ($toDate !== null) {
            $qb->andWhere('t.date <= :toDate')
               ->setParameter('toDate', $toDate->format('Y-m-d'));
        }

        if ($type !== null && $type !== '') {
            $qb->andWhere('t.type = :type')
               ->setParameter('type', $type);
        }

        if ($costCenter !== null && $costCenter !== '') {
            $qb->andWhere('t.costCenter = :costCenter')
               ->setParameter('costCenter', $costCenter);
        }

        return $qb->getQuery()->getArrayResult();
    }
}