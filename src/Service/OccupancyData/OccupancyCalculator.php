<?php

namespace App\Service\OccupancyData;

use App\Entity\Unit;
use App\Service\OccupancyData\ReservationOccupancyProvider;

/**
 * Lightweight calculator for monthly occupancy figures.
 *
 * Delegates booked-night counting to ReservationOccupancyProvider (currently backed by
 * the booking_month_slice table), then computes totals and percentage for the month.
 */
class OccupancyCalculator
{
    public function __construct(private readonly ReservationOccupancyProvider $provider) {}
    /**
     * Return booked/total days for a given unit & month (period is normalized to the 1st).
     *
     * @return array{bookedDays:int,totalDays:int,occupancyPercent:int}
     */
    public function forMonth(Unit $unit, \DateTimeImmutable $period): array
    {
        $monthStart = $this->firstDayOfMonth($period);
        $totalDays  = (int) $monthStart->format('t');
        $bookedDays = $this->getBookedDays($unit, $monthStart);

        // Clamp and compute percent as an integer 0..100
        $bookedDays = max(0, min($bookedDays, $totalDays));
        $percent = (int) round(($totalDays > 0 ? ($bookedDays / $totalDays) * 100 : 0));

        return [
            'bookedDays' => $bookedDays,
            'totalDays' => $totalDays,
            'occupancyPercent' => $percent,
        ];
    }

    /**
     * Return a status label based on thresholds.
     * - low  : percent < $low
     * - high : percent > $high
     * - ok   : otherwise
     */
    public function classify(int $occupancyPercent, int $low, int $high): string
    {
        if ($occupancyPercent < $low) {
            return 'low';
        }
        if ($occupancyPercent > $high) {
            return 'high';
        }
        return 'ok';
    }

    protected function getBookedDays(Unit $unit, \DateTimeImmutable $monthStart): int
    {
        $monthEndExclusive = $monthStart->modify('first day of next month');
        return $this->provider->countBookedNights($unit, $monthStart, $monthEndExclusive);
    }

    private function firstDayOfMonth(\DateTimeImmutable $dt): \DateTimeImmutable
    {
        return $dt->setDate((int)$dt->format('Y'), (int)$dt->format('m'), 1)->setTime(0, 0, 0);
    }
}