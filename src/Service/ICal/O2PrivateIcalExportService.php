<?php

namespace App\Service\ICal;

use App\Entity\Unit;
use App\Entity\AllBookings;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Builds an iCalendar (.ics) feed for a Unit's PRIVATE reservations so Airbnb can import and block dates.
 * - Includes only source = 'Private'
 * - Excludes status = 'Cancelled' and 'Expired'
 * - Includes only reservations with checkOut >= today (plus optional window)
 * - Emits DATE-TIME events with TZID=America/Cancun and exclusive DTEND at 00:00, mirroring Airbnb’s ICS (e.g., checkIn 2025‑11‑02 → `DTSTART;TZID=America/Cancun:20251102T000000`).
 */
class O2PrivateIcalExportService
{
    private const PRODID = '-//Owners2//Private Blocks 1.0//EN';
    private const TZ = 'America/Cancun';

    public function __construct(private EntityManagerInterface $em)
    {
    }

    /**
     * Build ICS text for a given unit.
     *
     * @param Unit $unit
     * @param bool $includeDetails If true, include guest name and payout in SUMMARY.
     * @param \DateTimeImmutable|null $from Optional lower bound (inclusive) for check-in. Defaults to today in Cancun.
     * @param \DateTimeImmutable|null $to   Optional upper bound (exclusive) for check-in. Defaults to null (open-ended).
     */
    public function buildForUnit(Unit $unit, bool $includeDetails = true, ?\DateTimeImmutable $from = null, ?\DateTimeImmutable $to = null): string
    {
        // If disabled, emit an empty minimal calendar to avoid breaking Airbnb, or caller can 404 instead.
        if (method_exists($unit, 'isPrivateIcalEnabled') && !$unit->isPrivateIcalEnabled()) {
            return $this->wrapCalendar([],$unit);
        }

        $tz = new \DateTimeZone(self::TZ);
        $today = (new \DateTimeImmutable('today', $tz))->setTime(0,0);

        $from = $from ? $from->setTime(0,0) : $today;
        // $to can remain null (Airbnb will accept far-future blocks); if provided, normalize
        if ($to) { $to = $to->setTime(0,0); }

        // Use an overlap window instead of "checkIn >= from" so ongoing stays are included.
        // Default window start = today; window end = optional $to (open-ended if null).
        $windowStart = ($from ?: $today)->setTime(0, 0);
        $windowEnd   = $to ? $to->setTime(0, 0) : null;

        $qb = $this->em->getRepository(AllBookings::class)->createQueryBuilder('b')
            ->where('b.source IN (:srcs)')
            ->andWhere('LOWER(b.status) NOT IN (:cancels)');

        $qb
            ->setParameter('srcs', ['Private','Owners2'])
            ->setParameter('cancels', ['cancelled','canceled','expired']);
        $qb->andWhere('(LOWER(b.guestType) NOT IN (:soft) AND LOWER(b.status) NOT IN (:soft))')
           ->setParameter('soft', ['hold','block','cleaning','maintenance','late check-out','late checkout','late check out']);

        // Overlap rule:
        // If we have an end bound, include any booking that overlaps [windowStart, windowEnd)
        // i.e., b.checkIn < windowEnd AND b.checkOut >= windowStart
        // If no end bound, include any booking whose checkOut is on/after windowStart (includes ongoing).
        if ($windowEnd) {
            $qb->andWhere('b.checkIn < :winEnd AND b.checkOut >= :winStart')
               ->setParameter('winEnd', $windowEnd)
               ->setParameter('winStart', $windowStart);
        } else {
            $qb->andWhere('b.checkOut >= :winStart')
               ->setParameter('winStart', $windowStart);
        }

        // filter to this unit (prefer relation method if present; else by unitId or unitName)
        if (method_exists($unit, 'getId') && $this->hasField(AllBookings::class, 'unitId')) {
            $qb->andWhere('b.unitId = :uid')->setParameter('uid', $unit->getId());
        } elseif ($this->hasField(AllBookings::class, 'unit')) {
            $qb->andWhere('b.unit = :u')->setParameter('u', $unit);
        } elseif ($this->hasField(AllBookings::class, 'unitName')) {
            $qb->andWhere('b.unitName = :uname')->setParameter('uname', $unit->getUnitName());
        }

        $qb->orderBy('b.checkIn', 'ASC');

        /** @var AllBookings[] $rows */
        $rows = $qb->getQuery()->getResult();

        $events = [];
        $nowUtc = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $dtstamp = $nowUtc->format('Ymd\\THis\\Z');
        $unitLabel = method_exists($unit, 'getUnitName') ? (string)$unit->getUnitName() : ('Unit #' . $unit->getId());
        $unitIdVal = method_exists($unit, 'getId') ? (string) $unit->getId() : '';

        foreach ($rows as $b) {
            $cin  = $b->getCheckIn();
            $cout = $b->getCheckOut();
            if (!$cin || !$cout) { continue; }

            // Normalize to Cancun date-only
            $cinLocal  = (new \DateTimeImmutable($cin->format('Y-m-d'), $tz));
            $coutLocal = (new \DateTimeImmutable($cout->format('Y-m-d'), $tz));

            $dtstartZ = $cinLocal->format('Ymd\\T000000');
            $dtendZ   = $coutLocal->format('Ymd\\T000000');
            $tzid     = self::TZ;

            $bookingId = method_exists($b, 'getId') ? $b->getId() : null;
            $guest = method_exists($b, 'getGuestName') ? (string)($b->getGuestName() ?? '') : '';
            $payout = method_exists($b, 'getPayout') ? (float)($b->getPayout() ?? 0) : 0.0;

            $summary = 'O2 Reservation';
            if ($includeDetails) {
                $parts = [];
                if ($guest !== '') { $parts[] = $guest; }
                if ($payout > 0) { $parts[] = '$' . number_format($payout, 2, '.', ','); }
                if (!empty($parts)) {
                    $summary .= ' — ' . implode(' · ', $parts);
                }
            }

            $descParts = [];
            $descParts[] = 'Unit: ' . $unitLabel;
            if ($bookingId) { $descParts[] = 'Booking ID: ' . $bookingId; }
            if ($guest !== '') { $descParts[] = 'Guest: ' . $guest; }
            if ($payout > 0) { $descParts[] = 'Payout: $' . number_format($payout, 2, '.', ','); }
            if (method_exists($b, 'getNotes') && $b->getNotes()) {
                $descParts[] = 'Notes: ' . $b->getNotes();
            }
            $description = $this->escapeText(implode("\n", $descParts));
            $summaryEsc  = $this->escapeText($summary);

            // Stable UID per booking while it exists
            $uid = 'o2-private-' . ($bookingId ?? md5($unitLabel . $dtstartZ . $dtendZ)) . '@owners2.com';

            $ev = [
                'BEGIN:VEVENT',
                'UID:' . $uid,
                'DTSTAMP:' . $dtstamp,
                'DTSTART;TZID=' . $tzid . ':' . $dtstartZ,
                'DTEND;TZID='   . $tzid . ':' . $dtendZ,
                'SUMMARY:' . $summaryEsc,
                'DESCRIPTION:' . $description,
                'X-OWNERS2-UNIT-ID:' . $unitIdVal,
                'X-OWNERS2-BOOKING-ID:' . ($bookingId !== null ? (string)$bookingId : ''),
                'X-OWNERS2-BOOKING-CODE:' . (method_exists($b, 'getConfirmationCode') && $b->getConfirmationCode() ? $b->getConfirmationCode() : ''),
                'STATUS:CONFIRMED',
                'TRANSP:OPAQUE',
                'END:VEVENT',
            ];
            $events[] = implode("\r\n", $ev);
        }

        // --- Include soft reservations: Hold / Block ---
        $qbSoft = $this->em->getRepository(AllBookings::class)->createQueryBuilder('b')
            ->andWhere('(LOWER(b.guestType) IN (:soft) OR LOWER(b.status) IN (:soft))')
            ->andWhere('b.source IN (:srcs)')
            ->andWhere('LOWER(b.status) NOT IN (:cancels)')
            ->setParameter('soft', ['hold','block','cleaning','maintenance','late check-out','late checkout','late check out'])
            ->setParameter('srcs', ['Private','Owners2'])
            ->setParameter('cancels', ['cancelled','canceled','expired']);

        // Overlap rule like above
        if ($windowEnd) {
            $qbSoft->andWhere('b.checkIn < :winEnd AND b.checkOut >= :winStart')
                   ->setParameter('winEnd', $windowEnd)
                   ->setParameter('winStart', $windowStart);
        } else {
            $qbSoft->andWhere('b.checkOut >= :winStart')
                   ->setParameter('winStart', $windowStart);
        }

        // Filter to this unit (mirror logic from above)
        if (method_exists($unit, 'getId') && $this->hasField(AllBookings::class, 'unitId')) {
            $qbSoft->andWhere('b.unitId = :uid')->setParameter('uid', $unit->getId());
        } elseif ($this->hasField(AllBookings::class, 'unit')) {
            $qbSoft->andWhere('b.unit = :u')->setParameter('u', $unit);
        } elseif ($this->hasField(AllBookings::class, 'unitName')) {
            $qbSoft->andWhere('b.unitName = :uname')->setParameter('uname', $unitLabel);
        }

        $qbSoft->orderBy('b.checkIn', 'ASC');
        /** @var AllBookings[] $softRows */
        $softRows = $qbSoft->getQuery()->getResult();

        foreach ($softRows as $b) {
            $cin  = $b->getCheckIn();
            $cout = $b->getCheckOut();
            if (!$cin || !$cout) { continue; }

            $cinLocal  = (new \DateTimeImmutable($cin->format('Y-m-d'), $tz));
            $coutLocal = (new \DateTimeImmutable($cout->format('Y-m-d'), $tz));

            $dtstartZ = $cinLocal->format('Ymd\T000000');
            $dtendZ   = $coutLocal->format('Ymd\T000000');

            $kindSource = '';
            if (method_exists($b, 'getGuestType') && $b->getGuestType()) {
                $kindSource = (string)$b->getGuestType();
            } elseif (method_exists($b, 'getStatus') && $b->getStatus()) {
                $kindSource = (string)$b->getStatus();
            }
            $kindRaw = strtolower(trim($kindSource));
            $guest = method_exists($b, 'getGuestName') ? (string)($b->getGuestName() ?? '') : '';
            $note  = method_exists($b, 'getNotes') ? (string)($b->getNotes() ?? '') : '';

            $isHold  = ($kindRaw === 'hold');
            $isBlock = ($kindRaw === 'block') || in_array($kindRaw, ['cleaning','maintenance','late check-out','late checkout','late check out'], true);

            $summary = $isBlock ? 'BLOCKED' : 'HOLD';
            // For BLOCK: if the specific reason is not literally 'block', append it in brackets
            if ($isBlock && $kindRaw !== 'block' && $kindRaw !== '') {
                $summary .= ' — [' . strtoupper($kindRaw) . ']';
            }
            if (!$isBlock && $guest !== '') {
                $summary .= ': ' . $guest;
            }
            if ($isBlock && $note !== '') {
                $summary .= ' — ' . $note;
            }

            $summaryEsc = $this->escapeText($summary);
            $descParts = ['Unit: ' . $unitLabel, 'Type: ' . $summary];
            if ($guest !== '') { $descParts[] = 'Guest: ' . $guest; }
            if ($note !== '')  { $descParts[] = 'Notes: ' . $note; }
            $description = $this->escapeText(implode("\n", $descParts));

            $uid = 'o2-soft-' . ((method_exists($b, 'getId') ? $b->getId() : null) ?? md5($unitLabel . $dtstartZ . $dtendZ . $kindRaw)) . '@owners2.com';

            $tzid = self::TZ;
            $ev = [
                'BEGIN:VEVENT',
                'UID:' . $uid,
                'DTSTAMP:' . $dtstamp,
                'DTSTART;TZID=' . $tzid . ':' . $dtstartZ,
                'DTEND;TZID='   . $tzid . ':' . $dtendZ,
                'SUMMARY:' . $summaryEsc,
                'DESCRIPTION:' . $description,
                'X-OWNERS2-UNIT-ID:' . $unitIdVal,
                'STATUS:' . ($isHold ? 'TENTATIVE' : 'CONFIRMED'),
                'TRANSP:' . ($isBlock ? 'TRANSPARENT' : 'OPAQUE'),
                'CATEGORIES:' . strtoupper($kindRaw),
                'END:VEVENT',
            ];
            $events[] = implode("\r\n", $ev);
        }

        return $this->wrapCalendar($events, $unit);
    }

    private function wrapCalendar(array $eventBlocks, Unit $unit): string
    {
        $name = method_exists($unit, 'getUnitName') ? $unit->getUnitName() : ('Unit #' . $unit->getId());
        $calName = $this->escapeText($name . ' – Owners2 Private Blocks');
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:' . self::PRODID,
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:' . $calName,
        ];

        foreach ($eventBlocks as $b) {
            $lines[] = $b;
        }

        $lines[] = 'END:VCALENDAR';
        return implode("\r\n", $lines) . "\r\n"; // Ensure trailing CRLF
    }

    private function escapeText(string $s): string
    {
        // RFC5545 escaping for text values: backslash, comma, semicolon, and newlines
        $s = str_replace('\\', '\\\\', $s);
        $s = str_replace([",", ";"], ['\\,', '\\;'], $s);
        // Convert newlines to \n per iCal text rules
        $s = str_replace(["\r\n", "\r", "\n"], '\\n', $s);
        return $s;
    }

    private function hasField(string $entityClass, string $field): bool
    {
        try {
            $meta = $this->em->getClassMetadata($entityClass);
            return $meta->hasField($field) || $meta->hasAssociation($field);
        } catch (\Throwable $e) {
            return false;
        }
    }
}