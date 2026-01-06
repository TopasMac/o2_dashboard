<?php

namespace App\Repository;

use App\Entity\IcalEvent;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<IcalEvent>
 */
class IcalEventRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, IcalEvent::class);
    }

    /**
     * Find a single event by Unit ID and iCal UID (if the feed provides one).
     */
    public function findOneByUnitAndUid(int $unitId, ?string $uid): ?IcalEvent
    {
        if (!$uid) {
            return null;
        }

        return $this->createQueryBuilder('e')
            ->andWhere('IDENTITY(e.unit) = :u')->setParameter('u', $unitId)
            ->andWhere('e.uid = :uid')->setParameter('uid', $uid)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Delete events for a unit that were not seen in the latest sync cycle.
     * Useful to reflect cancellations or manual unblocks.
     */
    public function deleteStaleByUnitBefore(int $unitId, \DateTimeInterface $cutoff): int
    {
        return (int)$this->createQueryBuilder('e')
            ->delete()
            ->andWhere('IDENTITY(e.unit) = :u')->setParameter('u', $unitId)
            ->andWhere('e.lastSeenAt < :cut')->setParameter('cut', $cutoff)
            ->getQuery()
            ->execute();
    }

    /**
     * Find events overlapping a given date range for reconciliation UI.
     * DTEND is exclusive by spec. We treat overlap as (dtstart < $end) AND (dtend > $start).
     */
    public function findOverlappingByUnitAndRange(int $unitId, \DateTimeInterface $start, \DateTimeInterface $end): array
    {
        return $this->createQueryBuilder('e')
            ->andWhere('IDENTITY(e.unit) = :u')->setParameter('u', $unitId)
            ->andWhere('e.dtstart < :end')->setParameter('end', $end)
            ->andWhere('e.dtend > :start')->setParameter('start', $start)
            ->orderBy('e.dtstart', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Relaxed overlap search tolerant to DATE vs DATETIME quirks.
     * Falls back to a native SQL with DATE() on dtstart/dtend and then hydrates entities by id.
     */
    public function findOverlappingByUnitAndRangeRelaxed(int $unitId, \DateTimeInterface $start, \DateTimeInterface $end): array
    {
        $conn = $this->getEntityManager()->getConnection();

        $sql = <<<SQL
            SELECT id
            FROM ical_events
            WHERE unit_id = :u
              AND (
                    (dtstart < :end AND dtend > :start)
                 OR (DATE(dtstart) < :endDate AND DATE(dtend) > :startDate)
                  )
            ORDER BY dtstart ASC
        SQL;

        $ids = $conn->executeQuery($sql, [
            'u'         => $unitId,
            'start'     => $start->format('Y-m-d H:i:s'),
            'end'       => $end->format('Y-m-d H:i:s'),
            'startDate' => $start->format('Y-m-d'),
            'endDate'   => $end->format('Y-m-d'),
        ])->fetchFirstColumn();

        if (empty($ids)) {
            return [];
        }

        return $this->createQueryBuilder('e')
            ->andWhere('e.id IN (:ids)')
            ->setParameter('ids', $ids)
            ->orderBy('e.dtstart', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
