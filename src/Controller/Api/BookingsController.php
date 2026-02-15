<?php

namespace App\Controller\Api;

use App\Repository\AllBookingsRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Request;
use App\Entity\AllBookings;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\Response;
use App\Service\BookingAggregatorService;
use App\Entity\PrivateReservation;
use App\Service\BookingStatusUpdaterService;
use App\Service\MonthSliceRefresher;
use App\Service\UnitListService;
use App\Service\HKCleaningManager;
use Doctrine\DBAL\Types\Types;

class BookingsController extends AbstractController
{
    public function __construct(
        private MonthSliceRefresher $refresher,
        private HKCleaningManager $hkCleaningManager
    ) {
    }

    #[Route('/api/bookings', name: 'api_bookings', methods: ['GET'])]
    public function index(Request $request, AllBookingsRepository $repository, BookingStatusUpdaterService $statusUpdater, EntityManagerInterface $em): JsonResponse
    {
        // Optional query params (Y-m-d): checkInFrom, checkInTo, checkOutFrom, checkOutTo
        $checkInFrom   = $request->query->get('checkInFrom');
        $checkInTo     = $request->query->get('checkInTo');
        $checkOutFrom  = $request->query->get('checkOutFrom');
        $checkOutTo    = $request->query->get('checkOutTo');
        $focusId      = $request->query->get('focusId') ?? $request->query->get('focus');

        // --- New: support unitId/unit_id, month, and mode=recon ---
        $unitIdParam = $request->query->get('unitId') ?? $request->query->get('unit_id');
        $monthParam  = $request->query->get('month');
        $mode        = strtolower((string)($request->query->get('mode') ?? ''));

        $unitId = null;
        if ($unitIdParam !== null && $unitIdParam !== '') {
            if (!is_numeric($unitIdParam)) {
                return new JsonResponse(['error' => 'Invalid unitId'], 400);
            }
            $unitId = (int) $unitIdParam;
            if ($unitId <= 0) {
                return new JsonResponse(['error' => 'Invalid unitId'], 400);
            }
        }

        $monthStart = null;
        $monthEnd = null;
        if ($monthParam !== null && $monthParam !== '') {
            $m = trim((string)$monthParam);
            if (!preg_match('/^\d{4}-\d{2}$/', $m)) {
                return new JsonResponse(['error' => 'Invalid month (expected YYYY-MM)'], 400);
            }
            try {
                $monthStart = new \DateTimeImmutable($m . '-01');
                $monthEnd = $monthStart->modify('last day of this month');
            } catch (\Throwable $e) {
                return new JsonResponse(['error' => 'Invalid month'], 400);
            }
        }

        $parseYmd = static function ($value): ?\DateTimeImmutable {
            if (empty($value)) return null;
            if ($value instanceof \DateTimeImmutable) return $value;
            if ($value instanceof \DateTimeInterface) {
                return \DateTimeImmutable::createFromMutable(new \DateTime($value->format('Y-m-d')));
            }
            $v = (string)$value;
            // first try strict Y-m-d
            $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $v);
            if ($dt instanceof \DateTimeImmutable) {
                return $dt;
            }
            // fallback: let DateTime parse common strings
            try {
                return new \DateTimeImmutable($v);
            } catch (\Throwable $e) {
                return null;
            }
        };

        $ciFromDt  = $parseYmd($checkInFrom);
        $ciToDt    = $parseYmd($checkInTo);
        $coFromDt  = $parseYmd($checkOutFrom);
        $coToDt    = $parseYmd($checkOutTo);

        $qb = $repository->createQueryBuilder('b');

        // NOTE: unitId filtering is applied inside the WHERE expression (especially for recon mode)
        // to avoid binding unused parameters when a later `$qb->where(...)` replaces conditions.

        // If caller provides any bounds, respect them; otherwise default to:
        // - ongoing stays (checkout >= today)
        // - plus current-month check-ins through +14 days after month end
        $hasExplicitRange = $ciFromDt || $ciToDt || $coFromDt || $coToDt;

        // --- New: recon mode (HK reconciliation) ---
        // Recon mode (HK reconciliation): focus on cleanings => checkout in month OR ongoing during month
        // Requires month=YYYY-MM. If provided, it overrides the default range logic.
        if ($mode === 'recon' && $monthStart instanceof \DateTimeImmutable && $monthEnd instanceof \DateTimeImmutable) {
            $checkoutInMonth = $qb->expr()->andX(
                $qb->expr()->gte('b.checkOut', ':mStart'),
                $qb->expr()->lte('b.checkOut', ':mEnd')
            );

            // Ongoing across month end: overlaps month but checkout is after month end
            // Important: only include truly ongoing stays (exclude Cancelled/Upcoming/etc.)
            $ongoingDuringMonth = $qb->expr()->andX(
                $qb->expr()->lte('b.checkIn', ':mEnd'),
                $qb->expr()->gte('b.checkOut', ':mStart'),
                $qb->expr()->gt('b.checkOut', ':mEnd'),
                $qb->expr()->eq('b.status', ':ongoingStatus')
            );

            $reconWindow = $qb->expr()->orX($checkoutInMonth, $ongoingDuringMonth);

            // Apply unit filter inside the expression if provided
            $base = $reconWindow;
            if ($unitId !== null) {
                $base = $qb->expr()->andX(
                    $qb->expr()->eq('b.unitId', ':unitId'),
                    $reconWindow
                );
                $qb->setParameter('unitId', $unitId);
            }

            // If a focusId is provided, always include that booking id in the result (even if outside unit/month)
            $where = $base;
            if (!empty($focusId)) {
                $where = $qb->expr()->orX(
                    $base,
                    $qb->expr()->eq('b.id', ':focusId')
                );
                $qb->setParameter('focusId', (int)$focusId);
            }

            $qb->where($where)
               ->setParameter('mStart', $monthStart, Types::DATE_IMMUTABLE)
               ->setParameter('mEnd', $monthEnd, Types::DATE_IMMUTABLE)
               ->setParameter('ongoingStatus', 'Ongoing');

            $bookings = $qb->getQuery()->getResult();
            $statusUpdater->updateStatuses($bookings, true);

            // Recon payload: keep it small for month notes modal
            // Also enrich Airbnb rows with reservationUrl from ical_events (match by reservation_code, fallback to confirmation_code)
            $airbnbCodes = [];
            foreach ($bookings as $b) {
                if (!$b instanceof AllBookings) { continue; }
                $src = method_exists($b, 'getSource') ? strtolower((string)($b->getSource() ?? '')) : '';
                if ($src !== 'airbnb') { continue; }
                $rc = method_exists($b, 'getReservationCode') ? (string)($b->getReservationCode() ?? '') : '';
                $cc = method_exists($b, 'getConfirmationCode') ? (string)($b->getConfirmationCode() ?? '') : '';
                $code = $rc !== '' ? $rc : $cc;
                if ($code !== '') {
                    $airbnbCodes[strtolower($code)] = true;
                }
            }

            $urlByCode = [];
            if (!empty($airbnbCodes)) {
                try {
                    $conn = $em->getConnection();
                    $codes = array_keys($airbnbCodes);
                    // Pull most recent reservation_url per reservation_code
                    // NOTE: we match on LOWER(reservation_code) to keep it case-insensitive
                    $sql = "
                        SELECT LOWER(reservation_code) AS rc, reservation_url
                          FROM ical_events
                         WHERE reservation_url IS NOT NULL
                           AND reservation_url <> ''
                           AND LOWER(reservation_code) IN (:codes)
                      ORDER BY updated_at DESC
                    ";
                    $rows = $conn->executeQuery(
                        $sql,
                        ['codes' => $codes],
                        ['codes' => \Doctrine\DBAL\Connection::PARAM_STR_ARRAY]
                    )->fetchAllAssociative();

                    foreach ($rows as $r) {
                        $k = (string)($r['rc'] ?? '');
                        if ($k !== '' && !isset($urlByCode[$k])) {
                            $urlByCode[$k] = (string)($r['reservation_url'] ?? '');
                        }
                    }
                } catch (\Throwable $e) {
                    // best-effort: ignore
                }
            }

            $data = array_map(function ($b) use ($urlByCode) {
                if (!$b instanceof AllBookings) {
                    return null;
                }
                $src = method_exists($b, 'getSource') ? (string)($b->getSource() ?? '') : null;
                $srcLower = strtolower((string)($src ?? ''));
                $rc = method_exists($b, 'getReservationCode') ? (string)($b->getReservationCode() ?? '') : '';
                $cc = method_exists($b, 'getConfirmationCode') ? (string)($b->getConfirmationCode() ?? '') : '';
                $codeKey = strtolower($rc !== '' ? $rc : $cc);
                $reservationUrl = null;
                if ($srcLower === 'airbnb' && $codeKey !== '' && isset($urlByCode[$codeKey]) && $urlByCode[$codeKey] !== '') {
                    $reservationUrl = $urlByCode[$codeKey];
                }

                return [
                    'id' => $b->getId(),
                    'confirmationCode' => method_exists($b, 'getConfirmationCode') ? $b->getConfirmationCode() : null,
                    'reservationCode' => method_exists($b, 'getReservationCode') ? $b->getReservationCode() : null,
                    'guestName' => method_exists($b, 'getGuestName') ? $b->getGuestName() : null,
                    'source' => $src,
                    'status' => method_exists($b, 'getStatus') ? $b->getStatus() : null,
                    'checkIn' => $b->getCheckIn()?->format('Y-m-d'),
                    'checkOut' => $b->getCheckOut()?->format('Y-m-d'),
                    'paid' => method_exists($b, 'getIsPaid') ? (bool)$b->getIsPaid() : (method_exists($b, 'isPaid') ? (bool)$b->isPaid() : null),
                    'reservationUrl' => $reservationUrl,
                ];
            }, $bookings);

            // remove nulls defensively
            $data = array_values(array_filter($data));

            return $this->json($data);
        }

        if ($hasExplicitRange) {
            $andX = $qb->expr()->andX();
            if ($unitId !== null) {
                $andX->add($qb->expr()->eq('b.unitId', ':unitId'));
                $qb->setParameter('unitId', $unitId);
            }
            if ($ciFromDt) {
                $andX->add($qb->expr()->gte('b.checkIn', ':ciFrom'));
                $qb->setParameter('ciFrom', $ciFromDt, Types::DATE_IMMUTABLE);
            }
            if ($ciToDt) {
                $andX->add($qb->expr()->lte('b.checkIn', ':ciTo'));
                $qb->setParameter('ciTo', $ciToDt, Types::DATE_IMMUTABLE);
            }
            if ($coFromDt) {
                $andX->add($qb->expr()->gte('b.checkOut', ':coFrom'));
                $qb->setParameter('coFrom', $coFromDt, Types::DATE_IMMUTABLE);
            }
            if ($coToDt) {
                $andX->add($qb->expr()->lte('b.checkOut', ':coTo'));
                $qb->setParameter('coTo', $coToDt, Types::DATE_IMMUTABLE);
            }
            if ($andX->count() > 0) {
                // If a focusId is provided, always include that booking id in the result
                if (!empty($focusId)) {
                    $orX = $qb->expr()->orX(
                        $andX,
                        $qb->expr()->eq('b.id', ':focusId')
                    );
                    $qb->where($orX)
                       ->setParameter('focusId', (int)$focusId);
                } else {
                    $qb->where($andX);
                }
            }
        } else {
            $today = new \DateTimeImmutable('today');

            // New business rule:
            // checkInFrom = first day of current month - 3 months
            // checkOutTo = end of current month + 6 months
            $monthStartDefault = $today->modify('first day of this month')->modify('-3 months');
            $monthEndDefault   = $today->modify('last day of this month')->modify('+6 months');

            $ongoing = $qb->expr()->gte('b.checkOut', ':today');
            $upcoming = $qb->expr()->andX(
                $qb->expr()->gte('b.checkIn', ':monthStart'),
                $qb->expr()->lte('b.checkOut', ':monthEnd')
            );

            $baseWhere = $qb->expr()->orX($ongoing, $upcoming);
            if ($unitId !== null) {
                $baseWhere = $qb->expr()->andX(
                    $qb->expr()->eq('b.unitId', ':unitId'),
                    $baseWhere
                );
                $qb->setParameter('unitId', $unitId);
            }

            // If a focusId is provided, always include that booking id in the result
            if (!empty($focusId)) {
                $baseWhere = $qb->expr()->orX(
                    $baseWhere,
                    $qb->expr()->eq('b.id', ':focusId')
                );
                $qb->setParameter('focusId', (int)$focusId);
            }

            $qb->where($baseWhere)
               ->setParameter('today', $today, Types::DATE_IMMUTABLE)
               ->setParameter('monthStart', $monthStartDefault, Types::DATE_IMMUTABLE)
               ->setParameter('monthEnd', $monthEndDefault, Types::DATE_IMMUTABLE);
        }

        $bookings = $qb->getQuery()->getResult();
        // Update statuses before returning
        $statusUpdater->updateStatuses($bookings, true);

        return $this->json($bookings);
    }

    #[Route('/api/bookings/check-activity', name: 'api_check_activity', methods: ['GET'])]
    public function checkActivity(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $start = $request->query->get('start');
        $end = $request->query->get('end');
        $city = $request->query->get('city');

        $parseYmd = static function ($value): ?\DateTimeImmutable {
            if (empty($value)) return null;
            if ($value instanceof \DateTimeImmutable) return $value;
            if ($value instanceof \DateTimeInterface) {
                return \DateTimeImmutable::createFromMutable(new \DateTime($value->format('Y-m-d')));
            }
            $v = (string)$value;
            $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $v);
            if ($dt instanceof \DateTimeImmutable) {
                return $dt;
            }
            try {
                return new \DateTimeImmutable($v);
            } catch (\Throwable $e) {
                return null;
            }
        };

        $startDt = $parseYmd($start);
        $endDt   = $parseYmd($end);

        if (!$startDt || !$endDt) {
            return new JsonResponse(['error' => 'Missing or invalid date range'], 400);
        }

        $qb = $em->getRepository(AllBookings::class)->createQueryBuilder('b')
            ->where('(b.checkIn BETWEEN :start AND :end) OR (b.checkOut BETWEEN :start AND :end)')
            ->setParameter('start', $startDt, Types::DATE_IMMUTABLE)
            ->setParameter('end', $endDt, Types::DATE_IMMUTABLE);

        if ($city) {
            $qb->andWhere('b.city = :city')->setParameter('city', $city);
        }

        $bookings = $qb->getQuery()->getResult();

        $data = array_map(fn($b) => [
            'id' => $b->getId(),
            'unit' => $b->getUnitId(),
            'guest' => $b->getGuestName(),
            'check_in' => $b->getCheckIn()?->format('Y-m-d'),
            'check_out' => $b->getCheckOut()?->format('Y-m-d'),
            'notes' => $b->getNotes(),
            'check_in_notes' => $b->getCheckInNotes(),
            'check_out_notes' => $b->getCheckOutNotes(),
            'city' => $b->getCity()
        ], $bookings);

        return $this->json($data);
    }

    #[Route('/api/bookings/{id}', name: 'api_booking_show', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(int $id, AllBookingsRepository $repository, EntityManagerInterface $em): JsonResponse
    {
        $booking = $repository->find($id);

        if (!$booking) {
            return new JsonResponse(['error' => 'Booking not found'], 404);
        }

        // Lookup reservation_url from ical_events (prefer reservation_code, with fallbacks)
        $reservationUrl = null;
        try {
            $conn = $em->getConnection();
            $cc = method_exists($booking, 'getConfirmationCode') ? (string)($booking->getConfirmationCode() ?? '') : '';
            $rc = method_exists($booking, 'getReservationCode') ? (string)($booking->getReservationCode() ?? '') : '';
            $url = $conn->fetchOne(
                'SELECT reservation_url
                   FROM ical_events
                  WHERE booking_id = :bid
                     OR LOWER(reservation_code) = LOWER(:rc)
                     OR ( :rc = \'\' AND LOWER(reservation_code) = LOWER(:cc) )
               ORDER BY updated_at DESC
                  LIMIT 1',
                ['bid' => $booking->getId(), 'rc' => $rc, 'cc' => $cc]
            );
            if (is_string($url) && $url !== '') { $reservationUrl = $url; }
        } catch (\Throwable $e) {
            // best-effort: ignore errors
        }

        $tzCancun = new \DateTimeZone('America/Cancun');
        $response = [
            'id' => $booking->getId(),
            'reservationCode' => method_exists($booking, 'getReservationCode') ? $booking->getReservationCode() : null,
            'originalCode' => method_exists($booking, 'getOriginalCode') ? $booking->getOriginalCode() : null,
            'bookingDate' => method_exists($booking, 'getBookingDate') ? $booking->getBookingDate()?->format('Y-m-d') : null,
            'source' => method_exists($booking, 'getSource') ? $booking->getSource() : null,
            'guestName' => $booking->getGuestName(),
            'guestType' => method_exists($booking, 'getGuestType') ? $booking->getGuestType() : null,
            'status' => $booking->getStatus(),
            'unitName' => method_exists($booking, 'getUnitName') ? $booking->getUnitName() : null,
            'unitId' => method_exists($booking, 'getUnitId') ? $booking->getUnitId() : null,
            'city' => method_exists($booking, 'getCity') ? $booking->getCity() : null,
            'guests' => method_exists($booking, 'getGuests') ? $booking->getGuests() : null,
            'checkIn' => $booking->getCheckIn()?->format('Y-m-d'),
            'checkOut' => $booking->getCheckOut()?->format('Y-m-d'),
            'payout' => method_exists($booking, 'getPayout') ? $booking->getPayout() : null,
            'paymentMethod' => method_exists($booking, 'getPaymentMethod') ? $booking->getPaymentMethod() : null,
            'cleaningFee' => method_exists($booking, 'getCleaningFee') ? $booking->getCleaningFee() : null,
            'commissionPercent' => method_exists($booking, 'getCommissionPercent') ? $booking->getCommissionPercent() : null,
            'notes' => $booking->getNotes(),
            'reservationUrl' => $reservationUrl,
        ];

        return $this->json($response);
    }

    #[Route('/api/bookings/{id}', name: 'api_booking_update', methods: ['PUT'], requirements: ['id' => '\\d+'])]
    public function update(Request $request, EntityManagerInterface $entityManager, BookingAggregatorService $aggregator, MonthSliceRefresher $refresher, BookingStatusUpdaterService $statusUpdater, string $id): JsonResponse
    {
        $id = (int) $id;
        $booking = $entityManager->getRepository(AllBookings::class)->find($id);

        if (!$booking) {
            return new JsonResponse(['message' => 'Booking not found'], Response::HTTP_NOT_FOUND);
        }

        // Capture original dates before applying updates so we can refresh old months if needed
        $oldCheckIn  = $booking->getCheckIn();
        $oldCheckOut = $booking->getCheckOut();

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            $data = [];
        }

        // --- Soft reservation normalization (Owners2 Block/Hold) ---
        $incomingType = isset($data['type']) ? (string)$data['type'] : null;
        $incomingReason = (string)($data['reason'] ?? $data['block_reason'] ?? $data['guestType'] ?? $data['guest_type'] ?? '');
        $incomingStart = (string)($data['start'] ?? '');
        $incomingEnd   = (string)($data['end'] ?? '');
        $incomingBookingDate = (string)($data['bookingDate'] ?? $data['booking_date'] ?? '');

        // Derive soft intent when `type` is missing:
        // - If guest_name or reason looks like a Block reason (Cleaning/Maintenance/Late Check-Out/Other), treat as Block.
        // - If guest_type equals Hold, treat as Hold.
        $incomingGuestName = (string)($data['guest_name'] ?? $data['guestName'] ?? '');
        $incomingGuestType = (string)($data['guest_type'] ?? $data['guestType'] ?? '');
        if (!$incomingType) {
            $gn = strtolower(trim($incomingGuestName));
            $gt = strtolower(trim($incomingGuestType));
            if ($gt === 'hold') {
                $incomingType = 'Hold';
            } elseif ($gn !== '' || $incomingReason !== '') {
                $probe = $incomingReason !== '' ? strtolower($incomingReason) : $gn;
                if (str_contains($probe, 'clean')) {
                    $incomingType = 'Block';
                    $incomingReason = 'Cleaning';
                } elseif (str_contains($probe, 'maint') || str_contains($probe, 'repair') || str_contains($probe, 'fix')) {
                    $incomingType = 'Block';
                    $incomingReason = 'Maintenance';
                } elseif (str_contains($probe, 'late') && (str_contains($probe, 'checkout') || str_contains($probe, 'check-out') || str_contains($probe, 'check out'))) {
                    $incomingType = 'Block';
                    $incomingReason = 'Late Check-Out';
                } elseif ($probe !== '') {
                    $incomingType = 'Block';
                    $incomingReason = 'Other';
                }
            }
        }

        // Treat as "soft" if Source is Owners2 or if type/guest_type indicate a Hold/Block reason
        $isSoft = false;
        if (method_exists($booking, 'getSource') && strtolower((string)$booking->getSource()) === 'owners2') {
            $isSoft = true;
        } else {
            $gt = strtolower((string)($booking->getGuestType() ?? ''));
            if (in_array($gt, ['hold','block','cleaning','maintenance','late check-out','late checkout','other'], true)) {
                $isSoft = true;
            }
        }

        // If still no explicit type from payload and this is an Owners2 soft entry,
        // infer from the persisted booking (default: Block unless Hold is explicit)
        if ($isSoft && !$incomingType) {
            $persistedGt = strtolower((string)($booking->getGuestType() ?? ''));
            if ($persistedGt === 'hold' || strtolower((string)$booking->getStatus()) === 'hold') {
                $incomingType = 'Hold';
            } else {
                $incomingType = 'Block';
            }
        }

        if ($isSoft) {
            // Normalize Block edits
            if (is_string($incomingType) && strcasecmp($incomingType, 'Block') === 0) {
                // start/end → checkIn/checkOut, but do not overwrite unless provided
                if ($incomingStart !== '') {
                    try { $booking->setCheckIn(new \DateTimeImmutable($incomingStart)); } catch (\Throwable $e) {}
                }
                if ($incomingEnd !== '') {
                    try { $booking->setCheckOut(new \DateTimeImmutable($incomingEnd)); } catch (\Throwable $e) {}
                }

                // reason or guest_name -> guestType + guestName (canonical)
                $reasonSource = $incomingReason !== '' ? $incomingReason : $incomingGuestName;
                $norm = strtolower(trim($reasonSource));
                if ($norm !== '') {
                    if (str_contains($norm, 'clean')) {
                        $reason = 'Cleaning';
                    } elseif (str_contains($norm, 'maint') || str_contains($norm, 'repair') || str_contains($norm, 'fix')) {
                        $reason = 'Maintenance';
                    } elseif (str_contains($norm, 'late') && (str_contains($norm, 'checkout') || str_contains($norm, 'check-out') || str_contains($norm, 'check out'))) {
                        $reason = 'Late Check-Out';
                    } else {
                        $reason = 'Other';
                    }
                    if (method_exists($booking, 'setGuestType')) { $booking->setGuestType('Block'); }
                    if (method_exists($booking, 'setGuestName')) { $booking->setGuestName($reason); }
                }

                // Force source Owners2 to keep semantics
                if (method_exists($booking, 'setSource')) { $booking->setSource('Owners2'); }

                // For Block we keep finance fields at zero; do not recalc here.
                // Respect incoming status if provided later in generic section.
            }

            // Normalize Hold edits (if type=Hold we allow date changes here)
            if (is_string($incomingType) && strcasecmp($incomingType, 'Hold') === 0) {
                if (!empty($data['checkIn'] ?? $data['check_in'] ?? null)) {
                    try { $booking->setCheckIn(new \DateTimeImmutable((string)($data['checkIn'] ?? $data['check_in']))); } catch (\Throwable $e) {}
                }
                if (!empty($data['checkOut'] ?? $data['check_out'] ?? null)) {
                    try { $booking->setCheckOut(new \DateTimeImmutable((string)($data['checkOut'] ?? $data['check_out']))); } catch (\Throwable $e) {}
                }
                if (method_exists($booking, 'setGuestType')) { $booking->setGuestType('Hold'); }
                if (method_exists($booking, 'setSource')) { $booking->setSource('Owners2'); }
            }

            // Optional: allow updating bookingDate from edit payload (kept if not provided)
            if ($incomingBookingDate !== '') {
                try {
                    // Interpret in America/Cancun to match creation logic
                    $tzCancun = new \DateTimeZone('America/Cancun');
                    $booking->setBookingDate(new \DateTimeImmutable($incomingBookingDate, $tzCancun));
                } catch (\Throwable $e) {}
            }
        }

        // --- Update editable fields ---
        $unitName = $data['unitName'] ?? $data['unit_name'] ?? null;
        if ($unitName !== null) {
            $booking->setUnitName((string)$unitName);
        }

        $status = $data['status'] ?? null;
        if ($status !== null) {
            // If this is an Owners2 soft entry, respect 'Active' or 'Cancelled' as-is
            $statusStr = (string)$status;
            if ($isSoft && in_array($statusStr, ['Active','Cancelled'], true)) {
                $booking->setStatus($statusStr);
            } else {
                $booking->setStatus($statusStr);
            }
        }

        $guestName = $data['guestName'] ?? $data['guest_name'] ?? null;
        if ($guestName !== null) {
            $booking->setGuestName((string)$guestName);
        }
        // If guestName provided in payload and $isSoft is true and guestType empty, set guestType from guestName if it matches block reasons
        if ($isSoft && $guestName !== null && method_exists($booking, 'getGuestType') && !$booking->getGuestType()) {
            $gnorm = strtolower((string)$guestName);
            if (str_contains($gnorm, 'clean')) { $booking->setGuestType('Cleaning'); }
            elseif (str_contains($gnorm, 'maint') || str_contains($gnorm, 'repair') || str_contains($gnorm, 'fix')) { $booking->setGuestType('Maintenance'); }
            elseif (str_contains($gnorm, 'late') && (str_contains($gnorm, 'checkout') || str_contains($gnorm, 'check-out') || str_contains($gnorm, 'check out'))) { $booking->setGuestType('Late Check-Out'); }
            elseif ($gnorm !== '') { $booking->setGuestType('Other'); }
        }

        if (isset($data['guests'])) {
            $booking->setGuests((int)$data['guests']);
        }

        if (!empty($data['checkIn'] ?? $data['check_in'] ?? null)) {
            $booking->setCheckIn(new \DateTimeImmutable($data['checkIn'] ?? $data['check_in']));
        }

        if (!empty($data['checkOut'] ?? $data['check_out'] ?? null)) {
            $booking->setCheckOut(new \DateTimeImmutable($data['checkOut'] ?? $data['check_out']));
        }

        // Safety net: map start/end (Block edits) to checkIn/checkOut if provided
        if (!empty($data['start'] ?? null)) {
            try { $booking->setCheckIn(new \DateTimeImmutable((string)$data['start'])); } catch (\Throwable $e) {}
        }
        if (!empty($data['end'] ?? null)) {
            try { $booking->setCheckOut(new \DateTimeImmutable((string)$data['end'])); } catch (\Throwable $e) {}
        }

        if (isset($data['payout'])) {
            $booking->setPayout((float)$data['payout']);
        }

        if (array_key_exists('isPaid', $data) || array_key_exists('is_paid', $data)) {
            $paidVal = $data['isPaid'] ?? $data['is_paid'];
            $booking->setIsPaid((bool)$paidVal);
        }

        $pm = $data['paymentMethod'] ?? $data['payment_method'] ?? null;
        if ($pm !== null) {
            $booking->setPaymentMethod((string)$pm);
        }

        if (isset($data['cleaningFee']) || isset($data['cleaning_fee'])) {
            $booking->setCleaningFee((float)($data['cleaningFee'] ?? $data['cleaning_fee']));
        }

        if (isset($data['commissionPercent']) || isset($data['commission_percent'])) {
            $booking->setCommissionPercent((float)($data['commissionPercent'] ?? $data['commission_percent']));
        }

        if (array_key_exists('notes', $data)) {
            $booking->setNotes((string)$data['notes']);
        }

        $checkInNotes = $data['checkInNotes'] ?? $data['check_in_notes'] ?? null;
        if ($checkInNotes !== null) {
            $booking->setCheckInNotes((string)$checkInNotes);
        }

        $checkOutNotes = $data['checkOutNotes'] ?? $data['check_out_notes'] ?? null;
        if ($checkOutNotes !== null) {
            $booking->setCheckOutNotes((string)$checkOutNotes);
        }

        if (isset($data['reason'])) {
            $r = (string)$data['reason'];
            $norm = strtolower(trim($r));
            if ($norm !== '') {
                if (str_contains($norm, 'clean')) {
                    $reasonCanon = 'Cleaning';
                } elseif (str_contains($norm, 'maint') || str_contains($norm, 'repair') || str_contains($norm, 'fix')) {
                    $reasonCanon = 'Maintenance';
                } elseif (str_contains($norm, 'late') && (str_contains($norm, 'checkout') || str_contains($norm, 'check-out') || str_contains($norm, 'check out'))) {
                    $reasonCanon = 'Late Check-Out';
                } else {
                    $reasonCanon = 'Other';
                }
                if (method_exists($booking, 'setGuestType')) { $booking->setGuestType($reasonCanon); }
                if (method_exists($booking, 'setGuestName')) { $booking->setGuestName($reasonCanon); }
            }
        }

        // For Block rows (Cleaning/Maintenance/Late Check-Out/Other/Block) keep finance at zero
        $gtLower = strtolower((string)($booking->getGuestType() ?? ''));
        if ($gtLower === 'block' || in_array($gtLower, ['cleaning','maintenance','late check-out','late checkout','other'], true)) {
            if (method_exists($booking, 'setPayout')) { $booking->setPayout(0.0); }
            if (method_exists($booking, 'setCommissionPercent')) { $booking->setCommissionPercent(0.0); }
            if (method_exists($booking, 'setPaymentMethod')) { $booking->setPaymentMethod('n/a'); }
            if (method_exists($booking, 'setIsPaid')) { $booking->setIsPaid(false); }
            if (method_exists($booking, 'setTaxPercent')) { $booking->setTaxPercent(0.0); }
            if (method_exists($booking, 'setTaxAmount')) { $booking->setTaxAmount(0.0); }
            if (method_exists($booking, 'setCleaningFee')) { $booking->setCleaningFee(0.0); }
            if (method_exists($booking, 'setCommissionBase')) { $booking->setCommissionBase(0.0); }
            if (method_exists($booking, 'setCommissionValue')) { $booking->setCommissionValue(0.0); }
            if (method_exists($booking, 'setNetPayout')) { $booking->setNetPayout(0.0); }
            if (method_exists($booking, 'setRoomFee')) { $booking->setRoomFee(0.0); }
            if (method_exists($booking, 'setClientIncome')) { $booking->setClientIncome(0.0); }
            if (method_exists($booking, 'setO2Total')) { $booking->setO2Total(0.0); }
        }

        // Recalculate derived fields (commission base/value, client income, o2 totals, etc.) before saving
        $aggregator->recalculateAllBookingFields($booking);

        // Stamp last updated when edited manually through API
        if (method_exists($booking, 'setLastUpdatedAt')) {
            $booking->setLastUpdatedAt(new \DateTimeImmutable());
        }
        if (method_exists($booking, 'setLastUpdatedVia')) {
            $booking->setLastUpdatedVia('manual');
        }

        $entityManager->persist($booking);
        $entityManager->flush();

        // If dates changed, resync hk_cleanings for this booking so checkout_date stays aligned
        // (HKCleaningManager.bulkCreate() will update existing rows when report_status is pending)
        $datesChanged = false;
        if ($oldCheckIn instanceof \DateTimeInterface && $booking->getCheckIn() instanceof \DateTimeInterface) {
            $datesChanged = $datesChanged || ($oldCheckIn->format('Y-m-d') !== $booking->getCheckIn()->format('Y-m-d'));
        } elseif (($oldCheckIn instanceof \DateTimeInterface) !== ($booking->getCheckIn() instanceof \DateTimeInterface)) {
            $datesChanged = true;
        }
        if ($oldCheckOut instanceof \DateTimeInterface && $booking->getCheckOut() instanceof \DateTimeInterface) {
            $datesChanged = $datesChanged || ($oldCheckOut->format('Y-m-d') !== $booking->getCheckOut()->format('Y-m-d'));
        } elseif (($oldCheckOut instanceof \DateTimeInterface) !== ($booking->getCheckOut() instanceof \DateTimeInterface)) {
            $datesChanged = true;
        }

        if ($datesChanged) {
            try {
                $rc = method_exists($booking, 'getReservationCode') ? (string)($booking->getReservationCode() ?? '') : '';
                $cc = method_exists($booking, 'getConfirmationCode') ? (string)($booking->getConfirmationCode() ?? '') : '';
                $payload = [
                    'bookingId'       => $booking->getId(),
                    'unitId'          => method_exists($booking, 'getUnitId') ? (int)$booking->getUnitId() : null,
                    'city'            => method_exists($booking, 'getCity') ? (string)$booking->getCity() : null,
                    'reservationCode' => $rc !== '' ? $rc : ($cc !== '' ? $cc : null),
                    'checkoutDate'    => $booking->getCheckOut()?->format('Y-m-d'),
                    'cleaningType'    => 'checkout',
                ];
                $this->hkCleaningManager->bulkCreate([$payload]);
            } catch (\Throwable $e) {
                // Non-fatal: booking saved; ignore HK sync errors
            }
        }

        // After flush, refresh month slices. First purge any slices in old month range if dates changed.
        $newCheckIn  = $booking->getCheckIn();
        $newCheckOut = $booking->getCheckOut();

        // If old dates existed and changed, refresh old range to remove stale slices
        if ($oldCheckIn instanceof \DateTimeInterface && $oldCheckOut instanceof \DateTimeInterface) {
            $oldRangeMonthKey = $oldCheckIn->format('Y-m') . '->' . $oldCheckOut->format('Y-m');
            $newRangeMonthKey = ($newCheckIn instanceof \DateTimeInterface ? $newCheckIn->format('Y-m') : '') . '->' .
                                ($newCheckOut instanceof \DateTimeInterface ? $newCheckOut->format('Y-m') : '');
            if (
                !($newCheckIn instanceof \DateTimeInterface) ||
                !($newCheckOut instanceof \DateTimeInterface) ||
                $oldRangeMonthKey !== $newRangeMonthKey ||
                $oldCheckIn != $newCheckIn ||
                $oldCheckOut != $newCheckOut
            ) {
                $refresher->refreshForBooking($booking->getId(), $oldCheckIn, $oldCheckOut);
            }
        }

        // Always refresh for the new/persisted dates when both exist
        if ($newCheckIn instanceof \DateTimeInterface && $newCheckOut instanceof \DateTimeInterface) {
            $refresher->refreshForBooking($booking->getId(), $newCheckIn, $newCheckOut);
        }

        // Recompute and sync housekeeping (will flip hk_cleanings to cancelled when applicable)
        try {
            $statusUpdater->updateStatuses([$booking], true);
        } catch (\Throwable $e) {
            // Non-fatal: booking saved; log/ignore sync errors
        }

        return $this->json($booking);
    }

    #[Route('/bookings/edit/{id}', name: 'booking_edit_page', methods: ['GET'])]
    public function editPage(): Response
    {
        return $this->render('base.html.twig');
    }
    
    #[Route('/api/bookings/private-reservation', name: 'create_private_booking', methods: ['POST'])]
    public function createPrivateBooking(Request $request, BookingAggregatorService $aggregator, EntityManagerInterface $entityManager): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) { $data = []; }

        $parseYMD = static function ($value): ?\DateTimeImmutable {
            if (empty($value)) return null;
            if ($value instanceof \DateTimeImmutable) return $value;
            if ($value instanceof \DateTimeInterface) return \DateTimeImmutable::createFromMutable(new \DateTime($value->format('Y-m-d')));
            $v = (string)$value;
            // first try strict Y-m-d
            $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $v);
            if ($dt instanceof \DateTimeImmutable) return $dt;
            // fallback: let DateTime parse common strings
            try {
                return new \DateTimeImmutable($v);
            } catch (\Throwable $e) {
                return null;
            }
        };

        $reservation = new PrivateReservation();
        // Prefer explicit booking_date, else fall back to check_in, else today
        $bookingDateStr = $data['booking_date'] ?? $data['bookingDate'] ?? ($data['check_in'] ?? $data['checkIn'] ?? null);
        $bookingDate = $parseYMD($bookingDateStr) ?: new \DateTimeImmutable('today');
        $reservation
            ->setBookingDate($bookingDate)
            ->setGuestName($data['guest_name'] ?? $data['guestName'] ?? '');

        // Resolve Unit from payload (accepts unitId, unit_id, or IRI in `unit`)
        $rawUnitId = $data['unit_id'] ?? $data['unitId'] ?? ($data['unit'] ?? null);

        // If we received an IRI like "/api/units/8", extract the numeric id
        if (is_string($rawUnitId) && preg_match('~^/api/units/(\d+)$~', $rawUnitId, $m)) {
            $rawUnitId = $m[1];
        }

        if (empty($rawUnitId) || !is_numeric($rawUnitId)) {
            return new JsonResponse([
                'error' => 'Invalid or missing unitId',
                'received' => [
                    'unit_id' => $data['unit_id'] ?? null,
                    'unitId' => $data['unitId'] ?? null,
                    'unit' => $data['unit'] ?? null,
                ]
            ], Response::HTTP_BAD_REQUEST);
        }

        $unitId = (int) $rawUnitId;
        $reservation->setUnitId($unitId);

        // Attempt to get Unit entity by numeric id
        $unitRepo = $entityManager->getRepository(\App\Entity\Unit::class);
        $unit = $unitRepo->find($unitId);

        // Optional fallback: if not found and unitName provided, try to resolve by unit_name
        if (!$unit && isset($data['unit_name'])) {
            $unit = $unitRepo->findOneBy(['unitName' => $data['unit_name']]);
        }
        if (!$unit && isset($data['unitName'])) {
            $unit = $unitRepo->findOneBy(['unitName' => $data['unitName']]);
        }

        if ($unit) {
            $reservation->setCity($unit->getCity());
        } else {
            return new JsonResponse([
                'error' => 'Unit not found',
                'message' => 'Unit could not be found for supplied identifier',
                'debug' => [ 'unitId' => $unitId, 'unitName' => $data['unitName'] ?? $data['unit_name'] ?? null ]
            ], Response::HTTP_BAD_REQUEST);
        }

        $reservation
            ->setNrOfGuests((int) ($data['guests'] ?? 0))
            ->setCheckIn($parseYMD($data['check_in'] ?? $data['checkIn'] ?? null) ?? throw new \InvalidArgumentException('Invalid or missing check_in'))
            ->setCheckOut($parseYMD($data['check_out'] ?? $data['checkOut'] ?? null) ?? throw new \InvalidArgumentException('Invalid or missing check_out'))
            ->setPayout((float) ($data['payout'] ?? 0))
            ->setCleaningFee((float) ($data['cleaning_fee'] ?? $data['cleaningFee'] ?? 0))
            ->setGuestType($data['guest_type'] ?? $data['guestType'] ?? 'new')
            ->setPaymentMethod($data['payment_method'] ?? $data['paymentMethod'] ?? 'cash');

        try {
            $booking = $aggregator->createAllBookingFromPrivateReservation($reservation);
            $entityManager->flush();

            // Apply optional notes fields directly on the created booking (PrivateReservation may not expose these)
            if ($booking instanceof AllBookings) {
                if (array_key_exists('notes', $data)) {
                    $booking->setNotes((string)$data['notes']);
                }
                if (array_key_exists('check_in_notes', $data) || array_key_exists('checkInNotes', $data)) {
                    $cin = $data['check_in_notes'] ?? $data['checkInNotes'] ?? '';
                    $booking->setCheckInNotes((string)$cin);
                }
                if (array_key_exists('check_out_notes', $data) || array_key_exists('checkOutNotes', $data)) {
                    $con = $data['check_out_notes'] ?? $data['checkOutNotes'] ?? '';
                    $booking->setCheckOutNotes((string)$con);
                }
                $entityManager->persist($booking);
                $entityManager->flush();
            }

            // Ensure month slices exist for this new booking
            if ($booking instanceof \App\Entity\AllBookings) {
                $ci = $booking->getCheckIn();
                $co = $booking->getCheckOut();
                if ($ci instanceof \DateTimeInterface && $co instanceof \DateTimeInterface) {
                    $this->refresher->refreshForBooking($booking->getId(), $ci, $co);
                }
            }

            return $this->json($booking);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'error' => 'Failed to create private booking',
                'message' => $e->getMessage()
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    #[Route('/api/bookings/manual-airbnb', name: 'create_manual_airbnb_booking', methods: ['POST'])]
    public function createManualAirbnbBooking(Request $request, BookingAggregatorService $aggregator, EntityManagerInterface $entityManager): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        try {
            // Retrieve city from Unit entity and set it in $data
            $unitId = $data['unit_id'] ?? null;
            if (empty($unitId) || !is_numeric($unitId)) {
                return new JsonResponse(['error' => 'Invalid or missing unit_id'], Response::HTTP_BAD_REQUEST);
            }

            $unit = $entityManager->getRepository(\App\Entity\Unit::class)->find($unitId);
            if (!$unit) {
                return new JsonResponse(['error' => "Unit not found for unit_id: $unitId"], Response::HTTP_BAD_REQUEST);
            }

            $data['city'] = $unit->getCity();

            $booking = $aggregator->createAllBookingFromManualAirbnb($data);
            $entityManager->flush();

            // Ensure month slices exist for this new booking
            if ($booking instanceof \App\Entity\AllBookings) {
                $ci = $booking->getCheckIn();
                $co = $booking->getCheckOut();
                if ($ci instanceof \DateTimeInterface && $co instanceof \DateTimeInterface) {
                    $this->refresher->refreshForBooking($booking->getId(), $ci, $co);
                }
            }

            return $this->json($booking);
        } catch (\Exception $e) {
            return new JsonResponse([
                'error' => 'Failed to create manual Airbnb booking',
                'message' => $e->getMessage()
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    #[Route('/api/soft-reservations', name: 'api_soft_reservations_create', methods: ['POST'])]
    public function createSoftReservation(Request $req, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($req->getContent(), true) ?? [];

        $type = trim((string)($data['type'] ?? ''));// 'Hold' | 'Block'
        $rawUnitId = $data['unit_id'] ?? $data['unitId'] ?? ($data['unit'] ?? null);
        $checkInStr = (string)($data['check_in'] ?? $data['checkIn'] ?? '');
        $checkOutStr = (string)($data['check_out'] ?? $data['checkOut'] ?? '');
        $guestName = (string)($data['guest_name'] ?? $data['guestName'] ?? '');
        $note = (string)($data['note'] ?? '');

        $expiry = (string)($data['expiry'] ?? '');                 // '24h'|'48h'|'custom'
        $customExpireAtStr = $data['custom_expire_at'] ?? $data['customExpireAt'] ?? null;

        $blockReason = (string)($data['block_reason'] ?? $data['blockReason'] ?? ''); // for Block

        $payoutInput = $data['payout'] ?? null;
        $paymentMethodInput = $data['payment_method'] ?? $data['paymentMethod'] ?? null;

        if (!in_array($type, ['Hold', 'Block'], true)) {
            return new JsonResponse(['error' => 'Invalid type. Use Hold or Block.'], 422);
        }

        // Accept IRI like "/api/units/8"
        if (is_string($rawUnitId) && preg_match('~^/api/units/(\d+)$~', $rawUnitId, $m)) {
            $rawUnitId = $m[1];
        }
        if (empty($rawUnitId) || !is_numeric($rawUnitId)) {
            return new JsonResponse(['error' => 'Invalid or missing unitId'], 422);
        }
        $unitId = (int)$rawUnitId;

        // Parse dates (require both)
        try {
            $checkIn = new \DateTimeImmutable($checkInStr);
            $checkOut = new \DateTimeImmutable($checkOutStr);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Invalid check_in/check_out format'], 422);
        }
        if (!$checkIn || !$checkOut || $checkOut <= $checkIn) {
            return new JsonResponse(['error' => 'checkOut must be after checkIn'], 422);
        }

        // Resolve Unit to fetch city (like other endpoints)
        $unitRepo = $em->getRepository(\App\Entity\Unit::class);
        $unit = $unitRepo->find($unitId);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found for unit_id: ' . $unitId], 422);
        }

        $b = new AllBookings();
        $b->setUnitId($unitId);
        $b->setCity($unit->getCity());
        if (method_exists($b, 'setUnitName') && method_exists($unit, 'getUnitName')) {
            $b->setUnitName($unit->getUnitName());
        }
        $b->setCheckIn($checkIn);
        $b->setCheckOut($checkOut);
        $tzCancun = new \DateTimeZone('America/Cancun');
        $b->setBookingDate(new \DateTimeImmutable('today', $tzCancun));
        // Ensure non-nullable days (length of stay)
        if (method_exists($b, 'setDays')) {
            $interval = $checkIn->diff($checkOut);
            $days = max(0, (int)$interval->days);
            $b->setDays($days);
        }
        $b->setNotes($note ?: null);
        if ($guestName) { $b->setGuestName($guestName); }
        // Ensure non-nullable guests (defaults)
        if (method_exists($b, 'setGuests')) {
            $b->setGuests($type === 'Block' ? 0 : 1); // Blocks have 0 guests; Holds default to 1
        }
        // Ensure non-nullable source (soft reservations originate in Owners2)
        if (method_exists($b, 'setSource')) {
            $b->setSource('Owners2');
        }


        if ($type === 'Hold') {
            // guest_type + status
            $b->setGuestType('Hold');
            $b->setStatus('Active');

            // Confirmation code O2HYYMMDDXXXX (no dashes, 4 digits)
            $code = sprintf('O2H%s%04d', $checkIn->format('ymd'), random_int(0, 9999));
            $b->setConfirmationCode($code);
            $b->setOriginalCode($code);

            // Expiry (auto-cancel is considered enabled if an expiry is set)
            $policy = null; $expiresAt = null;
            $nowCancun = new \DateTimeImmutable('now', $tzCancun);
            if ($expiry === '24h') {
                $policy = '24h';
                $expiresAt = $nowCancun->add(new \DateInterval('PT24H'));
            } elseif ($expiry === '48h') {
                $policy = '48h';
                $expiresAt = $nowCancun->add(new \DateInterval('PT48H'));
            } elseif ($expiry === 'custom' && !empty($customExpireAtStr)) {
                try {
                    $policy = 'custom';
                    // Interpret customExpireAt in Cancun timezone if it lacks tz info
                    $tmp = new \DateTimeImmutable((string)$customExpireAtStr, $tzCancun);
                    $expiresAt = $tmp;
                } catch (\Throwable $e) {
                    return new JsonResponse(['error' => 'Invalid customExpireAt datetime'], 422);
                }
            }
            $b->setHoldPolicy($policy);
            $b->setHoldExpiresAt($expiresAt);

            // Pull cleaning fee and payment type from Unit when available
            $cleaningFeeFromUnit = 0.0;
            if (method_exists($unit, 'getCleaningFee') && $unit->getCleaningFee() !== null) {
                $cleaningFeeFromUnit = (float)$unit->getCleaningFee();
            } elseif (method_exists($unit, 'getCleaningFeeAmount') && $unit->getCleaningFeeAmount() !== null) {
                $cleaningFeeFromUnit = (float)$unit->getCleaningFeeAmount();
            } elseif (method_exists($unit, 'getCleaningRate') && $unit->getCleaningRate() !== null) {
                $cleaningFeeFromUnit = (float)$unit->getCleaningRate();
            }
            if (method_exists($b, 'setCleaningFee')) { $b->setCleaningFee($cleaningFeeFromUnit); }

            if (method_exists($b, 'setPaymentType')) {
                if (method_exists($unit, 'getPaymentType') && $unit->getPaymentType() !== null) {
                    $b->setPaymentType((string)$unit->getPaymentType());
                } elseif (method_exists($unit, 'getManagementType') && $unit->getManagementType() !== null) {
                    $b->setPaymentType((string)$unit->getManagementType());
                }
            }

            // HOLD finance: payout & payment_method must come from the form; commission depends on unit payment type; is_paid=false
            if ($payoutInput === null || $paymentMethodInput === null || $paymentMethodInput === '') {
                return new JsonResponse(['error' => 'For Hold reservations, both payout and payment_method are required in the payload.'], 422);
            }
            if (method_exists($b, 'setPayout')) { $b->setPayout((float)$payoutInput); }
            if (method_exists($b, 'setPaymentMethod')) { $b->setPaymentMethod((string)$paymentMethodInput); }
            // tax_percent depends on payment_method
            $taxPercent = 12.0;
            $pmLower = is_string($paymentMethodInput) ? strtolower($paymentMethodInput) : '';
            if (in_array($pmLower, ['cash', 'efectivo'], true)) {
                $taxPercent = 0.0; // private cash = 0% tax per business rule
            }
            if (method_exists($b, 'setTaxPercent')) { $b->setTaxPercent($taxPercent); }

            // commission_percent derived from Unit payment/management type (default 20.0 if unavailable)
            $managementType = null;
            if (method_exists($unit, 'getPaymentType')) { $managementType = $unit->getPaymentType(); }
            elseif (method_exists($unit, 'getManagementType')) { $managementType = $unit->getManagementType(); }
            $commissionPercent = 20.0;
            if (is_string($managementType)) {
                switch ($managementType) {
                    case 'O2Pay':
                    case 'OwnersPay':
                        $commissionPercent = 20.0; // adjust if your business rules differ
                        break;
                    default:
                        $commissionPercent = 20.0;
                }
            }
            if (method_exists($b, 'setCommissionPercent')) { $b->setCommissionPercent($commissionPercent); }
            if (method_exists($b, 'setIsPaid')) { $b->setIsPaid(false); }

            // Compute tax_amount = payout * tax_percent / 100
            if (method_exists($b, 'getPayout') && method_exists($b, 'getTaxPercent') && method_exists($b, 'setTaxAmount')) {
                $payoutVal = (float) $b->getPayout();
                $taxPct = (float) $b->getTaxPercent();
                $taxAmount = round(($payoutVal * $taxPct) / 100, 2);
                $b->setTaxAmount($taxAmount);
            }

            // === Finance calculations for HOLD ===
            // net_payout = payout - tax_amount
            $payoutVal = method_exists($b, 'getPayout') ? (float)$b->getPayout() : 0.0;
            $taxAmountVal = method_exists($b, 'getTaxAmount') ? (float)$b->getTaxAmount() : 0.0;
            $netPayout = max(0.0, $payoutVal - $taxAmountVal);
            if (method_exists($b, 'setNetPayout')) { $b->setNetPayout($netPayout); }

            // commission_base = net_payout - cleaning_fee
            $cleaningFeeVal = method_exists($b, 'getCleaningFee') ? (float)($b->getCleaningFee() ?? 0.0) : 0.0;
            $commissionBase = max(0.0, $netPayout - $cleaningFeeVal);
            if (method_exists($b, 'setCommissionBase')) { $b->setCommissionBase($commissionBase); }

            // commission_value = commission_base * commission_percent / 100
            $cp = method_exists($b, 'getCommissionPercent') ? (float)$b->getCommissionPercent() : 0.0;
            $commissionValue = round(($commissionBase * $cp) / 100, 2);
            if (method_exists($b, 'setCommissionValue')) { $b->setCommissionValue($commissionValue); }

            // room_fee = (net_payout - cleaning_fee) / days
            if (method_exists($b, 'getDays') && method_exists($b, 'setRoomFee')) {
                $daysVal = (int)($b->getDays() ?? 0);
                $den = max(1, $daysVal);
                $roomFee = round((max(0.0, $netPayout - $cleaningFeeVal)) / $den, 2);
                $b->setRoomFee($roomFee);
            }

            // client_income = net_payout - cleaning_fee - commission_value
            if (method_exists($b, 'setClientIncome')) {
                $clientIncome = round(max(0.0, $netPayout - $cleaningFeeVal - $commissionValue), 2);
                $b->setClientIncome($clientIncome);
            }

            // o2_total = commission_value (placeholder; can extend per O2Pay/OwnersPay rules)
            if (method_exists($b, 'setO2Total')) { $b->setO2Total($commissionValue); }
        }

        if ($type === 'Block') {
            // Blocks are always created as Active
            $b->setStatus('Active');
            $b->setConfirmationCode(sprintf('O2B%s%04d', $checkIn->format('ymd'), random_int(0, 9999)));

            // Normalize reason string and store it in guest_name; guest_type carries the kind = 'Block'
            $rawReason = (string)($blockReason ?: ($data['reason'] ?? $data['guestType'] ?? $data['guest_type'] ?? 'Other'));
            $norm = strtolower(trim($rawReason));
            if (str_contains($norm, 'clean')) {
                $reason = 'Cleaning';
            } elseif (str_contains($norm, 'late') && (str_contains($norm, 'checkout') || str_contains($norm, 'check-out') || str_contains($norm, 'check out'))) {
                $reason = 'Late Check-Out';
            } elseif (str_contains($norm, 'maint') || str_contains($norm, 'repair') || str_contains($norm, 'fix')) {
                $reason = 'Maintenance';
            } else {
                $reason = 'Other';
            }
            // Kind
            $b->setGuestType('Block');
            // Label
            if (method_exists($b, 'setGuestName')) { $b->setGuestName($reason); }

            // Keep free text notes as-is (do not prefix the reason)
            $b->setNotes($note ?: null);

            // BLOCK finance defaults (all zeros, unpaid, n/a payment method)
            if (method_exists($b, 'setPayout')) { $b->setPayout(0.0); }
            if (method_exists($b, 'setCommissionPercent')) { $b->setCommissionPercent(0.0); }
            if (method_exists($b, 'setPaymentMethod')) { $b->setPaymentMethod('n/a'); }
            if (method_exists($b, 'setIsPaid')) { $b->setIsPaid(false); }
            if (method_exists($b, 'setTaxPercent')) { $b->setTaxPercent(0.0); }
            if (method_exists($b, 'setTaxAmount')) { $b->setTaxAmount(0.0); }
            if (method_exists($b, 'setCleaningFee')) { $b->setCleaningFee(0.0); }
            if (method_exists($b, 'setCommissionBase')) { $b->setCommissionBase(0.0); }
            if (method_exists($b, 'setCommissionValue')) { $b->setCommissionValue(0.0); }
            if (method_exists($b, 'setNetPayout')) { $b->setNetPayout(0.0); }
            if (method_exists($b, 'setRoomFee')) { $b->setRoomFee(0.0); }
            if (method_exists($b, 'setClientIncome')) { $b->setClientIncome(0.0); }
            if (method_exists($b, 'setO2Total')) { $b->setO2Total(0.0); }
        }

        $em->persist($b);
        $em->flush();

        return $this->json([
            'id' => $b->getId(),
            'type' => $type,
            'unitId' => $b->getUnitId(),
            'city' => $b->getCity(),
            'status' => $b->getStatus(),
            'guestType' => $b->getGuestType(), // ensure guestType is always included
            'guestName' => $b->getGuestName(),
            'confirmationCode' => $b->getConfirmationCode(),
            'bookingDate' => $b->getBookingDate()?->format('Y-m-d'),
            'holdPolicy' => $b->getHoldPolicy(),
            'holdExpiresAt' => $b->getHoldExpiresAt()?->setTimezone($tzCancun)->format(DATE_ATOM),
            'checkIn' => $b->getCheckIn()?->format('Y-m-d'),
            'checkOut' => $b->getCheckOut()?->format('Y-m-d'),
        ], 201);
    }

    #[Route(
        '/api/soft-reservations/{id}',
        name: 'api_soft_reservations_show',
        methods: ['GET'],
        requirements: ['id' => '\d+']
    )]
    public function showSoftReservation(int $id, EntityManagerInterface $entityManager): JsonResponse
    {
        /** @var AllBookings|null $b */
        $b = $entityManager->getRepository(AllBookings::class)->find($id);
        if (!$b) {
            return new JsonResponse(['error' => 'Soft reservation not found'], Response::HTTP_NOT_FOUND);
        }
        $tzCancun = new \DateTimeZone('America/Cancun');
        return $this->json([
            'id' => $b->getId(),
            'confirmationCode' => $b->getConfirmationCode(),
            'bookingDate' => $b->getBookingDate()?->format('Y-m-d'),
            'source' => method_exists($b, 'getSource') ? $b->getSource() : null,
            'guestName' => $b->getGuestName(),
            'guestType' => method_exists($b, 'getGuestType') ? $b->getGuestType() : null,
            'status' => $b->getStatus(),
            'holdPolicy' => method_exists($b, 'getHoldPolicy') ? $b->getHoldPolicy() : null,
            'holdExpiresAt' => method_exists($b, 'getHoldExpiresAt') ? $b->getHoldExpiresAt()?->format('Y-m-d H:i') : null,
            'unitName' => method_exists($b, 'getUnitName') ? $b->getUnitName() : null,
            'unitId' => method_exists($b, 'getUnitId') ? $b->getUnitId() : null,
            'city' => method_exists($b, 'getCity') ? $b->getCity() : null,
            'guests' => method_exists($b, 'getGuests') ? $b->getGuests() : null,
            'checkIn' => $b->getCheckIn()?->format('Y-m-d'),
            'checkOut' => $b->getCheckOut()?->format('Y-m-d'),
            'payout' => method_exists($b, 'getPayout') ? $b->getPayout() : null,
            'paymentMethod' => method_exists($b, 'getPaymentMethod') ? $b->getPaymentMethod() : null,
            'cleaningFee' => method_exists($b, 'getCleaningFee') ? $b->getCleaningFee() : null,
            'commissionPercent' => method_exists($b, 'getCommissionPercent') ? $b->getCommissionPercent() : null,
            'notes' => $b->getNotes(),
        ]);
    }

    #[Route(
        '/api/soft-reservations/{id}',
        name: 'api_soft_reservations_update',
        methods: ['PUT', 'PATCH'],
        requirements: ['id' => '\d+']
    )]
    public function updateSoftReservation(
        Request $request,
        EntityManagerInterface $entityManager,
        BookingAggregatorService $aggregator,
        MonthSliceRefresher $refresher,
        BookingStatusUpdaterService $statusUpdater,
        string $id
    ): JsonResponse {
        // Parse payload (tolerant)
        $raw = $request->getContent();
        $data = json_decode($raw, true);
        if (!is_array($data)) { $data = []; }

        // Load booking
        $idInt = (int) $id;
        /** @var AllBookings|null $booking */
        $booking = $entityManager->getRepository(AllBookings::class)->find($idInt);
        if (!$booking) {
            return new JsonResponse(['error' => 'Soft reservation not found'], Response::HTTP_NOT_FOUND);
        }

        // Capture original dates for slice refresh
        $oldCheckIn  = $booking->getCheckIn();
        $oldCheckOut = $booking->getCheckOut();

        // ---- Minimal partial update (no type inference, no finance rules) ----
        // Dates (accept both snake_case and camelCase)
        if (array_key_exists('check_in', $data) || array_key_exists('checkIn', $data)) {
            $ci = (string)($data['checkIn'] ?? $data['check_in']);
            if ($ci !== '') { try { $booking->setCheckIn(new \DateTimeImmutable($ci)); } catch (\Throwable $e) {} }
        }
        if (array_key_exists('check_out', $data) || array_key_exists('checkOut', $data)) {
            $co = (string)($data['checkOut'] ?? $data['check_out']);
            if ($co !== '') { try { $booking->setCheckOut(new \DateTimeImmutable($co)); } catch (\Throwable $e) {} }
        }

        // Status
        if (array_key_exists('status', $data)) {
            $booking->setStatus((string)$data['status']);
        }

        // Notes
        if (array_key_exists('notes', $data)) {
            $booking->setNotes((string)$data['notes']);
        }

        // Guest name
        if (array_key_exists('guest_name', $data) || array_key_exists('guestName', $data)) {
            $gn = (string)($data['guestName'] ?? $data['guest_name']);
            $booking->setGuestName($gn);
        }

        // Guest type (normalize selected values)
        if (array_key_exists('guest_type', $data) || array_key_exists('guestType', $data)) {
            $rawGt = (string)($data['guestType'] ?? $data['guest_type']);
            $norm = strtolower(trim(str_replace(['-', '_'], ' ', $rawGt))); // unify separators
            $mapped = $rawGt; // default: keep original
            if ($norm === 'new') {
                $mapped = 'new';
            } elseif ($norm === 'previous' || $norm === 'prev') {
                $mapped = 'previous';
            } elseif (strpos($norm, 'airbnb') !== false && strpos($norm, 'extension') !== false) {
                // Canonical form requested by business: "Airbnb_extension"
                $mapped = 'Airbnb_extension';
            }
            if (method_exists($booking, 'setGuestType')) { 
                $booking->setGuestType($mapped); 
            }
        }

        // Hold policy (accept camelCase and snake_case)
        if (array_key_exists('holdPolicy', $data) || array_key_exists('hold_policy', $data)) {
            $hp = (string)($data['holdPolicy'] ?? $data['hold_policy']);
            if ($hp !== '' && method_exists($booking, 'setHoldPolicy')) {
                $booking->setHoldPolicy($hp);
            }
        }
        // Hold expires at (accept camelCase and snake_case), interpret in America/Cancun if no tz info
        if (array_key_exists('holdExpiresAt', $data) || array_key_exists('hold_expires_at', $data)) {
            $he = (string)($data['holdExpiresAt'] ?? $data['hold_expires_at']);
            if ($he !== '' && method_exists($booking, 'setHoldExpiresAt')) {
                try {
                    $tzCancun = new \DateTimeZone('America/Cancun');
                    // If the string lacks timezone info, construct with Cancun tz to avoid shifting
                    // DATE_ATOM contains 'T' and timezone, our UI sends 'Y-m-d H:i' without tz.
                    if (strpos($he, 'T') === false) {
                        $booking->setHoldExpiresAt(new \DateTimeImmutable($he, $tzCancun));
                    } else {
                        $booking->setHoldExpiresAt(new \DateTimeImmutable($he));
                    }
                } catch (\Throwable $e) {
                    // ignore parse errors; keep previous value
                }
            }
        }

        // Handle action for Hold → Confirmed conversion
        $action = $data['action'] ?? null;
        if ($action === 'confirm') {
            // Canonicalize guestType if the client sent it with a different field name
            if (!isset($data['guestType']) && isset($data['guestTypeConfirm'])) {
                $data['guestType'] = (string)$data['guestTypeConfirm'];
            }
            // Source of truth for confirmation side-effects
            $tzCancun = new \DateTimeZone('America/Cancun');
            $now = new \DateTimeImmutable('now', $tzCancun);
            // 1) Flip to Private
            if (method_exists($booking, 'setSource')) {
                $booking->setSource('Private');
            }
            // 2) Stamp confirmedAt
            if (method_exists($booking, 'setConfirmedAt')) {
                $booking->setConfirmedAt($now);
            }
            // 3) Set bookingDate = today (local Cancun date)
            if (method_exists($booking, 'setBookingDate')) {
                try {
                    $booking->setBookingDate(new \DateTimeImmutable($now->format('Y-m-d'), $tzCancun));
                } catch (\Throwable $e) {
                    // ignore
                }
            }
            // 4) Ensure O2M code(s)
            $ensureO2M = function (?string $code): bool {
                return \is_string($code) && \preg_match('/^O2M\\d+$/', $code) === 1;
            };
            $genO2M = function (\DateTimeInterface $ci = null): string {
                $datePart = $ci instanceof \DateTimeInterface ? $ci->format('ymd') : (new \DateTimeImmutable('today'))->format('ymd');
                return sprintf('O2M%s%04d', $datePart, random_int(0, 9999));
            };
            // Save current code as originalCode if empty
            if (method_exists($booking, 'getConfirmationCode') && method_exists($booking, 'getOriginalCode') && method_exists($booking, 'setOriginalCode')) {
                $cur = (string)($booking->getConfirmationCode() ?? '');
                if ($booking->getOriginalCode() === null || $booking->getOriginalCode() === '') {
                    $booking->setOriginalCode($cur);
                }
            }
            // Derive O2M from O2H if possible, else generate
            if (method_exists($booking, 'getConfirmationCode') && method_exists($booking, 'setConfirmationCode')) {
                $cur = (string)($booking->getConfirmationCode() ?? '');
                if (!$ensureO2M($cur)) {
                    if (preg_match('~^O2H(\d{6})(\d{4})$~', $cur, $m)) {
                        $booking->setConfirmationCode('O2M' . $m[1] . $m[2]);
                    } else {
                        $booking->setConfirmationCode($genO2M($booking->getCheckIn() ?: null));
                    }
                }
            }
            if (method_exists($booking, 'getReservationCode') && method_exists($booking, 'setReservationCode')) {
                $cur = (string)($booking->getReservationCode() ?? '');
                if (!$ensureO2M($cur)) {
                    if (preg_match('~^O2H(\d{6})(\d{4})$~', $cur, $m)) {
                        $booking->setReservationCode('O2M' . $m[1] . $m[2]);
                    } else {
                        $booking->setReservationCode($genO2M($booking->getCheckIn() ?: null));
                    }
                }
            }
            // 5) Clear hold-specific fields
            if (method_exists($booking, 'setHoldPolicy')) { $booking->setHoldPolicy(null); }
            if (method_exists($booking, 'setHoldExpiresAt')) { $booking->setHoldExpiresAt(null); }
            // 6) Let status updater assign Upcoming/Ongoing/Past correctly
            try {
                $statusUpdater->updateStatuses([$booking], true);
            } catch (\Throwable $e) {
                if (method_exists($booking, 'setStatus')) {
                    $booking->setStatus('Confirmed');
                }
            }
            // 7) Persist and refresh slices immediately
            $entityManager->flush();
            try {
                $ci = $booking->getCheckIn();
                $co = $booking->getCheckOut();
                if ($ci instanceof \DateTimeInterface && $co instanceof \DateTimeInterface) {
                    $this->refresher->refreshForBooking($booking->getId(), $ci, $co);
                }
            } catch (\Throwable $e) {
                // Non-fatal: ignore slice refresh errors here
            }
        }

        // Stamp update meta if available
        if (method_exists($booking, 'setLastUpdatedAt')) {
            $booking->setLastUpdatedAt(new \DateTimeImmutable());
        }
        if (method_exists($booking, 'setLastUpdatedVia')) {
            $booking->setLastUpdatedVia('manual');
        }

        // Persist
        $entityManager->persist($booking);
        $entityManager->flush();

        // Refresh month slices if date range changed
        $newCheckIn  = $booking->getCheckIn();
        $newCheckOut = $booking->getCheckOut();
        if ($oldCheckIn instanceof \DateTimeInterface && $oldCheckOut instanceof \DateTimeInterface) {
            $oldKey = $oldCheckIn->format('Y-m') . '->' . $oldCheckOut->format('Y-m');
            $newKey = ($newCheckIn instanceof \DateTimeInterface ? $newCheckIn->format('Y-m') : '') . '->' .
                      ($newCheckOut instanceof \DateTimeInterface ? $newCheckOut->format('Y-m') : '');
            if (
                !($newCheckIn instanceof \DateTimeInterface) ||
                !($newCheckOut instanceof \DateTimeInterface) ||
                $oldKey !== $newKey ||
                $oldCheckIn != $newCheckIn ||
                $oldCheckOut != $newCheckOut
            ) {
                $refresher->refreshForBooking($booking->getId(), $oldCheckIn, $oldCheckOut);
            }
        }
        if ($newCheckIn instanceof \DateTimeInterface && $newCheckOut instanceof \DateTimeInterface) {
            $refresher->refreshForBooking($booking->getId(), $newCheckIn, $newCheckOut);
        }

        // Non-fatal status updater
        try { $statusUpdater->updateStatuses([$booking], true); } catch (\Throwable $e) {}

        // Return the updated entity as JSON
        $tzCancun = new \DateTimeZone('America/Cancun');
        return $this->json([
            'id' => $booking->getId(),
            'confirmationCode' => $booking->getConfirmationCode(),
            'bookingDate' => $booking->getBookingDate()?->format('Y-m-d'),
            'source' => method_exists($booking, 'getSource') ? $booking->getSource() : null,
            'guestName' => $booking->getGuestName(),
            'guestType' => method_exists($booking, 'getGuestType') ? $booking->getGuestType() : null,
            'status' => $booking->getStatus(),
            'holdPolicy' => method_exists($booking, 'getHoldPolicy') ? $booking->getHoldPolicy() : null,
            'holdExpiresAt' => method_exists($booking, 'getHoldExpiresAt') ? $booking->getHoldExpiresAt()?->format('Y-m-d H:i') : null,
            'unitName' => method_exists($booking, 'getUnitName') ? $booking->getUnitName() : null,
            'unitId' => method_exists($booking, 'getUnitId') ? $booking->getUnitId() : null,
            'city' => method_exists($booking, 'getCity') ? $booking->getCity() : null,
            'guests' => method_exists($booking, 'getGuests') ? $booking->getGuests() : null,
            'checkIn' => $booking->getCheckIn()?->format('Y-m-d'),
            'checkOut' => $booking->getCheckOut()?->format('Y-m-d'),
            'payout' => method_exists($booking, 'getPayout') ? $booking->getPayout() : null,
            'paymentMethod' => method_exists($booking, 'getPaymentMethod') ? $booking->getPaymentMethod() : null,
            'cleaningFee' => method_exists($booking, 'getCleaningFee') ? $booking->getCleaningFee() : null,
            'commissionPercent' => method_exists($booking, 'getCommissionPercent') ? $booking->getCommissionPercent() : null,
            'notes' => $booking->getNotes(),
        ]);
    }

    #[Route('/api/holds/{id}/confirm', name: 'api_hold_confirm', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function confirmHold(int $id, EntityManagerInterface $em, BookingStatusUpdaterService $statusUpdater): JsonResponse
    {
        /** @var AllBookings|null $b */
        $b = $em->getRepository(AllBookings::class)->find($id);
        if (!$b) {
            return new JsonResponse(['error' => 'Booking not found'], 404);
        }
        // Must be a Hold
        if (strtolower((string)$b->getGuestType()) !== 'hold' && strtolower((string)$b->getStatus()) !== 'hold') {
            return new JsonResponse(['error' => 'Booking is not a Hold'], 409);
        }

        // Save old code then convert code prefix from O2H to O2M
        $currentCode = (string)$b->getConfirmationCode();
        if (method_exists($b, 'getOriginalCode') && method_exists($b, 'setOriginalCode')) {
            if (!$b->getOriginalCode()) {
                $b->setOriginalCode($currentCode);
            }
        }
        $newCode = $currentCode;
        if (preg_match('~^O2H(\d{6})(\d{4})$~', $currentCode, $m)) {
            $newCode = 'O2M' . $m[1] . $m[2];
        } else {
            // fallback generator O2MYYMMDDXXXX
            $ci = $b->getCheckIn();
            $datePart = $ci instanceof \DateTimeInterface ? $ci->format('ymd') : (new \DateTimeImmutable('today'))->format('ymd');
            $newCode = sprintf('O2M%s%04d', $datePart, random_int(0, 9999));
        }
        $b->setConfirmationCode($newCode);

        // Flip guestType to New (default for confirmed private bookings)
        if (method_exists($b, 'setGuestType')) { $b->setGuestType('New'); }

        // Clear hold fields and stamp confirmedAt in America/Cancun
        if (method_exists($b, 'setHoldPolicy')) { $b->setHoldPolicy(null); }
        if (method_exists($b, 'setHoldExpiresAt')) { $b->setHoldExpiresAt(null); }
        if (method_exists($b, 'setConfirmedAt')) {
            $tzCancun = new \DateTimeZone('America/Cancun');
            $b->setConfirmedAt(new \DateTimeImmutable('now', $tzCancun));
        }

        // Compute status (Upcoming/Ongoing/Past) and persist
        $now = new \DateTimeImmutable();
        $ci = $b->getCheckIn();
        $co = $b->getCheckOut();
        if ($ci instanceof \DateTimeInterface && $co instanceof \DateTimeInterface) {
            if ($now < $ci) {
                $b->setStatus('Upcoming');
            } elseif ($now >= $ci && $now < $co) {
                $b->setStatus('Ongoing');
            } else {
                $b->setStatus('Past');
            }
        }

        $em->persist($b);
        $em->flush();

        // Refresh month slices for the confirmed stay
        if ($ci instanceof \DateTimeInterface && $co instanceof \DateTimeInterface) {
            $this->refresher->refreshForBooking($b->getId(), $ci, $co);
        }

        // Ensure any status-dependent side effects run
        try { $statusUpdater->updateStatuses([$b], true); } catch (\Throwable $e) {}

        return $this->json($b);
    }

    #[Route('/api/holds/{id}/cancel', name: 'api_hold_cancel', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function cancelHold(int $id, EntityManagerInterface $em, BookingStatusUpdaterService $statusUpdater): JsonResponse
    {
        /** @var AllBookings|null $b */
        $b = $em->getRepository(AllBookings::class)->find($id);
        if (!$b) {
            return new JsonResponse(['error' => 'Booking not found'], 404);
        }
        if (strtolower((string)$b->getGuestType()) !== 'hold' && strtolower((string)$b->getStatus()) !== 'hold') {
            return new JsonResponse(['error' => 'Booking is not a Hold'], 409);
        }

        // Cancel + clear hold fields
        $b->setStatus('Cancelled');
        if (method_exists($b, 'setHoldPolicy')) { $b->setHoldPolicy(null); }
        if (method_exists($b, 'setHoldExpiresAt')) { $b->setHoldExpiresAt(null); }

        $em->persist($b);
        $em->flush();

        // Refresh month slices to free the dates
        $ci = $b->getCheckIn();
        $co = $b->getCheckOut();
        if ($ci instanceof \DateTimeInterface && $co instanceof \DateTimeInterface) {
            $this->refresher->refreshForBooking($b->getId(), $ci, $co);
        }

        try { $statusUpdater->updateStatuses([$b], true); } catch (\Throwable $e) {}

        return $this->json($b);
    }
    #[Route('/api/unit-list/active', name: 'api_unit_list_active', methods: ['GET'])]
    public function unitListActive(Request $request, UnitListService $unitListService): JsonResponse
    {
        // Ignore pagination-related query params like ?pagination=false
        // Return only active units via the dedicated service
        $units = $unitListService->getUnitList(['status' => 'Active']);
        return $this->json($units);
    }
}
