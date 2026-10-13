<?php

namespace App\Tests\Service;

use App\Service\HKCleaningDisplayStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class HKCleaningDisplayStatusTest extends TestCase
{
    private const PLAYA = 'Playa del Carmen';

    #[DataProvider('playaCases')]
    public function testPlayaStatus(string $status, ?string $reportStatus, string $expected): void
    {
        self::assertSame($expected, HKCleaningDisplayStatus::derive(self::PLAYA, $status, $reportStatus));
    }

    /**
     * @return iterable<string, array{string, ?string, string}>
     */
    public static function playaCases(): iterable
    {
        yield 'pending, untouched' => ['pending', 'pending', 'pending'];
        yield 'pending, null report' => ['pending', null, 'pending'];
        yield 'done' => ['done', 'pending', 'done'];
        yield 'pending marked reported' => ['pending', 'reported', 'reported'];
        yield 'done marked reported' => ['done', 'reported', 'reported'];
        yield 'reported can become needs review' => ['done', 'needs_review', 'needs_review'];
        yield 'pending marked needs review' => ['pending', 'needs_review', 'needs_review'];
        yield 'scheduled counts as pending' => ['scheduled', 'pending', 'pending'];
        yield 'cancelled wins' => ['cancelled', 'reported', 'cancelled'];
        yield 'case insensitive' => ['DONE', 'Pending', 'done'];
    }

    public function testOtherCitiesKeepLegacyBehavior(): void
    {
        self::assertNull(HKCleaningDisplayStatus::derive('Tulum', 'done', 'pending'));
        self::assertNull(HKCleaningDisplayStatus::derive(null, 'done', 'reported'));
    }
}
