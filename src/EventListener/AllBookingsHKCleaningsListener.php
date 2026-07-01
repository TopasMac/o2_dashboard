<?php

namespace App\EventListener;

use App\Entity\AllBookings;
use App\Service\HKCleaningManager;
use Doctrine\Common\EventSubscriber;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\PostUpdateEventArgs;
use Doctrine\Persistence\Event\LifecycleEventArgs;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;

/**
 * On every new AllBookings insert, auto-create a housekeeping row (pending)
 * using the booking's check-out date and unit info.
 */
#[AsDoctrineListener(event: Events::postPersist)]
#[AsDoctrineListener(event: Events::postUpdate)]
class AllBookingsHKCleaningsListener implements EventSubscriber
{
    private HKCleaningManager $hkCleaningManager;

    public function __construct(HKCleaningManager $hkCleaningManager)
    {
        $this->hkCleaningManager = $hkCleaningManager;
    }

    public function getSubscribedEvents(): array
    {
        return [Events::postPersist, Events::postUpdate];
    }

    public function postPersist(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof AllBookings) {
            return; // only handle AllBookings inserts
        }

        // Single source of truth: HKCleaningManager handles normalization + idempotency.
        try {
            $this->hkCleaningManager->syncCheckoutCleaningForBooking($entity);
        } catch (\Throwable $e) {
            // Do not block booking creation on HK sync issues
        }
    }

    public function postUpdate(PostUpdateEventArgs $args): void
    {
        try {
            $entity = $args->getObject();
            if (!$entity instanceof AllBookings) {
                return;
            }

            $changeSet = $args->getObjectManager()
                ->getUnitOfWork()
                ->getEntityChangeSet($entity);

            if (!$this->hasHousekeepingRelevantChange($changeSet)) {
                return;
            }

            // Single source of truth: HKCleaningManager handles normalization + safe updates.
            $this->hkCleaningManager->syncCheckoutCleaningForBooking($entity);
        } catch (\Throwable $e) {
            // Do not block booking updates on HK sync issues
        }
    }

    private function hasHousekeepingRelevantChange(array $changeSet): bool
    {
        $relevantFields = [
            'checkOut',
            'unit',
            'unitId',
            'unitName',
            'city',
            'guestType',
            'confirmationCode',
            'reservationCode',
            'notes',
            'status',
        ];

        foreach ($relevantFields as $field) {
            if (array_key_exists($field, $changeSet)) {
                return true;
            }
        }

        return false;
    }
}