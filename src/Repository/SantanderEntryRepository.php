<?php

namespace App\Repository;

use App\Entity\SantanderEntry;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SantanderEntry>
 *
 * @method SantanderEntry|null find($id, $lockMode = null, $lockVersion = null)
 * @method SantanderEntry|null findOneBy(array $criteria, array $orderBy = null)
 * @method SantanderEntry[]    findAll()
 * @method SantanderEntry[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class SantanderEntryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SantanderEntry::class);
    }

    /**
     * Base query builder for Santander entries, ordered newest first.
     *
     * @param string|null $accountLast4 Optional account last4 filter (e.g. "2825")
     */
    public function createBaseQuery(?string $accountLast4 = null)
    {
        $qb = $this->createQueryBuilder('s')
            ->orderBy('s.fechaOn', 'DESC')
            ->addOrderBy('s.hora', 'DESC');

        if ($accountLast4 !== null && $accountLast4 !== '') {
            $qb
                ->andWhere('s.accountLast4 = :accountLast4')
                ->setParameter('accountLast4', $accountLast4);
        }

        return $qb;
    }

    /**
     * Find credit entries (DEPOSITO not null) in a date range, optionally filtered
     * by account and checked flag.
     *
     * @return SantanderEntry[]
     */
    public function findCreditsInRange(
        \DateTimeInterface $from,
        \DateTimeInterface $to,
        ?string $accountLast4 = null,
        ?bool $checked = null
    ): array {
        $qb = $this->createBaseQuery($accountLast4)
            ->andWhere('s.fechaOn BETWEEN :from AND :to')
            ->andWhere('s.deposito IS NOT NULL')
            ->setParameter('from', $from->format('Y-m-d'))
            ->setParameter('to', $to->format('Y-m-d'));

        if ($checked !== null) {
            $qb
                ->andWhere('s.checked = :checked')
                ->setParameter('checked', $checked);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Find all credits that have not yet been marked as checked.
     *
     * @return SantanderEntry[]
     */
    public function findUncheckedCredits(?string $accountLast4 = null): array
    {
        $qb = $this->createBaseQuery($accountLast4)
            ->andWhere('s.deposito IS NOT NULL')
            ->andWhere('s.checked = :checked')
            ->setParameter('checked', false);

        return $qb->getQuery()->getResult();
    }

    /**
     * Find potential duplicates by simple fingerprint (fecha_on + deposito + concept).
     *
     * This is useful for idempotent imports of the same Santander XLSX.
     */
    public function findExistingByFingerprint(
        \DateTimeInterface $fechaOn,
        string $concept,
        string $deposito,
        ?string $accountLast4 = null
    ): ?SantanderEntry {
        $qb = $this->createBaseQuery($accountLast4)
            ->andWhere('s.fechaOn = :fechaOn')
            ->andWhere('s.deposito = :deposito')
            ->andWhere('s.concept = :concept')
            ->setParameter('fechaOn', $fechaOn->format('Y-m-d'))
            ->setParameter('deposito', $deposito)
            ->setParameter('concept', $concept);

        return $qb->getQuery()->getOneOrNullResult();
    }
}
