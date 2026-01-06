<?php

namespace App\Repository;

use App\Entity\UnitDocumentAttachment;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class UnitDocumentAttachmentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UnitDocumentAttachment::class);
    }

    public function findByTargetAndCategory(string $targetType, int $targetId, ?string $category): array
    {
        $qb = $this->createQueryBuilder('a')
            ->andWhere('a.targetType = :t')->setParameter('t', $targetType)
            ->andWhere('a.targetId = :id')->setParameter('id', $targetId);

        if ($category === null) {
            $qb->andWhere('a.category IS NULL');
        } else {
            $qb->andWhere('a.category = :c')->setParameter('c', $category);
        }

        return $qb->getQuery()->getResult();
    }

    public function deleteByTargetAndCategory(string $targetType, int $targetId, ?string $category): int
    {
        $qb = $this->getEntityManager()->createQueryBuilder()
            ->delete(UnitDocumentAttachment::class, 'a')
            ->andWhere('a.targetType = :t')->setParameter('t', $targetType)
            ->andWhere('a.targetId = :id')->setParameter('id', $targetId);

        if ($category === null) {
            $qb->andWhere('a.category IS NULL');
        } else {
            $qb->andWhere('a.category = :c')->setParameter('c', $category);
        }

        return $qb->getQuery()->execute();
    }

    public function deleteByTarget(string $targetType, int $targetId): int
    {
        return $this->getEntityManager()->createQueryBuilder()
            ->delete(UnitDocumentAttachment::class, 'a')
            ->andWhere('a.targetType = :t')->setParameter('t', $targetType)
            ->andWhere('a.targetId = :id')->setParameter('id', $targetId)
            ->getQuery()->execute();
    }
    /**
     * Fetch the latest attachment for a given targetType + targetId, including its UnitDocument.
     */
    public function findLatestFor(string $targetType, int $targetId): ?UnitDocumentAttachment
    {
        return $this->createQueryBuilder('a')
            ->leftJoin('a.document', 'd')
            ->addSelect('d')
            ->andWhere('a.targetType = :t')->setParameter('t', $targetType)
            ->andWhere('a.targetId = :id')->setParameter('id', $targetId)
            ->orderBy('a.id', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
    /**
     * Batch fetch latest attachments for many targetIds at once (avoids N+1).
     * Returns a map: [targetId => UnitDocumentAttachment]
     *
     * @param string $targetType  e.g. 'unit_transactions'
     * @param int[]  $targetIds   list of target ids
     * @return array<int, UnitDocumentAttachment>
     */
    public function findLatestForTargets(string $targetType, array $targetIds): array
    {
        if (empty($targetIds)) {
            return [];
        }

        $rows = $this->createQueryBuilder('a')
            ->leftJoin('a.document', 'd')
            ->addSelect('d')
            ->andWhere('a.targetType = :t')->setParameter('t', $targetType)
            ->andWhere('a.targetId IN (:ids)')->setParameter('ids', array_values(array_unique(array_map('intval', $targetIds))))
            ->orderBy('a.targetId', 'ASC')
            ->addOrderBy('a.id', 'DESC')
            ->getQuery()
            ->getResult();

        $map = [];
        foreach ($rows as $att) {
            $tid = $att->getTargetId();
            if (!isset($map[$tid])) {
                $map[$tid] = $att; // first entry per targetId is latest because of DESC ordering
            }
        }
        return $map;
    }
}