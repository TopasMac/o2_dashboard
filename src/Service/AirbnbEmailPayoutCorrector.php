<?php

namespace App\Service;

final class AirbnbEmailPayoutCorrector
{
    private const INCOME_TAX_RATE = 0.025;
    private const VAT_WITHHOLDING_RATE = 0.08;

    /**
     * @return array{payout: float, cleaningFee: float, roomFee: float}
     */
    public function parse(string $body): array
    {
        if (!preg_match('/TOTAL\s*\(MXN\)/i', $body)) {
            throw new \InvalidArgumentException('The Airbnb confirmation email is not denominated in MXN.');
        }

        $guestPaidSection = $this->extractSection($body, 'GUEST PAID', 'HOST PAYOUT');
        $hostPayoutSection = $this->extractSection($body, 'HOST PAYOUT', 'YOU EARN');

        $roomFee = $this->extractRequiredAmount(
            $guestPaidSection,
            '/\$([0-9][0-9,.]*)\s*x\s*\d+\s*nights?/i',
            'displayed nightly room rate',
        );
        $hostRoomFeeTotal = $this->extractRequiredAmount(
            $hostPayoutSection,
            '/\d+\s*-\s*nights?\s+room fee\s+\$([0-9][0-9,.]*)/i',
            'host room-fee total',
        );
        $cleaningFee = $this->extractRequiredAmount(
            $hostPayoutSection,
            '/Cleaning fee\s+\$([0-9][0-9,.]*)/i',
            'cleaning fee',
        );
        $emailPayout = $this->extractRequiredAmount(
            $body,
            '/YOU EARN\s+\$([0-9][0-9,.]*)/i',
            'You earn payout',
        );
        $nightlyRateAdjustment = $this->extractOptionalSignedAmount(
            $hostPayoutSection,
            '/Nightly rate adjustment\s+([+-]?)\$([0-9][0-9,.]*)/i',
        );

        $taxableBase = $hostRoomFeeTotal + $cleaningFee + $nightlyRateAdjustment;
        $incomeTaxWithheld = round($taxableBase * self::INCOME_TAX_RATE, 2, PHP_ROUND_HALF_UP);
        $vatWithheld = round($taxableBase * self::VAT_WITHHOLDING_RATE, 2, PHP_ROUND_HALF_UP);
        $correctedPayout = round($emailPayout - $incomeTaxWithheld - $vatWithheld, 2, PHP_ROUND_HALF_UP);

        return [
            'payout' => $correctedPayout,
            'cleaningFee' => $cleaningFee,
            'roomFee' => $roomFee,
        ];
    }

    private function extractSection(string $body, string $startLabel, string $endLabel): string
    {
        $pattern = sprintf(
            '/%s(.*?)%s/is',
            preg_quote($startLabel, '/'),
            preg_quote($endLabel, '/'),
        );

        if (!preg_match($pattern, $body, $matches)) {
            throw new \InvalidArgumentException(sprintf(
                'Could not find the %s section in the Airbnb confirmation email.',
                $startLabel,
            ));
        }

        return $matches[1];
    }

    private function extractRequiredAmount(string $text, string $pattern, string $label): float
    {
        if (!preg_match($pattern, $text, $matches)) {
            throw new \InvalidArgumentException(sprintf(
                'Could not extract the %s from the Airbnb confirmation email.',
                $label,
            ));
        }

        return $this->normalizeAmount($matches[1]);
    }

    private function extractOptionalSignedAmount(string $text, string $pattern): float
    {
        if (!preg_match($pattern, $text, $matches)) {
            return 0.0;
        }

        $amount = $this->normalizeAmount($matches[2]);

        return ($matches[1] ?? '') === '-' ? -$amount : $amount;
    }

    private function normalizeAmount(string $amount): float
    {
        return (float) str_replace(',', '', $amount);
    }
}
