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
        $dry  = filter_var($request->query->get('dry', false), FILTER_VALIDATE_BOOL);

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
            $items = array_values(array_filter($result['items'], static function ($row) use ($em) {
                // We only consider rows that have a booking id and a fingerprint to compare
                $bookingId = $row['bookingId'] ?? null;
                $fp        = $row['fingerprint'] ?? null;

                if ($bookingId && is_string($fp) && $fp !== '') {
                    /** @var AllBookings|null $ab */
                    $ab = $em->getRepository(AllBookings::class)->find($bookingId);
                    if ($ab && method_exists($ab, 'getIcalAckSignature')) {
                        $ackSig = $ab->getIcalAckSignature();
                        if ($ackSig && hash_equals($ackSig, $fp)) {
                            // acknowledged → hide this row (regardless of status: conflict or suspected_cancelled)
                            return false;
                        }
                    }
                }
                // keep if not acknowledged
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