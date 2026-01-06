<?php

namespace App\Service;

/**
 * Service to calculate markup based on progressive (tiered) logic:
 * - 20% for the first 1000 pesos.
 * - 10% for everything above 1000 pesos.
 * Returns the calculated markup amount.
 */
class MarkupCalculatorService
{
    /**
     * Calculate the markup for a given amount using tiered rates.
     *
     * @param float $amount The input amount in pesos
     * @return float The calculated markup
     */
    public function calculate(float $amount): float
    {
        $tier1_limit = 1000.0;
        $tier1_rate = 0.20;
        $tier2_rate = 0.10;

        if ($amount <= $tier1_limit) {
            return $amount * $tier1_rate;
        }

        $tier1_markup = $tier1_limit * $tier1_rate;
        $tier2_markup = ($amount - $tier1_limit) * $tier2_rate;
        return $tier1_markup + $tier2_markup;
    }
}