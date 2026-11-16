<?php

namespace App\Tests\Service;

use App\Entity\AllBookings;
use App\Service\BookingStatusUpdaterService;
use App\Service\HKCleaningManager;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;

final class BookingStatusUpdaterServiceTest extends TestCase
{
    public function testPastBookingStatusDoesNotTriggerLegacyCleaningCompletion(): void
    {
        $booking = $this->booking(
            new \DateTimeImmutable('2026-05-10'),
            new \DateTimeImmutable('2026-05-15'),
        );

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects(self::once())->method('persist')->with($booking);
        $entityManager->expects(self::once())->method('flush');

        $cleaningManager = $this->createMock(HKCleaningManager::class);
        $cleaningManager->expects(self::once())
            ->method('usesReconciliationPolicy')
            ->with($booking->getCheckOut())
            ->willReturn(false);
        $cleaningManager->expects(self::never())->method('markDoneAndCreateTransaction');
        $cleaningManager->expects(self::never())->method('syncCheckoutCleaningForBooking');

        (new BookingStatusUpdaterService($entityManager, $cleaningManager))
            ->updateStatuses([$booking], true);

        self::assertSame('Past', $booking->getStatus());
    }

    public function testPostCutoffPastBookingStillSynchronizesWithoutCompletingInUpdater(): void
    {
        $booking = $this->booking(
            new \DateTimeImmutable('2026-09-01'),
            new \DateTimeImmutable('2026-09-05'),
        );

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects(self::once())->method('persist')->with($booking);
        $entityManager->expects(self::once())->method('flush');

        $cleaningManager = $this->createMock(HKCleaningManager::class);
        $cleaningManager->expects(self::once())
            ->method('usesReconciliationPolicy')
            ->willReturn(true);
        $cleaningManager->expects(self::once())
            ->method('syncCheckoutCleaningForBooking')
            ->with($booking);
        $cleaningManager->expects(self::never())->method('markDoneAndCreateTransaction');

        (new BookingStatusUpdaterService($entityManager, $cleaningManager))
            ->updateStatuses([$booking], true);

        self::assertSame('Past', $booking->getStatus());
    }

    public function testPastOwners2BlockBecomesPastWithoutCompletingHousekeeping(): void
    {
        $booking = $this->booking(
            new \DateTimeImmutable('2026-05-10'),
            new \DateTimeImmutable('2026-05-15'),
        )
            ->setSource('Owners2')
            ->setGuestType('Block')
            ->setStatus('Active');

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects(self::once())->method('persist')->with($booking);
        $entityManager->expects(self::once())->method('flush');

        $cleaningManager = $this->createMock(HKCleaningManager::class);
        $cleaningManager->expects(self::never())->method('markDoneAndCreateTransaction');
        $cleaningManager->expects(self::never())->method('syncCheckoutCleaningForBooking');

        (new BookingStatusUpdaterService($entityManager, $cleaningManager))
            ->updateStatuses([$booking], true);

        self::assertSame('Past', $booking->getStatus());
    }

    public function testOwners2BlockCheckingOutTodayRemainsActive(): void
    {
        $today = new \DateTimeImmutable('today', new \DateTimeZone('America/Cancun'));
        $booking = $this->booking($today->modify('-1 day'), $today)
            ->setSource('Owners2')
            ->setGuestType('Block')
            ->setStatus('Active');

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects(self::never())->method('persist');
        $entityManager->expects(self::once())->method('flush');

        $cleaningManager = $this->createMock(HKCleaningManager::class);
        $cleaningManager->expects(self::never())->method('markDoneAndCreateTransaction');
        $cleaningManager->expects(self::never())->method('syncCheckoutCleaningForBooking');

        (new BookingStatusUpdaterService($entityManager, $cleaningManager))
            ->updateStatuses([$booking], true);

        self::assertSame('Active', $booking->getStatus());
    }

    public function testIncompleteBookingDatesDoNotCauseStatusUpdateFailure(): void
    {
        $booking = (new AllBookings())
            ->setSource('Airbnb')
            ->setStatus('Upcoming');

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects(self::never())->method('persist');
        $entityManager->expects(self::never())->method('flush');

        $cleaningManager = $this->createMock(HKCleaningManager::class);
        $cleaningManager->expects(self::never())->method('usesReconciliationPolicy');
        $cleaningManager->expects(self::never())->method('syncCheckoutCleaningForBooking');

        (new BookingStatusUpdaterService($entityManager, $cleaningManager))
            ->updateStatuses([$booking]);

        self::assertSame('Upcoming', $booking->getStatus());
    }

    public function testStatusTransitionsKeepTheStoredCheckoutDayAndDoNotCompleteCleaning(): void
    {
        $utc = new \DateTimeZone('UTC');
        $checkIn = new \DateTimeImmutable('2026-11-02', $utc);
        $checkOut = new \DateTimeImmutable('2026-11-16', $utc);
        $entityManager = $this->createMock(EntityManagerInterface::class);
        $cleaningManager = $this->createMock(HKCleaningManager::class);
        $cleaningManager->method('usesReconciliationPolicy')->with($checkOut)->willReturn(true);
        $cleaningManager->expects(self::exactly(5))->method('syncCheckoutCleaningForBooking');
        $cleaningManager->expects(self::never())->method('markDoneAndCreateTransaction');
        $updater = new BookingStatusUpdaterService($entityManager, $cleaningManager);

        foreach ([
            '2026-11-02 14:59:59' => 'Upcoming',
            '2026-11-02 15:00:00' => 'Ongoing',
            '2026-11-15 22:50:00' => 'Ongoing',
            '2026-11-16 10:59:59' => 'Ongoing',
            '2026-11-16 11:00:00' => 'Past',
        ] as $time => $expected) {
            $booking = $this->booking($checkIn, $checkOut)->setCity('Tulum')->setStatus('Past');
            $now = new \DateTimeImmutable($time, new \DateTimeZone('America/Cancun'));
            $updater->updateStatuses([$booking], now: $now->setTimezone($utc));

            self::assertSame($expected, $booking->getStatus(), $time);
            self::assertSame($checkOut, $booking->getCheckOut());
        }
    }

    private function booking(\DateTimeImmutable $checkIn, \DateTimeImmutable $checkOut): AllBookings
    {
        return (new AllBookings())
            ->setSource('Airbnb')
            ->setStatus('Ongoing')
            ->setCheckIn($checkIn)
            ->setCheckOut($checkOut);
    }
}
