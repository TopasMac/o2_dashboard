<?php

namespace App\Service;

final class BookingDateValidator
{
    public static function parse(mixed $value): ?\DateTimeImmutable
    {
        if ($value instanceof \DateTimeInterface) {
            $value = $value->format('Y-m-d');
        }
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}(?:T.*)?$/', $value)) {
            return null;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', substr($value, 0, 10));
        return $date && $date->format('Y-m-d') === substr($value, 0, 10) ? $date : null;
    }

    public static function error(mixed $checkIn, mixed $checkOut): ?string
    {
        $start = self::parse($checkIn);
        $end = self::parse($checkOut);
        if (!$start || !$end) {
            return 'Enter valid check-in and check-out dates';
        }
        return $end <= $start ? 'Check-out must be after check-in' : null;
    }
}
