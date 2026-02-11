<?php

namespace App\Controller\Api;

use App\Service\ICal\BookingIcalReconcileService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Doctrine\ORM\EntityManagerInterface;
use App\Entity\AllBookings;

class IcalReconcileController extends AbstractController
{
    #[Route('/api/ical/reconcile', name: 'api_ical_reconcile', methods: ['GET'])]
    public function reconcile(Request $request, BookingIcalReconcileService $service, EntityManagerInterface $em): JsonResponse
    {
        $unit = $request->query->get('unit');
        $from = $this->parseDate($request->query->get('from'));
        $to   = $this->parseDate($request->query->get('to'));
        // Default to dry=true for GET reconcile (compute-only). Persisting changes should be explicit.
        $dry  = filter_var($request->query->get('dry', true), FILTER_VALIDATE_BOOL);

        // Enforce a safe reconcile window.
        // If no window is provided, default to the current month (America/Cancun).
        // If only one side is provided, expand to that month.
        // Always normalize to inclusive day boundaries.
        $tz = new \DateTimeZone('America/Cancun');

        if ($from === null && $to === null) {
            $from = (new \DateTimeImmutable('first day of this month', $tz))->setTime(0, 0, 0);
            $to   = (new \DateTimeImmutable('last day of this month', $tz))->setTime(23, 59, 59);
        } elseif ($from !== null && $to === null) {
            $from = $from->setTimezone($tz)->setTime(0, 0, 0);
            $to   = $from->modify('last day of this month')->setTime(23, 59, 59);
        } elseif ($from === null && $to !== null) {
            $to   = $to->setTimezone($tz)->setTime(23, 59, 59);
            $from = $to->modify('first day of this month')->setTime(0, 0, 0);
        } else {
            // Both provided: normalize boundaries
            $from = $from->setTimezone($tz)->setTime(0, 0, 0);
            $to   = $to->setTimezone($tz)->setTime(23, 59, 59);
        }

        // Safety guard: do not allow overly large ranges (prevents accidental full-table scans)
        $days = $from->diff($to)->days ?? 0;
        if ($days > 93) { // ~3 months
            return new JsonResponse([
                'ok' => false,
                'error' => 'invalid_range',
                'message' => 'Please request a smaller date window (max 93 days).',
                'params' => [
                    'from' => $from->format('Y-m-d'),
                    'to' => $to->format('Y-m-d'),
                ],
            ], 400);
        }

        $result = $service->reconcile(
            $unit !== null && $unit !== '' ? (int)$unit : null,
            $from,
            $to,
            flush: !$dry,
        );

        // Read hideAck preference (must be defined before use)
        $hideAck = filter_var($request->query->get('hideAck', '1'), FILTER_VALIDATE_BOOL);
        $items = (isset($result['items']) && is_array($result['items'])) ? $result['items'] : [];

        if ($hideAck && isset($result['items']) && is_array($result['items'])) {
            // Build a list of booking ids present in the result that also have fingerprints
            $ids = [];
            foreach ($result['items'] as $row) {
                $bookingId = $row['bookingId'] ?? null;
                $fp        = $row['fingerprint'] ?? null;
                if ($bookingId && is_string($fp) && $fp !== '') {
                    $ids[(int)$bookingId] = true;
                }
            }

            // Bulk fetch ack signatures without hydrating entities (avoid UnitOfWork / N+1)
            $ackById = [];
            if (!empty($ids)) {
                $idList = array_keys($ids);
                $qb = $em->createQueryBuilder();
                $rows = $qb
                    ->select('ab.id AS id, ab.icalAckSignature AS sig')
                    ->from(AllBookings::class, 'ab')
                    ->where($qb->expr()->in('ab.id', ':ids'))
                    ->setParameter('ids', $idList)
                    ->getQuery()
                    ->getArrayResult();

                foreach ($rows as $r) {
                    $bid = isset($r['id']) ? (int)$r['id'] : null;
                    if ($bid) {
                        $ackById[$bid] = $r['sig'] ?? null;
                    }
                }
            }

            $items = array_values(array_filter($result['items'], static function ($row) use ($ackById) {
                $bookingId = $row['bookingId'] ?? null;
                $fp        = $row['fingerprint'] ?? null;

                if (!$bookingId || !is_string($fp) || $fp === '') {
                    return true;
                }

                $bid = (int)$bookingId;
                $ackSig = $ackById[$bid] ?? null;
                if ($ackSig && hash_equals($ackSig, $fp)) {
                    // acknowledged → hide this row (regardless of status: conflict or suspected_cancelled)
                    return false;
                }

                return true;
            }));

            // Recompute a couple of counters for the filtered view
            $conflicts = 0;
            $suspected = 0;
            foreach ($items as $r) {
                $st = $r['status'] ?? null;
                if ($st === 'conflict') {
                    $conflicts++;
                } elseif ($st === 'suspected_cancelled') {
                    $suspected++;
                }
            }

            // Overwrite the result view fields without losing raw totals
            $result['items'] = $items;
            $result['conflicts'] = $conflicts;
            // Preserve any separate 'suspectedCancelled' field if the service provides one;
            // otherwise surface it alongside the existing keys.
            if (!isset($result['suspectedCancelled'])) {
                $result['suspectedCancelled'] = $suspected;
            } else {
                // Keep service-provided value but also expose filtered count
                $result['suspectedCancelledFiltered'] = $suspected;
            }
            $result['filteredByAck'] = true;
        } else {
            $result['filteredByAck'] = false;
        }

        // Attach last iCal sync meta so the frontend doesn't need a second call
        $icalMeta = $this->readIcalSyncMetrics();

        return new JsonResponse([
            'ok' => true,
            'params' => [
                'unit' => $unit,
                'from' => $from?->format('Y-m-d'),
                'to'   => $to?->format('Y-m-d'),
                'dry'  => $dry,
                'hideAck' => $hideAck,
            ],
            'data' => $result,
            'meta' => [
                'icalSyncLastRun' => $icalMeta,
            ],
        ]);
    }

    private function readIcalSyncMetrics(): ?array
    {
        try {
            $projectRoot = \dirname(__DIR__, 3);
            $filePath = $projectRoot . '/var/metrics/ical_sync_last_run.json';
            if (!is_file($filePath)) {
                return null;
            }
            $raw = file_get_contents($filePath);
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            return [
                'lastRunAt'        => $data['lastRunAt']        ?? null,
                'lastRunAtLocal'   => $data['lastRunAtLocal']   ?? null,
                'lastRunAtLocalTz' => $data['lastRunAtLocalTz'] ?? 'America/Cancun',
                'unitsConsidered'  => $data['unitsConsidered']  ?? null,
                'eventsUpdated'    => $data['eventsUpdated']    ?? null,
                'errors'           => $data['errors']           ?? null,
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function parseDate(?string $val): ?\DateTimeImmutable
    {
        if (!$val) return null;
        try {
            // Normalize to midnight to match CLI behavior
            return new \DateTimeImmutable($val . ' 00:00:00');
        } catch (\Throwable) {
            return null;
        }
    }
}