<?php

namespace App\Controller\Api\ICal;

use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Doctrine\DBAL\Connection;

/**
 * Lightweight calendar API for a single unit.
 * Returns blocked ranges with **inclusive end** in local dates (we convert DB/ICS half‑open [start, end) into [start, endInclusive]).
 */
class UnitCalendarController extends AbstractController
{
    private Connection $db;

    public function __construct(Connection $db)
    {
        $this->db = $db;
    }

    #[Route('/api/units/{id}/calendar', name: 'api_unit_calendar', methods: ['GET'])]
    #[Route('/api/ical/unit/{id}/calendar', name: 'api_unit_calendar_ical', methods: ['GET'])]
    public function __invoke(Request $request, string $id): JsonResponse
    {
        // Allow unit_id (numeric) or unit_code (string like "NickPrice_302A")
        $lookupId = $id;

        // If non-numeric, resolve using units.unit_id (unit_code)
        if (!ctype_digit((string) $id)) {
            $row = $this->db->fetchAssociative(
                'SELECT id FROM units WHERE unit_id = :code LIMIT 1',
                ['code' => $id]
            );
            if (!$row) {
                return new JsonResponse(['error' => 'Unit not found'], 404);
            }
            $lookupId = (int) $row['id'];
        }

        // Timezone: America/Cancun (no DST issues for date-only windows we return)
        $tz = new DateTimeZone('America/Cancun');
        $today = new DateTimeImmutable('now', $tz);

        // Window defaults: from = today -15 days, to = today +60 days
        $fromParam = trim((string) $request->query->get('from', ''));
        $toParam   = trim((string) $request->query->get('to', ''));

        $from = $fromParam !== ''
            ? DateTimeImmutable::createFromFormat('Y-m-d', $fromParam, $tz) ?: $today
            : $today->sub(new DateInterval('P15D'));

        $to = $toParam !== ''
            ? DateTimeImmutable::createFromFormat('Y-m-d', $toParam, $tz) ?: $today->add(new DateInterval('P60D'))
            : $today->add(new DateInterval('P60D'));

        // Normalize to Y-m-d (date-only semantics)
        $fromStr = $from->format('Y-m-d');
        $toStr   = $to->format('Y-m-d');

        $excludeBookingId = (int) $request->query->get('excludeBookingId', 0);

        // Helper: given an exclusive end date (Y-m-d), return inclusive end (minus 1 day), clamped to >= start
        $toInclusive = function (string $startYmd, string $endExclusiveYmd) use ($tz): ?string {
            $s = DateTimeImmutable::createFromFormat('Y-m-d', substr($startYmd, 0, 10), $tz);
            $e = DateTimeImmutable::createFromFormat('Y-m-d', substr($endExclusiveYmd, 0, 10), $tz);
            if (!$s || !$e) { return null; }
            // Convert half-open [start, end) into inclusive end = end - 1 day
            $eInc = $e->sub(new DateInterval('P1D'));
            if ($eInc < $s) { $eInc = $s; } // clamp
            return $eInc->format('Y-m-d');
        };

        // Pull from all_bookings via DBAL to avoid entity coupling.
        // We consider any reservation that overlaps the window and has a blocking status.
        // NOTE: end date is considered exclusive client-side ([start, end)).
        $sql = <<<SQL
            SELECT
                id         AS booking_id,
                check_in   AS start_date,
                check_out  AS end_date,
                status     AS type,
                source     AS source,
                guest_type AS guest_type
            FROM all_bookings
            WHERE unit_id = :unitId
              AND (:excludeBookingId = 0 OR id <> :excludeBookingId)
              AND check_out > :fromDate
              AND check_in  < :toDate
              AND status IN ('Confirmed','Ongoing','Upcoming','Hold','Block')
              AND LOWER(status) <> 'expired'
            ORDER BY check_in ASC
        SQL;

        $rows = $this->db->fetchAllAssociative($sql, [
            'unitId'            => $lookupId,
            'excludeBookingId'  => $excludeBookingId,
            'fromDate'          => $fromStr,
            'toDate'            => $toStr,
        ]);

        // Also include Airbnb manual blocks coming from iCal sync (ical_events)
        // We consider rows classified as block either via event_type = 'block' or is_block = 1
        $sqlIcal = <<<SQL
            SELECT
                DATE(dtstart) AS start_date,
                DATE(dtend)   AS end_date,
                event_type,
                summary
            FROM ical_events
            WHERE unit_id = :unitId
              AND dtend   > :fromDate
              AND dtstart < :toDate
              AND (
                    LOWER(event_type) = 'block'
                 OR (is_block IS NOT NULL AND is_block <> 0)
              )
            ORDER BY dtstart ASC
        SQL;

        $icalRows = $this->db->fetchAllAssociative($sqlIcal, [
            'unitId'   => $lookupId,
            'fromDate' => $fromStr,
            'toDate'   => $toStr,
        ]);

        // Map to simple shape and ensure Y-m-d formatting (defensive)
        $result = [];
        foreach ($rows as $r) {
            if ($excludeBookingId > 0 && isset($r['booking_id']) && (int) $r['booking_id'] === $excludeBookingId) {
                continue;
            }
            $start = (string) ($r['start_date'] ?? '');
            $end   = (string) ($r['end_date'] ?? '');
            $type  = (string) ($r['type'] ?? '');
            $source = (string) ($r['source'] ?? '');
            $guestType = (string) ($r['guest_type'] ?? '');

            if ($start === '' || $end === '') {
                continue;
            }

            // Ensure valid format
            $startFmt = DateTimeImmutable::createFromFormat('Y-m-d', substr($start, 0, 10), $tz)?->format('Y-m-d');
            $endFmt   = DateTimeImmutable::createFromFormat('Y-m-d', substr($end, 0, 10), $tz)?->format('Y-m-d');
            if (!$startFmt || !$endFmt) {
                continue;
            }

            $endInc = $toInclusive($startFmt, $endFmt);
            if (!$endInc) { continue; }

            // Compute hardBlock + summary using your rules
            // - Airbnb / Private reservations: no override (hard)
            // - Owners2 Hold/Block: warning only (soft)
            $hardBlock = true;
            if (in_array($source, ['Airbnb', 'Private'], true)) {
                $hardBlock = true;
            } elseif ($source === 'Owners2' && in_array($guestType, ['Hold', 'Block'], true)) {
                $hardBlock = false;
            }

            $summary = '';
            if ($source === 'Airbnb') {
                $summary = 'Reserved';
            } elseif ($source === 'Private') {
                $summary = 'O2 Reservation';
            } elseif ($source === 'Owners2' && $guestType === 'Hold') {
                $summary = 'O2 Hold';
            } elseif ($source === 'Owners2' && $guestType === 'Block') {
                $summary = 'O2 Block';
            } else {
                // fallback to type/status
                $summary = $type !== '' ? $type : 'Reservation';
            }

            $result[] = [
                'start'     => $startFmt,
                'end'       => $endInc,   // inclusive end so checkout day is selectable
                'type'      => $type,     // backward compatible
                'source'    => $source,
                'guest_type'=> $guestType,
                'summary'   => $summary,
                'hardBlock' => $hardBlock,
            ];
        }

        // Map iCal blocks into the same shape; use type 'Block' to align with UI coloring
        foreach ($icalRows as $r) {
            $start = (string) ($r['start_date'] ?? '');
            $end   = (string) ($r['end_date'] ?? '');
            $summaryRaw = (string) ($r['summary'] ?? '');

            if ($start === '' || $end === '') {
                continue;
            }

            $startFmt = DateTimeImmutable::createFromFormat('Y-m-d', substr($start, 0, 10), $tz)?->format('Y-m-d');
            $endFmt   = DateTimeImmutable::createFromFormat('Y-m-d', substr($end, 0, 10), $tz)?->format('Y-m-d');
            if (!$startFmt || !$endFmt) {
                continue;
            }

            $endInc = $toInclusive($startFmt, $endFmt);
            if (!$endInc) { continue; }

            $summary = trim($summaryRaw) !== '' ? trim($summaryRaw) : 'Airbnb (Not available)';

            // Airbnb manual blocks from iCal should warn but still allow override
            $result[] = [
                'start'      => $startFmt,
                'end'        => $endInc,   // inclusive end for UI
                'type'       => 'Block',   // backward compatible
                'source'     => 'AirbnbIcal',
                'guest_type' => 'Block',
                'summary'    => $summary,
                'hardBlock'  => false,
            ];
        }

        // Optional: merge overlapping/contiguous ranges into a single span
        $merge = (string) $request->query->get('merge', '0');
        if (in_array($merge, ['1','true','yes'], true)) {
            $result = $this->mergeDateRanges($result, $tz);
        }

        return new JsonResponse($result, 200, [
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
        ]);
    }

    #[Route('/api/ical/unit-calendar', name: 'api_unit_calendar_param', methods: ['GET'])]
    public function byQuery(Request $request): JsonResponse
    {
        $unitId = (int) $request->query->get('unitId');
        if (!$unitId) {
            return new JsonResponse(['error' => 'Missing unitId'], 400);
        }

        // Frontend may send start/end; map to from/to expected by __invoke
        $from = $request->query->get('start', $request->query->get('from'));
        $to   = $request->query->get('end', $request->query->get('to'));

        // Build a minimal Request carrying from/to for __invoke
        $forward = new Request(query: ['from' => $from, 'to' => $to]);
        return $this->__invoke($forward, $unitId);
    }

    /**
     * Merge overlapping or contiguous date ranges.
     * Input ranges are arrays with keys: start (Y-m-d), end (Y-m-d), type (string).
     * End is treated as **inclusive** in this controller's output; ranges are merged when next.start <= current.end.
     * If multiple types are merged, the resulting type becomes 'Mixed'; otherwise, the original type persists.
     */
    private function mergeDateRanges(array $ranges, DateTimeZone $tz): array
    {
        if (count($ranges) <= 1) {
            return $ranges;
        }

        // Normalize to DateTime and sort by start
        $normalized = [];
        foreach ($ranges as $r) {
            $s = DateTimeImmutable::createFromFormat('Y-m-d', (string) $r['start'], $tz);
            $e = DateTimeImmutable::createFromFormat('Y-m-d', (string) $r['end'], $tz);
            if (!$s || !$e || $s > $e) {
                continue;
            }
            $normalized[] = [
                'start'      => $s,
                'end'        => $e,
                'types'      => [$r['type'] ?? ''],
                'hardBlocks' => [(bool) ($r['hardBlock'] ?? false)],
                'summaries'  => [$r['summary'] ?? ''],
            ];
        }
        usort($normalized, function ($a, $b) {
            return $a['start'] <=> $b['start'];
        });

        $merged = [];
        $current = array_shift($normalized);
        while ($current !== null) {
            $next = $normalized[0] ?? null;
            if ($next === null) {
                // flush current
                $types = array_unique(array_filter($current['types'], static fn($t) => $t !== ''));
                $hardBlocks = array_map(static fn($v) => (bool) $v, $current['hardBlocks'] ?? []);
                $summaries = array_unique(array_filter((array) ($current['summaries'] ?? []), static fn($t) => trim((string) $t) !== ''));

                $merged[] = [
                    'start'     => $current['start']->format('Y-m-d'),
                    'end'       => $current['end']->format('Y-m-d'),
                    'type'      => count($types) > 1 ? 'Mixed' : ($types[0] ?? ''),
                    'summary'   => count($summaries) === 1 ? ($summaries[0] ?? '') : (count($summaries) > 1 ? 'Mixed' : ''),
                    'hardBlock' => in_array(true, $hardBlocks, true),
                ];
                break;
            }

            $curHard = in_array(true, array_map(static fn($v) => (bool) $v, $current['hardBlocks'] ?? []), true);
            $nextHard = in_array(true, array_map(static fn($v) => (bool) $v, $next['hardBlocks'] ?? []), true);

            // If overlapping or contiguous: next.start <= current.end
            if ($next['start'] <= $current['end']) {
                // If hard flags differ, do NOT merge; emit current and let next start a new span.
                // This prevents a soft iCal/manual block from extending a hard span when merge=1.
                if ($curHard !== $nextHard) {
                    $types = array_unique(array_filter($current['types'], static fn($t) => $t !== ''));
                    $hardBlocks = array_map(static fn($v) => (bool) $v, $current['hardBlocks'] ?? []);
                    $summaries = array_unique(array_filter((array) ($current['summaries'] ?? []), static fn($t) => trim((string) $t) !== ''));

                    $merged[] = [
                        'start'     => $current['start']->format('Y-m-d'),
                        'end'       => $current['end']->format('Y-m-d'),
                        'type'      => count($types) > 1 ? 'Mixed' : ($types[0] ?? ''),
                        'summary'   => count($summaries) === 1 ? ($summaries[0] ?? '') : (count($summaries) > 1 ? 'Mixed' : ''),
                        'hardBlock' => in_array(true, $hardBlocks, true),
                    ];

                    $current = array_shift($normalized);
                    continue;
                }

                // Same hard flag => merge as before
                if ($next['end'] > $current['end']) {
                    $current['end'] = $next['end'];
                }
                $current['types'] = array_merge($current['types'], $next['types']);
                $current['hardBlocks'] = array_merge($current['hardBlocks'] ?? [], $next['hardBlocks'] ?? []);
                $current['summaries'] = array_merge($current['summaries'] ?? [], $next['summaries'] ?? []);
                array_shift($normalized);
                continue;
            }

            // no overlap: emit current and advance
            $types = array_unique(array_filter($current['types'], static fn($t) => $t !== ''));
            $hardBlocks = array_map(static fn($v) => (bool) $v, $current['hardBlocks'] ?? []);
            $summaries = array_unique(array_filter((array) ($current['summaries'] ?? []), static fn($t) => trim((string) $t) !== ''));

            $merged[] = [
                'start'     => $current['start']->format('Y-m-d'),
                'end'       => $current['end']->format('Y-m-d'),
                'type'      => count($types) > 1 ? 'Mixed' : ($types[0] ?? ''),
                'summary'   => count($summaries) === 1 ? ($summaries[0] ?? '') : (count($summaries) > 1 ? 'Mixed' : ''),
                'hardBlock' => in_array(true, $hardBlocks, true),
            ];
            $current = array_shift($normalized);
        }

        return $merged;
    }
}
