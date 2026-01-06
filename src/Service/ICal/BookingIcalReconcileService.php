<?php

namespace App\Service\ICal;

use App\Entity\AllBookings;
use App\Entity\IcalEvent;
use App\Repository\IcalEventRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Non-destructive reconciler between Owners2 bookings and iCal events.
 *
 * It DOES NOT change booking dates. It only links the matched iCal event,
 * stamps the last sync time, and labels the record as 'matched' or 'conflict'.
 *
 * Matching order:
 *   1) reservation_code (best)
 *   2) (unit_id, overlapping date range) as a fallback
 */
class BookingIcalReconcileService
{
    public function __construct(
        private EntityManagerInterface $em,
        private IcalEventRepository $icalRepo,
    ) {}

    /**
     * Reconcile bookings with iCal events.
     *
     * @param int|null $unitId   If provided, limits to one unit.
     * @param \DateTimeInterface|null $from  Optional start date filter (bookings with checkout >= $from)
     * @param \DateTimeInterface|null $to    Optional end date filter (bookings with checkin <= $to)
     * @param bool $flush Whether to flush DB changes (link + status + last sync timestamp)
     * @return array{processed:int, matched:int, conflicts:int, linked:int, items:array}
     */
    public function reconcile(?int $unitId = null, ?\DateTimeInterface $from = null, ?\DateTimeInterface $to = null, bool $flush = true): array
    {
        $now = new \DateTimeImmutable();
        $gracePastCutoff = $now->modify('-2 days'); // do not suspect-cancelled if checkout is older than this

        // Track if $from was provided by the caller
        $userProvidedFrom = ($from !== null);

        // --- Clamp the lower bound to avoid false "suspected cancelled" due to Airbnb ICS dropping older past events ---
        // Base clamp: today - 60 days
        $baseClamp = (new \DateTimeImmutable('today'))
            ->modify('-60 days')
            ->setTime(0, 0, 0);

        // Earliest ICS dtstart (global or for the specific unit)
        $earliestIcs = $this->getEarliestIcsStart($unitId); // may be null if table empty
        if ($earliestIcs && $earliestIcs > $baseClamp) {
            $baseClamp = $earliestIcs;
        }

        // Default window: from the first day of the previous month if not provided
        if ($from === null) {
            $from = (new \DateTimeImmutable('first day of -1 month'))->setTime(0, 0, 0);
        }
        // Only clamp the lower bound if the caller did NOT provide `$from`.
        // This avoids shrinking explicit ranges (e.g., future windows in 2025) which would otherwise yield 0 processed.
        if (!$userProvidedFrom && $from < $baseClamp) {
            $from = $baseClamp;
        }
        // Keep $to as provided (null = open-ended into the future)

        // Load candidate bookings: we keep this simple and filter in-PHP to avoid coupling to repo specifics.
        $bookings = $this->findCandidateBookings($unitId, $from, $to);

        $items = [];
        $matched = 0;
        $conflicts = 0;
        $linked = 0;
        $suspectedCancelled = 0;

        foreach ($bookings as $b) {
            $unitIdVal = $this->getUnitId($b);
            if (!$unitIdVal) { continue; }

            $code = $this->getReservationCode($b);
            $checkIn  = $this->getBookingCheckIn($b);   // ?DateTimeInterface
            $checkOut = $this->getBookingCheckOut($b);  // ?DateTimeInterface

            // Booking confirmation code (may be non-HM for private bookings)
            $bookingConf = method_exists($b, 'getConfirmationCode') ? $b->getConfirmationCode() : null;
            $bookingHm   = ($bookingConf && preg_match('/^HM[0-9A-Z]{7,}$/', $bookingConf)) ? $bookingConf : null;

            // Canonical HM: prefer explicit reservation_code; otherwise use confirmation_code if it looks like HM…
            $canonicalHm = $code ?: $bookingHm;

            // Define bookingReservationUrl based on canonicalHm
            $bookingReservationUrl = $canonicalHm ? ('https://www.airbnb.com/hosting/reservations/details/' . $canonicalHm) : null;

            $source = $this->safeGet($b, 'getSource');

            // For diagnostics
            $matchMethod = 'none'; // 'code' | 'overlap' | 'none'
            $warnings    = [];
            $usedOverlap = false;
            $suppressDateSummary = false;

            $overCount = null;
            $overSample = [];

            // Diagnostics for private-vs-Airbnb overlap (double-booking warning)
            $overlapWarning = false;
            $overlapDetails = [];

            // Skip if booking has no dates
            if (!$checkIn || !$checkOut) { continue; }

            // 0) Prefer an existing linked iCal event if it still overlaps and belongs to the same unit
            $event = null;
            $prelinked = null;
            $prelinkedId = null;
            try {
                if (method_exists($b, 'getIcalEvent') && ($prelinked = $b->getIcalEvent())) {
                    $event = $prelinked;
                    $matchMethod = 'linked';
                } elseif (method_exists($b, 'getIcalEventId') && ($prelinkedId = $b->getIcalEventId())) {
                    $tmp = $this->icalRepo->find($prelinkedId);
                    if ($tmp instanceof IcalEvent) {
                        $event = $tmp;
                        $matchMethod = 'linked';
                    }
                }
                if ($event) {
                    // validate overlap and unit
                    $overlaps = false;
                    $sameUnit = true;
                    try {
                        $overlaps = ($event->getDtstart() < $checkOut) && ($event->getDtend() > $checkIn);
                    } catch (\Throwable $t) {
                        $overlaps = false;
                    }
                    try {
                        $evUnit = method_exists($event, 'getUnit') ? $event->getUnit() : null;
                        if ($evUnit && method_exists($evUnit, 'getId')) {
                            $sameUnit = ((int) $evUnit->getId() === (int) $unitIdVal);
                        }
                    } catch (\Throwable $t) {
                        $sameUnit = true; // be permissive if unit cannot be read
                    }
                    if (!$overlaps || !$sameUnit) {
                        // discard the prelinked event; continue with normal matching
                        $event = null;
                        $matchMethod = 'none';
                    }
                }
            } catch (\Throwable $t) {
                // ignore linking errors and continue with normal flow
                $event = null;
                $matchMethod = 'none';
            }

            // 1) Try to match by canonical HM (reservation_code or HM-like confirmation_code)
            if ($canonicalHm && !$event) {
                $event = $this->findEventByReservationCode($unitIdVal, $canonicalHm);
            }

            // 2) Fallback: overlap by date range (with heuristics)
            // IMPORTANT: if this booking has a canonical Airbnb HM code, we DO NOT fallback to overlap —
            // if the HM is not present in ICS it is probably cancelled or outside the ICS window.
            $adjacentOk = false;
            if (!$event) {
                $allowOverlap = !$this->looksLikeHm($canonicalHm); // only private/O2 can overlap-match
                if ($allowOverlap) {
                    $qb = $this->icalRepo->createQueryBuilder('e')
                        ->andWhere('IDENTITY(e.unit) = :u')->setParameter('u', $unitIdVal);

                    // Overlap window: any event that intersects the booking range
                    // e.dtstart <= :to AND e.dtend >= :from
                    $qb->andWhere('e.dtstart <= :to')
                        ->andWhere('e.dtend >= :from')
                        ->setParameter('from', $checkIn)
                        ->setParameter('to', $checkOut);

                    $over = $qb->getQuery()->getResult();

                    // Only consider Owners2/private style blocks for overlap matching
                    $over = array_values(array_filter($over, function ($ev) {
                        $etRaw = method_exists($ev, 'getEventType') ? $ev->getEventType() : null;
                        $et = is_string($etRaw) ? strtolower($etRaw) : null;
                        $isBlockFlag = method_exists($ev, 'isBlock') ? (bool) $ev->isBlock() : (method_exists($ev, 'getIsBlock') ? (bool) $ev->getIsBlock() : false);
                        $rc = method_exists($ev, 'getReservationCode') ? $ev->getReservationCode() : null;
                        $uid = method_exists($ev, 'getUid') ? $ev->getUid() : null;

                        $isBlockyType = in_array($et, ['block','blocked','owner_block','owner-block','maintenance','busy','o2_private','o2-private'], true);
                        $looksO2     = (is_string($rc) && str_starts_with($rc, 'O2')) || (is_string($uid) && str_starts_with($uid, 'o2-'));

                        return $isBlockFlag || $isBlockyType || $looksO2;
                    }));

                    // Diagnostics: capture overlap candidates
                    $overCount = is_array($over) ? count($over) : 0;
                    if ($overCount > 0) {
                        foreach (array_slice($over, 0, 3) as $cand) {
                            $overSample[] = [
                                'id' => $cand->getId(),
                                's'  => $cand->getDtstart()?->format('Y-m-d'),
                                'e'  => $cand->getDtend()?->format('Y-m-d'),
                            ];
                        }
                    }

                    // Fallback: if strict overlap returned none, try relaxed (DATE()-based) search
                    if ($overCount === 0 && method_exists($this->icalRepo, 'findOverlappingByUnitAndRangeRelaxed')) {
                        $over = $this->icalRepo->findOverlappingByUnitAndRangeRelaxed($unitIdVal, $checkIn, $checkOut);
                        // Only consider Owners2/private style blocks for overlap matching (relaxed)
                        $over = array_values(array_filter($over, function ($ev) {
                            $etRaw = method_exists($ev, 'getEventType') ? $ev->getEventType() : null;
                            $et = is_string($etRaw) ? strtolower($etRaw) : null;
                            $isBlockFlag = method_exists($ev, 'isBlock') ? (bool) $ev->isBlock() : (method_exists($ev, 'getIsBlock') ? (bool) $ev->getIsBlock() : false);
                            $rc = method_exists($ev, 'getReservationCode') ? $ev->getReservationCode() : null;
                            $uid = method_exists($ev, 'getUid') ? $ev->getUid() : null;

                            $isBlockyType = in_array($et, ['block','blocked','owner_block','owner-block','maintenance','busy','o2_private','o2-private'], true);
                            $looksO2     = (is_string($rc) && str_starts_with($rc, 'O2')) || (is_string($uid) && str_starts_with($uid, 'o2-'));

                            return $isBlockFlag || $isBlockyType || $looksO2;
                        }));
                        // Recompute diagnostics for relaxed results
                        $overCount = is_array($over) ? count($over) : 0;
                        if ($overCount > 0) {
                            $overSample = [];
                            foreach (array_slice($over, 0, 3) as $cand) {
                                $overSample[] = [
                                    'id' => $cand->getId(),
                                    's'  => $cand->getDtstart()?->format('Y-m-d'),
                                    'e'  => $cand->getDtend()?->format('Y-m-d'),
                                ];
                            }
                        }
                    }

                    // Use heuristic chooser for private/O2 only
                    [$picked, $adjacentOk] = $this->pickBestOverlapHeuristic(
                        $over,
                        $checkIn,
                        $checkOut,
                        $code ?: $bookingConf
                    );

                    if ($picked) {
                        $event = $picked;
                        $usedOverlap = true;
                    }
                }
            }

            // 2b) If we picked an overlap but there exists an exact code match by canonical HM, override to the exact code match.
            if ($usedOverlap && $canonicalHm) {
                $exact = $this->findEventByReservationCode($unitIdVal, $canonicalHm);
                if ($exact && $event && $exact->getId() !== $event->getId()) {
                    $event = $exact; // prefer exact code match over an arbitrary overlap
                    $usedOverlap = false;
                }
            }

            // Unified handoff flag: true if Airbnb checkout == private check-in OR private checkout == Airbnb check-in
            $handoffOk = false;
            if ($event) {
                try {
                    $handoffOk = $this->isAdjacentHandoff($checkIn, $event) || $this->isReverseAdjacentHandoff($checkOut, $event);
                } catch (\Throwable $t) {
                    $handoffOk = false;
                }
            }

            if ($event) {
                $linked += $this->linkIfChanged($b, $event);
                // Persist link and optional audit metadata when matched by overlap
                if ($usedOverlap) {
                    if (method_exists($b, 'setLastUpdatedAt')) {
                        $b->setLastUpdatedAt($now);
                    }
                    if (method_exists($b, 'setLastUpdatedVia')) {
                        $b->setLastUpdatedVia('ical-reconcile');
                    }
                }

                // Compare dates.
                // Airbnb ICS can represent DTEND as either the checkout date (VALUE=DATE, exclusive)
                // or midnight boundary. Accept equality against either DTEND or (DTEND - 1 day) to avoid false conflicts.
                $sameIn = $this->sameDate($checkIn, $event->getDtstart());
                // End-date match depends on source: Airbnb (HM...) uses tolerant DTEND logic; private/O2 is exact.
                if ($this->looksLikeHm($canonicalHm) || ($source === 'Airbnb')) {
                    $sameOut = $this->airbnbCheckoutMatches($checkOut, $event->getDtend());
                } else {
                    $sameOut = $event?->getDtend() ? $this->sameDate($checkOut, $event->getDtend()) : false;
                }

                // --- Private booking adjacent to an Airbnb event (handoff) ---
                // If this is a private/O2 booking (non-HM code) and the overlapped
                // event is an Airbnb HM event, and they are merely adjacent
                // (Airbnb DTEND == private check-in OR private checkout == Airbnb DTSTART),
                // treat this as a matched handoff and suppress date-diff summaries.
                // This avoids false conflicts like: 02-11 → 01-11, 01-12 → 02-11
                // when Airbnb night ends exactly the day private stay begins (or vice-versa).
                $eventRc = $event->getReservationCode();
                if ((!$sameIn || !$sameOut)
                    && !$this->looksLikeHm($canonicalHm) // booking is NOT Airbnb (i.e., private/O2)
                    && ($eventRc && $this->looksLikeHm($eventRc)) // event IS an Airbnb HM
                    && $handoffOk === true
                ) {
                    $this->setDateSyncStatus($b, 'matched');
                    $matched++;
                    $suppressDateSummary = true; // do not show iCal changed … lines for handoffs
                    // Also neutralize diffs so the lower logic won't add lines.
                    $diffIn = false;
                    $diffOut = false;
                }

                // Precedence: if Airbnb booking HM code differs from iCal event HM code…
                $eventRc = $event->getReservationCode();
                if (($source === 'Airbnb') && $canonicalHm && $eventRc && ($canonicalHm !== $eventRc)) {
                    // If this is an adjacent handoff (Airbnb checkout = private check-in), do NOT flag as suspected cancelled.
                    // Treat as matched/conflict solely based on dates.
                    if ($handoffOk === true) {
                        // Treat adjacent Airbnb↔Private handoffs as matched and suppress noisy summaries
                        $this->setDateSyncStatus($b, 'matched');
                        $matched++;
                        $suppressDateSummary = true; // do not add date-change lines for adjacency handoffs
                    } else {
                        // Only suspect-cancelled if checkout is not far in the past
                        if ($checkOut >= $gracePastCutoff) {
                            $this->setDateSyncStatus($b, 'suspected_cancelled');
                            // Show ONLY the cancellation hint line for this case
                            $summary = ['Airbnb: booking code ' . $canonicalHm . ' not present in iCal; overlapping event shows ' . $eventRc . ' — likely cancelled.'];
                            $suspectedCancelled++;
                            $suppressDateSummary = true; // do not append date-change lines below
                        } else {
                            // Old past stay: fall back to date comparison without suspected flag
                            if (!$sameIn || !$sameOut) {
                                $this->setDateSyncStatus($b, 'conflict');
                                $conflicts++;
                            } else {
                                $this->setDateSyncStatus($b, 'matched');
                                $matched++;
                            }
                        }
                    }
                } elseif ((!$sameIn || !$sameOut) && !(!$this->looksLikeHm($canonicalHm) && isset($eventRc) && $this->looksLikeHm($eventRc) && $handoffOk === true)) {
                    // Dates differ → conflict
                    $this->setDateSyncStatus($b, 'conflict');
                    $conflicts++;
                    // Detection only: do NOT stamp lastUpdated* here. That happens on apply.
                } else {
                    // Perfect match
                    $this->setDateSyncStatus($b, 'matched');
                    $matched++;
                }

                // Proposed dates from iCal (if linked)
                $proposedIn  = $event?->getDtstart();
                $proposedOut = $event?->getDtend();

                // Diff flags
                $diffIn  = $event ? !$sameIn : false;
                $diffOut = $event ? !$sameOut : false;

                // Human summaries (append date diffs unless suppressed by HM mismatch rule)
                $summary = $summary ?? [];
                if ($event && !$suppressDateSummary) {
                    if ($diffIn && $proposedIn) {
                        $summary[] = 'iCal changed check-in → ' . $proposedIn->format('Y-m-d');
                    }
                    if ($diffOut && $proposedOut) {
                        $summary[] = 'iCal changed check-out → ' . $proposedOut->format('Y-m-d');
                    }
                }

                // If we have an event now, drop any stale 'not found in iCal' message from previous runs
                if (!empty($summary) && $event) {
                    $summary = array_values(array_filter($summary, function ($line) {
                        return stripos($line, 'not found in iCal') === false;
                    }));
                }

                // Determine how we matched and warn on Airbnb HM mismatches
                $eventRc = $event->getReservationCode();
                if ($canonicalHm && $eventRc && $eventRc === $canonicalHm) {
                    $matchMethod = 'code';
                } elseif ($usedOverlap) {
                    $matchMethod = 'overlap';
                    if ($eventRc && !$handoffOk) {
                        if (!$canonicalHm) {
                            $warnings[] = 'Airbnb: event has HM code ' . $eventRc . ' but booking has no HM code';
                        } elseif ($canonicalHm !== $eventRc) {
                            $warnings[] = 'Airbnb: event HM code ' . $eventRc . ' ≠ booking HM code ' . $canonicalHm;
                        }
                    }
                }
            } else {
                // If no event, define variables to avoid undefined variable errors
                $proposedIn = null;
                $proposedOut = null;
                $diffIn = false;
                $diffOut = false;
                $summary = [];
                $matchMethod = 'none';
                $warnings = [];
                // $bookingReservationUrl is already defined above using $canonicalHm
                if (($source === 'Airbnb') && $bookingHm) {
                    if ($checkOut >= $gracePastCutoff) {
                        $this->setDateSyncStatus($b, 'suspected_cancelled');
                        $summary[] = 'Airbnb: booking code ' . $bookingHm . ' not found in iCal — likely cancelled.';
                        $suspectedCancelled++;
                    } else {
                        // Do not mark long past stays as suspected; treat as matched by default
                        $this->setDateSyncStatus($b, 'matched');
                        $matched++;
                    }
                }
            }

            // Private booking vs Airbnb reservation overlap detection (calendar double-booking)
            if ($source === 'Private') {
                try {
                    $aqb = $this->icalRepo->createQueryBuilder('ae')
                        ->andWhere('IDENTITY(ae.unit) = :u')->setParameter('u', $unitIdVal)
                        ->andWhere('LOWER(ae.eventType) = :et')->setParameter('et', 'reservation')
                        ->andWhere('ae.dtstart < :co')
                        ->andWhere('ae.dtend > :ci')
                        ->setParameter('ci', $checkIn)
                        ->setParameter('co', $checkOut);

                    $airbnbOver = $aqb->getQuery()->getResult();

                    // Filter to Airbnb-like HM codes and drop any already-linked event
                    $airbnbOver = array_values(array_filter($airbnbOver, function ($ev) use ($event) {
                        if (!($ev instanceof IcalEvent)) {
                            return false;
                        }
                        $rc = method_exists($ev, 'getReservationCode') ? $ev->getReservationCode() : null;
                        if (!$rc || !$this->looksLikeHm($rc)) {
                            return false;
                        }
                        if ($event && method_exists($ev, 'getId') && method_exists($event, 'getId')) {
                            if ($ev->getId() === $event->getId()) {
                                return false;
                            }
                        }
                        return true;
                    }));

                    if (count($airbnbOver) > 0) {
                        $overlapWarning = true;

                        // Persist flag on booking entity if supported
                        if (method_exists($b, 'setOverlapWarning')) {
                            $b->setOverlapWarning(true);
                        }

                        foreach (array_slice($airbnbOver, 0, 3) as $ev) {
                            $overlapDetails[] = [
                                'id' => $ev->getId(),
                                'reservationCode' => $ev->getReservationCode(),
                                'start' => $ev->getDtstart()?->format('Y-m-d'),
                                'end' => $ev->getDtend()?->format('Y-m-d'),
                            ];
                        }

                        // Add human summary line for UI
                        $primary = $airbnbOver[0];
                        $rc = $primary->getReservationCode();
                        $label = $rc ?: ('event #' . $primary->getId());
                        $summary[] = sprintf(
                            'Calendar double-booked: overlaps Airbnb reservation %s (%s → %s).',
                            $label,
                            $primary->getDtstart()?->format('Y-m-d'),
                            $primary->getDtend()?->format('Y-m-d')
                        );
                    } else {
                        if (method_exists($b, 'setOverlapWarning')) {
                            $b->setOverlapWarning(false);
                        }
                    }
                } catch (\Throwable $t) {
                    // Fail-safe: do not break reconcile if overlap detection fails
                }
            }

            // Stamp last sync
            $this->setLastIcalSyncAt($b, $now);

            $items[] = [
                'bookingId'        => $this->getId($b),
                'unitId'           => $unitIdVal,
                'reservationCode'  => $code,
                'confirmationCode' => $bookingConf,

                // Baseline booking dates
                'checkIn'          => $checkIn?->format('Y-m-d'),
                'checkOut'         => $checkOut?->format('Y-m-d'),

                // Linked iCal event
                'linkedEventId'    => $event?->getId(),
                'eventDtStart'     => $event?->getDtstart()?->format('Y-m-d'),
                'eventDtEnd'       => $event?->getDtend()?->format('Y-m-d'),

                // Proposed dates (from iCal) and diffs
                'proposedCheckIn'  => $proposedIn?->format('Y-m-d'),
                'proposedCheckOut' => $proposedOut?->format('Y-m-d'),
                'diffs'            => [
                    'checkIn'  => $diffIn,
                    'checkOut' => $diffOut,
                ],

                // Status + human summary
                'status'           => $this->getDateSyncStatus($b),
                'summary'          => $summary,
                'matchMethod'      => $matchMethod,
                'warnings'         => $warnings,

                // Diagnostics for overlap candidates
                'overlapCount'     => $overCount,
                'overlapCandidates'=> $overSample,
                // Diagnostics for private-vs-Airbnb overlap (double-booking warning)
                'overlapWarning'    => $overlapWarning,
                'overlapDetails'    => $overlapDetails,

                // Additional fields
                'unitName'         => $this->safeGet($b, 'getUnitName'),
                'city'             => $this->safeGet($b, 'getCity'),
                'guestName'        => $this->safeGet($b, 'getGuestName'),
                'payout'           => $this->firstNonNull(
                    $this->safeGet($b, 'getPayout'),
                    $this->safeGet($b, 'getTotalPayout'),
                    $this->safeGet($b, 'getOwnerPayout'),
                    $this->safeGet($b, 'getAmount')
                ),
                'source'           => $this->safeGet($b, 'getSource'),
                'icalEventId'      => $event?->getId(),
                'reservationUrl'   => $event?->getReservationUrl(),
                'bookingReservationUrl' => $bookingReservationUrl,
                'dateSyncStatus'   => $this->getDateSyncStatus($b),
                'lastIcalSyncAt'   => method_exists($b, 'getLastIcalSyncAt') ? ($b->getLastIcalSyncAt()?->format('Y-m-d H:i:s')) : null,
                'fingerprint'      => $this->makeFingerprint($b, $event),
            ];
        }

        if ($flush) {
            $this->em->flush();
        }

        return [
            'processed' => count($bookings),
            'matched' => $matched,
            'conflicts' => $conflicts,
            'suspected_cancelled' => $suspectedCancelled,
            'linked' => $linked,
            'items' => $items,
        ];
    }

    // --------------------------- helpers --------------------------- //

    /**
     * Build a stable fingerprint for a booking + (optional) linked iCal event.
     * This allows the frontend to acknowledge ("Checked") a specific reconcile outcome safely.
     * It intentionally includes booking id/codes/dates/status and event uid/dates.
     */
    private function makeFingerprint(AllBookings $b, ?IcalEvent $e): string
    {
        $bookingId   = $this->getId($b) ?? 0;
        $resCode     = $this->getReservationCode($b) ?? '';
        $confCode    = method_exists($b, 'getConfirmationCode') ? ((string) ($b->getConfirmationCode() ?? '')) : '';
        $status      = $this->getDateSyncStatus($b) ?? '';
        $in          = $this->getBookingCheckIn($b)?->format('Y-m-d') ?? '';
        $out         = $this->getBookingCheckOut($b)?->format('Y-m-d') ?? '';

        $eventUid    = $e?->getUid() ?? '';
        $eventStart  = $e?->getDtstart()?->format('Y-m-d') ?? '';
        $eventEnd    = $e?->getDtend()?->format('Y-m-d') ?? '';
        $eventCode   = $e?->getReservationCode() ?? '';

        $parts = implode('|', [
            'bid='.$bookingId,
            'rc='.$resCode,
            'cc='.$confCode,
            'st='.$status,
            'in='.$in,
            'out='.$out,
            'euid='.$eventUid,
            'es='.$eventStart,
            'ee='.$eventEnd,
            'erc='.$eventCode,
        ]);
        // SHA-256 to minimize collision risk but remain deterministic
        return hash('sha256', $parts);
    }

    /**
     * Find an event by reservation code for a unit.
     * Only matches Airbnb reservations (event_type = 'reservation').
     */
    private function findEventByReservationCode(int $unitId, string $reservationCode): ?IcalEvent
    {
        return $this->icalRepo->createQueryBuilder('e')
            ->andWhere('IDENTITY(e.unit) = :u')->setParameter('u', $unitId)
            ->andWhere('e.reservationCode = :rc')->setParameter('rc', $reservationCode)
            ->andWhere('LOWER(e.eventType) = :et')->setParameter('et', 'reservation')
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /**
     * Choose the best event from overlapping list: prefer exact date match.
     * @param IcalEvent[] $events
     */
    private function pickBestOverlap(array $events, \DateTimeInterface $in, \DateTimeInterface $out): ?IcalEvent
    {
        foreach ($events as $ev) {
            if ($this->sameDate($ev->getDtstart(), $in) && $this->sameDate($ev->getDtend(), $out)) {
                return $ev;
            }
        }
        return $events[0] ?? null;
    }

    /** Is Owners2 private code (O2M...) */
    private function isO2Code(?string $code): bool
    {
        return is_string($code) && str_starts_with($code, 'O2M');
    }

    /** Adjacent handoff if event.dtend equals booking check-in (iCal DTEND is exclusive). */
    private function isAdjacentHandoff(\DateTimeInterface $bookingCheckIn, IcalEvent $ev): bool
    {
        $evEnd = $ev->getDtend();
        return $evEnd !== null && $evEnd->format('Y-m-d') === $bookingCheckIn->format('Y-m-d');
    }

    /** Adjacent handoff if booking checkout equals event start (reverse direction). */
    private function isReverseAdjacentHandoff(\DateTimeInterface $bookingCheckOut, IcalEvent $ev): bool
    {
        $evStart = $ev->getDtstart();
        return $evStart !== null && $evStart->format('Y-m-d') === $bookingCheckOut->format('Y-m-d');
    }

    /**
     * Pick best overlap with heuristics:
     *  - Prefer exact date match.
     *  - If booking is O2M, prefer O2M/blocked events.
     *  - If none, allow adjacent handoff (DTEND == booking check-in).
     * Returns [IcalEvent|null, bool $adjacentOk]
     */
    private function pickBestOverlapHeuristic(array $events, \DateTimeInterface $in, \DateTimeInterface $out, ?string $bookingCode): array
    {
        // 1) Exact date match (end-date match depends on bookingCode: HM (Airbnb) uses tolerant DTEND logic; private/O2 is exact)
        foreach ($events as $ev) {
            $endMatches = $this->looksLikeHm($bookingCode)
                ? $this->airbnbCheckoutMatches($out, $ev->getDtend())
                : $this->sameDate($ev->getDtend(), $out);
            if ($this->sameDate($ev->getDtstart(), $in) && $endMatches) {
                return [$ev, false];
            }
        }

        // 2) If O2 private booking, try to prefer O2M events or blocked events
        if ($this->isO2Code($bookingCode)) {
            foreach ($events as $ev) {
                $rc = method_exists($ev, 'getReservationCode') ? $ev->getReservationCode() : null;
                $et = method_exists($ev, 'getEventType') ? $ev->getEventType() : null;
                if ($this->isO2Code($rc) || ($et && strtolower((string)$et) === 'blocked')) {
                    return [$ev, false];
                }
            }
        }

        // 3) Adjacent handoff (Airbnb stay ends exactly when private starts)
        foreach ($events as $ev) {
            if ($this->isAdjacentHandoff($in, $ev)) {
                return [$ev, true];
            }
        }
        // 3b) Reverse adjacent handoff (private stay ends exactly when Airbnb starts)
        foreach ($events as $ev) {
            if ($this->isReverseAdjacentHandoff($out, $ev)) {
                return [$ev, true];
            }
        }

        // 4) Fallback: choose the candidate with the largest overlap window with the booking
        $best = null; $bestOverlap = -1;
        foreach ($events as $ev) {
            $s = $ev->getDtstart();
            $e = $ev->getDtend();
            if (!$s || !$e) { continue; }
            $ovStart = $s > $in ? $s : $in;   // max(s, in)
            $ovEnd   = $e < $out ? $e : $out; // min(e, out)
            if ($ovEnd > $ovStart) {
                $days = (int) $ovEnd->diff($ovStart)->days;
                if ($days > $bestOverlap) {
                    $bestOverlap = $days;
                    $best = $ev;
                }
            }
        }
        return [$best ?? ($events[0] ?? null), false];
    }

    /** HM-like codes identify Airbnb. For others (private/O2), we treat checkout == DTEND exactly. */
    private function looksLikeHm(?string $code): bool
    {
        return is_string($code) && preg_match('/^HM[0-9A-Z]{7,}$/', $code) === 1;
    }

    /** Link event if different; returns 1 if changed, else 0. */
    private function linkIfChanged(AllBookings $b, IcalEvent $e): int
    {
        if (method_exists($b, 'getIcalEvent') && method_exists($b, 'setIcalEvent')) {
            $current = $b->getIcalEvent();
            if ($current?->getId() !== $e->getId()) {
                $b->setIcalEvent($e);
                return 1;
            }
        }
        return 0;
    }

    private function setDateSyncStatus(AllBookings $b, string $status): void
    {
        if (method_exists($b, 'setDateSyncStatus')) {
            $b->setDateSyncStatus($status);
        }
    }

    private function getDateSyncStatus(AllBookings $b): ?string
    {
        return method_exists($b, 'getDateSyncStatus') ? $b->getDateSyncStatus() : null;
    }

    private function setLastIcalSyncAt(AllBookings $b, \DateTimeImmutable $now): void
    {
        if (method_exists($b, 'setLastIcalSyncAt')) {
            $b->setLastIcalSyncAt($now);
        }
    }

    private function sameDate(\DateTimeInterface $a, \DateTimeInterface $b): bool
    {
        return $a->format('Y-m-d') === $b->format('Y-m-d');
    }

    /**
     * For Airbnb ICS, treat DTEND as matching if booking checkout equals DTEND (VALUE=DATE exclusive)
     * or equals (DTEND - 1 day) to account for different exporter semantics.
     */
    private function airbnbCheckoutMatches(\DateTimeInterface $bookingCheckOut, ?\DateTimeInterface $icsDtend): bool
    {
        if ($icsDtend === null) {
            return false;
        }
        $co = $bookingCheckOut->format('Y-m-d');
        $dt = $icsDtend->format('Y-m-d');
        // Clone and subtract one day safely
        try {
            $dtMinus1 = (clone $icsDtend)->modify('-1 day')->format('Y-m-d');
        } catch (\Throwable $t) {
            $dtMinus1 = $dt; // fallback, will still compare equal if same
        }
        return ($co === $dt) || ($co === $dtMinus1);
    }

    private function getId(AllBookings $b): ?int
    {
        return method_exists($b, 'getId') ? $b->getId() : null;
    }

    private function getUnitId(AllBookings $b): ?int
    {
        return method_exists($b, 'getUnitId') ? $b->getUnitId() : null;
    }

    private function getReservationCode(AllBookings $b): ?string
    {
        if (method_exists($b, 'getReservationCode')) {
            $rc = $b->getReservationCode();
            if ($rc) return $rc;
        }
        // Optional: some setups use confirmationCode to store HM code, try fallback
        if (method_exists($b, 'getConfirmationCode')) {
            $cc = $b->getConfirmationCode();
            if ($cc && preg_match('/^HM[0-9A-Z]{7,}$/', $cc)) {
                return $cc;
            }
        }
        return null;
    }

    /** @return AllBookings[] */
    private function findCandidateBookings(?int $unitId, ?\DateTimeInterface $from, ?\DateTimeInterface $to): array
    {
        // Generic DQL to avoid coupling to a custom repository for now
        $qb = $this->em->createQueryBuilder()
            ->select('b')
            ->from(AllBookings::class, 'b');

        if ($unitId !== null) {
            $qb->andWhere('b.unitId = :u')->setParameter('u', $unitId);
        }

        // Try common field names for dates. We keep broader set for flexibility.
        // Expect at least methods on the entity to retrieve them.
        // We’ll filter by date in PHP since field names may vary.

        $result = $qb->getQuery()->getResult();

        // PHP-side date filtering to stay schema-agnostic
        if ($from || $to) {
            $result = array_filter($result, function (AllBookings $b) use ($from, $to) {
                $in  = $this->getBookingCheckIn($b);
                $out = $this->getBookingCheckOut($b);
                if (!$in || !$out) return false;
                if ($from && $out < $from) return false;   // ends before window
                if ($to && $in > $to) return false;        // starts after window
                return true;
            });
        }

        // Exclude cancelled / expired bookings
        $result = array_filter($result, function (AllBookings $b) {
            if (method_exists($b, 'getStatus')) {
                $status = $b->getStatus();
                $s = $status ? strtolower((string) $status) : '';
                if ($s === 'cancelled' || $s === 'expired') {
                    return false;
                }
            }
            return true;
        });

        return array_values($result);
    }

    private function getBookingCheckIn(AllBookings $b): ?\DateTimeInterface
    {
        if (method_exists($b, 'getCheckIn')) return $b->getCheckIn();
        if (method_exists($b, 'getCheckin')) return $b->getCheckin();
        if (method_exists($b, 'getStartDate')) return $b->getStartDate();
        return null;
    }

    private function getBookingCheckOut(AllBookings $b): ?\DateTimeInterface
    {
        if (method_exists($b, 'getCheckOut')) return $b->getCheckOut();
        if (method_exists($b, 'getCheckout')) return $b->getCheckout();
        if (method_exists($b, 'getEndDate')) return $b->getEndDate();
        return null;
    }

    private function safeGet(object $obj, string $method): mixed
    {
        return method_exists($obj, $method) ? $obj->$method() : null;
    }

    private function firstNonNull(mixed ...$vals): mixed
    {
        foreach ($vals as $v) {
            if ($v !== null) return $v;
        }
        return null;
    }

    /**
     * Get the earliest dtstart present in ical_events (optionally per unit).
     */
    private function getEarliestIcsStart(?int $unitId): ?\DateTimeImmutable
    {
        $qb = $this->icalRepo->createQueryBuilder('e')
            ->select('MIN(e.dtstart) as mindt');
        if ($unitId !== null) {
            $qb->andWhere('IDENTITY(e.unit) = :u')->setParameter('u', $unitId);
        }
        $row = $qb->getQuery()->getSingleScalarResult();
        if (!$row) {
            return null;
        }
        try {
            return (new \DateTimeImmutable($row))->setTime(0, 0, 0);
        } catch (\Throwable $e) {
            return null;
        }
    }
}