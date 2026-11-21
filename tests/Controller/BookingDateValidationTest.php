<?php

namespace App\Tests\Controller;

use App\Controller\Api\BookingsController;
use App\Entity\AllBookings;
use App\Repository\AllBookingsRepository;
use App\Service\BookingAggregatorService;
use App\Service\BookingStatusUpdaterService;
use App\Service\HKCleaningManager;
use App\Service\MonthSliceRefresher;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\IgnoreDeprecations;
use Symfony\Component\HttpFoundation\Request;

final class BookingDateValidationTest extends TestCase
{
    #[IgnoreDeprecations]
    public function testPrivateCreationRejectsReversedDatesBeforeAnyWrites(): void
    {
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects(self::never())->method('getRepository');
        $em->expects(self::never())->method('flush');
        $aggregator = $this->createMock(BookingAggregatorService::class);
        $aggregator->expects(self::never())->method('createAllBookingFromPrivateReservation');
        $controller = new BookingsController($this->createMock(MonthSliceRefresher::class), $this->createMock(HKCleaningManager::class));
        $response = $controller->createPrivateBooking(new Request(content: json_encode([
            'check_in' => '2026-11-21', 'check_out' => '2026-11-01',
        ])), $aggregator, $em);
        self::assertSame(422, $response->getStatusCode());
    }

    public function testPartialUpdateChecksPersistedOtherDateBeforeMutation(): void
    {
        $booking = (new AllBookings())->setSource('Private')->setGuestType('owner')
            ->setCheckIn(new \DateTimeImmutable('2026-11-21'))->setCheckOut(new \DateTimeImmutable('2026-11-22'));
        $repository = $this->createMock(AllBookingsRepository::class);
        $repository->method('find')->willReturn($booking);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getRepository')->willReturn($repository);
        $em->expects(self::never())->method('flush');
        $refresher = $this->createMock(MonthSliceRefresher::class);
        $refresher->expects(self::never())->method('refreshForBooking');
        $controller = new BookingsController($refresher, $this->createMock(HKCleaningManager::class));
        foreach ([['checkOut' => '2026-11-01'], ['check_in' => '2026-11-23'], ['checkOut' => '2026-11-21']] as $payload) {
            $response = $controller->update(new Request(content: json_encode($payload)), $em,
                $this->createMock(BookingAggregatorService::class), $refresher,
                $this->createMock(BookingStatusUpdaterService::class), '42');
            self::assertSame(422, $response->getStatusCode());
            self::assertSame('2026-11-21', $booking->getCheckIn()->format('Y-m-d'));
            self::assertSame('2026-11-22', $booking->getCheckOut()->format('Y-m-d'));
        }
    }
}
