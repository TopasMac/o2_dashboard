<?php

namespace App\Controller\Api\ICal;

use App\Entity\AllBookings;
use App\Service\ICal\BookingIcalReconcileService;
use DateInterval;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class IcalNotificationsController extends AbstractController
{
    public function __construct(
        private readonly BookingIcalReconcileService $reconcileService,
        private readonly EntityManagerInterface $em,
    ) {}

    #[Route('/api/ical/notifications', name: 'api_ical_notifications', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        // Optional filters (unit, from, to)
        $unitParam = $request->query->get('unit');
        $unitId = $unitParam !== null && $unitParam !== '' ? (int) $unitParam : null;

        $from = $this->parseDate($request->query->get('from'));
        $to   = $this->parseDate($request->query->get('to'));

        // Apply sane defaults if not provided (align with CLI): last 60d → next 180d
        if (!$from) {
            $from = (new DateTimeImmutable('today'))
                ->sub(new DateInterval('P60D'))
                ->setTime(0, 0, 0);
        }
        if (!$to) {
            $to = (new DateTimeImmutable('today'))
                ->add(new DateInterval('P180D'))
                ->setTime(0, 0, 0);
        }

        // Run reconcile in compute-only mode (no persistence). Reuse the existing service output.
        $result = $this->reconcileService->reconcile($unitId, $from, $to, true);

        $items = $result['items'] ?? [];

        // Keep only actionable notifications (conflicts / suspected cancels / replaced_by)
        $notifs = [];
        foreach ($items as $it) {
            $status = $it['status'] ?? null;
            if (!in_array($status, ['conflict', 'suspected_cancelled', 'replaced_by'], true)) {
                continue;
            }

            $fp = $this->computeFingerprint($it);

            $bookingId = $it['bookingId'] ?? null;

            $notifs[] = [
                'id' => sprintf('issue|%s|%s', $bookingId ?? '0', $status ?? 'unknown'),
                'type' => match ($status) {
                    'conflict' => 'ical_conflict',
                    'suspected_cancelled' => 'ical_suspected_cancelled',
                    'replaced_by' => 'ical_replaced_by',
                    default => 'ical_notice',
                },
                'bookingId' => $bookingId,
                'unitId' => $it['unitId'] ?? null,
                'unitName' => $it['unitName'] ?? null,
                'guestName' => $it['guestName'] ?? null,
                'reservationCode' => $it['reservationCode'] ?? ($it['confirmationCode'] ?? null),
                'status' => $status,
                'diffs' => $it['diffs'] ?? ['checkIn' => false, 'checkOut' => false],
                'proposedCheckIn' => $it['proposedCheckIn'] ?? null,
                'proposedCheckOut' => $it['proposedCheckOut'] ?? null,
                'checkIn' => $it['checkIn'] ?? null,
                'checkOut' => $it['checkOut'] ?? null,
                'reservationUrl' => $it['reservationUrl'] ?? null,
                'bookingReservationUrl' => $it['bookingReservationUrl'] ?? null,
                'lastIcalSyncAt' => $it['lastIcalSyncAt'] ?? null,
                'summary' => $it['summary'] ?? [],
                'fingerprint' => $fp,
            ];
        }

        return $this->json([
            'ok' => true,
            'params' => [
                'unit' => $unitId,
                'from' => $from?->format('Y-m-d'),
                'to' => $to?->format('Y-m-d'),
            ],
            'data' => [
                'count' => count($notifs),
                'items' => $notifs,
            ],
        ]);
    }

    private function parseDate(?string $val): ?DateTimeImmutable
    {
        if (!$val) return null;
        $val = trim($val);
        if ($val === '') return null;
        // accept YYYY-MM-DD
        $d = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $val.' 00:00:00');
        if ($d instanceof DateTimeImmutable) {
            return $d->setTime(0, 0, 0);
        }
        $d2 = DateTimeImmutable::createFromFormat('Y-m-d', $val);
        return $d2 ? $d2->setTime(0, 0, 0) : null;
    }

    private function computeFingerprint(array $it): string
    {
        $parts = [
            $it['bookingId'] ?? '',
            $it['status'] ?? '',
            $it['checkIn'] ?? '',
            $it['checkOut'] ?? '',
            $it['proposedCheckIn'] ?? '',
            $it['proposedCheckOut'] ?? '',
            $it['reservationCode'] ?? ($it['confirmationCode'] ?? ''),
            $it['icalEventId'] ?? '',
        ];

        // Serialize diffs as JSON to a stable string
        $diffs = $it['diffs'] ?? [];
        $diffsJson = json_encode($diffs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_NUMERIC_CHECK);
        $parts[] = $diffsJson ?: '';

        return sha1(implode('|', $parts));
    }

    private function computeLooseFingerprint(array $it): string
    {
        $bookingId = $it['bookingId'] ?? '';
        $status    = $it['status'] ?? '';
        $code      = $it['reservationCode'] ?? ($it['confirmationCode'] ?? '');
        // A coarse-grained fingerprint that ignores date/proposed diffs so an ack can persist
        // across harmless changes (e.g., re-syncs that don't change the fact/type of issue).
        return sha1(implode('|', ['loose', $bookingId, $status, $code]));
    }

    #[Route('/api/ical/ack/{bookingId}', name: 'api_ical_ack', methods: ['POST'])]
    public function ack(Request $request, int $bookingId): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data) || empty($data['fingerprint']) || !is_string($data['fingerprint'])) {
            return $this->json(['ok' => false, 'error' => 'Missing or invalid fingerprint'], 400);
        }
        $fingerprint = $data['fingerprint'] ?? null;

        $booking = $this->em->getRepository(AllBookings::class)->find($bookingId);
        if (!$booking) {
            return $this->json(['ok' => false, 'error' => 'Booking not found'], 404);
        }

        if (!$fingerprint) {
            // Compute a coarse fingerprint from current reconcile so the ack can persist
            $from = ($booking->getCheckIn() ? DateTimeImmutable::createFromFormat('Y-m-d', $booking->getCheckIn()) : (new DateTimeImmutable('today'))->sub(new DateInterval('P30D')));
            $to   = ($booking->getCheckOut() ? DateTimeImmutable::createFromFormat('Y-m-d', $booking->getCheckOut()) : (new DateTimeImmutable('today'))->add(new DateInterval('P30D')));
            $unitId = method_exists($booking, 'getUnitId') ? $booking->getUnitId() : null;
            $recon = $this->reconcileService->reconcile($unitId, $from, $to, true);
            $foundFp = null;
            foreach (($recon['items'] ?? []) as $it) {
                if (($it['bookingId'] ?? null) === $booking->getId()) {
                    $foundFp = $this->computeFingerprint($it);
                    break;
                }
            }
            $fingerprint = $foundFp ?: sha1(implode('|', ['manual-ack', $booking->getId(), $booking->getStatus() ?: '']));
        }

        // If client asked for a loose acknowledgement, honor it
        if (!empty($data['loose'])) {
            // Derive a loose signature from the provided context if possible
            $status = $booking->getDateSyncStatus() ?: ($booking->getStatus() ?: '');
            $code   = $booking->getReservationCode() ?: $booking->getConfirmationCode() ?: '';
            $fingerprint = sha1(implode('|', ['loose', $booking->getId(), $status, $code]));
        }

        $booking->setIcalAckSignature($fingerprint);
        $now = new DateTimeImmutable('now');
        $booking->setIcalAckAt($now);

        $user = $this->getUser();
        if ($user !== null && method_exists($user, 'getId')) {
            $userId = $user->getId();
        } else {
            $userId = null;
        }
        $booking->setIcalAckUserId($userId);

        $this->em->persist($booking);
        $this->em->flush();

        return $this->json([
            'ok' => true,
            'bookingId' => $bookingId,
            'ackedAt' => $now->format(DATE_ATOM),
            'userId' => $userId,
        ]);
    }
}