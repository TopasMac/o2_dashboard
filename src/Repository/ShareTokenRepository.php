<?php
declare(strict_types=1);

namespace App\Repository;

use App\Entity\ShareToken;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ShareToken>
 */
class ShareTokenRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ShareToken::class);
    }

    /**
     * Find a token by its string value.
     */
    public function findByToken(string $token): ?ShareToken
    {
        return $this->findOneBy(['token' => $token]);
    }

    /**
     * Find a token that is not expired/revoked and (optionally) has remaining uses.
     */
    public function findActiveByToken(string $token): ?ShareToken
    {
        $qb = $this->createQueryBuilder('t')
            ->andWhere('t.token = :token')
            ->andWhere('(t.revokedAt IS NULL)')
            ->andWhere('(t.expiresAt IS NULL OR t.expiresAt > :now)')
            ->andWhere('(t.maxUses = 0 OR t.usedCount < t.maxUses)')
            ->setParameter('token', $token)
            ->setParameter('now', new \DateTimeImmutable())
            ->setMaxResults(1);

        return $qb->getQuery()->getOneOrNullResult();
    }

    /**
     * Persist + flush a token usage increment safely.
     */
    public function markUsed(ShareToken $token): void
    {
        $token->markUsed();
        $this->_em->persist($token);
        $this->_em->flush();
    }

    /**
     * Revoke and persist.
     */
    public function revoke(ShareToken $token): void
    {
        $token->revoke();
        $this->_em->persist($token);
        $this->_em->flush();
    }
}