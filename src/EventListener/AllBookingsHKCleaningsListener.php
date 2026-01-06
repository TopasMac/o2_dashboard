<?php

namespace App\EventListener;

use App\Entity\AllBookings;
use App\Entity\HKCleanings;
use App\Service\HKCleaningManager;
use Doctrine\Common\EventSubscriber;
use Doctrine\ORM\Events;
use Doctrine\Persistence\Event\LifecycleEventArgs;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;

/**
 * On every new AllBookings insert, auto-create a housekeeping row (pending)
 * using the booking's check-out date and unit info.
 */
#[AsDoctrineListener(event: Events::postPersist)]
class AllBookingsHKCleaningsListener implements EventSubscriber
{
    private HKCleaningManager $hkCleaningManager;

    public function __construct(HKCleaningManager $hkCleaningManager)
    {
        $this->hkCleaningManager = $hkCleaningManager;
    }

    public function getSubscribedEvents(): array
    {
        return [Events::postPersist];
    }

    public function postPersist(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof AllBookings) {
            return; // only handle AllBookings inserts
        }

        // Pull required data from the booking
        $checkOut = $entity->getCheckOut();
        if (!$checkOut instanceof \DateTimeInterface) {
            return; // nothing to do without a checkout date
        }

        // Resolve unit — prefer relation, but fall back to scalar fields on AllBookings
        $unit = method_exists($entity, 'getUnit') ? $entity->getUnit() : null;
        $unitId = null;
        $unitCity = '';

        if ($unit) {
            $unitId = method_exists($unit, 'getId') ? $unit->getId() : null;
            $unitCity = method_exists($unit, 'getCity') ? (string) $unit->getCity() : '';
        } else {
            // Fallbacks if relation isn’t hydrated/set yet
            if (method_exists($entity, 'getUnitId')) {
                $unitId = $entity->getUnitId();
            }
            if (method_exists($entity, 'getCity')) {
                $unitCity = (string) $entity->getCity();
            }
        }

        if (!$unitId) {
            return; // require a concrete Unit id via relation or scalar fallback
        }

        // Optional fields
        $reservationCode = method_exists($entity, 'getConfirmationCode') ? $entity->getConfirmationCode() : null;

        $guestType = method_exists($entity, 'getGuestType') ? (string) $entity->getGuestType() : '';
        $notes = method_exists($entity, 'getNotes') ? (string) ($entity->getNotes() ?? '') : '';

        // Build the HK payload (idempotency handled in HKCleaningManager)
        $payload = [
            'unitId'          => $unitId,
            'city'            => $unitCity,
            'checkoutDate'    => $checkOut->format('Y-m-d'),
            // Let HKCleaningManager decide cleaningType (owner vs checkout)
            'guestType'       => $guestType,
            'bookingId'       => $entity->getId(),
            'reservationCode' => $reservationCode,
            'status'          => HKCleanings::STATUS_PENDING,
            'notes'           => $notes,
        ];

        // Create (or noop if it already exists)
        try {
            $this->hkCleaningManager->bulkCreate([$payload]);
        } catch (\Throwable $e) {
            // Do not block booking creation on HK creation issues; log if you have a logger
            // You can inject LoggerInterface if you wish to record this
        }
    }
}