<?php

namespace App\Tests\Service;

use App\Service\BookingNightCalculator;
use PHPUnit\Framework\TestCase;

final class BookingNightCalculatorTest extends TestCase
{
    private BookingNightCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new BookingNightCalculator();
    }

    public function testItCountsCalendarNightsInsteadOfWholeTwentyFourHourPeriods(): void
    {
        $checkIn = new \DateTimeImmutable('2026-09-15 15:00:00');
        $checkOut = new \DateTimeImmutable('2026-09-18 11:00:00');

        self::assertSame(3, $this->calculator->calculate($checkIn, $checkOut));
    }

    public function testItCountsNightsAcrossMonthAndYearBoundaries(): void
    {
        $checkIn = new \DateTimeImmutable('2026-12-31 15:00:00');
        $checkOut = new \DateTimeImmutable('2027-01-02 11:00:00');

        self::assertSame(2, $this->calculator->calculate($checkIn, $checkOut));
    }

    public function testItReturnsZeroForMissingOrInvalidRanges(): void
    {
        self::assertSame(0, $this->calculator->calculate(null, new \DateTimeImmutable('2026-09-18')));
        self::assertSame(0, $this->calculator->calculate(new \DateTimeImmutable('2026-09-18'), null));
        self::assertSame(0, $this->calculator->calculate(
            new \DateTimeImmutable('2026-09-18 15:00:00'),
            new \DateTimeImmutable('2026-09-18 11:00:00')
        ));
        self::assertSame(0, $this->calculator->calculate(
            new \DateTimeImmutable('2026-09-19'),
            new \DateTimeImmutable('2026-09-18')
        ));
    }
}
