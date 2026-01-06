<?php

namespace App\Repository;

use App\Entity\AirbnbEmailNotifications;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AirbnbEmailNotifications>
 */
class AirbnbEmailNotificationsRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AirbnbEmailNotifications::class);
    }

    /**
     * Returns the most recent notifications, optionally filtered by recipient.
     *
     * @param int $limit
     * @param string|null $recipientEmail
     * @return AirbnbEmailNotifications[]
     */
    public function findRecent(int $limit = 20, ?string $recipientEmail = null): array
    {
        $qb = $this->createQueryBuilder('n')
            ->orderBy('n.receivedAt', 'DESC')
            ->addOrderBy('n.id', 'DESC')
            ->setMaxResults($limit);

        if ($recipientEmail) {
            $qb->andWhere('LOWER(n.recipientEmail) = LOWER(:email)')
               ->setParameter('email', $recipientEmail);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Finds one by external message id (useful for deduplication).
     */
    public function findOneByMessageId(?string $messageId): ?AirbnbEmailNotifications
    {
        if (!$messageId) {
            return null;
        }
        return $this->createQueryBuilder('n')
            ->andWhere('n.messageId = :mid')
            ->setParameter('mid', $messageId)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
}