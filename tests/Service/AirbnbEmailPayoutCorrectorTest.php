<?php

namespace App\Tests\Service;

use App\Service\AirbnbEmailPayoutCorrector;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class AirbnbEmailPayoutCorrectorTest extends TestCase
{
    #[DataProvider('confirmationEmailProvider')]
    public function testItCorrectsMexicanWithholdingsFromConfirmationEmail(
        string $fixture,
        float $expectedPayout,
        float $expectedCleaningFee,
        float $expectedRoomFee,
    ): void {
        $body = file_get_contents(__DIR__.'/../Fixtures/Airbnb/'.$fixture);

        self::assertIsString($body);

        $corrector = new AirbnbEmailPayoutCorrector();
        $financials = $corrector->parse($body);

        self::assertEqualsWithDelta(
            $expectedPayout,
            $financials['payout'],
            0.001,
        );
        self::assertEqualsWithDelta(
            $expectedCleaningFee,
            $financials['cleaningFee'],
            0.001,
        );
        self::assertEqualsWithDelta(
            $expectedRoomFee,
            $financials['roomFee'],
            0.001,
        );
    }

    public static function confirmationEmailProvider(): iterable
    {
        yield '16% service fee without adjustment' => [
            'confirmation_16_percent_no_adjustment.txt',
            5857.11,
            900.00,
            833.86,
        ];

        yield '16% service fee with negative nightly adjustment' => [
            'confirmation_16_percent_negative_adjustment.txt',
            28455.96,
            1200.00,
            3503.40,
        ];

        yield '3% service fee with negative nightly adjustment' => [
            'confirmation_3_percent_negative_adjustment.txt',
            5660.48,
            800.00,
            527.60,
        ];
    }
}
