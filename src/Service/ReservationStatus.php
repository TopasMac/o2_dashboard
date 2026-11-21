<?php

namespace App\Service;

final class ReservationStatus
{
    public const TIMEZONE = 'America/Cancun';

    private const CHECK_IN_HOUR = 15;
    private const CHECK_OUT_HOUR = 11;

    public static function resolve(
        ?\DateTimeInterface $checkIn,
        ?\DateTimeInterface $checkOut,
        ?\DateTimeImmutable $now = null,
        string $fallback = 'Upcoming',
    ): string {
        $dates = self::transitionDates($now);

        // Doctrine dates carry a timezone, but their stored calendar day is what matters.
        if ($checkOut !== null && $checkOut->format('Y-m-d') <= $dates['lastDeparted']) {
            return 'Past';
        }
        if ($checkIn !== null && $checkIn->format('Y-m-d') > $dates['lastArrived']) {
            return 'Upcoming';
        }

        return $checkIn !== null || $checkOut !== null ? 'Ongoing' : $fallback;
    }

    /**
     * @return array{today: string, lastArrived: string, lastDeparted: string}
     */
    public static function transitionDates(?\DateTimeImmutable $now = null): array
    {
        $timezone = new \DateTimeZone(self::TIMEZONE);
        $local = $now === null ? new \DateTimeImmutable('now', $timezone) : $now->setTimezone($timezone);
        $today = $local->format('Y-m-d');
        $yesterday = $local->modify('-1 day')->format('Y-m-d');
        $hour = (int) $local->format('G');

        return [
            'today' => $today,
            'lastArrived' => $hour >= self::CHECK_IN_HOUR ? $today : $yesterday,
            'lastDeparted' => $hour >= self::CHECK_OUT_HOUR ? $today : $yesterday,
        ];
    }
}
