<?php

namespace App\Tests\Service;

use App\Service\BookingDateValidator;
use PHPUnit\Framework\TestCase;

final class BookingDateValidatorTest extends TestCase
{
    public function testRejectsReversedSameDayAndInvalidDates(): void
    {
        foreach (['2026-11-01', '2026-11-21', '2026-02-31', '', null] as $checkout) {
            self::assertNotNull(BookingDateValidator::error('2026-11-21', $checkout));
        }
    }

    public function testAcceptsCalendarDatesAcrossYearAndLeapDay(): void
    {
        self::assertNull(BookingDateValidator::error('2026-12-31', '2027-01-01'));
        self::assertNull(BookingDateValidator::error('2028-02-28', '2028-02-29'));
        self::assertNull(BookingDateValidator::error(new \DateTimeImmutable('2026-11-21'), '2026-11-22T00:00:00Z'));
    }
}
