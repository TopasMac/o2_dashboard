<?php

namespace App\Tests\Service;

use App\Entity\AllBookings;
use App\Entity\BookingConfig;
use App\Entity\Unit;
use App\Service\BookingCalculatorService;
use App\Service\BookingNightCalculator;
use PHPUnit\Framework\TestCase;

final class BookingCalculatorServiceTest extends TestCase
{
    public function testItUsesCalendarNightsForStoredDaysAndPerNightRoomFee(): void
    {
        $booking = (new AllBookings())
            ->setSource('Airbnb')
            ->setStatus('Upcoming')
            ->setPaymentMethod('platform')
            ->setCheckIn(new \DateTimeImmutable('2026-09-15 15:00:00'))
            ->setCheckOut(new \DateTimeImmutable('2026-09-18 11:00:00'))
            ->setPayout(350.00)
            ->setCleaningFee(50.00)
            ->setCommissionPercent(20.00);

        $unit = (new Unit())
            ->setPaymentType('OWNERS2')
            ->setCleaningFee(50.00);

        $config = (new BookingConfig())
            ->setDefaultTaxPercentage(12.00)
            ->setDefaultCommissionPercentage(20.00);

        $calculator = new BookingCalculatorService(new BookingNightCalculator());
        $calculator->recalculate($booking, $unit, $config);

        self::assertSame(3, $booking->getDays());
        self::assertSame(100.00, $booking->getRoomFee());
    }
}
