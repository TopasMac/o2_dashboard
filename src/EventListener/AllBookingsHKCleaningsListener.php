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

    public function postUpdate(LifecycleEventArgs $args): void
    {
        try {
            $entity = $args->getObject();
            if (!$entity instanceof AllBookings) {
                return;
            }

            $checkOut = $entity->getCheckOut();
            if (!$checkOut instanceof \DateTimeInterface) {
                return;
            }

            $unit = method_exists($entity, 'getUnit') ? $entity->getUnit() : null;
            $unitId = null;
            $unitCity = '';

            if ($unit) {
                $unitId = method_exists($unit, 'getId') ? $unit->getId() : null;
                $unitCity = method_exists($unit, 'getCity') ? (string) $unit->getCity() : '';
            } else {
                if (method_exists($entity, 'getUnitId')) {
                    $unitId = $entity->getUnitId();
                }
                if (method_exists($entity, 'getCity')) {
                    $unitCity = (string) $entity->getCity();
                }
            }

            if (!$unitId) {
                return;
            }

            $em = $args->getObjectManager();

            $bookingId = $entity->getId();

            // Determine intended cleaning type from guestType (owner/client stay vs normal checkout)
            $guestType = method_exists($entity, 'getGuestType') ? strtolower(trim((string) $entity->getGuestType())) : '';
            $typeCheckout = \defined(HKCleanings::class . '::TYPE_CHECKOUT') ? HKCleanings::TYPE_CHECKOUT : 'checkout';
            $typeOwner    = \defined(HKCleanings::class . '::TYPE_OWNER') ? HKCleanings::TYPE_OWNER : 'owner';
            $intendedType = in_array($guestType, ['owner', 'client'], true) ? $typeOwner : $typeCheckout;

            $repo = $em->getRepository(HKCleanings::class);
            // Prefer the intended type, but tolerate legacy rows by selecting any row for the booking.
            $existingList = $repo->findBy(['bookingId' => $bookingId]);
            $existingCleaning = null;
            if (is_array($existingList) && count($existingList) > 0) {
                foreach ($existingList as $c) {
                    if (method_exists($c, 'getCleaningType') && strtolower((string) $c->getCleaningType()) === strtolower((string) $intendedType)) {
                        $existingCleaning = $c;
                        break;
                    }
                }
                if (!$existingCleaning) {
                    // Fall back to first row (legacy/unknown type)
                    $existingCleaning = $existingList[0];
                }
            }

            $reservationCode = method_exists($entity, 'getConfirmationCode') ? $entity->getConfirmationCode() : null;

            $notes = method_exists($entity, 'getNotes') ? (string) ($entity->getNotes() ?? '') : '';

            $newCheckoutDate = $checkOut->format('Y-m-d');

            if (!$existingCleaning) {
                $payload = [
                    'unitId'          => $unitId,
                    'city'            => $unitCity,
                    'checkoutDate'    => $newCheckoutDate,
                    'guestType'       => $guestType,
                    'bookingId'       => $bookingId,
                    'reservationCode' => $reservationCode,
                    'status'          => HKCleanings::STATUS_PENDING,
                    'notes'           => $notes,
                ];
                $this->hkCleaningManager->bulkCreate([$payload]);
                return;
            }

            $bookingStatus = method_exists($entity, 'getStatus') ? strtolower((string) $entity->getStatus()) : '';

            $targetCleaningStatus = $existingCleaning->getStatus();
            if (in_array($bookingStatus, ['cancelled', 'expired'], true)) {
                $targetCleaningStatus = HKCleanings::STATUS_CANCELLED;
            }

            $existingCheckoutObj = $existingCleaning->getCheckoutDate();
            $existingCheckoutYmd = $existingCheckoutObj instanceof \DateTimeInterface ? $existingCheckoutObj->format('Y-m-d') : (string) $existingCheckoutObj;
            if ($existingCheckoutYmd !== $newCheckoutDate) {
                $targetType = method_exists($existingCleaning, 'getCleaningType') ? (string) $existingCleaning->getCleaningType() : (string) $intendedType;
                $targetCleaning = $repo->findOneBy([
                    'unitId'       => $unitId,
                    'checkoutDate' => $newCheckoutDate,
                    'cleaningType' => $targetType,
                ]);

                if ($targetCleaning && $targetCleaning->getId() !== $existingCleaning->getId()) {
                    if (!$targetCleaning->getBookingId()) {
                        $targetCleaning->setBookingId($existingCleaning->getBookingId());
                    }
                    if (!$targetCleaning->getReservationCode()) {
                        $targetCleaning->setReservationCode($existingCleaning->getReservationCode());
                    }
                    if ($targetCleaning->getStatus() === HKCleanings::STATUS_PENDING && $targetCleaningStatus === HKCleanings::STATUS_CANCELLED) {
                        $targetCleaning->setStatus(HKCleanings::STATUS_CANCELLED);
                    }
                    $em->remove($existingCleaning);
                    $em->flush();
                    return;
                } else {
                    $existingCleaning->setCheckoutDate($newCheckoutDate);
                }
            }

            if ($targetCleaningStatus === HKCleanings::STATUS_CANCELLED && $existingCleaning->getStatus() !== HKCleanings::STATUS_CANCELLED) {
                $existingCleaning->setStatus(HKCleanings::STATUS_CANCELLED);
            }

            // Backfill bookingId/reservationCode/notes if missing
            if (!$existingCleaning->getBookingId()) {
                $existingCleaning->setBookingId($bookingId);
            }
            if (!$existingCleaning->getReservationCode() && $reservationCode) {
                $existingCleaning->setReservationCode($reservationCode);
            }
            if (method_exists($existingCleaning, 'getNotes') && method_exists($existingCleaning, 'setNotes')) {
                if (!(string) $existingCleaning->getNotes() && $notes) {
                    $existingCleaning->setNotes($notes);
                }
            }

            $em->persist($existingCleaning);
            $em->flush();
        } catch (\Throwable $e) {
            // silently ignore exceptions
        }
    }
}