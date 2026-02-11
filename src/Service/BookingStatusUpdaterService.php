<?php

namespace App\Service;

use App\Entity\AllBookings;
use App\Entity\HKCleanings;
use App\Entity\Unit;
use App\Service\HKCleaningManager;
use Doctrine\ORM\EntityManagerInterface;

class BookingStatusUpdaterService
{
    private EntityManagerInterface $entityManager;
    private HKCleaningManager $hkCleaningManager;

    public function __construct(EntityManagerInterface $entityManager, HKCleaningManager $hkCleaningManager)
    {
        $this->entityManager = $entityManager;
        $this->hkCleaningManager = $hkCleaningManager;
    }

    public function updateStatuses(iterable $bookings, bool $flush = false): void
    {
        $now = new \DateTimeImmutable();

        foreach ($bookings as $booking) {
            // Respect explicit Cancelled/Canceled first
            $currentStatus = strtolower((string)$booking->getStatus());
            if (in_array($currentStatus, ['cancelled','canceled'], true)) {
                // Sync housekeeping row status to cancelled when a booking is cancelled
                $this->syncHousekeepingCancelled($booking);
                // Skip further status recomputation for cancelled bookings
                continue;
            }

            // Owners2 soft-rows handling: respect user status; auto-mark past blocks as Done
            $source = method_exists($booking, 'getSource') ? (string)$booking->getSource() : '';
            if ($source === 'Owners2') {
                $guestType = method_exists($booking, 'getGuestType') ? (string)$booking->getGuestType() : '';
                $co = method_exists($booking, 'getCheckOut') ? $booking->getCheckOut() : null;

                // If this is a maintenance/cleaning/late-checkout block and it's in the past, mark as Done (unless user cancelled)
                $isBlockType = in_array($guestType, ['Cleaning', 'Maintenance', 'Late Check-Out'], true);
                if ($isBlockType && $co instanceof \DateTimeInterface) {
                    $nowCancun = new \DateTimeImmutable('now', new \DateTimeZone('America/Cancun'));
                    if ($co < $nowCancun && !in_array($currentStatus, ['cancelled','canceled'], true)) {
                        if ($booking->getStatus() !== 'Done') {
                            $booking->setStatus('Done');
                            $this->entityManager->persist($booking);
                        }
                        continue; // finalized; skip normal logic
                    }
                }

                // Otherwise, for Owners2 entries (Holds/Blocks/etc.), respect the status set by the user
                // (Active / Cancelled / Hold / Block ...). Do not auto-derive by dates.
                continue;
            }

            // Default date-driven status logic for non-Owners2 rows
            $checkIn = $booking->getCheckIn();
            $checkOut = $booking->getCheckOut();

            // If a non-cancelled reservation has checked out, mark the HK cleaning as done (Playa + Tulum).
            $nowCancun = new \DateTimeImmutable('now', new \DateTimeZone('America/Cancun'));
            if ($checkOut instanceof \DateTimeInterface && $checkOut < $nowCancun) {
                $this->syncHousekeepingDoneForPlayaOrTulum($booking);
            }

            $status = $booking->getStatus();
            if ($checkOut < $now) {
                $status = 'Past';
            } elseif ($checkIn > $now) {
                $status = 'Upcoming';
            } else {
                $status = 'Ongoing';
            }

            if ($booking->getStatus() !== $status) {
                $booking->setStatus($status);
                $this->entityManager->persist($booking);
            }
        }

        if ($flush) {
            $this->entityManager->flush();
        }
    }

    private function syncHousekeepingCancelled(AllBookings $booking): void
    {
        // Try to find hk_cleanings by reservation_code + checkout_date first
        $repo = $this->entityManager->getRepository(HKCleanings::class);
        $date = $booking->getCheckOut();
        if (!$date instanceof \DateTimeInterface) {
            return; // cannot match without a checkout date
        }
        $dateImmutable = \DateTimeImmutable::createFromInterface($date);

        // 1) Best match: booking_id
        $bookingId = (int)($booking->getId() ?? 0);
        if ($bookingId > 0) {
            $hk = $repo->findOneBy(['bookingId' => $bookingId]);
        }

        $resCode = method_exists($booking, 'getConfirmationCode') ? $booking->getConfirmationCode() : null;
        if (!$hk && $resCode) {
            $hk = $repo->findOneBy([
                'reservationCode' => $resCode,
                'checkoutDate' => $dateImmutable,
            ]);
        }

        // Fallback: match by unit_name + date if reservation code is missing or no row found
        if (!$hk) {
            $unitName = method_exists($booking, 'getUnitName') ? $booking->getUnitName() : null;
            if ($unitName) {
                $hk = $repo->createQueryBuilder('h')
                    ->leftJoin('h.unit', 'u')
                    ->andWhere('h.checkoutDate = :d')
                    ->andWhere('u.unitName = :un')
                    ->setParameter('d', $dateImmutable)
                    ->setParameter('un', $unitName)
                    ->setMaxResults(1)
                    ->getQuery()
                    ->getOneOrNullResult();
            }
        }

        if ($hk && method_exists($hk, 'setStatus')) {
            $doneConst = \defined(HKCleanings::class . '::STATUS_DONE') ? HKCleanings::STATUS_DONE : 'done';
            $cancelConst = \defined(HKCleanings::class . '::STATUS_CANCELLED') ? HKCleanings::STATUS_CANCELLED : 'cancelled';

            if (method_exists($hk, 'getStatus')) {
                $cur = (string)$hk->getStatus();
                if ($cur === $cancelConst) {
                    return; // already cancelled; nothing to do
                }
                if ($cur === $doneConst) {
                    return; // do not override done
                }
            }

            $hk->setStatus($cancelConst);
            $this->entityManager->persist($hk);
            // Do not flush here; defer to caller's $flush flag in updateStatuses()
        }
    }

    private function syncHousekeepingDoneForPlayaOrTulum(AllBookings $booking): void
    {
        // Only apply to city: Tulum or Playa del Carmen
        $city = null;

        if (method_exists($booking, 'getCity')) {
            $city = $booking->getCity();
        } elseif (method_exists($booking, 'getUnitCity')) {
            $city = $booking->getUnitCity();
        }

        if (!$city) {
            // Fallback: resolve unit city by unit_name
            $unitName = method_exists($booking, 'getUnitName') ? $booking->getUnitName() : null;
            if ($unitName) {
                try {
                    $unitRepo = $this->entityManager->getRepository(Unit::class);
                    $unit = $unitRepo->findOneBy(['unitName' => $unitName]);
                    if ($unit && method_exists($unit, 'getCity')) {
                        $city = $unit->getCity();
                    }
                } catch (\Throwable) {
                    // ignore
                }
            }
        }

        $cityLower = strtolower((string)$city);
        if (!in_array($cityLower, ['tulum', 'playa del carmen'], true)) {
            return;
        }

        // Match hk_cleanings by reservation_code + checkout_date first
        $repo = $this->entityManager->getRepository(HKCleanings::class);
        $date = $booking->getCheckOut();
        if (!$date instanceof \DateTimeInterface) {
            return;
        }
        $dateImmutable = \DateTimeImmutable::createFromInterface($date);

        $hk = null;

        // 1) Best match: booking_id
        $bookingId = (int)($booking->getId() ?? 0);
        if ($bookingId > 0) {
            $hk = $repo->findOneBy(['bookingId' => $bookingId]);
        }

        $resCode = method_exists($booking, 'getConfirmationCode') ? $booking->getConfirmationCode() : null;
        if (!$hk && $resCode) {
            $hk = $repo->findOneBy([
                'reservationCode' => $resCode,
                'checkoutDate' => $dateImmutable,
            ]);
        }

        // Fallback: match by unit_name + date
        if (!$hk) {
            $unitName = method_exists($booking, 'getUnitName') ? $booking->getUnitName() : null;
            if ($unitName) {
                $hk = $repo->createQueryBuilder('h')
                    ->leftJoin('h.unit', 'u')
                    ->andWhere('h.checkoutDate = :d')
                    ->andWhere('u.unitName = :un')
                    ->setParameter('d', $dateImmutable)
                    ->setParameter('un', $unitName)
                    ->setMaxResults(1)
                    ->getQuery()
                    ->getOneOrNullResult();
            }
        }

        if ($hk && method_exists($hk, 'setStatus')) {
            $doneConst = \defined(HKCleanings::class . '::STATUS_DONE') ? HKCleanings::STATUS_DONE : 'done';
            $cancelConst = \defined(HKCleanings::class . '::STATUS_CANCELLED') ? HKCleanings::STATUS_CANCELLED : 'cancelled';

            // Never override cancelled
            if (method_exists($hk, 'getStatus')) {
                $cur = $hk->getStatus();
                if ($cur === $cancelConst) {
                    return;
                }
                if ($cur === $doneConst) {
                    return; // already done
                }
            }

            // Delegate to manager to mark done + create hktransactions row (idempotent)
            $this->hkCleaningManager->markDoneAndCreateTransaction($hk);
            // Do not flush here; defer to caller's $flush flag in updateStatuses()
        }
    }
}