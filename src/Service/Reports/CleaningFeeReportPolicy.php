<?php

namespace App\Service\Reports;

/** Read-time waivers: reservations and historical month slices remain unchanged. */
final class CleaningFeeReportPolicy
{
    private static function waivedSql(string $slice): string
    {
        return "EXISTS (
            SELECT 1 FROM hk_cleanings waived_hk
            WHERE waived_hk.unit_id = $slice.unit_id
              AND LOWER(waived_hk.cleaning_type) = CASE
                  WHEN EXISTS (SELECT 1 FROM all_bookings owner_booking WHERE owner_booking.id = $slice.booking_id
                      AND LOWER(COALESCE(owner_booking.guest_type, '')) = 'owner') THEN 'owner' ELSE 'checkout' END
              AND (LOWER(waived_hk.status) = 'cancelled'
                OR (LOWER(waived_hk.status) = 'pending' AND EXISTS (
                    SELECT 1 FROM hk_cleanings_reconcile retained WHERE retained.hk_cleaning_id = waived_hk.id
                )))
              AND (waived_hk.booking_id = $slice.booking_id
                OR (COALESCE(waived_hk.booking_id, 0) = 0 AND COALESCE(waived_hk.reservation_code, '') <> '' AND EXISTS (
                    SELECT 1 FROM all_bookings linked_booking WHERE linked_booking.id = $slice.booking_id
                      AND (linked_booking.confirmation_code = waived_hk.reservation_code OR linked_booking.reservation_code = waived_hk.reservation_code)
                )))
        )";
    }

    public static function cleaningFeeSql(string $slice): string
    {
        $waived = self::waivedSql($slice);
        return "CASE WHEN $waived THEN 0 ELSE COALESCE($slice.cleaning_fee_in_month, 0) END";
    }

    public static function ownerPayoutSql(string $slice): string
    {
        $waived = self::waivedSql($slice);
        // Client-collected Airbnb payouts never deducted the fee from owner income.
        // Other payouts deduct it proportionally by night, even when the cleaning fee
        // itself appears entirely in the checkout month. Zero-night owner stays use the full fee.
        $refund = "COALESCE((SELECT CASE
            WHEN UPPER(COALESCE(fee_unit.payment_type, '')) = 'CLIENT'
              AND UPPER(COALESCE($slice.source, '')) = 'AIRBNB'
              AND COALESCE(fee_booking.payment_method, '') <> 'no_pay' THEN 0
            WHEN COALESCE($slice.nights_total, 0) = 0 THEN COALESCE(fee_booking.cleaning_fee, 0)
            ELSE ROUND(COALESCE(fee_booking.cleaning_fee, 0) * 1.0 * $slice.nights_in_month / NULLIF($slice.nights_total, 0), 2)
            END FROM all_bookings fee_booking LEFT JOIN unit fee_unit ON fee_unit.id = fee_booking.unit_id
            WHERE fee_booking.id = $slice.booking_id), 0)";
        return "ROUND((COALESCE($slice.owner_payout_in_month, 0) + CASE WHEN $waived THEN $refund ELSE 0 END), 2)";
    }
}
