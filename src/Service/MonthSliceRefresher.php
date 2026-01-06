<?php

namespace App\Service;

use Doctrine\DBAL\Connection;
use Psr\Log\LoggerInterface;
use App\Service\HKCleaningRateResolver;

class MonthSliceRefresher
{
    private Connection $conn;
    private LoggerInterface $logger;
    private HKCleaningRateResolver $rateResolver;

    public function __construct(Connection $conn, LoggerInterface $logger, HKCleaningRateResolver $rateResolver)
    {
        $this->conn = $conn;
        $this->logger = $logger;
        $this->rateResolver = $rateResolver;
    }

    /**
     * Refresh slice rows for a single booking across all months spanned by its check-in/out dates.
     */
    public function refreshForBooking(int $bookingId, \DateTimeInterface $checkIn, \DateTimeInterface $checkOut): int
    {
        $this->logger->debug('[MonthSliceRefresher] refreshForBooking begin', [
            'bookingId' => $bookingId,
            'checkIn'   => $checkIn->format('Y-m-d'),
            'checkOut'  => $checkOut->format('Y-m-d'),
        ]);

        // Fetch booking core fields needed for special-case handling (e.g., cancelled bookings)
        $ab = $this->conn->fetchAssociative(
            "SELECT `status`, `payout`, `tax_amount`, `cleaning_fee`, `commission_percent`, `commission_value`,
                    `o2_total`, `client_income`, `room_fee`,
                    `unit_id`, `city`, `unit_name`, `guest_name`, `guest_type`, `source`, `payment_method`,
                    `check_in`, `check_out`
             FROM `owners2_dashboard`.`all_bookings`
             WHERE `id` = :bid",
            ['bid' => $bookingId]
        );

        if ($ab) {
            // Enforce source eligibility: only 'Private' or 'Airbnb' bookings are sliced
            $source = strtolower((string)($ab['source'] ?? ''));
            $eligible = in_array($source, ['private', 'airbnb'], true);
            if (!$eligible) {
                // Clean up any previous slices if present and skip
                $deleted = $this->conn->executeStatement(
                    "DELETE FROM `booking_month_slice` WHERE `booking_id` = :bid",
                    ['bid' => $bookingId]
                );
                $this->logger->debug('[MonthSliceRefresher] source not eligible, deleted slices and skipping', [
                    'bookingId' => $bookingId,
                    'source'    => $ab['source'] ?? null,
                    'deleted'   => $deleted,
                ]);
                return 0;
            }
            $status = (string)($ab['status'] ?? '');
            // Handle both spellings just in case ("Cancelled" / "Canceled")
            $isCancelled = strcasecmp($status, 'Cancelled') === 0 || strcasecmp($status, 'Canceled') === 0;

            if ($isCancelled) {
                $payout = (float)($ab['payout'] ?? 0);

                // Always clear any existing slices for this booking
                $deleted = $this->conn->executeStatement(
                    "DELETE FROM `booking_month_slice` WHERE `booking_id` = :bid",
                    ['bid' => $bookingId]
                );
                $this->logger->debug('[MonthSliceRefresher] cancelled: deleted existing slices', [
                    'bookingId' => $bookingId,
                    'deleted'   => $deleted,
                ]);

                // Scenario 1: guest cancelled and there's no payout -> no slice rows
                if ($payout <= 0.00001) {
                    return 0;
                }

                // Scenario 2: cancelled but there is a payout -> allocate **full** amounts to the check-in month
                // Compute year_month from check-in (provided as argument); we trust the passed dates
                $yearMonth = $checkIn->format('Y-m');

                $params = [
                    'bid' => $bookingId,
                    'ym'  => $yearMonth,
                ];

                $insertCancelledSql = <<<SQL
INSERT INTO `booking_month_slice` (
  `booking_id`, `unit_id`,
  `city`, `source`, `payment_method`, `guest_type`,
  `year_month`, `month_start_date`, `month_end_date`,
  `nights_total`, `nights_in_month`,
  `room_fee_in_month`, `payout_in_month`, `tax_in_month`, `net_payout_in_month`,
  `cleaning_fee_in_month`, `o2_commission_in_month`, `owner_payout_in_month`, `commission_base_in_month`
)
SELECT
  ab.`id`                                AS `booking_id`,
  ab.`unit_id`                           AS `unit_id`,
  ab.`city`                              AS `city`,
  ab.`source`                            AS `source`,
  ab.`payment_method`                    AS `payment_method`,
  ab.`guest_type`                        AS `guest_type`,
  :ym                                    AS `year_month`,
  STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')           AS `month_start_date`,
  LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')) AS `month_end_date`,
  0 AS `nights_total`,
  0 AS `nights_in_month`,
  -- Keep average per-night room fee as defined in all_bookings
  ab.`room_fee`                          AS `room_fee_in_month`,
  -- Allocate full booking-level amounts with **no proration**
  ab.`payout`                            AS `payout_in_month`,
  ab.`tax_amount`                        AS `tax_in_month`,
  (ab.`payout` - ab.`tax_amount`)        AS `net_payout_in_month`,
  0.00                                   AS `cleaning_fee_in_month`,
  ROUND(COALESCE(ab.`commission_value`, 0), 2) AS `o2_commission_in_month`,
  ROUND(COALESCE(ab.`client_income`, 0), 2)    AS `owner_payout_in_month`,
  COALESCE(ab.`commission_base`, 0)            AS `commission_base_in_month`
FROM `owners2_dashboard`.`all_bookings` ab
WHERE ab.`id` = :bid
LIMIT 1
SQL;

                $inserted = (int) $this->conn->executeStatement($insertCancelledSql, $params);
                $this->logger->debug('[MonthSliceRefresher] cancelled: inserted slice row', [
                    'bookingId' => $bookingId,
                    'yearMonth' => $yearMonth,
                    'inserted'  => $inserted,
                ]);
                return $inserted;
            }
        }

        // Derive list of year-month values between checkIn and checkOut-1
        $months = [];
        $cur = (clone $checkIn)->modify('first day of this month');
        $end = (clone $checkOut)->modify('-1 day')->modify('first day of next month');
        while ($cur < $end) {
            $months[] = $cur->format('Y-m');
            $cur = $cur->modify('+1 month');
        }

        if (empty($months)) {
            return 0;
        }

        // Build placeholders
        $placeholders = [];
        $params = ['bid' => $bookingId];
        foreach ($months as $i => $m) {
            $ph = ':m' . $i;
            $placeholders[] = $ph;
            $params['m' . $i] = $m;
        }
        $inClause = implode(',', $placeholders);

        // Build a derived table for the provided months: (SELECT :m0 AS ym UNION ALL SELECT :m1 AS ym ...)
        $monthRows = [];
        foreach (array_keys($placeholders) as $i) {
            $idx = substr($placeholders[$i], 2); // turns ':m0' -> '0'
            $monthRows[] = "SELECT :m{$idx} AS ym";
        }
        $monthsTableSql = '(' . implode(' UNION ALL ', $monthRows) . ') AS m(ym)';

        // Delete old slices
        $deleteSql = "DELETE FROM `booking_month_slice` WHERE `booking_id` = :bid AND `year_month` IN ($inClause)";
        $deleted = $this->conn->executeStatement($deleteSql, $params);
        $this->logger->debug('[MonthSliceRefresher] deleted previous month slices', [
            'bookingId' => $bookingId,
            'months'    => $months,
            'deleted'   => $deleted,
        ]);

        // Insert fresh rows
        $insertSql = <<<SQL
INSERT INTO `booking_month_slice` (
  `booking_id`, `unit_id`,
  `city`, `source`, `payment_method`, `guest_type`,
  `year_month`, `month_start_date`, `month_end_date`,
  `nights_total`, `nights_in_month`,
  `room_fee_in_month`, `payout_in_month`, `tax_in_month`, `net_payout_in_month`,
  `cleaning_fee_in_month`, `o2_commission_in_month`, `owner_payout_in_month`, `commission_base_in_month`
)
SELECT
  t.`booking_id`,
  t.`unit_id`,
  t.`city`,
  t.`source`,
  t.`payment_method`,
  t.`guest_type`,
  t.`year_month`,
  t.`month_start_date`,
  t.`month_end_date`,
  t.`nights_total`,
  t.`nights_in_month`,
  t.`room_fee_in_month`,
  t.`payout_in_month`,
  t.`tax_in_month`,
  t.`net_payout_in_month`,
  t.`cleaning_fee_in_month`,
  t.`o2_commission_in_month`,
  t.`owner_payout_in_month`,
  t.`commission_base_in_month`
FROM (
  SELECT
    ab.`id`                              AS `booking_id`,
    ab.`unit_id`                         AS `unit_id`,
    ab.`city`                            AS `city`,
    ab.`source`                          AS `source`,
    ab.`payment_method`                  AS `payment_method`,
    ab.`guest_type`                      AS `guest_type`,
    m.`ym`                               AS `year_month`,
    STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')           AS `month_start_date`,
    LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')) AS `month_end_date`,
    DATEDIFF(ab.`check_out`, ab.`check_in`)                 AS `nights_total`,
    GREATEST(
      0,
      DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )
    ) AS `nights_in_month`,

    -- room_fee is an average per night in all_bookings -> carry through to slice
    ab.`room_fee` AS `room_fee_in_month`,

    -- prorated payout by nights in month (rounded)
    ROUND((ab.`payout` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `payout_in_month`,

    -- prorated tax by nights in month (rounded)
    ROUND((ab.`tax_amount` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `tax_in_month`,

    CASE
      WHEN DAY(ab.`check_out`) = 1 THEN
        CASE
          WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = m.`ym`
            THEN COALESCE(ab.`cleaning_fee`, 0)
          ELSE 0
        END
      ELSE
        CASE
          WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = m.`ym`
            THEN COALESCE(ab.`cleaning_fee`, 0)
          ELSE 0
        END
    END AS `cleaning_fee_in_month`,

    -- net payout: directly prorate booking-level net_payout
    ROUND((ab.`net_payout` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `net_payout_in_month`,

    -- commission base: directly prorate booking-level commission_base
    ROUND((ab.`commission_base` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `commission_base_in_month`,

    -- O2 commission: directly prorate booking-level commission_value
    ROUND((ab.`commission_value` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `o2_commission_in_month`,

    -- Owner payout: directly prorate booking-level client_income
    ROUND((ab.`client_income` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `owner_payout_in_month`
  FROM `owners2_dashboard`.`all_bookings` AS ab
  JOIN {$monthsTableSql}
    ON ab.`check_in` < DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)
   AND ab.`check_out` > STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')
  WHERE ab.`id` = :bid
    AND m.`ym` IN ($inClause)
    AND GREATEST(
          0,
          DATEDIFF(
            LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
            GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
          )
        ) > 0
) AS t
SQL;

        $inserted = (int) $this->conn->executeStatement($insertSql, $params);
        $this->logger->debug('[MonthSliceRefresher] inserted month slices', [
            'bookingId' => $bookingId,
            'months'    => $months,
            'inserted'  => $inserted,
        ]);

        // Auto-create a pending hk_cleanings row for the checkout date (idempotent)
        try {
            // Pull needed booking info (unit, city, checkout, cleaning fee collected)
            $ab2 = $this->conn->fetchAssociative(
                "SELECT `unit_id`, `city`, `check_out`, `cleaning_fee` FROM `owners2_dashboard`.`all_bookings` WHERE `id` = :bid LIMIT 1",
                ['bid' => $bookingId]
            );

            if ($ab2 && !empty($ab2['check_out'])) {
                $unitId = (int) $ab2['unit_id'];
                $city = (string) $ab2['city'];
                $checkoutDate = (new \DateTimeImmutable($ab2['check_out']))->format('Y-m-d');
                $o2Collected = isset($ab2['cleaning_fee']) ? (float)$ab2['cleaning_fee'] : null;

                $cleaningCost = $this->rateResolver->resolveAmountForDateStr($unitId, $city, $checkoutDate);

                // Idempotency: avoid duplicates for (unit, date, 'checkout')
                $exists = (int) $this->conn->fetchOne(
                    "SELECT COUNT(*) FROM `hk_cleanings` WHERE `unit_id` = :uid AND `checkout_date` = :cd AND `cleaning_type` = 'checkout'",
                    ['uid' => $unitId, 'cd' => $checkoutDate]
                );

                if ($exists === 0) {
                    $this->conn->executeStatement(
                        "INSERT INTO `hk_cleanings` (`unit_id`, `city`, `checkout_date`, `cleaning_type`, `status`, `booking_id`, `o2_collected_fee`, `cleaning_cost`, `created_at`) 
                         VALUES (:uid, :city, :cd, 'checkout', 'pending', :bid, :o2col, :ccost, NOW())",
                        [
                            'uid' => $unitId,
                            'city' => $city,
                            'cd' => $checkoutDate,
                            'bid' => $bookingId,
                            'o2col' => $o2Collected,
                            'ccost' => $cleaningCost,
                        ]
                    );
                    $this->logger->info('[MonthSliceRefresher] auto-created hk_cleanings row', [
                        'bookingId' => $bookingId,
                        'unitId' => $unitId,
                        'checkoutDate' => $checkoutDate,
                        'city' => $city,
                        'o2_collected_fee' => $o2Collected,
                        'cleaning_cost' => $cleaningCost,
                    ]);
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('[MonthSliceRefresher] failed to auto-create hk_cleanings', [
                'bookingId' => $bookingId,
                'error' => $e->getMessage(),
            ]);
            // continue; do not block slice creation on housekeeping insert
        }

        return $inserted;
    }
}