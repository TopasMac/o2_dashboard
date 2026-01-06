<?php

namespace App\EventListener;

use App\Entity\Unit;
use App\Entity\UnitBalanceLedger;
use Doctrine\Common\EventSubscriber;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\LifecycleEventArgs;
use Doctrine\ORM\Event\PostUpdateEventArgs;
use Doctrine\ORM\Event\PreUpdateEventArgs;

/**
 * Recompute running balances for a Unit's ledger after any change.
 */
class UnitBalanceLedgerListener implements EventSubscriber
{
    private EntityManagerInterface $em;

    /**
     * Guard flag to avoid recursive updates triggering this listener again.
     */
    private bool $recomputing = false;

    public function __construct(EntityManagerInterface $em)
    {
        $this->em = $em;
    }

    public function getSubscribedEvents(): array
    {
        return [
            Events::prePersist,
            Events::preUpdate,
            Events::postPersist,
            Events::postUpdate,
            Events::postRemove,
        ];
    }
    public function prePersist(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof UnitBalanceLedger) {
            return;
        }
        $this->normalizeLedgerSignAndPeriod($entity);
    }

    public function preUpdate(PreUpdateEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof UnitBalanceLedger) {
            return;
        }
        $this->normalizeLedgerSignAndPeriod($entity);
        // Inform the UnitOfWork that we changed fields
        $em = $args->getEntityManager();
        $em->getUnitOfWork()->recomputeSingleEntityChangeSet(
            $em->getClassMetadata(UnitBalanceLedger::class),
            $entity
        );
    }
    /**
     * Normalize amount sign based on entryType and set derived fields (e.g. yearmonth) before saving.
     */
    private function normalizeLedgerSignAndPeriod(UnitBalanceLedger $row): void
    {
        // Normalize amount sign (UI always sends positive)
        $raw = (float) ($row->getAmount() ?? 0);
        $etype = strtoupper((string) ($row->getEntryType() ?? ''));

        switch ($etype) {
            case 'PAYMENT_TO_CLIENT':
            case 'PAYMENT_TO_CLIENT_PARTIAL':
                // Money going OUT to client should be stored as negative
                $row->setAmount(number_format(-abs($raw), 2, '.', ''));
                break;
            case 'PAYMENT_FROM_CLIENT':
                // Money coming IN from client stored as positive
                $row->setAmount(number_format(abs($raw), 2, '.', ''));
                break;
            default:
                // Leave other types as-is
                $row->setAmount(number_format($raw, 2, '.', ''));
                break;
        }

        // Derive yearmonth (YYYY-MM) from txnDate if available, else from date
        $dt = null;
        if (method_exists($row, 'getTxnDate') && $row->getTxnDate()) {
            $dt = $row->getTxnDate();
        } elseif (method_exists($row, 'getDate') && $row->getDate()) {
            $dt = $row->getDate();
        }
        if ($dt instanceof \DateTimeInterface && method_exists($row, 'setYearmonth')) {
            $row->setYearmonth($dt->format('Y-m'));
        }

        // Ensure txnDate is populated to support consistent ordering later
        if (method_exists($row, 'getTxnDate') && method_exists($row, 'setTxnDate') && !$row->getTxnDate()) {
            $candidate = null;
            if (method_exists($row, 'getDate') && $row->getDate()) {
                $candidate = $row->getDate();
            } elseif (method_exists($row, 'getCreatedAt') && $row->getCreatedAt()) {
                $candidate = $row->getCreatedAt();
            }
            if (!$candidate) {
                $candidate = new \DateTimeImmutable('now');
            }
            $row->setTxnDate($candidate);
        }
    }

    /**
     * Resolve the effective date for ordering: txnDate > date > createdAt.
     */
    private function resolveEffectiveDate(UnitBalanceLedger $row): \DateTimeInterface
    {
        if (method_exists($row, 'getTxnDate') && $row->getTxnDate() instanceof \DateTimeInterface) {
            return $row->getTxnDate();
        }
        if (method_exists($row, 'getDate') && $row->getDate() instanceof \DateTimeInterface) {
            return $row->getDate();
        }
        if (method_exists($row, 'getCreatedAt') && $row->getCreatedAt() instanceof \DateTimeInterface) {
            return $row->getCreatedAt();
        }
        return new \DateTimeImmutable('1970-01-01 00:00:00');
    }

    public function postPersist(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof UnitBalanceLedger) {
            return;
        }
        $this->recomputeUnitRunningBalance($entity->getUnit());
    }

    public function postUpdate(PostUpdateEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof UnitBalanceLedger) {
            return;
        }
        $this->recomputeUnitRunningBalance($entity->getUnit());
    }

    public function postRemove(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof UnitBalanceLedger) {
            return;
        }
        $this->recomputeUnitRunningBalance($entity->getUnit());
    }

    /**
     * Walk all ledger rows for the unit in chronological order and update balanceAfter.
     */
    private function recomputeUnitRunningBalance(?Unit $unit): void
    {
        if ($this->recomputing || !$unit) {
            return;
        }

        $this->recomputing = true;
        try {
            // Load all entries for the unit without ordering (ordering done in PHP)
            $qb = $this->em->createQueryBuilder();
            $qb->select('l')
                ->from(UnitBalanceLedger::class, 'l')
                ->where('l.unit = :unit')
                ->setParameter('unit', $unit);
            /** @var UnitBalanceLedger[] $entries */
            $entries = $qb->getQuery()->getResult();
            // Sort by effective date ASC, then id ASC
            usort($entries, function (UnitBalanceLedger $a, UnitBalanceLedger $b) {
                $da = $this->resolveEffectiveDate($a);
                $db = $this->resolveEffectiveDate($b);
                if ($da == $db) {
                    return ($a->getId() <=> $b->getId());
                }
                return ($da <=> $db);
            });

            $running = 0.0;
            foreach ($entries as $row) {
                $rawAmount = (float) ($row->getAmount() ?? 0);
                $etype = strtoupper((string) ($row->getEntryType() ?? ''));

                switch ($etype) {
                    case 'PAYMENT_TO_CLIENT':
                    case 'PAYMENT_TO_CLIENT_PARTIAL':
                        $signed = -abs($rawAmount);
                        $running += $signed;
                        break;
                    case 'PAYMENT_FROM_CLIENT':
                        $signed = abs($rawAmount);
                        $running += $signed;
                        break;
                    case 'REPORT_POSTING':
                        // Reset running balance to report's closing amount
                        $running = $rawAmount;
                        $row->setBalanceAfter(number_format($running, 2, '.', ''));
                        continue 2; // skip to next row
                    default:
                        $signed = $rawAmount; // neutral for other entry types (ADJUSTMENT, etc.)
                        $running += $signed;
                        break;
                }
                $row->setBalanceAfter(number_format($running, 2, '.', ''));
            }

            $this->em->flush();
        } finally {
            $this->recomputing = false;
        }
    }
}