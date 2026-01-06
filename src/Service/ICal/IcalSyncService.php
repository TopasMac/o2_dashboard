<?php

namespace App\Service\ICal;

use App\Entity\IcalEvent;
use App\Entity\Unit;
use App\Repository\IcalEventRepository;
use Doctrine\ORM\EntityManagerInterface;
use Sabre\VObject\Reader;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Fetches and parses Airbnb iCal feeds per Unit and upserts into ical_events.
 */
class IcalSyncService
{
    public function __construct(
        private EntityManagerInterface $em,
        private IcalEventRepository $repo,
        private HttpClientInterface $http,
    ) {}

    /**
     * Sync a single unit using its airbnb_ical URL.
     *
     * @return array{ok:bool, count?:int, reason?:string, unchanged?:bool}
     */
    public function syncUnit(Unit $unit): array
    {
        $runStartedAt = new \DateTimeImmutable(); // mark start to detect stale events
        $url = method_exists($unit, 'getAirbnbIcal') ? $unit->getAirbnbIcal() : null;
        if (!$url) {
            return ['ok' => false, 'reason' => 'no_url'];
        }

        // Fetch ICS (ETag/If-Modified-Since can be added later if stored on Unit)
        $resp = $this->http->request('GET', $url, [
            'timeout' => 20,
        ]);

        if ($resp->getStatusCode() === 304) {
            return ['ok' => true, 'unchanged' => true];
        }

        $ics = $resp->getContent();
        if (!$ics) {
            return ['ok' => false, 'reason' => 'empty_body'];
        }

        $vcal = Reader::read($ics);
        $eventsIter = $vcal->select('VEVENT');
        $events = \is_iterable($eventsIter) ? iterator_to_array($eventsIter) : [];
        if (count($events) === 0) {
            return ['ok' => false, 'reason' => 'no_vevents'];
        }
        // Compute min and max date range from the feed
        $minDt = null;
        $maxDt = null;
        foreach ($events as $ve) {
            $ds = $this->toDateTimeImmutable($ve->DTSTART);
            $de = $this->toDateTimeImmutable($ve->DTEND);
            if ($minDt === null || $ds < $minDt) { $minDt = $ds; }
            if ($maxDt === null || $de > $maxDt) { $maxDt = $de; }
        }
        // Delete events for this unit within the min/max range
        if ($minDt && $maxDt) {
            $conn = $this->em->getConnection();
            $conn->executeQuery(
                'DELETE FROM ical_events 
                 WHERE unit_id = :uid 
                   AND dtstart >= :min 
                   AND dtend   <= :max',
                [
                    'uid' => $unit->getId(),
                    'min' => $minDt->format('Y-m-d H:i:s'),
                    'max' => $maxDt->format('Y-m-d H:i:s'),
                ]
            );
        }
        $now = new \DateTimeImmutable();
        $createdOrUpdated = 0;
        $seen = 0;


        // Mark-pass: touch all events seen in this sync via lastSeenAt=now
        foreach ($events as $vevent) {
            $uid = isset($vevent->UID) ? (string)$vevent->UID : null;

            $dtstart = $this->toDateTimeImmutable($vevent->DTSTART);
            $dtend   = $this->toDateTimeImmutable($vevent->DTEND);

            // Airbnb convention: DTEND is exclusive → checkout date
            $summary = isset($vevent->SUMMARY) ? (string)$vevent->SUMMARY : null;
            $desc    = isset($vevent->DESCRIPTION) ? (string)$vevent->DESCRIPTION : null;
            $status  = isset($vevent->STATUS) ? (string)$vevent->STATUS : null;

            // Extract Reservation URL and Code (supports escaped URLs and HM in UID)
            [$reservationUrl, $reservationCode] = $this->extractReservationData($uid, $desc, $summary);

            // Use normalized text for classification as well
            $normSummary = $this->normalizeIcsText($summary ?? '');
            $normDesc    = $this->normalizeIcsText($desc ?? '');
            [$eventType, $isBlock] = $this->classifyEventType($normSummary, $normDesc, (bool)$reservationCode);

            $event = $uid ? $this->repo->findOneByUnitAndUid($unit->getId(), $uid) : null;
            if (!$event) {
                $event = new IcalEvent();
                $event->setUnit($unit);
                $event->setCreatedAt($now);
            }

            $event->setUid($uid);
            $event->setDtstart($dtstart);
            $event->setDtend($dtend);
            $event->setSummary($summary);
            $event->setDescription($desc);
            $event->setStatus($status);
            if (method_exists($event, 'setEventType')) {
                $event->setEventType($eventType);
            }
            if (method_exists($event, 'setIsBlock')) {
                $event->setIsBlock($isBlock);
            }
            if ($reservationUrl && method_exists($event, 'setReservationUrl')) {
                $event->setReservationUrl($reservationUrl);
            }
            if ($reservationCode && method_exists($event, 'setReservationCode')) {
                $event->setReservationCode($reservationCode);
            }
            $event->setLastSeenAt($now);
            $event->setUpdatedAt($now);

            $this->em->persist($event);
            $createdOrUpdated++;
            $seen++;
        }

        // --- Import Owners2 Private Blocks feed (explicit GET & parse) ---
        if (method_exists($unit, 'getIcalExportToken')) {
            $token = (string) $unit->getIcalExportToken();
            if ($token !== '') {
                $o2Url = 'https://dashboard.owners2.com/ical/export/unit/'
                    . rawurlencode((string)$unit->getId())
                    . '.ics?token=' . rawurlencode($token);
                try {
                    $resp2 = $this->http->request('GET', $o2Url, [ 'timeout' => 20 ]);
                    if ($resp2->getStatusCode() === 200) {
                        $ics2 = $resp2->getContent();
                        if ($ics2) {
                            $vcal2 = Reader::read($ics2);
                            $events2 = $vcal2->select('VEVENT');
                            if (\is_iterable($events2)) {
                                foreach ($events2 as $vevent2) {
                                    $uid2 = isset($vevent2->UID) ? (string)$vevent2->UID : null;
                                    $dtstart2 = $this->toDateTimeImmutable($vevent2->DTSTART);
                                    $dtend2   = $this->toDateTimeImmutable($vevent2->DTEND);
                                    $summary2 = isset($vevent2->SUMMARY) ? (string)$vevent2->SUMMARY : null;
                                    $desc2    = isset($vevent2->DESCRIPTION) ? (string)$vevent2->DESCRIPTION : null;
                                    $status2  = isset($vevent2->STATUS) ? (string)$vevent2->STATUS : null;

                                    // Extract Owners2 X-properties when present
                                    $unitX      = isset($vevent2->{'X-OWNERS2-UNIT-ID'}) ? (string)$vevent2->{'X-OWNERS2-UNIT-ID'} : null;
                                    $bookingX   = isset($vevent2->{'X-OWNERS2-BOOKING-ID'}) ? (string)$vevent2->{'X-OWNERS2-BOOKING-ID'} : null;
                                    $bookingCodeX = isset($vevent2->{'X-OWNERS2-BOOKING-CODE'}) ? (string)$vevent2->{'X-OWNERS2-BOOKING-CODE'} : null;

                                    // Decide type: reservation if we have a confirmation code (preferred) or a booking id; else block
                                    $hasBooking = ($bookingCodeX !== null && $bookingCodeX !== '') || ($bookingX !== null && $bookingX !== '');

                                    // Reservation code: prefer Owners2 confirmation code header; else try to parse an O2… code from text
                                    $reservationCode2 = null;
                                    if ($bookingCodeX !== null && $bookingCodeX !== '') {
                                        $reservationCode2 = trim((string)$bookingCodeX);
                                    } else {
                                        $norm2 = $this->normalizeIcsText(($summary2 ?? '') . ' ' . ($desc2 ?? ''));
                                        if (preg_match('/\bO2[A-Z0-9]{6,}\b/i', $norm2, $mO2)) {
                                            $reservationCode2 = strtoupper($mO2[0]);
                                        }
                                    }

                                    $finalSummary = $hasBooking ? 'O2 Reservation' : 'O2 Block';
                                    $finalIsBlock = !$hasBooking; // reservations are not blocks
                                    $finalEventType = $hasBooking ? 'reservation' : 'block';

                                    $event2 = $uid2 ? $this->repo->findOneByUnitAndUid($unit->getId(), $uid2) : null;
                                    if (!$event2) {
                                        $event2 = new IcalEvent();
                                        $event2->setUnit($unit);
                                        $event2->setCreatedAt($now);
                                    }

                                    $event2->setUid($uid2);
                                    $event2->setDtstart($dtstart2);
                                    $event2->setDtend($dtend2);
                                    // Force our normalized mapping for O2 feed
                                    $event2->setSummary($finalSummary);
                                    $event2->setDescription(null);
                                    if (method_exists($event2, 'setStatus')) { $event2->setStatus(null); }
                                    if (method_exists($event2, 'setEventType')) { $event2->setEventType($finalEventType); }
                                    if (method_exists($event2, 'setIsBlock')) { $event2->setIsBlock($finalIsBlock); }
                                    if (method_exists($event2, 'setReservationUrl')) { $event2->setReservationUrl(null); }
                                    if ($reservationCode2 && method_exists($event2, 'setReservationCode')) { $event2->setReservationCode($reservationCode2); }
                                    $event2->setLastSeenAt($now);
                                    $event2->setUpdatedAt($now);

                                    $this->em->persist($event2);
                                    $createdOrUpdated++;
                                    $seen++;
                                }
                            }
                        }
                    }

                    if (property_exists($this, 'logger') && $this->logger) {
                        $this->logger->info('Synced Owners2 Private ICS', [
                            'unit' => method_exists($unit, 'getId') ? $unit->getId() : null,
                            'url'  => $o2Url,
                        ]);
                    }
                } catch (\Throwable $e) {
                    if (property_exists($this, 'logger') && $this->logger) {
                        $this->logger->warning('Owners2 Private ICS sync failed', [
                            'unit' => method_exists($unit, 'getId') ? $unit->getId() : null,
                            'url'  => $o2Url,
                            'error'=> $e->getMessage(),
                        ]);
                    }
                }
            }
        }

        // Cleanup-pass: remove future BLOCK events for this unit that were NOT seen in this run.
        // Rationale: Airbnb ICS drops removed manual blocks. We keep historical past events,
        // but for availability we must clear future "block" events that didn't appear in the latest feed.
        try {
            $today = new \DateTimeImmutable('today');
            $qb = $this->em->createQueryBuilder();
            $qb->delete(IcalEvent::class, 'e')
               ->where('e.unit = :unit')
               ->andWhere('(LOWER(COALESCE(e.eventType, \'\')) = :block OR COALESCE(e.isBlock, 0) <> 0)')
               ->andWhere('e.dtend >= :today')
               // Not seen in this run (their lastSeenAt predates the run start, or is NULL)
               ->andWhere('(e.lastSeenAt IS NULL OR e.lastSeenAt < :seenCutoff)')
               ->setParameter('unit', $unit)
               ->setParameter('block', 'block')
               ->setParameter('today', $today)
               ->setParameter('seenCutoff', $runStartedAt);
            $deleted = $qb->getQuery()->execute();
        } catch (\Throwable $e) {
            // Swallow cleanup errors; sync result should still be ok
            $deleted = 0;
        }

        // Cleanup-pass: remove future RESERVATION events for this unit that were NOT seen in this run.
        // Rationale: Airbnb ICS removes cancelled reservations from its feed. We want to drop stale
        // future reservation events so that downstream reconciliation can detect missing iCal reservations
        // (e.g. as suspected cancellations) instead of treating them as still matched.
        $deletedReservations = 0;
        try {
            $todayRes = new \DateTimeImmutable('today');
            $qbRes = $this->em->createQueryBuilder();
            $qbRes->delete(IcalEvent::class, 'e')
                  ->where('e.unit = :unit')
                  // Reservations only (non-block)
                  ->andWhere('LOWER(COALESCE(e.eventType, \'\')) = :reservation')
                  ->andWhere('COALESCE(e.isBlock, 0) = 0')
                  // Only future (or ongoing) reservations
                  ->andWhere('e.dtend >= :today')
                  // Not seen in this run (their lastSeenAt predates the run start, or is NULL)
                  ->andWhere('(e.lastSeenAt IS NULL OR e.lastSeenAt < :seenCutoff)')
                  // Only reservation-coded events (avoid touching O2-only historical items)
                  ->andWhere('e.reservationCode IS NOT NULL')
                  ->andWhere('e.reservationCode NOT LIKE :o2Prefix')
                  ->setParameter('unit', $unit)
                  ->setParameter('reservation', 'reservation')
                  ->setParameter('today', $todayRes)
                  ->setParameter('seenCutoff', $runStartedAt)
                  ->setParameter('o2Prefix', 'O2%');

            $deletedReservations = $qbRes->getQuery()->execute();
        } catch (\Throwable $e) {
            // Swallow cleanup errors; sync result should still be ok
            $deletedReservations = 0;
        }

        $this->em->flush();

        return [
            'ok' => true,
            'count' => $createdOrUpdated,
            'deleted' => $deleted ?? 0,
            'deletedReservations' => $deletedReservations ?? 0,
        ];
    }

    /**
     * Normalize Sabre VObject date/time to immutable. Handles DATE or DATE-TIME.
     */
    private function toDateTimeImmutable($vobjectDate): \DateTimeImmutable
    {
        // Sabre returns DateTimeInterface via getDateTime(); preserve TZ if provided.
        if (is_object($vobjectDate) && method_exists($vobjectDate, 'getDateTime')) {
            $dt = $vobjectDate->getDateTime();
            if ($dt instanceof \DateTimeImmutable) {
                return $dt;
            }
            // Convert mutable to immutable
            return \DateTimeImmutable::createFromMutable($dt);
        }
        // Fallback from string
        return new \DateTimeImmutable((string)$vobjectDate);
    }

    /**
     * Unescape common ICS escapes and flatten whitespace so regex can see URLs/codes.
     */
    private function normalizeIcsText(?string $text): string
    {
        if ($text === null) {
            return '';
        }
        // Replace ICS escapes for comma, semicolon, backslash, and (defensively) colon.
        $t = str_replace(
            ['\\,', '\\;', '\\\\', '\\:'],
            [',',  ';',  '\\',  ':'],
            $text
        );
        // Collapse CRLF/CR/LF and literal "\n" into spaces
        $t = str_replace(["\r\n", "\n", "\r"], ' ', $t);
        $t = str_replace(['\\n', '\\N'], ' ', $t);
        // Collapse multiple spaces
        $t = preg_replace('/\s+/', ' ', $t) ?? $t;
        return trim($t);
    }

    /**
     * Extracts Airbnb reservation URL and reservation code (e.g., HM94CZQCEJ)
     * from DESCRIPTION and/or SUMMARY text, with fallbacks (including UID).
     * Returns array [reservationUrl|null, reservationCode|null].
     */
    private function extractReservationData(?string $uid, ?string $description, ?string $summary): array
    {
        $desc = $this->normalizeIcsText($description ?? '');
        $sum  = $this->normalizeIcsText($summary ?? '');
        $uidStr = (string)($uid ?? '');

        $reservationUrl = null;
        $reservationCode = null;

        // 1) Robust URL pattern: allow optional backslash before colon (https\://) and match both
        if (!$reservationUrl && preg_match('#https?\\:?//www\\.airbnb\\.com/hosting/reservations/details/([A-Za-z0-9]+)#i', $desc . ' ' . $sum, $m)) {
            $reservationUrl  = $m[0];
            $reservationCode = $m[1];
        }

        // 2) Fallback: explicit HM code anywhere in description/summary
        if (!$reservationCode && preg_match('#\\bHM[0-9A-Z]{8,}\\b#i', $desc . ' ' . $sum, $m2)) {
            $reservationCode = strtoupper($m2[0]);
        }

        // 3) Fallback: HM code present in UID (some feeds include it there)
        if (!$reservationCode && $uidStr && preg_match('#\\bHM[0-9A-Z]{8,}\\b#i', $uidStr, $m3)) {
            $reservationCode = strtoupper($m3[0]);
        }

        return [$reservationUrl, $reservationCode];
    }

    /**
     * Decide event type based on presence of reservation code and common block keywords.
     * Returns array [$eventType, $isBlock].
     */
    private function classifyEventType(string $summary, string $description, bool $hasReservationCode): array
    {
        if ($hasReservationCode) {
            return ['reservation', false];
        }
        $text = strtolower($summary . ' ' . $description);
        // Common block markers used by Airbnb/manual blocks
        $patterns = [
            'o2 reservation', 'owners2', 'block', 'blocked', 'owner', 'owner stay', 'manual', 'private', 'hold', 'maintenance', 'unavailable', 'not available'
        ];
        foreach ($patterns as $p) {
            if (str_contains($text, $p)) {
                return ['block', true];
            }
        }
        return ['unknown', false];
    }
}
