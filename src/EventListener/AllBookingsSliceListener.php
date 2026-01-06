<?php

namespace App\EventListener;

use App\Entity\AllBookings;
use App\Service\MonthSliceRefresher;
use Doctrine\ORM\Event\PostUpdateEventArgs;
use Doctrine\ORM\Events;
use Doctrine\Persistence\Event\LifecycleEventArgs;
use Doctrine\Common\EventSubscriber;
use Doctrine\ORM\Event\OnFlushEventArgs;
use Doctrine\ORM\Event\PostFlushEventArgs;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\UnitOfWork;
use Psr\Log\LoggerInterface;

class AllBookingsSliceListener implements EventSubscriber
{
    /**
     * Queue of slice refresh jobs captured during flush.
     * For INSERTs we store the managed entity (ID is generated after flush);
     * for UPDATE/DELETE we store the concrete bookingId.
     *
     * @var array<int, array{
     *   entity?: \App\Entity\AllBookings,
     *   bookingId?: int,
     *   oldCheckIn:?\DateTimeInterface,
     *   oldCheckOut:?\DateTimeInterface,
     *   newCheckIn:?\DateTimeInterface,
     *   newCheckOut:?\DateTimeInterface
     * }>
     */
    private array $pending = [];

    public function __construct(private MonthSliceRefresher $refresher, private LoggerInterface $logger)
    {
    }

    public function getSubscribedEvents(): array
    {
        return [
            Events::postPersist,
            Events::postUpdate,
            Events::postRemove,
            Events::onFlush,
            Events::postFlush,
        ];
    }

    public function postPersist(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof AllBookings) {
            return;
        }
        $this->logger->debug('[AllBookingsSliceListener] postPersist bookingId=' . $entity->getId());
        $this->refreshCurrent($entity);
    }

    public function postUpdate(PostUpdateEventArgs $args): void
    {
        $entity = $args->getEntity();
        if (!$entity instanceof AllBookings) {
            $this->logger->debug('[AllBookingsSliceListener] postUpdate non-AllBookings entity, skipping');
            return;
        }

        $changeSet = $args->getEntityChangeSet();
        $this->logger->debug('[AllBookingsSliceListener] postUpdate changes=' . implode(',', array_keys($changeSet)));

        // Only refresh when relevant fields have changed
        $relevantFields = [
            'checkIn', 'checkOut',
            'payout', 'taxAmount', 'cleaningFee', 'commissionPercent', 'commissionValue',
            'o2Total', 'clientIncome',
            'paymentMethod', 'guestType', 'status',
            'roomFee'
        ];
        if (!$this->changedAny($changeSet, $relevantFields)) {
            return; // no relevant changes -> skip expensive refresh
        }

        // If dates changed, clear old-month slices too by calling refresher with old dates first
        $oldCheckIn  = $this->dateFromChangeSet($changeSet, 'checkIn');
        $oldCheckOut = $this->dateFromChangeSet($changeSet, 'checkOut');
        if ($oldCheckIn && $oldCheckOut) {
            $this->logger->debug('[AllBookingsSliceListener] refresh old dates bookingId=' . $entity->getId());
            $this->refresher->refreshForBooking($entity->getId(), $oldCheckIn, $oldCheckOut);
        }

        // Always refresh for current dates
        $this->logger->debug('[AllBookingsSliceListener] refresh current dates bookingId=' . $entity->getId());
        $this->refreshCurrent($entity);
    }

    public function postRemove(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof AllBookings) {
            return;
        }
        $this->logger->debug('[AllBookingsSliceListener] postRemove bookingId=' . $entity->getId());
        // Deleting with the entity's dates will purge any remaining slices; view insert will be zero rows now
        $checkIn  = $entity->getCheckIn();
        $checkOut = $entity->getCheckOut();
        if ($checkIn instanceof \DateTimeInterface && $checkOut instanceof \DateTimeInterface) {
            $this->refresher->refreshForBooking($entity->getId(), $checkIn, $checkOut);
        }
    }

    public function onFlush(OnFlushEventArgs $args): void
    {
        $em  = $args->getObjectManager();
        if (!$em instanceof EntityManagerInterface) {
            return;
        }
        /** @var UnitOfWork $uow */
        $uow = $em->getUnitOfWork();

        $this->logger->debug('[AllBookingsSliceListener] onFlush begin');

        // Inserts
        foreach ($uow->getScheduledEntityInsertions() as $entity) {
            if ($entity instanceof AllBookings) {
                $this->logger->debug('[AllBookingsSliceListener] onFlush INSERT (capturing entity; ID not yet generated)');
                $this->pending[] = [
                    'entity'      => $entity,
                    'oldCheckIn'  => null,
                    'oldCheckOut' => null,
                    'newCheckIn'  => $entity->getCheckIn() instanceof \DateTimeInterface ? $entity->getCheckIn() : null,
                    'newCheckOut' => $entity->getCheckOut() instanceof \DateTimeInterface ? $entity->getCheckOut() : null,
                ];
            }
        }

        // Updates
        foreach ($uow->getScheduledEntityUpdates() as $entity) {
            if ($entity instanceof AllBookings) {
                $this->logger->debug('[AllBookingsSliceListener] onFlush UPDATE bookingId=' . $entity->getId());
                $changeSet = $uow->getEntityChangeSet($entity);

                // Only if relevant fields changed
                $relevantFields = [
                    'checkIn', 'checkOut',
                    'payout', 'taxAmount', 'cleaningFee', 'commissionPercent', 'commissionValue',
                    'o2Total', 'clientIncome',
                    'paymentMethod', 'guestType', 'status',
                    'roomFee'
                ];
                $changed = false;
                foreach ($relevantFields as $f) {
                    if (array_key_exists($f, $changeSet)) { $changed = true; break; }
                }
                if (!$changed) {
                    continue;
                }

                $oldIn  = isset($changeSet['checkIn'][0]) && $changeSet['checkIn'][0] instanceof \DateTimeInterface ? $changeSet['checkIn'][0] : null;
                $oldOut = isset($changeSet['checkOut'][0]) && $changeSet['checkOut'][0] instanceof \DateTimeInterface ? $changeSet['checkOut'][0] : null;

                $this->pending[] = [
                    'bookingId'   => (int) $entity->getId(),
                    'oldCheckIn'  => $oldIn,
                    'oldCheckOut' => $oldOut,
                    'newCheckIn'  => $entity->getCheckIn() instanceof \DateTimeInterface ? $entity->getCheckIn() : null,
                    'newCheckOut' => $entity->getCheckOut() instanceof \DateTimeInterface ? $entity->getCheckOut() : null,
                ];
            }
        }

        // Deletions
        foreach ($uow->getScheduledEntityDeletions() as $entity) {
            if ($entity instanceof AllBookings) {
                $this->logger->debug('[AllBookingsSliceListener] onFlush DELETE bookingId=' . $entity->getId());
                $this->pending[] = [
                    'bookingId'   => (int) $entity->getId(),
                    'oldCheckIn'  => $entity->getCheckIn() instanceof \DateTimeInterface ? $entity->getCheckIn() : null,
                    'oldCheckOut' => $entity->getCheckOut() instanceof \DateTimeInterface ? $entity->getCheckOut() : null,
                    'newCheckIn'  => null,
                    'newCheckOut' => null,
                ];
            }
        }
    }

    public function postFlush(PostFlushEventArgs $args): void
    {
        if (empty($this->pending)) {
            return;
        }

        // Drain the queue locally to avoid re-entrancy issues
        $jobs = $this->pending;
        $this->logger->debug('[AllBookingsSliceListener] postFlush draining ' . count($jobs) . ' job(s)');
        $this->pending = [];

        foreach ($jobs as $job) {
            $bookingId = null;
            if (isset($job['entity']) && $job['entity'] instanceof AllBookings) {
                $bookingId = (int) $job['entity']->getId();
                $this->logger->debug('[AllBookingsSliceListener] postFlush resolved bookingId from entity=' . $bookingId);
            } elseif (isset($job['bookingId'])) {
                $bookingId = (int) $job['bookingId'];
                $this->logger->debug('[AllBookingsSliceListener] postFlush job for bookingId=' . $bookingId);
            }
            if (!$bookingId) {
                $this->logger->debug('[AllBookingsSliceListener] postFlush skipping job: missing bookingId (ID not generated?)');
                continue;
            }

            // If we have old dates (e.g., date moved or deletion), refresh those months first to purge old slices
            if (($job['oldCheckIn'] ?? null) instanceof \DateTimeInterface && ($job['oldCheckOut'] ?? null) instanceof \DateTimeInterface) {
                $this->logger->debug('[AllBookingsSliceListener] postFlush refreshing OLD range');
                $this->refresher->refreshForBooking($bookingId, $job['oldCheckIn'], $job['oldCheckOut']);
            }

            // Then refresh the current/new dates (insert or update)
            if (($job['newCheckIn'] ?? null) instanceof \DateTimeInterface && ($job['newCheckOut'] ?? null) instanceof \DateTimeInterface) {
                $this->logger->debug('[AllBookingsSliceListener] postFlush refreshing NEW range');
                $this->refresher->refreshForBooking($bookingId, $job['newCheckIn'], $job['newCheckOut']);
            }
        }
    }

    private function refreshCurrent(AllBookings $entity): void
    {
        $checkIn  = $entity->getCheckIn();
        $checkOut = $entity->getCheckOut();
        if (!$checkIn instanceof \DateTimeInterface || !$checkOut instanceof \DateTimeInterface) {
            return;
        }
        $this->refresher->refreshForBooking($entity->getId(), $checkIn, $checkOut);
    }

    /**
     * Return true if any of the provided fields are present in the Doctrine change set.
     */
    private function changedAny(array $changeSet, array $fields): bool
    {
        foreach ($fields as $field) {
            if (array_key_exists($field, $changeSet)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Pull a previous DateTime value from Doctrine changeset if the field changed.
     */
    private function dateFromChangeSet(array $changeSet, string $field): ?\DateTimeInterface
    {
        if (!isset($changeSet[$field]) || !is_array($changeSet[$field]) || count($changeSet[$field]) < 1) {
            return null;
        }
        $old = $changeSet[$field][0] ?? null;
        if ($old instanceof \DateTimeInterface) {
            return $old;
        }
        if (is_string($old)) {
            try {
                return new \DateTimeImmutable($old);
            } catch (\Exception) {
                return null;
            }
        }
        return null;
    }
}