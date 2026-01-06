<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AccountantEntry;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AccountantEntry>
 */
class AccountantEntryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AccountantEntry::class);
    }

    /**
     * Returns the currently active entry for a given group key, if any.
     */
    public function findActiveByGroupKey(string $groupKey): ?AccountantEntry
    {
        return $this->findOneBy(['groupKey' => $groupKey, 'isActive' => true]);
    }

    /**
     * Loads all row hashes from the database.
     * @return string[]
     */
    public function loadAllRowHashes(): array
    {
        $rows = $this->createQueryBuilder('e')
            ->select('e.rowHash AS h')
            ->getQuery()
            ->getArrayResult();
        return array_map(static fn(array $r) => $r['h'], $rows);
    }

    /**
     * Marks an entry as superseded by a new row hash and sets a human-readable change summary.
     */
    public function markAsSuperseded(AccountantEntry $entry, string $newRowHash, string $changeSummary): void
    {
        $entry->setIsActive(false);
        $entry->setSupersededByRowHash($newRowHash);
        $entry->setSupersededAt(new \DateTimeImmutable());
        $entry->setChangeSummary($changeSummary);
    }
}