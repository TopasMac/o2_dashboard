<?php

namespace App\Service;

use App\Entity\AllBookings;
use App\Entity\IcalEvent;
use App\Entity\Unit;
use App\Service\ServicesPaymentStatusService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * Centralised builder for dashboard alerts (Pagos de Servicios + Conflictos de Reservas).
 *
 * For now this focuses on reservation alerts:
 *  - unpaid private bookings (source = Private, status in {Ongoing, Past}, is_paid = 0)
 *
 * Service payment alerts (CFE / Internet / HOA / Water) can be added here later,
 * so that the frontend no longer needs to understand unit_transactions business rules.
 */
class DashboardAlertsService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ServicesPaymentStatusService $servicesPaymentStatusService,
    ) {
    }

    /**
     * Returns alert buckets for the dashboard.
     *
     * @return array{
     *     serviceAlerts: list<array<string,mixed>>,
     *     reservationAlerts: list<array<string,mixed>>
     * }
     */
    public function getAlertsForDashboard(?UserInterface $user = null): array
    {
        // Service-payment alerts (CFE / Internet / HOA / Water).
        $serviceAlerts = $this->buildServicePaymentAlerts($user);

        // Reservation-related alerts:
        //  - unpaid private bookings
        //  - iCal conflicts (date mismatch / suspected cancelled / calendar overlap)
        $reservationAlerts   = $this->buildUnpaidPrivateBookingAlerts($user);
        $icalConflictAlerts  = $this->buildIcalConflictAlerts($user);

        // Merge all reservation alerts into a single bucket; the "type" key allows the frontend
        // to distinguish between unpaid vs iCal conflict alerts.
        $reservationAlerts = array_merge($reservationAlerts, $icalConflictAlerts);

        return [
            'serviceAlerts'     => $serviceAlerts,
            'reservationAlerts' => $reservationAlerts,
        ];
    }

    /**
     * Build alerts for service payments (HOA / Internet / Water / CFE):
     *  - Overdue: payment expected, missing, and period is past or after due day in current month.
     *  - Due soon: payment expected, missing, current month, and within 3 days of deadline.
     *  - Mismatch: payment recorded but total != expected amount (currently HOA & Internet only).
     *
     * This delegates business rules to ServicesPaymentStatusService so that all monthly
     * expectations & cadences live in a single place.
     *
     * @return list<array<string,mixed>>
     */
    private function buildServicePaymentAlerts(?UserInterface $user = null): array
    {
        $alerts = [];

        /** @var \App\Repository\UnitRepository $unitRepo */
        $unitRepo = $this->em->getRepository(Unit::class);
        $units = $unitRepo->findAll();

        $today = new \DateTimeImmutable('today');
        $currentYearMonth = $today->format('Y-m');
        $prevMonth = $today->modify('first day of -1 month');
        $prevYearMonth = $prevMonth->format('Y-m');

        // We only look at previous month and current month for the dashboard
        $periods = [$prevYearMonth, $currentYearMonth];

        foreach ($units as $unit) {
            if (!$unit instanceof Unit) {
                continue;
            }

            $unitId = $unit->getId();
            $unitName = null;
            if (method_exists($unit, 'getName')) {
                $unitName = $unit->getName();
            } elseif (method_exists($unit, 'getUnitName')) {
                $unitName = $unit->getUnitName();
            } else {
                $unitName = sprintf('Unit #%d', $unitId);
            }

            $city = method_exists($unit, 'getCity') ? $unit->getCity() : null;

            foreach ($periods as $yearMonth) {
                $status = $this->servicesPaymentStatusService->getStatusForUnitYearMonth($unit, $yearMonth);

                $expected       = $status['expected'] ?? [];
                $missing        = $status['missing'] ?? [];
                $valueWarnings  = $status['valueWarnings'] ?? [];
                $paidTotals     = $status['paidTotalsThisMonth'] ?? [];
                $paidTransactionIds = $status['paidTransactionIdsThisMonth'] ?? [];

                // --- Overdue / Due soon alerts ---

                // Map service keys to metadata in $expected
                $serviceMeta = [
                    'HOA'      => [
                        'deadlineKey' => 'hoaDueDay',
                        'overdueKey'  => 'hoaOverdueThisMonth',
                    ],
                    'Internet' => [
                        'deadlineKey' => 'internetDeadline',
                        'overdueKey'  => 'internetOverdueThisMonth',
                    ],
                    'Water'    => [
                        'deadlineKey' => 'waterDeadline',
                        'overdueKey'  => 'waterOverdueThisMonth',
                    ],
                    'CFE'      => [
                        'deadlineKey' => 'cfePaymentDay',
                        'overdueKey'  => 'cfeOverdueThisMonth',
                    ],
                ];

                foreach ($serviceMeta as $svc => $meta) {
                    $isExpected = !empty($expected[$svc]);
                    if (!$isExpected) {
                        continue;
                    }

                    $deadlineKey = $meta['deadlineKey'];
                    $overdueKey  = $meta['overdueKey'];

                    $deadline    = $expected[$deadlineKey] ?? null;
                    $isOverdue   = $expected[$overdueKey] ?? false;

                    // For CFE, only consider periods where it is due this month
                    if ($svc === 'CFE') {
                        $cfeDueThisMonth = $expected['cfeDueThisMonth'] ?? null;
                        if ($cfeDueThisMonth !== true) {
                            continue;
                        }
                    }

                    $isMissing = in_array($svc, $missing, true);

                    // Overdue: expected, missing, and flagged as overdue
                    if ($isMissing && $deadline !== null && $isOverdue === true) {
                        $alerts[] = [
                            'id'         => sprintf('service-overdue-%s-%d-%s', strtolower($svc), $unitId, str_replace('-', '', $yearMonth)),
                            'type'       => 'service-payment-overdue',
                            'severity'   => 'error',
                            'service'    => $svc,
                            'unitId'     => $unitId,
                            'unitName'   => $unitName,
                            'city'       => $city,
                            'yearMonth'  => $yearMonth,
                            'deadline'   => (int) $deadline,
                            'message'    => sprintf('%s payment overdue — due date %d (%s)', $svc, (int) $deadline, $yearMonth),
                            'link'       => sprintf('/service-payments?unit=%d&period=%s', $unitId, $yearMonth),
                        ];

                        // No need to also add a "due soon" alert for the same period/service
                        continue;
                    }

                    // Due soon (only for current month, not yet overdue)
                    if (
                        $yearMonth === $currentYearMonth
                        && $isMissing
                        && $deadline !== null
                        && $isOverdue !== true
                    ) {
                        $deadlineDay = (int) $deadline;
                        $todayDay = (int) $today->format('j');
                        $daysUntil = $deadlineDay - $todayDay;

                        if ($daysUntil >= 0 && $daysUntil <= 3) {
                            $alerts[] = [
                                'id'         => sprintf('service-due-soon-%s-%d-%s', strtolower($svc), $unitId, str_replace('-', '', $yearMonth)),
                                'type'       => 'service-payment-due-soon',
                                'severity'   => 'warning',
                                'service'    => $svc,
                                'unitId'     => $unitId,
                                'unitName'   => $unitName,
                                'city'       => $city,
                                'yearMonth'  => $yearMonth,
                                'deadline'   => $deadlineDay,
                                'message'    => sprintf('%s payment due soon — due date %d (%s)', $svc, $deadlineDay, $yearMonth),
                                'link'       => sprintf('/service-payments?unit=%d&period=%s', $unitId, $yearMonth),
                            ];
                        }
                    }
                }

                // --- Expected vs paid amount mismatches (currently HOA & Internet only) ---

                foreach ($valueWarnings as $svc => $warn) {
                    // We expect valueWarnings keys to be 'HOA' or 'Internet'
                    $expectedValue = $warn['expectedValue'] ?? null;
                    $recordedValue = $warn['recordedValue'] ?? null;

                    if ($expectedValue === null || $recordedValue === null) {
                        continue;
                    }

                    $txIds = $paidTransactionIds[$svc] ?? [];
                    $primaryTxId = (count($txIds) === 1) ? $txIds[0] : null;

                    $alerts[] = [
                        'id'                   => sprintf('service-mismatch-%s-%d-%s', strtolower($svc), $unitId, str_replace('-', '', $yearMonth)),
                        'type'                 => 'service-payment-mismatch',
                        'severity'             => 'warning',
                        'service'              => $svc,
                        'unitId'               => $unitId,
                        'unitName'             => $unitName,
                        'city'                 => $city,
                        'yearMonth'            => $yearMonth,
                        'transactionIds'       => $txIds,
                        'transactionCount'     => count($txIds),
                        'primaryTransactionId' => $primaryTxId,
                        'expected'             => (float) $expectedValue,
                        'paid'                 => (float) $recordedValue,
                        'paidTotals'           => $paidTotals[$svc] ?? null,
                        'message'              => sprintf(
                            '%s payment amount mismatch — expected %.2f, recorded %.2f (%s)',
                            $svc,
                            (float) $expectedValue,
                            (float) $recordedValue,
                            $yearMonth
                        ),
                        'link'                 => sprintf('/service-payments?unit=%d&period=%s', $unitId, $yearMonth),
                    ];
                }
            }
        }

        // --- Priority sort: Overdue → Due Soon → Mismatch ---
        usort($alerts, function ($a, $b) {
            // Priority buckets
            $priority = [
                'service-payment-overdue'   => 1,
                'service-payment-due-soon'  => 2,
                'service-payment-mismatch'  => 3,
            ];

            $pa = $priority[$a['type']] ?? 99;
            $pb = $priority[$b['type']] ?? 99;
            if ($pa !== $pb) {
                return $pa <=> $pb;
            }

            // For overdue: sort from most overdue (earliest period + earliest deadline) to least
            if ($a['type'] === 'service-payment-overdue' && $b['type'] === 'service-payment-overdue') {
                $cmpPeriod = strcmp($a['yearMonth'], $b['yearMonth']);
                if ($cmpPeriod !== 0) {
                    return $cmpPeriod;
                }

                $aDeadline = $a['deadline'] ?? 31;
                $bDeadline = $b['deadline'] ?? 31;

                return $aDeadline <=> $bDeadline;
            }

            // For due soon: soonest deadline first
            if ($a['type'] === 'service-payment-due-soon' && $b['type'] === 'service-payment-due-soon') {
                return ($a['deadline'] ?? 999) <=> ($b['deadline'] ?? 999);
            }

            // For mismatches: group by yearMonth, newest first
            if ($a['type'] === 'service-payment-mismatch' && $b['type'] === 'service-payment-mismatch') {
                return strcmp($b['yearMonth'], $a['yearMonth']);
            }

            return 0;
        });

        return $alerts;
    }

    /**
     * Build alerts for unpaid private bookings:
     *  - source: Private
     *  - status: Ongoing or Past
     *  - is_paid: 0 (using isPaid / is_paid / paid flags)
     *
     * Right now this does not filter by user/area/city; that can be added later
     * once access rules for managers vs supervisors are finalised.
     *
     * @return list<array<string,mixed>>
     */
    private function buildUnpaidPrivateBookingAlerts(?UserInterface $user = null): array
    {
        /** @var \App\Repository\AllBookingsRepository $repo */
        $repo = $this->em->getRepository(AllBookings::class);

        // Fetch candidate bookings in one go; we'll do the fine-grained checks in PHP
        // so we don't depend on exact Doctrine field names for the paid flag.
        $candidates = $repo->createQueryBuilder('b')
            ->where('LOWER(b.source) = :src')
            ->andWhere('LOWER(b.status) IN (:statuses)')
            ->setParameter('src', 'private')
            ->setParameter('statuses', ['ongoing', 'past'])
            ->getQuery()
            ->getResult();

        $alerts = [];

        /** @var AllBookings $booking */
        // Extra safeguard: only treat true "Private" bookings as candidates
        foreach ($candidates as $booking) {
            if (method_exists($booking, 'getSource')) {
                $source = strtolower((string) $booking->getSource());
                if ($source !== 'private') {
                    continue;
                }
            }
            $paid = $this->resolvePaidFlag($booking);

            if ($paid) {
                continue;
            }

            // Skip bookings with no meaningful payout (0 or null) – nothing to collect.
            $payout = $booking->getPayout();
            if ($payout === null || (float) $payout === 0.0) {
                continue;
            }

            // Build fields similar to what the frontend AlertCenter expects today.
            $id = $booking->getId();
            $codeRaw = $booking->getConfirmationCode() ?: $booking->getReservationCode() ?: (string) $id;
            $codeLabel = $codeRaw ? sprintf('#%s', $codeRaw) : '';
            $unitName = $booking->getUnitName() ?: 'unit';

            $message = $codeLabel
                ? sprintf('Reservation %s — %s not paid', $codeLabel, $unitName)
                : sprintf('Reservation — %s not paid', $unitName);

            $alerts[] = [
                'id'         => sprintf('booking-unpaid-%s', $id),
                'type'       => 'booking-unpaid',
                'severity'   => 'warning',
                'bookingId'  => $id,
                'code'       => $codeRaw,
                'unitName'   => $unitName,
                'guestName'  => $booking->getGuestName(),
                'checkIn'    => $booking->getCheckIn(),
                'checkOut'   => $booking->getCheckOut(),
                'payout'     => $booking->getPayout(),
                'message'    => $message,
                'link'       => sprintf('/bookings?view=basic&focus=%s', rawurlencode((string) $id)),
            ];
        }

        // Sort unpaid alerts by earliest check‑in date
        usort($alerts, function ($a, $b) {
            $aDate = ($a['checkIn'] instanceof \DateTimeInterface)
                ? $a['checkIn']->getTimestamp()
                : PHP_INT_MAX;

            $bDate = ($b['checkIn'] instanceof \DateTimeInterface)
                ? $b['checkIn']->getTimestamp()
                : PHP_INT_MAX;

            return $aDate <=> $bDate;
        });

        return $alerts;
    }

    /**
     * Build alerts for bookings that have iCal-related conflicts:
     *  - dateSyncStatus = 'conflict'            → date mismatch between booking and iCal
     *  - dateSyncStatus = 'suspected_cancelled'→ Airbnb code not found in iCal (likely cancelled)
     *  - overlapWarning = true                  → private vs Airbnb overlap (calendar double-booked)
     *
     * This assumes BookingIcalReconcileService has been run recently to stamp these fields.
     *
     * @return list<array<string,mixed>>
     */
    private function buildIcalConflictAlerts(?UserInterface $user = null): array
    {
        /** @var \App\Repository\AllBookingsRepository $repo */
        $repo = $this->em->getRepository(AllBookings::class);

        // Only consider bookings whose stay ends from the first day of the previous month onwards
        $fromDate = (new \DateTimeImmutable('first day of -1 month'))->setTime(0, 0, 0);

        $qb = $repo->createQueryBuilder('b')
            ->orderBy('b.checkIn', 'ASC');

        // Include ongoing, upcoming, and past bookings (excluding cancelled)
        $qb
            ->andWhere('LOWER(b.status) IN (:bookingStatuses)')
            ->setParameter('bookingStatuses', ['ongoing', 'upcoming', 'past']);

        // Enforce date window: only conflicts whose stay ends from previous month onwards
        $qb
            ->andWhere('b.checkOut >= :fromDate')
            ->setParameter('fromDate', $fromDate);

        // Only bookings with relevant iCal conflict status/flags
        $qb
            ->andWhere('(b.dateSyncStatus IN (:statuses) OR b.overlapWarning = 1)')
            ->setParameter('statuses', ['conflict', 'suspected_cancelled'])
            ->setMaxResults(200);

        $candidates = $qb->getQuery()->getResult();

        /** @var \App\Repository\IcalEventRepository $icalRepo */
        $icalRepo = $this->em->getRepository(IcalEvent::class);

        $alerts = [];

        /** @var AllBookings $booking */
        foreach ($candidates as $booking) {
            $status  = method_exists($booking, 'getDateSyncStatus') ? $booking->getDateSyncStatus() : null;
            $overlap = method_exists($booking, 'getOverlapWarning') ? (bool) $booking->getOverlapWarning() : false;

            $icalEventId = method_exists($booking, 'getIcalEventId') ? $booking->getIcalEventId() : null;

            $bookingSource = method_exists($booking, 'getSource') ? $booking->getSource() : null;
            $bookingStatus = method_exists($booking, 'getStatus') ? $booking->getStatus() : null;
            $city          = method_exists($booking, 'getCity') ? $booking->getCity() : null;
            $reservationCode = method_exists($booking, 'getReservationCode') ? $booking->getReservationCode() : null;
            $lastIcalSyncAt  = method_exists($booking, 'getLastIcalSyncAt') ? $booking->getLastIcalSyncAt() : null;

            // Optional Airbnb / iCal event context
            $icalCheckIn = null;
            $icalCheckOut = null;
            $icalReservationCode = null;
            $reservationUrl = null;
            $icalIsBlock = null;
            $bookingReservationUrl = method_exists($booking, 'getBookingReservationUrl') ? $booking->getBookingReservationUrl() : null;

            if ($icalEventId) {
                $event = $icalRepo->find($icalEventId);
                if ($event instanceof IcalEvent) {
                    $icalCheckIn = $event->getDtstart();
                    $icalCheckOut = $event->getDtend();
                    if (method_exists($event, 'getReservationCode')) {
                        $icalReservationCode = $event->getReservationCode();
                    }
                    if (method_exists($event, 'getReservationUrl')) {
                        $reservationUrl = $event->getReservationUrl();
                    }
                    if (method_exists($event, 'isBlock')) {
                        $icalIsBlock = $event->isBlock();
                    }
                }
            }

            // Classify conflict type
            if ($overlap) {
                $conflictType = 'overlap';
            } elseif ($status === 'suspected_cancelled') {
                $conflictType = 'suspected_cancelled';
            } elseif ($status === 'conflict') {
                $conflictType = 'date_mismatch';
            } else {
                // Should not happen given the where clause, but be defensive.
                $conflictType = 'unknown';
            }

            $id = $booking->getId();
            $codeRaw = $booking->getConfirmationCode() ?: $booking->getReservationCode() ?: (string) $id;
            $codeLabel = $codeRaw ? sprintf('#%s', $codeRaw) : '';
            $unitName = $booking->getUnitName() ?: 'unit';

            // Build a human-readable message depending on the conflict type
            switch ($conflictType) {
                case 'overlap':
                    $reason = 'Calendar double-booked (Private + Airbnb overlap)';
                    break;
                case 'suspected_cancelled':
                    $reason = 'Airbnb reservation likely cancelled (not present in iCal)';
                    break;
                case 'date_mismatch':
                    $reason = 'Dates mismatch between booking and iCal';
                    break;
                default:
                    $reason = 'iCal conflict detected';
                    break;
            }

            $message = $codeLabel
                ? sprintf('Reservation %s — %s: %s', $codeLabel, $unitName, $reason)
                : sprintf('Reservation — %s: %s', $unitName, $reason);

            $alerts[] = [
                'id'                   => sprintf('booking-ical-conflict-%s', $id),
                'type'                 => 'booking-ical-conflict',
                'severity'             => 'error',
                'bookingId'            => $id,
                'code'                 => $codeRaw,
                'reservationCode'      => $reservationCode,
                'unitName'             => $unitName,
                'city'                 => $city,
                'guestName'            => $booking->getGuestName(),
                'bookingSource'        => $bookingSource,
                'bookingStatus'        => $bookingStatus,
                // Booking (AllBookings) dates
                'checkIn'              => $booking->getCheckIn(),
                'checkOut'             => $booking->getCheckOut(),
                'bookingCheckIn'       => $booking->getCheckIn(),
                'bookingCheckOut'      => $booking->getCheckOut(),
                // iCal (Airbnb) event dates and metadata
                'icalCheckIn'          => $icalCheckIn,
                'icalCheckOut'         => $icalCheckOut,
                'icalReservationCode'  => $icalReservationCode,
                'icalIsBlock'          => $icalIsBlock,
                'icalEventId'          => $icalEventId,
                'eventDtStart'         => $icalCheckIn,
                'eventDtEnd'           => $icalCheckOut,
                // URLs to Airbnb (booking-side and iCal-side)
                'bookingReservationUrl'=> $bookingReservationUrl,
                'reservationUrl'       => $reservationUrl,
                // Conflict metadata
                'dateSyncStatus'       => $status,
                'overlapWarning'       => $overlap,
                'conflictType'         => $conflictType,
                'lastIcalSyncAt'       => $lastIcalSyncAt,
                'message'              => $message,
                'link'                 => sprintf('/bookings-ical?unit=%s', rawurlencode((string) $booking->getUnitId())),
            ];
        }

        return $alerts;
    }

    /**
     * Try to resolve the "paid" flag from the AllBookings entity without assuming
     * a specific getter name. This mirrors the frontend logic that prefers isPaid /
     * is_paid over legacy "paid".
     */
    private function resolvePaidFlag(AllBookings $booking): bool
    {
        // Prefer explicit isPaid / getIsPaid style accessors
        if (method_exists($booking, 'getIsPaid')) {
            $value = $booking->getIsPaid();
        } elseif (method_exists($booking, 'isPaid')) {
            $value = $booking->isPaid();
        } elseif (method_exists($booking, 'getPaid')) {
            $value = $booking->getPaid();
        } else {
            // If no flag exists, be conservative and treat it as unpaid so it can be noticed.
            return false;
        }

        return (bool) $value;
    }
}