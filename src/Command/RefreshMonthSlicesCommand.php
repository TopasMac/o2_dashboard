<?php

namespace App\Command;

use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:refresh-month-slices',
    description: 'Materialize v_booking_month_final into booking_month_slice. Default: refresh ALL months; supports per-month (YYYY-MM) and per-booking modes.'
)]
class RefreshMonthSlicesCommand extends Command
{
    public function __construct(private readonly Connection $conn)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('yearMonth', InputArgument::OPTIONAL, 'Target month in format YYYY-MM (e.g., 2025-09). Leave empty or pass ALL to refresh every available month.', 'ALL');
        $this
            ->addOption('booking', null, InputOption::VALUE_REQUIRED, 'Booking ID to refresh (per-booking mode).')
            ->addOption('months', null, InputOption::VALUE_REQUIRED, 'Comma-separated list of YYYY-MM months to refresh for the given booking.');
    }

    /**
     * Refresh slice rows for a single booking across a set of months (DELETE + INSERT .. SELECT from the view).
     * Returns number of inserted rows.
     */
    private function refreshSlicesForBookingMonths(int $bookingId, array $months): int
    {
        // Normalize & validate months
        $months = array_values(array_filter(array_map('trim', $months)));
        if (empty($months)) {
            throw new \InvalidArgumentException('Months list is empty.');
        }
        foreach ($months as $m) {
            if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $m)) {
                throw new \InvalidArgumentException("Invalid month format: $m. Expected YYYY-MM.");
            }
        }

        // --- Cancelled handling (per-booking path) ---
        $ab = $this->conn->fetchAssociative(
            "SELECT `status`, `payout`, `tax_amount`, `cleaning_fee`, `commission_percent`, `commission_value`,
                    `o2_total`, `client_income`, `room_fee`, `check_in`
             FROM `owners2_dashboard`.`all_bookings`
             WHERE `id` = :bid",
            ['bid' => $bookingId]
        );
        if ($ab) {
            $status = (string)($ab['status'] ?? '');
            $isCancelled = strcasecmp($status, 'Cancelled') === 0 || strcasecmp($status, 'Canceled') === 0;
            if ($isCancelled) {
                $payout = (float)($ab['payout'] ?? 0);

                // Build placeholders and params for DELETE
                $placeholders = [];
                $paramsDel = ['bid' => $bookingId];
                foreach ($months as $i => $m) { $paramsDel['m'.$i] = $m; $placeholders[] = ':m'.$i; }
                $in = implode(',', $placeholders);

                // Always clear existing slices for these months
                $this->conn->executeStatement(
                    "DELETE FROM `booking_month_slice` WHERE `booking_id` = :bid AND `year_month` IN ($in)",
                    $paramsDel
                );

                if ($payout <= 0.00001) {
                    // Scenario 1: cancelled with no payout -> no slices
                    return 0;
                }

                // Scenario 2: cancelled with payout -> single row in the check-in month (full amounts, no proration)
                $ymCheckin = (new \DateTimeImmutable($ab['check_in']))->format('Y-m');
                if (!in_array($ymCheckin, $months, true)) {
                    // Requested months do not include the check-in month → nothing to insert
                    return 0;
                }

                $insertParams = [
                    'bid' => $bookingId,
                    'ym'  => $ymCheckin,
                ];

        $insertSql = <<<SQL
INSERT INTO `booking_month_slice` (
  `booking_id`, `year_month`, `unit_id`,
  `city`, `source`, `payment_method`, `guest_type`,
  `month_start_date`, `month_end_date`,
  `nights_total`, `nights_in_month`,
  `room_fee_in_month`,
  `payout_in_month`, `tax_in_month`, `net_payout_in_month`, `commission_base_in_month`,
  `cleaning_fee_in_month`, `o2_commission_in_month`, `owner_payout_in_month`
)
SELECT
  ab.`id`                               AS `booking_id`,
  :ym                                   AS `year_month`,
  ab.`unit_id`                          AS `unit_id`,
  ab.`city`                             AS `city`,
  ab.`source`                           AS `source`,
  ab.`payment_method`                   AS `payment_method`,
  ab.`guest_type`                       AS `guest_type`,
  STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')            AS `month_start_date`,
  LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))  AS `month_end_date`,
  0 AS `nights_total`,
  0 AS `nights_in_month`,
  ab.`room_fee`                         AS `room_fee_in_month`,
  ab.`payout`                           AS `payout_in_month`,
  ab.`tax_amount`                       AS `tax_in_month`,
  ROUND(GREATEST(0, (ab.`payout` - ab.`tax_amount`)), 2) AS `net_payout_in_month`,
  ROUND(COALESCE(ab.`commission_base`, 0), 2) AS `commission_base_in_month`,
  0.00                                  AS `cleaning_fee_in_month`,
  ROUND(COALESCE(ab.`commission_value`, 0), 2) AS `o2_commission_in_month`,
  ROUND(COALESCE(ab.`client_income`, 0), 2) AS `owner_payout_in_month`
FROM `owners2_dashboard`.`all_bookings` ab
WHERE ab.`id` = :bid
LIMIT 1
SQL;

                return (int) $this->conn->executeStatement($insertSql, $insertParams);
            }
        }

        // Build dynamic placeholders for months
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
            $monthRows[] = "SELECT :m{$i} AS ym";
        }
        $monthsTableSql = '(' . implode(' UNION ALL ', $monthRows) . ') AS m(ym)';

        // 1) Delete existing slices for booking + months
        $deleteSql = "DELETE FROM `booking_month_slice` WHERE `booking_id` = :bid AND `year_month` IN ($inClause)";
        $this->conn->executeStatement($deleteSql, $params);

        // 2) Insert fresh rows for this booking + months using derived table version (new lean schema and proration)
        $insertSql = <<<SQL
INSERT INTO `booking_month_slice` (
  `booking_id`, `year_month`, `unit_id`,
  `city`, `source`, `payment_method`, `guest_type`,
  `month_start_date`, `month_end_date`,
  `nights_total`, `nights_in_month`,
  `room_fee_in_month`,
  `payout_in_month`, `tax_in_month`, `net_payout_in_month`, `commission_base_in_month`,
  `cleaning_fee_in_month`, `o2_commission_in_month`, `owner_payout_in_month`
)
SELECT
  t.`booking_id`,
  t.`year_month`,
  t.`unit_id`,
  t.`city`,
  t.`source`,
  t.`payment_method`,
  t.`guest_type`,
  t.`month_start_date`,
  t.`month_end_date`,
  t.`nights_total`,
  t.`nights_in_month`,
  -- room_fee is already an average per night in all_bookings; carry it unchanged
  t.`room_fee_in_month`,
  -- prorated monetary values using ratio
  t.`payout_in_month`,
  t.`tax_in_month`,
  t.`net_payout_in_month`,
  t.`commission_base_in_month`,
  -- cleaning only in checkout month
  t.`cleaning_fee_in_month`,
  -- ratio-based commission & owner payout
  t.`o2_commission_in_month`,
  t.`owner_payout_in_month` AS `owner_payout_in_month`
FROM (
  SELECT
    ab.`id` AS `booking_id`,
    m.`ym` AS `year_month`,
    ab.`unit_id` AS `unit_id`,
    ab.`city` AS `city`,
    ab.`source` AS `source`,
    ab.`payment_method` AS `payment_method`,
    ab.`guest_type` AS `guest_type`,
    STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d') AS `month_start_date`,
    LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')) AS `month_end_date`,
    DATEDIFF(ab.`check_out`, ab.`check_in`) AS `nights_total`,
    GREATEST(
      0,
      DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )
    ) AS `nights_in_month`,
    (GREATEST(
      0,
      DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )
    ) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)) AS `ratio`,

    ab.`room_fee` AS `room_fee_in_month`,
    ROUND((ab.`payout` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `payout_in_month`,
    ROUND((
      ROUND((ab.`payout` * (
        GREATEST(0, DATEDIFF(
          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
      )), 2)
      * (COALESCE(ab.`tax_percent`, 0) / 100)
    ), 2) AS `tax_in_month`,
    ROUND(
      ROUND((ab.`payout` * (
        GREATEST(0, DATEDIFF(
          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
      )), 2)
      -
      ROUND((
        ROUND((ab.`payout` * (
          GREATEST(0, DATEDIFF(
            LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
            GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
          )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
        )), 2)
        * (COALESCE(ab.`tax_percent`, 0) / 100)
      ), 2)
    , 2) AS `net_payout_in_month`,
    ROUND(
      (
        ROUND(
          ROUND((ab.`payout` * (
            GREATEST(0, DATEDIFF(
              LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
              GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
            )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
          )), 2)
          -
          ROUND((
            ROUND((ab.`payout` * (
              GREATEST(0, DATEDIFF(
                LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
              )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
            )), 2)
            * (COALESCE(ab.`tax_percent`, 0) / 100)
          ), 2)
        , 2)
      )
      -
      (CASE
        WHEN DAY(ab.`check_out`) = 1 THEN
          (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
        ELSE
          (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
      END)
    , 2) AS `commission_base_in_month`,
    (CASE
      WHEN DAY(ab.`check_out`) = 1 THEN
        (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
      ELSE
        (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
    END) AS `cleaning_fee_in_month`,
    ROUND(
      (
        ROUND(
          (
            ROUND(
              (
                ROUND(
                  ROUND((ab.`payout` * (
                    GREATEST(0, DATEDIFF(
                      LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                      GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
                    )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                  )), 2)
                  -
                  ROUND((
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    * (COALESCE(ab.`tax_percent`, 0) / 100)
                  ), 2)
                , 2)
              )
              -
              (CASE
                WHEN DAY(ab.`check_out`) = 1 THEN
                  (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                ELSE
                  (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
              END)
            , 2)
          )
          * (COALESCE(ab.`commission_percent`, 0) / 100)
        , 2)
      )
    , 2) AS `o2_commission_in_month`,
    ROUND(
      (
        ROUND(
          (
            ROUND(
              (
                ROUND(
                  ROUND((ab.`payout` * (
                    GREATEST(0, DATEDIFF(
                      LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                      GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
                    )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                  )), 2)
                  -
                  ROUND((
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    * (COALESCE(ab.`tax_percent`, 0) / 100)
                  ), 2)
                , 2)
              )
              -
              (CASE
                WHEN DAY(ab.`check_out`) = 1 THEN
                  (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                ELSE
                  (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
              END)
            , 2)
          )
        , 2)
      )
      -
      ROUND(
        (
          ROUND(
            (
              ROUND(
                (
                  ROUND(
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    -
                    ROUND((
                      ROUND((ab.`payout` * (
                        GREATEST(0, DATEDIFF(
                          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
                        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                      )), 2)
                      * (COALESCE(ab.`tax_percent`, 0) / 100)
                    ), 2)
                  , 2)
                )
                -
                (CASE
                  WHEN DAY(ab.`check_out`) = 1 THEN
                    (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                  ELSE
                    (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = m.`ym` THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                END)
              , 2)
            )
            * (COALESCE(ab.`commission_percent`, 0) / 100)
          , 2)
        )
      , 2)
    , 2) AS `owner_payout_in_month`
  FROM `owners2_dashboard`.`all_bookings` AS ab
  JOIN {$monthsTableSql}
    ON ab.`check_in` < DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)
   AND ab.`check_out` > STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')
  WHERE ab.`id` = :bid
    AND m.`ym` IN ($inClause)
    AND (GREATEST(
          0,
          DATEDIFF(
            LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
            GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(m.`ym`,'-01'), '%Y-%m-%d'))
          )
        ) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)) > 0
) AS t
SQL;

        return (int) $this->conn->executeStatement($insertSql, $params);
    }

    /**
     * Derive all months (YYYY-MM) between min(check_in) and max(check_out) in all_bookings, inclusive.
     * @return string[]
     */
    private function fetchAllMonths(): array
    {
        $row = $this->conn->fetchAssociative(
            "SELECT MIN(`check_in`) AS min_ci, MAX(`check_out`) AS max_co FROM `owners2_dashboard`.`all_bookings`"
        );
        if (!$row || empty($row['min_ci']) || empty($row['max_co'])) {
            return [];
        }

        // Normalize to first-of-month boundaries
        $start = (new \DateTimeImmutable(substr((string)$row['min_ci'], 0, 10)))->modify('first day of this month');
        $end   = (new \DateTimeImmutable(substr((string)$row['max_co'], 0, 10)))->modify('first day of next month'); // exclusive

        $months = [];
        for ($cur = $start; $cur < $end; $cur = $cur->modify('+1 month')) {
            $months[] = $cur->format('Y-m');
        }

        return $months;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $ym = (string) $input->getArgument('yearMonth');

        $bookingOpt = $input->getOption('booking');
        $monthsOpt  = $input->getOption('months');
        if ($bookingOpt !== null) {
            if ($monthsOpt === null) {
                $io->error('When using --booking, you must also supply --months=YYYY-MM,YYYY-MM');
                return Command::INVALID;
            }
            $bookingId = (int) $bookingOpt;
            if ($bookingId <= 0) {
                $io->error('Invalid --booking value; must be a positive integer.');
                return Command::INVALID;
            }
            $months = array_filter(array_map('trim', explode(',', $monthsOpt)));
            try {
                $inserted = $this->refreshSlicesForBookingMonths($bookingId, $months);
            } catch (\InvalidArgumentException $e) {
                $io->error($e->getMessage());
                return Command::INVALID;
            }
            $io->success("Per-booking refresh complete: booking #{$bookingId}, months=[" . implode(', ', $months) . "] — inserted {$inserted} row(s).");
            return Command::SUCCESS;
        }

        if ($ym === 'ALL' || $ym === '') {
            $months = $this->fetchAllMonths();
            if (empty($months)) {
                $io->warning('No months range found in all_bookings.');
                return Command::SUCCESS;
            }

            $totalAffected = 0;
            $totalCount = 0;

            $sql = <<<SQL
REPLACE INTO `booking_month_slice` (
  `booking_id`, `year_month`, `unit_id`,
  `city`, `source`, `payment_method`, `guest_type`,
  `month_start_date`, `month_end_date`,
  `nights_total`, `nights_in_month`,
  `room_fee_in_month`,
  `payout_in_month`, `tax_in_month`, `net_payout_in_month`, `commission_base_in_month`,
  `cleaning_fee_in_month`, `o2_commission_in_month`, `owner_payout_in_month`
)
SELECT
  t.`booking_id`,
  t.`year_month`,
  t.`unit_id`,
  t.`city`,
  t.`source`,
  t.`payment_method`,
  t.`guest_type`,
  t.`month_start_date`,
  t.`month_end_date`,
  t.`nights_total`,
  t.`nights_in_month`,
  t.`room_fee_in_month`,
  t.`payout_in_month`,
  t.`tax_in_month`,
  t.`net_payout_in_month`,
  t.`commission_base_in_month`,
  t.`cleaning_fee_in_month`,
  t.`o2_commission_in_month`,
  t.`owner_payout_in_month` AS `owner_payout_in_month`
FROM (
  -- (A) Non-cancelled bookings → prorated rows for any overlap with :ym
  SELECT
    ab.`id` AS `booking_id`,
    :ym AS `year_month`,
    ab.`unit_id` AS `unit_id`,
    ab.`city` AS `city`,
    ab.`source` AS `source`,
    ab.`payment_method` AS `payment_method`,
    ab.`guest_type` AS `guest_type`,
    STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d') AS `month_start_date`,
    LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')) AS `month_end_date`,
    DATEDIFF(ab.`check_out`, ab.`check_in`) AS `nights_total`,
    GREATEST(
      0,
      DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
      )
    ) AS `nights_in_month`,

    ab.`room_fee` AS `room_fee_in_month`,
    ROUND((ab.`payout` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `payout_in_month`,
    ROUND((
      ROUND((ab.`payout` * (
        GREATEST(0, DATEDIFF(
          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
      )), 2)
      * (COALESCE(ab.`tax_percent`, 0) / 100)
    ), 2) AS `tax_in_month`,
    ROUND(
      ROUND((ab.`payout` * (
        GREATEST(0, DATEDIFF(
          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
      )), 2)
      -
      ROUND((
        ROUND((ab.`payout` * (
          GREATEST(0, DATEDIFF(
            LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
            GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
          )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
        )), 2)
        * (COALESCE(ab.`tax_percent`, 0) / 100)
      ), 2)
    , 2) AS `net_payout_in_month`,
    ROUND(
      (
        ROUND(
          ROUND((ab.`payout` * (
            GREATEST(0, DATEDIFF(
              LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
              GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
            )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
          )), 2)
          -
          ROUND((
            ROUND((ab.`payout` * (
              GREATEST(0, DATEDIFF(
                LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
              )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
            )), 2)
            * (COALESCE(ab.`tax_percent`, 0) / 100)
          ), 2)
        , 2)
      )
      -
      (CASE
        WHEN DAY(ab.`check_out`) = 1 THEN
          (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
        ELSE
          (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
      END)
    , 2) AS `commission_base_in_month`,

    (CASE
      WHEN DAY(ab.`check_out`) = 1 THEN
        (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
      ELSE
        (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
    END) AS `cleaning_fee_in_month`,

    ROUND(
      (
        ROUND(
          (
            ROUND(
              (
                ROUND(
                  ROUND((ab.`payout` * (
                    GREATEST(0, DATEDIFF(
                      LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                      GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                    )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                  )), 2)
                  -
                  ROUND((
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    * (COALESCE(ab.`tax_percent`, 0) / 100)
                  ), 2)
                , 2)
              )
              -
              (CASE
                WHEN DAY(ab.`check_out`) = 1 THEN
                  (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                ELSE
                  (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
              END)
            , 2)
          )
          * (COALESCE(ab.`commission_percent`, 0) / 100)
        , 2)
      )
    , 2) AS `o2_commission_in_month`,
    ROUND(
      (
        ROUND(
          (
            ROUND(
              (
                ROUND(
                  ROUND((ab.`payout` * (
                    GREATEST(0, DATEDIFF(
                      LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                      GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                    )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                  )), 2)
                  -
                  ROUND((
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    * (COALESCE(ab.`tax_percent`, 0) / 100)
                  ), 2)
                , 2)
              )
              -
              (CASE
                WHEN DAY(ab.`check_out`) = 1 THEN
                  (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                ELSE
                  (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
              END)
            , 2)
          )
        , 2)
      )
      -
      ROUND(
        (
          ROUND(
            (
              ROUND(
                (
                  ROUND(
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    -
                    ROUND((
                      ROUND((ab.`payout` * (
                        GREATEST(0, DATEDIFF(
                          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                      )), 2)
                      * (COALESCE(ab.`tax_percent`, 0) / 100)
                    ), 2)
                  , 2)
                )
                -
                (CASE
                  WHEN DAY(ab.`check_out`) = 1 THEN
                    (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                  ELSE
                    (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                END)
              , 2)
            )
            * (COALESCE(ab.`commission_percent`, 0) / 100)
          , 2)
        )
      , 2)
    , 2) AS `owner_payout_in_month`

  FROM `owners2_dashboard`.`all_bookings` AS ab
  WHERE (LOWER(ab.`status`) NOT IN ('cancelled','canceled') OR ab.`status` IS NULL)
    AND ab.`check_in` < DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)
    AND ab.`check_out` > STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')
    AND GREATEST(
          0,
          DATEDIFF(
            LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
            GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
          )
        ) > 0

  UNION ALL

  -- (B) Cancelled with payout > 0 → single full-amount row in check-in month only
  SELECT
    ab.`id` AS `booking_id`,
    :ym AS `year_month`,
    ab.`unit_id` AS `unit_id`,
    ab.`city` AS `city`,
    ab.`source` AS `source`,
    ab.`payment_method` AS `payment_method`,
    ab.`guest_type` AS `guest_type`,
    STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d') AS `month_start_date`,
    LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')) AS `month_end_date`,
    0 AS `nights_total`,
    0 AS `nights_in_month`,
    ab.`room_fee` AS `room_fee_in_month`,
    ab.`payout` AS `payout_in_month`,
    ab.`tax_amount` AS `tax_in_month`,
    ROUND(GREATEST(0, (ab.`payout` - ab.`tax_amount`)), 2) AS `net_payout_in_month`,
    ROUND(COALESCE(ab.`commission_base`, 0), 2) AS `commission_base_in_month`,
    0.00 AS `cleaning_fee_in_month`,
    ROUND(COALESCE(ab.`commission_value`, 0), 2) AS `o2_commission_in_month`,
    ROUND(COALESCE(ab.`client_income`, 0), 2) AS `owner_payout_in_month`
  FROM `owners2_dashboard`.`all_bookings` AS ab
  WHERE LOWER(ab.`status`) IN ('cancelled','canceled')
    AND COALESCE(ab.`payout`, 0) > 0
    AND DATE_FORMAT(ab.`check_in`, '%Y-%m') = :ym
) AS t
SQL;

            foreach ($months as $m) {
                $this->conn->executeStatement("DELETE FROM `booking_month_slice` WHERE `year_month` = :ym", ['ym' => $m]);
                $affected = $this->conn->executeStatement($sql, ['ym' => $m]);
                $count = (int) $this->conn->fetchOne(
                    "SELECT COUNT(*) FROM `booking_month_slice` WHERE `year_month` = :ym",
                    ['ym' => $m]
                );
                $totalAffected += $affected;
                $totalCount += $count;
            }

            $io->success(sprintf(
                "Loaded a total of %d row(s) across %d month(s) (%s to %s). Now have %d row(s) in booking_month_slice for these months.",
                $totalAffected,
                count($months),
                $months[0],
                $months[count($months) - 1],
                $totalCount
            ));

            return Command::SUCCESS;
        }

        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) {
            $io->error("Invalid yearMonth: '$ym'. Expected format YYYY-MM.");
            return Command::INVALID;
        }

        // Optional: ensure unique index exists (MySQL doesn't support IF NOT EXISTS for CREATE INDEX)
        $exists = (int) $this->conn->fetchOne("
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'booking_month_slice'
              AND INDEX_NAME = 'uniq_booking_month'
        ");
        if ($exists === 0) {
            $this->conn->executeStatement("
                ALTER TABLE `booking_month_slice`
                ADD UNIQUE INDEX `uniq_booking_month` (`booking_id`, `year_month`)
            ");
        }

        $sql = <<<SQL
REPLACE INTO `booking_month_slice` (
  `booking_id`, `year_month`, `unit_id`,
  `city`, `source`, `payment_method`, `guest_type`,
  `month_start_date`, `month_end_date`,
  `nights_total`, `nights_in_month`,
  `room_fee_in_month`,
  `payout_in_month`, `tax_in_month`, `net_payout_in_month`, `commission_base_in_month`,
  `cleaning_fee_in_month`, `o2_commission_in_month`, `owner_payout_in_month`
)
SELECT
  t.`booking_id`,
  t.`year_month`,
  t.`unit_id`,
  t.`city`,
  t.`source`,
  t.`payment_method`,
  t.`guest_type`,
  t.`month_start_date`,
  t.`month_end_date`,
  t.`nights_total`,
  t.`nights_in_month`,
  t.`room_fee_in_month`,
  t.`payout_in_month`,
  t.`tax_in_month`,
  t.`net_payout_in_month`,
  t.`commission_base_in_month`,
  t.`cleaning_fee_in_month`,
  t.`o2_commission_in_month`,
  t.`owner_payout_in_month` AS `owner_payout_in_month`
FROM (
  -- (A) Non-cancelled bookings → prorated rows for any overlap with :ym
  SELECT
    ab.`id` AS `booking_id`,
    :ym AS `year_month`,
    ab.`unit_id` AS `unit_id`,
    ab.`city` AS `city`,
    ab.`source` AS `source`,
    ab.`payment_method` AS `payment_method`,
    ab.`guest_type` AS `guest_type`,
    STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d') AS `month_start_date`,
    LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')) AS `month_end_date`,
    DATEDIFF(ab.`check_out`, ab.`check_in`) AS `nights_total`,
    GREATEST(
      0,
      DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
      )
    ) AS `nights_in_month`,

    ab.`room_fee` AS `room_fee_in_month`,
    ROUND((ab.`payout` * (
      GREATEST(0, DATEDIFF(
        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
    )), 2) AS `payout_in_month`,
    ROUND((
      ROUND((ab.`payout` * (
        GREATEST(0, DATEDIFF(
          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
      )), 2)
      * (COALESCE(ab.`tax_percent`, 0) / 100)
    ), 2) AS `tax_in_month`,
    ROUND(
      ROUND((ab.`payout` * (
        GREATEST(0, DATEDIFF(
          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
      )), 2)
      -
      ROUND((
        ROUND((ab.`payout` * (
          GREATEST(0, DATEDIFF(
            LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
            GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
          )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
        )), 2)
        * (COALESCE(ab.`tax_percent`, 0) / 100)
      ), 2)
    , 2) AS `net_payout_in_month`,
    ROUND(
      (
        ROUND(
          ROUND((ab.`payout` * (
            GREATEST(0, DATEDIFF(
              LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
              GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
            )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
          )), 2)
          -
          ROUND((
            ROUND((ab.`payout` * (
              GREATEST(0, DATEDIFF(
                LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
              )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
            )), 2)
            * (COALESCE(ab.`tax_percent`, 0) / 100)
          ), 2)
        , 2)
      )
      -
      (CASE
        WHEN DAY(ab.`check_out`) = 1 THEN
          (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
        ELSE
          (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
      END)
    , 2) AS `commission_base_in_month`,
    (CASE
      WHEN DAY(ab.`check_out`) = 1 THEN
        (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
      ELSE
        (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
    END) AS `cleaning_fee_in_month`,
    ROUND(
      (
        ROUND(
          (
            ROUND(
              (
                ROUND(
                  ROUND((ab.`payout` * (
                    GREATEST(0, DATEDIFF(
                      LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                      GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                    )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                  )), 2)
                  -
                  ROUND((
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    * (COALESCE(ab.`tax_percent`, 0) / 100)
                  ), 2)
                , 2)
              )
              -
              (CASE
                WHEN DAY(ab.`check_out`) = 1 THEN
                  (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                ELSE
                  (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
              END)
            , 2)
          )
          * (COALESCE(ab.`commission_percent`, 0) / 100)
        , 2)
      )
    , 2) AS `o2_commission_in_month`,
    ROUND(
      (
        ROUND(
          (
            ROUND(
              (
                ROUND(
                  ROUND((ab.`payout` * (
                    GREATEST(0, DATEDIFF(
                      LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                      GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                    )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                  )), 2)
                  -
                  ROUND((
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    * (COALESCE(ab.`tax_percent`, 0) / 100)
                  ), 2)
                , 2)
              )
              -
              (CASE
                WHEN DAY(ab.`check_out`) = 1 THEN
                  (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                ELSE
                  (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
              END)
            , 2)
          )
        , 2)
      )
      -
      ROUND(
        (
          ROUND(
            (
              ROUND(
                (
                  ROUND(
                    ROUND((ab.`payout` * (
                      GREATEST(0, DATEDIFF(
                        LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                        GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                      )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                    )), 2)
                    -
                    ROUND((
                      ROUND((ab.`payout` * (
                        GREATEST(0, DATEDIFF(
                          LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
                          GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
                        )) / NULLIF(DATEDIFF(ab.`check_out`, ab.`check_in`), 0)
                      )), 2)
                      * (COALESCE(ab.`tax_percent`, 0) / 100)
                    ), 2)
                  , 2)
                )
                -
                (CASE
                  WHEN DAY(ab.`check_out`) = 1 THEN
                    (CASE WHEN DATE_FORMAT(DATE_SUB(ab.`check_out`, INTERVAL 1 DAY), '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                  ELSE
                    (CASE WHEN DATE_FORMAT(ab.`check_out`, '%Y-%m') = :ym THEN COALESCE(ab.`cleaning_fee`, 0) ELSE 0 END)
                END)
              , 2)
            )
            * (COALESCE(ab.`commission_percent`, 0) / 100)
          , 2)
        )
      , 2)
    , 2) AS `owner_payout_in_month`
  FROM `owners2_dashboard`.`all_bookings` AS ab
  WHERE (LOWER(ab.`status`) NOT IN ('cancelled','canceled') OR ab.`status` IS NULL)
    AND ab.`check_in` < DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)
    AND ab.`check_out` > STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')
    AND GREATEST(
          0,
          DATEDIFF(
            LEAST(ab.`check_out`, DATE_ADD(LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')), INTERVAL 1 DAY)),
            GREATEST(ab.`check_in`, STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d'))
          )
        ) > 0

  UNION ALL

  -- (B) Cancelled with payout > 0 → single full-amount row in check-in month only
  SELECT
    ab.`id` AS `booking_id`,
    :ym AS `year_month`,
    ab.`unit_id` AS `unit_id`,
    ab.`city` AS `city`,
    ab.`source` AS `source`,
    ab.`payment_method` AS `payment_method`,
    ab.`guest_type` AS `guest_type`,
    STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d') AS `month_start_date`,
    LAST_DAY(STR_TO_DATE(CONCAT(:ym,'-01'), '%Y-%m-%d')) AS `month_end_date`,
    0 AS `nights_total`,
    0 AS `nights_in_month`,
    ab.`room_fee` AS `room_fee_in_month`,
    ab.`payout` AS `payout_in_month`,
    ab.`tax_amount` AS `tax_in_month`,
    ROUND(GREATEST(0, (ab.`payout` - ab.`tax_amount`)), 2) AS `net_payout_in_month`,
    ROUND(COALESCE(ab.`commission_base`, 0), 2) AS `commission_base_in_month`,
    0.00 AS `cleaning_fee_in_month`,
    ROUND(COALESCE(ab.`commission_value`, 0), 2) AS `o2_commission_in_month`,
    ROUND(COALESCE(ab.`client_income`, 0), 2) AS `owner_payout_in_month`
  FROM `owners2_dashboard`.`all_bookings` AS ab
  WHERE LOWER(ab.`status`) IN ('cancelled','canceled')
    AND COALESCE(ab.`payout`, 0) > 0
    AND DATE_FORMAT(ab.`check_in`, '%Y-%m') = :ym
) AS t
SQL;

        $this->conn->executeStatement("DELETE FROM `booking_month_slice` WHERE `year_month` = :ym", ['ym' => $ym]);
        $affected = $this->conn->executeStatement($sql, ['ym' => $ym]);

        // Optional: count rows now present for that month (helps confirm)
        $count = (int) $this->conn->fetchOne(
            "SELECT COUNT(*) FROM `booking_month_slice` WHERE `year_month` = :ym",
            ['ym' => $ym]
        );

        $io->success("Loaded {$affected} row(s). Now have {$count} row(s) for {$ym} in booking_month_slice.");
        return Command::SUCCESS;
    }
}