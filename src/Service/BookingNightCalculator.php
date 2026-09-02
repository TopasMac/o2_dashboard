<?php

namespace App\Service;

final class BookingNightCalculator
{
    public function calculate(?\DateTimeInterface $checkIn, ?\DateTimeInterface $checkOut): int
    {
        if ($checkIn === null || $checkOut === null) {
            return 0;
        }

        $start = \DateTimeImmutable::createFromInterface($checkIn)->setTime(0, 0);
        $end = \DateTimeImmutable::createFromInterface($checkOut)->setTime(0, 0);

        if ($end <= $start) {
            return 0;
        }

        return (int) $start->diff($end)->days;
    }
}
