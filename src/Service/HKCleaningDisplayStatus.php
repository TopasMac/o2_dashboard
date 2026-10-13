<?php

namespace App\Service;

use App\Entity\HKCleanings;

/**
 * Single status shown for a cleaning in both the Cleanings table and HK Reconciliation.
 *
 * Playa del Carmen only: a manual report status (reported / needs_review) wins,
 * otherwise the cleaning's own status is shown (done, or pending for anything not done).
 * Other cities return null and keep their existing behavior.
 */
final class HKCleaningDisplayStatus
{
    public const PENDING      = 'pending';
    public const DONE         = 'done';
    public const REPORTED     = 'reported';
    public const NEEDS_REVIEW = 'needs_review';
    public const CANCELLED    = 'cancelled';

    public static function appliesToCity(?string $city): bool
    {
        return strtolower(trim((string) $city)) === 'playa del carmen';
    }

    public static function derive(?string $city, ?string $status, ?string $reportStatus): ?string
    {
        if (!self::appliesToCity($city)) {
            return null;
        }

        $status = strtolower(trim((string) $status));
        if ($status === HKCleanings::STATUS_CANCELLED) {
            return self::CANCELLED;
        }

        $report = strtolower(trim((string) $reportStatus));
        if ($report === HKCleanings::REPORT_STATUS_REPORTED) {
            return self::REPORTED;
        }
        if ($report === HKCleanings::REPORT_STATUS_NEEDS_REVIEW) {
            return self::NEEDS_REVIEW;
        }

        return $status === HKCleanings::STATUS_DONE ? self::DONE : self::PENDING;
    }
}
