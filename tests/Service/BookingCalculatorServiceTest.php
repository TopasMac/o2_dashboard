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

    public function testItPreservesTheDisplayedAirbnbNightlyRate(): void
    {
        $booking = (new AllBookings())
            ->setSource('Airbnb')
            ->setStatus('Upcoming')
            ->setPaymentMethod('platform')
            ->setCheckIn(new \DateTimeImmutable('2026-11-13'))
            ->setCheckOut(new \DateTimeImmutable('2026-11-20'))
            ->setPayout(5857.11)
            ->setCleaningFee(900.00)
            ->setRoomFee(833.86)
            ->setCommissionPercent(20.00);

        $unit = (new Unit())
            ->setPaymentType('OWNERS2')
            ->setCleaningFee(900.00);

        $config = (new BookingConfig())
            ->setDefaultTaxPercentage(12.00)
            ->setDefaultCommissionPercentage(20.00);

        $calculator = new BookingCalculatorService(new BookingNightCalculator());
        $calculator->recalculate($booking, $unit, $config);

        self::assertSame(7, $booking->getDays());
        self::assertSame(833.86, $booking->getRoomFee());
    }

    public function testItCalculatesPrivateRoomFeeFromGrossPayoutBeforeCardTax(): void
    {
        $booking = (new AllBookings())
            ->setSource('Private')
            ->setStatus('Upcoming')
            ->setPaymentMethod('card')
            ->setCheckIn(new \DateTimeImmutable('2026-11-02'))
            ->setCheckOut(new \DateTimeImmutable('2026-11-16'))
            ->setPayout(10500.00)
            ->setCleaningFee(800.00)
            ->setCommissionPercent(20.00);

        $unit = (new Unit())
            ->setPaymentType('OWNERS2')
            ->setCleaningFee(800.00);

        $config = (new BookingConfig())
            ->setDefaultTaxPercentage(10.00)
            ->setDefaultCommissionPercentage(20.00);

        $calculator = new BookingCalculatorService(new BookingNightCalculator());
        $calculator->recalculate($booking, $unit, $config);

        self::assertSame(14, $booking->getDays());
        self::assertSame(1050.00, $booking->getTaxAmount());
        self::assertSame(9450.00, $booking->getNetPayout());
        self::assertSame(692.86, $booking->getRoomFee());
    }

    public function testPrivateRoomFeeCannotBecomeNegative(): void
    {
        $booking = (new AllBookings())
            ->setSource('Private')
            ->setStatus('Upcoming')
            ->setPaymentMethod('cash')
            ->setCheckIn(new \DateTimeImmutable('2026-11-01'))
            ->setCheckOut(new \DateTimeImmutable('2026-11-04'))
            ->setPayout(0.00)
            ->setCleaningFee(900.00)
            ->setCommissionPercent(20.00);

        $unit = (new Unit())
            ->setPaymentType('OWNERS2')
            ->setCleaningFee(900.00);

        $config = (new BookingConfig())
            ->setDefaultTaxPercentage(0.00)
            ->setDefaultCommissionPercentage(20.00);

        $calculator = new BookingCalculatorService(new BookingNightCalculator());
        $calculator->recalculate($booking, $unit, $config);

        self::assertSame(0.00, $booking->getRoomFee());
    }
}
