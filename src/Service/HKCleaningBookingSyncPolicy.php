<?php

namespace App\Service;

use App\Entity\HKCleanings;

/**
 * Defines which workflow status booking synchronization may apply to a cleaning.
 *
 * Booking dates can create and update cleaning metadata, but they are not proof
 * that the physical cleaning was completed. Existing workflow decisions must be
 * preserved; new booking-driven cleanings always start pending.
 */
final class HKCleaningBookingSyncPolicy
{
    public function statusFor(?HKCleanings $existingCleaning): string
    {
        if (!$existingCleaning instanceof HKCleanings) {
            return HKCleanings::STATUS_PENDING;
        }

        $currentStatus = trim((string) $existingCleaning->getStatus());

        return $currentStatus !== ''
            ? $currentStatus
            : HKCleanings::STATUS_PENDING;
    }
}
