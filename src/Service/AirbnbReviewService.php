<?php

namespace App\Service;

use App\Entity\AllBookings;
use App\Entity\ReviewAction;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Service responsible for computing Airbnb review queues and stats.
 *
 * This centralizes the business logic that was previously partially implemented
 * in the frontend (AirbnbReviewsCard.jsx), so that:
 *  - we have a single source of truth for "pending / made / skipped / expired"
 *  - both the dashboard card and any future reports can reuse the same rules.
 */
class AirbnbReviewService
{
    private EntityManagerInterface $em;

    public function __construct(EntityManagerInterface $em)
    {
        $this->em = $em;
    }

    /**
     * Compute the current review queue for Airbnb reservations.
     *
     * Definition:
     *  - We consider only bookings with source = 'Airbnb'.
     *  - Window: check-outs between (today - 12 days) and (today - 1 day), inclusive.
     *    This is the "operational" window of reviews the team should be working on now.
     *  - Status resolution:
     *      * made     → there is a ReviewAction with status = 'made'
     *      * skipped  → ReviewAction status = 'skipped'
     *      * timeout  → ReviewAction status = 'timeout'
     *      * pending  → no ReviewAction row yet for this reservation
     *
     * Returns a structured array suitable to serialize as JSON:
     *
     *  [
     *      'today'  => 'YYYY-MM-DD',
     *      'window' => ['from' => 'YYYY-MM-DD', 'to' => 'YYYY-MM-DD'],
     *      'stats'  => [
     *          'totalInWindow' => int,
     *          'made'          => int,
     *          'skipped'       => int,
     *          'timeout'       => int,
     *          'pending'       => int,
     *      ],
     *      'items'  => [
     *          [
     *              'bookingId'       => int,
     *              'unitId'          => int|null,
     *              'unitName'        => string|null,
     *              'guestName'       => string|null,
     *              'checkoutDate'    => 'YYYY-MM-DD',
     *              'reviewDeadline'  => 'YYYY-MM-DD',
     *              'reservationCode' => string|null,
     *              'reservationUrl'  => string|null,
     *              'currentStatus'   => 'made'|'skipped'|'timeout'|'pending',
     *              'reviewActionId'  => int|null,
     *          ],
     *          ...
     *      ],
     *  ]
     *
     * Note: This method only computes the queue; it does NOT mutate ReviewAction.
     *       Any auto-expiry creation (e.g. marking as timeout) can be added later
     *       if needed in a separate command/service.
     */
    public function getReviewQueue(\DateTimeInterface $today): array
    {
        // Normalize "today" to a date (no time component) for consistent comparisons.
        $todayDate = (new \DateTimeImmutable($today->format('Y-m-d')))->setTime(0, 0, 0);

        // Define the operational window: 12 days ago up to yesterday.
        $fromDate = $todayDate->modify('-12 days');
        $toDate   = $todayDate->modify('-1 day');

        // Step 1: fetch Airbnb bookings with checkout in [fromDate, toDate].
        $qb = $this->em->getRepository(AllBookings::class)->createQueryBuilder('b');
        $qb
            ->where('b.source = :src')
            ->andWhere('b.status = :pastStatus')
            ->andWhere('b.checkOut >= :from')
            ->andWhere('b.checkOut <= :to')
            ->setParameter('src', 'Airbnb')
            ->setParameter('pastStatus', 'Past')
            ->setParameter('from', $fromDate->format('Y-m-d'))
            ->setParameter('to', $toDate->format('Y-m-d'))
            ->orderBy('b.checkOut', 'ASC');

        /** @var AllBookings[] $bookings */
        $bookings = $qb->getQuery()->getResult();

        if (empty($bookings)) {
            return [
                'today'  => $todayDate->format('Y-m-d'),
                'window' => [
                    'from' => $fromDate->format('Y-m-d'),
                    'to'   => $toDate->format('Y-m-d'),
                ],
                'stats'  => [
                    'totalInWindow' => 0,
                    'made'          => 0,
                    'skipped'       => 0,
                    'timeout'       => 0,
                    'pending'       => 0,
                ],
                'items'  => [],
            ];
        }

        // Collect reservation IDs for a batched ReviewAction lookup.
        $reservationIds = [];
        foreach ($bookings as $b) {
            // In your schema reservationId is typically the primary id of AllBookings.
            $reservationIds[] = $b->getId();
        }

        // Step 2: fetch ReviewAction rows for these reservations (source=Airbnb).
        $raRepo = $this->em->getRepository(ReviewAction::class);
        $raQb = $raRepo->createQueryBuilder('r');
        $raQb
            ->where('r.source = :src')
            ->andWhere('r.reservationId IN (:ids)')
            ->setParameter('src', 'Airbnb')
            ->setParameter('ids', array_unique($reservationIds));

        /** @var ReviewAction[] $reviewActions */
        $reviewActions = $raQb->getQuery()->getResult();

        // Index review actions by reservationId for quick lookup.
        $reviewByReservation = [];
        foreach ($reviewActions as $ra) {
            $reviewByReservation[$ra->getReservationId()] = $ra;
        }

        $items = [];
        $stats = [
            'totalInWindow' => 0,
            'made'          => 0,
            'skipped'       => 0,
            'timeout'       => 0,
            'pending'       => 0,
        ];

        foreach ($bookings as $b) {
            $checkout = $b->getCheckOut();
            if (!$checkout instanceof \DateTimeInterface) {
                continue;
            }

            // Ensure checkout is treated as a date-only for deadline calculations.
            $coDate = (new \DateTimeImmutable($checkout->format('Y-m-d')))->setTime(0, 0, 0);
            if ($coDate < $fromDate || $coDate > $toDate) {
                // Extra guard; should already be enforced by the query.
                continue;
            }

            $stats['totalInWindow']++;

            // Review deadline is 12 days after checkout (same as the operational window).
            $deadline = $coDate->modify('+12 days');

            $reservationId = $b->getId();
            $reviewAction  = $reviewByReservation[$reservationId] ?? null;

            $currentStatus   = 'pending';
            $reviewActionId  = null;

            if ($reviewAction instanceof ReviewAction) {
                $reviewActionId = $reviewAction->getId();
                $status         = $reviewAction->getStatus();

                if ($status === 'made') {
                    $currentStatus = 'made';
                    $stats['made']++;
                } elseif ($status === 'skipped') {
                    $currentStatus = 'skipped';
                    $stats['skipped']++;
                } elseif ($status === 'timeout') {
                    $currentStatus = 'timeout';
                    $stats['timeout']++;
                }
            } else {
                // No ReviewAction found → treat as pending in the current window.
                $currentStatus = 'pending';
                $stats['pending']++;
            }

            $items[] = [
                'bookingId'       => $reservationId,
                'unitId'          => $b->getUnitId(),
                'unitName'        => $b->getUnitName(),
                'guestName'       => $b->getGuestName(),
                'checkoutDate'    => $coDate->format('Y-m-d'),
                'reviewDeadline'  => $deadline->format('Y-m-d'),
                'reservationCode' => $b->getConfirmationCode() ?? $b->getReservationCode(),
                'reservationUrl'  => $b->getIcalEvent() ? $b->getIcalEvent()->getReservationUrl() : null,
                'currentStatus'   => $currentStatus,
                'reviewActionId'  => $reviewActionId,
            ];
        }

        // Compute month-level stats based on reviewDeadline falling in the current month.
        // "Review month" is defined as the month of (checkout + 12 days).
        $monthStart = $todayDate->modify('first day of this month');
        $monthEnd   = $todayDate->modify('last day of this month');

        // To find all bookings whose reviewDeadline falls within [monthStart, monthEnd],
        // we need all bookings with checkout in [monthStart - 12 days, monthEnd].
        $monthWindowFrom = $monthStart->modify('-12 days');
        $monthWindowTo   = $monthEnd;

        $bookingRepo = $this->em->getRepository(AllBookings::class);

        /** @var AllBookings[] $monthBookings */
        $monthBookings = $bookingRepo->createQueryBuilder('mb')
            ->where('mb.source = :srcMonth')
            ->andWhere('mb.status = :pastStatusMonth')
            ->andWhere('mb.checkOut >= :mFrom')
            ->andWhere('mb.checkOut <= :mTo')
            ->setParameter('srcMonth', 'Airbnb')
            ->setParameter('pastStatusMonth', 'Past')
            ->setParameter('mFrom', $monthWindowFrom->format('Y-m-d'))
            ->setParameter('mTo', $monthWindowTo->format('Y-m-d'))
            ->orderBy('mb.checkOut', 'ASC')
            ->getQuery()
            ->getResult();

        $monthStats = [
            'total'   => 0,
            'made'    => 0,
            'skipped' => 0,
            'timeout' => 0,
            'pending' => 0,
        ];

        if (!empty($monthBookings)) {
            // Collect reservation IDs for month window bookings.
            $monthReservationIds = [];
            foreach ($monthBookings as $mb) {
                $monthReservationIds[] = $mb->getId();
            }

            // Fetch ReviewAction rows for these reservations (source=Airbnb).
            $monthReviewActions = $raRepo->createQueryBuilder('mr')
                ->where('mr.source = :srcMonthRa')
                ->andWhere('mr.reservationId IN (:idsMonth)')
                ->setParameter('srcMonthRa', 'Airbnb')
                ->setParameter('idsMonth', array_unique($monthReservationIds))
                ->getQuery()
                ->getResult();

            $monthReviewByReservation = [];
            foreach ($monthReviewActions as $mra) {
                $monthReviewByReservation[$mra->getReservationId()] = $mra;
            }

            foreach ($monthBookings as $mb) {
                $checkout = $mb->getCheckOut();
                if (!$checkout instanceof \DateTimeInterface) {
                    continue;
                }

                $coDate = (new \DateTimeImmutable($checkout->format('Y-m-d')))->setTime(0, 0, 0);
                $deadline = $coDate->modify('+12 days');

                // Only consider bookings whose reviewDeadline actually falls inside this month.
                if ($deadline < $monthStart || $deadline > $monthEnd) {
                    continue;
                }

                $monthStats['total']++;

                $reservationId = $mb->getId();
                $mReviewAction = $monthReviewByReservation[$reservationId] ?? null;

                if ($mReviewAction instanceof ReviewAction) {
                    $status = $mReviewAction->getStatus();
                    if ($status === 'made') {
                        $monthStats['made']++;
                    } elseif ($status === 'skipped') {
                        $monthStats['skipped']++;
                    } elseif ($status === 'timeout') {
                        $monthStats['timeout']++;
                    }
                } else {
                    $monthStats['pending']++;
                }
            }
        }

        return [
            'today'  => $todayDate->format('Y-m-d'),
            'window' => [
                'from' => $fromDate->format('Y-m-d'),
                'to'   => $toDate->format('Y-m-d'),
            ],
            'stats'  => $stats,
            'month' => [
                'from'       => $monthStart->format('Y-m-d'),
                'to'         => $monthEnd->format('Y-m-d'),
                'windowFrom' => $monthWindowFrom->format('Y-m-d'),
                'windowTo'   => $monthWindowTo->format('Y-m-d'),
            ],
            'monthStats' => $monthStats,
            'items'  => $items,
        ];
    }
}
