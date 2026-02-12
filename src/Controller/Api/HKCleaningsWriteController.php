<?php

namespace App\Controller\Api;

use App\Entity\HKCleanings;
use App\Entity\Unit;
use App\Entity\Employee;
use App\Service\HKCleaningManager;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Write endpoints for HK Cleanings (status changes, side-effects, etc.)
 */
class HKCleaningsWriteController extends AbstractController
{
    private EntityManagerInterface $em;
    private HKCleaningManager $hkCleaningManager;

    public function __construct(EntityManagerInterface $em, HKCleaningManager $hkCleaningManager)
    {
        $this->em = $em;
        $this->hkCleaningManager = $hkCleaningManager;
    }

    private function fmtDt($v): ?string
    {
        if (!$v) {
            return null;
        }

        $tz = new \DateTimeZone('America/Cancun');

        // Normalize to DateTimeImmutable if possible
        if ($v instanceof \DateTimeInterface) {
            $dt = \DateTimeImmutable::createFromInterface($v);
            return $dt->setTimezone($tz)->format(\DateTimeInterface::ATOM);
        }

        if (is_string($v)) {
            $raw = trim($v);
            if ($raw === '') {
                return null;
            }

            // If the DB/tool gave us a string, try to parse it and re-emit as ATOM in Cancun.
            try {
                $dt = new \DateTimeImmutable($raw);
                return $dt->setTimezone($tz)->format(\DateTimeInterface::ATOM);
            } catch (\Throwable $e) {
                // Fallback: return raw string (better than lying about format)
                return $raw;
            }
        }

        return null;
    }

    private function currentEmployeeArea(): ?string
    {
        $user = $this->getUser();
        if ($user instanceof Employee) {
            return method_exists($user, 'getArea') ? (string) $user->getArea() : null;
        }
        if ($user && method_exists($user, 'getEmployee')) {
            $maybe = $user->getEmployee();
            if ($maybe instanceof Employee) {
                return method_exists($maybe, 'getArea') ? (string) $maybe->getArea() : null;
            }
        }
        return null;
    }

    /**
     * Create a new hk_cleanings entry.
     *
     * POST /api/hk-cleanings
     * Body JSON (snake_case):
     *  {
     *    unit_id: number|string,
     *    checkout_date: 'YYYY-MM-DD',
     *    cleaning_type: string,
     *    o2_collected_fee?: number|string|null,
     *    bill_to?: string|null,
     *    cost_centre?: string|null, // HK_Playa | HK_Tulum | HK_General
     *    status?: 'pending'|'done'|'cancelled',
     *    source?: string|null,
     *    booking_id?: number|null,
     *    reservation_code?: string|null,
     *    city?: string|null,
     *    report_status?: 'pending'|'reported'|'needs_review'|null
     *  }
     */
    #[Route('/api/hk-cleanings', name: 'api_hk_cleanings_create', methods: ['POST'])]
    public function createCleaning(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent() ?: '[]', true) ?: [];

        // Required
        $unitIdRaw = $data['unit_id'] ?? $data['unitId'] ?? null;
        $dateRaw   = $data['checkout_date'] ?? $data['checkoutDate'] ?? null;
        $typeRaw   = $data['cleaning_type'] ?? $data['cleaningType'] ?? null;

        if ($unitIdRaw === null || $unitIdRaw === '' || !$dateRaw || !$typeRaw) {
            return $this->json([
                'ok' => false,
                'error' => 'unit_id, checkout_date, and cleaning_type are required',
            ], Response::HTTP_BAD_REQUEST);
        }

        $unitId = (int) $unitIdRaw;
        if ($unitId <= 0) {
            return $this->json(['ok' => false, 'error' => 'unit_id must be a positive integer'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $checkoutDate = new \DateTimeImmutable((string) $dateRaw);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => 'Invalid checkout_date; expected YYYY-MM-DD'], Response::HTTP_BAD_REQUEST);
        }

        $cleaningType = trim((string) $typeRaw);
        if ($cleaningType === '') {
            return $this->json(['ok' => false, 'error' => 'cleaning_type is required'], Response::HTTP_BAD_REQUEST);
        }

        // Normalize cleaning_type to capitalized canonical codes
        $ctLc = strtolower($cleaningType);
        $map = [
            'initial'   => 'Initial',
            'mid-stay'  => 'Mid-stay',
            'midstay'   => 'Mid-stay',
            'mid stay'  => 'Mid-stay',
            'owner'     => 'Owner',
            'redo'      => 'Redo',
            'refresh'   => 'Refresh',
        ];

        if (array_key_exists($ctLc, $map)) {
            $cleaningType = $map[$ctLc];
        }

        // Optional fields
        $statusRaw = strtolower(trim((string)($data['status'] ?? 'pending')));
        $billTo    = $data['bill_to'] ?? $data['billTo'] ?? null;
        $source    = $data['source'] ?? null;

        $costCentre = $data['cost_centre'] ?? $data['costCentre'] ?? null;
        if (is_string($costCentre)) {
            $costCentre = trim($costCentre);
            if ($costCentre === '') { $costCentre = null; }
        } else {
            $costCentre = null;
        }

        $o2FeeRaw = $data['o2_collected_fee'] ?? $data['o2CollectedFee'] ?? null;
        if ($o2FeeRaw === '' || $o2FeeRaw === null) { $o2FeeRaw = null; }
        $o2Fee = ($o2FeeRaw === null) ? null : (float) $o2FeeRaw;

        $bookingId = $data['booking_id'] ?? $data['bookingId'] ?? null;
        if ($bookingId === '') { $bookingId = null; }
        if ($bookingId !== null) { $bookingId = (int) $bookingId; }

        $reservationCode = $data['reservation_code'] ?? $data['reservationCode'] ?? null;
        if (is_string($reservationCode)) {
            $reservationCode = trim($reservationCode);
            if ($reservationCode === '') { $reservationCode = null; }
        }

        // Resolve city from payload or unit
        $city = $data['city'] ?? null;
        if (is_string($city)) {
            $city = trim($city);
            if ($city === '') { $city = null; }
        } else {
            $city = null;
        }

        $unit = $this->em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return $this->json(['ok' => false, 'error' => 'Unit not found'], Response::HTTP_BAD_REQUEST);
        }
        if ($city === null && method_exists($unit, 'getCity')) {
            $maybeCity = $unit->getCity();
            $maybeCity = is_string($maybeCity) ? trim($maybeCity) : null;
            $city = $maybeCity ?: null;
        }

        // City flags (used only for sensible defaults like cost_centre; do NOT override user-provided values)
        $cityLc = strtolower(trim((string)($city ?? '')));
        $isPlaya = ($cityLc === 'playa del carmen' || str_contains($cityLc, 'playa'));
        $isTulum = ($cityLc === 'tulum' || str_contains($cityLc, 'tulum'));

        // Validate status (respect incoming status; default to pending if missing/invalid)
        $allowedStatus = ['pending', 'done', 'cancelled'];
        if (!in_array($statusRaw, $allowedStatus, true)) {
            $statusRaw = 'pending';
        }

        // Respect incoming report_status if provided; otherwise default to pending.
        $reportStatus = $data['report_status'] ?? $data['reportStatus'] ?? 'pending';
        if ($reportStatus === '' || $reportStatus === null) {
            $reportStatus = 'pending';
        }
        $reportStatus = strtolower(trim((string)$reportStatus));
        $allowedReportStatus = ['pending', 'reported', 'needs_review'];
        if (!in_array($reportStatus, $allowedReportStatus, true)) {
            $reportStatus = 'pending';
        }

        // Default/validate cost_centre (internal accounting destination)
        // Canonical values: HK_Playa | HK_Tulum | HK_General
        // Backward-compatible inputs: housekeepers_playa | housekeepers_tulum | general
        $allowedCanonical = [
            HKCleanings::COST_CENTRE_HK_PLAYA,
            HKCleanings::COST_CENTRE_HK_TULUM,
            HKCleanings::COST_CENTRE_GENERAL,
        ];

        if ($costCentre !== null) {
            $rawCc = trim((string) $costCentre);
            if ($rawCc === '') {
                $costCentre = null;
            } else {
                // Normalize legacy lowercase inputs
                $lc = strtolower($rawCc);
                if ($lc === 'housekeepers_playa') {
                    $costCentre = HKCleanings::COST_CENTRE_HK_PLAYA;
                } elseif ($lc === 'housekeepers_tulum') {
                    $costCentre = HKCleanings::COST_CENTRE_HK_TULUM;
                } elseif ($lc === 'general') {
                    $costCentre = HKCleanings::COST_CENTRE_GENERAL;
                } else {
                    // Accept canonical values (case-sensitive)
                    $costCentre = $rawCc;
                }

                if (!in_array($costCentre, $allowedCanonical, true)) {
                    $costCentre = null;
                }
            }
        }

        if ($costCentre === null) {
            if ($isPlaya) {
                $costCentre = HKCleanings::COST_CENTRE_HK_PLAYA;
            } elseif ($isTulum) {
                $costCentre = HKCleanings::COST_CENTRE_HK_TULUM;
            } else {
                $costCentre = HKCleanings::COST_CENTRE_GENERAL;
            }
        }

        // Default bill_to/source if missing
        // Rule: cleaning_type=owner => bill_to defaults to CLIENT
        if ($billTo === null || $billTo === '') {
            if (strtolower($cleaningType) === 'owner') {
                $billTo = 'CLIENT';
            } else {
                $billTo = 'OWNERS2';
            }
        }
        if ($source === null || $source === '') {
            $source = 'Housekeepers';
        }

        $hk = new HKCleanings();

        // Set unit relation/id
        if (method_exists($hk, 'setUnit')) {
            $hk->setUnit($unit);
        }
        if (method_exists($hk, 'setUnitId')) {
            $hk->setUnitId($unitId);
        }

        if (method_exists($hk, 'setCity')) {
            $hk->setCity($city);
        }
        if (method_exists($hk, 'setCheckoutDate')) {
            $hk->setCheckoutDate($checkoutDate);
        }
        if (method_exists($hk, 'setCleaningType')) {
            $hk->setCleaningType($cleaningType);
        }
        if (method_exists($hk, 'setO2CollectedFee')) {
            $hk->setO2CollectedFee($o2Fee);
        }
        if (method_exists($hk, 'setBillTo')) {
            $hk->setBillTo($billTo);
        }
        if (method_exists($hk, 'setCostCentre')) {
            $hk->setCostCentre($costCentre);
        }
        if (method_exists($hk, 'setSource')) {
            $hk->setSource($source);
        }

        // Explicit nullables (accept null)
        if (method_exists($hk, 'setBookingId')) {
            $hk->setBookingId($bookingId);
        }
        if (method_exists($hk, 'setReservationCode')) {
            $hk->setReservationCode($reservationCode);
        }
        if (method_exists($hk, 'setAssignedToId')) {
            $hk->setAssignedToId(null);
        }
        if (method_exists($hk, 'setAssignNotes')) {
            $hk->setAssignNotes(null);
        }
        if (method_exists($hk, 'setCleaningCost')) {
            $hk->setCleaningCost(null);
        }
        if (method_exists($hk, 'setLaundryCost')) {
            $hk->setLaundryCost(null);
        }
        if (method_exists($hk, 'setDoneByEmployeeId')) {
            $hk->setDoneByEmployeeId(null);
        }
        if (method_exists($hk, 'setDoneAt')) {
            $hk->setDoneAt(null);
        }

        // Set status
        if (method_exists($hk, 'setStatus')) {
            if ($statusRaw === 'pending' && \defined(HKCleanings::class.'::STATUS_PENDING')) {
                $hk->setStatus(HKCleanings::STATUS_PENDING);
            } elseif ($statusRaw === 'done' && \defined(HKCleanings::class.'::STATUS_DONE')) {
                $hk->setStatus(HKCleanings::STATUS_DONE);
            } elseif ($statusRaw === 'cancelled' && \defined(HKCleanings::class.'::STATUS_CANCELLED')) {
                $hk->setStatus(HKCleanings::STATUS_CANCELLED);
            } else {
                $hk->setStatus($statusRaw);
            }
        }

        // Set report_status
        if (method_exists($hk, 'setReportStatus')) {
            $hk->setReportStatus($reportStatus);
        }

        $this->em->persist($hk);
        $this->em->flush();

        // If created as done (Playa only per rules), create/reuse transaction idempotently.
        $txResult = null;
        $createdStatus = method_exists($hk, 'getStatus') ? strtolower((string)$hk->getStatus()) : $statusRaw;
        if ($createdStatus === 'done') {
            try {
                if (method_exists($this->hkCleaningManager, 'markDoneAndCreateTransaction')) {
                    $txResult = $this->hkCleaningManager->markDoneAndCreateTransaction($hk);
                }
            } catch (\Throwable $e) {
                // Do not fail create if tx creation fails
                return $this->json([
                    'ok' => true,
                    'warning' => 'Cleaning created, but transaction could not be created',
                    'error' => $e->getMessage(),
                    'data' => [
                        'id' => $hk->getId(),
                        'status' => method_exists($hk, 'getStatus') ? $hk->getStatus() : $statusRaw,
                    ],
                ], Response::HTTP_OK);
            }
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'id' => $hk->getId(),
                'status' => method_exists($hk, 'getStatus') ? $hk->getStatus() : $statusRaw,
                'report_status' => method_exists($hk, 'getReportStatus') ? $hk->getReportStatus() : $reportStatus,
                'transactionId' => is_array($txResult) && array_key_exists('id', $txResult) ? $txResult['id'] : null,
                'transactionCode' => is_array($txResult) && array_key_exists('transactionCode', $txResult) ? $txResult['transactionCode'] : null,
            ],
        ], Response::HTTP_CREATED);
    }

    /**
     * List cleaners that can be assigned to a cleaning.
     *
     * GET /api/hk-cleanings/assignable-cleaners?city=Playa%20del%20Carmen
     * Returns: [{ id, short_name }]
     */
    #[Route('/api/hk-cleanings/assignable-cleaners', name: 'api_hk_cleanings_assignable_cleaners', methods: ['GET'])]
    public function assignableCleaners(Request $request): JsonResponse
    {
        // Cleaners should not be able to browse/assign other cleaners.
        $area = strtolower(trim((string)($this->currentEmployeeArea() ?? '')));
        if ($area === 'cleaner') {
            return $this->json(['ok' => false, 'error' => 'Forbidden'], Response::HTTP_FORBIDDEN);
        }

        $city = trim((string) $request->query->get('city', ''));
        if ($city === '') {
            // Default to Playa del Carmen (as per current requirement)
            $city = 'Playa del Carmen';
        }

        $conn = $this->em->getConnection();

        // Use DBAL SQL to match the exact columns requested.
        $sql = <<<'SQL'
SELECT id, short_name
FROM employee
WHERE area = :area
  AND city = :city
  AND platform_enabled = 1
ORDER BY short_name ASC
SQL;

        $rows = $conn->fetchAllAssociative($sql, [
            'area' => 'cleaner',
            'city' => $city,
        ]);

        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => isset($r['id']) ? (int) $r['id'] : null,
                'short_name' => isset($r['short_name']) ? (string) $r['short_name'] : null,
            ];
        }

        return $this->json(['ok' => true, 'data' => $out]);
    }

    /**
     * Assign (or unassign) a cleaning to a cleaner.
     *
     * POST /api/hk-cleanings/{id}/assign
     * Body JSON: { assignedToId: number|null }
     */
    #[Route('/api/hk-cleanings/{id}/assign', name: 'api_hk_cleanings_assign', methods: ['POST'])]
    public function assignCleaning(int $id, Request $request): JsonResponse
    {
        // Cleaners cannot assign cleanings.
        $area = strtolower(trim((string)($this->currentEmployeeArea() ?? '')));
        if ($area === 'cleaner') {
            return $this->json(['ok' => false, 'error' => 'Forbidden'], Response::HTTP_FORBIDDEN);
        }

        $hk = $this->em->getRepository(HKCleanings::class)->find($id);
        if (!$hk) {
            return $this->json(['ok' => false, 'error' => 'Cleaning not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent() ?: '[]', true) ?: [];
        if (!array_key_exists('assignedToId', $data)) {
            return $this->json(['ok' => false, 'error' => 'assignedToId is required (can be null to unassign)'], Response::HTTP_BAD_REQUEST);
        }

        $assignedToId = $data['assignedToId'];
        $assignedEmployee = null;
        $assignedShortName = null;

        if ($assignedToId !== null && $assignedToId !== '') {
            $assignedToId = (int) $assignedToId;
            if ($assignedToId <= 0) {
                return $this->json(['ok' => false, 'error' => 'assignedToId must be a positive integer or null'], Response::HTTP_BAD_REQUEST);
            }

            // Validate employee is an enabled cleaner for the given city.
            $conn = $this->em->getConnection();
            $city = trim((string) ($data['city'] ?? ''));
            if ($city === '') {
                // If city not provided, do not enforce city match here; frontend usually passes city.
                $sql = 'SELECT id, short_name, city FROM employee WHERE id = :id AND area = :area AND platform_enabled = 1';
                $empRow = $conn->fetchAssociative($sql, [
                    'id' => $assignedToId,
                    'area' => 'cleaner',
                ]);
            } else {
                $sql = 'SELECT id, short_name, city FROM employee WHERE id = :id AND area = :area AND city = :city AND platform_enabled = 1';
                $empRow = $conn->fetchAssociative($sql, [
                    'id' => $assignedToId,
                    'area' => 'cleaner',
                    'city' => $city,
                ]);
            }

            if (!$empRow) {
                return $this->json(['ok' => false, 'error' => 'Cleaner not found or not eligible'], Response::HTTP_BAD_REQUEST);
            }

            $assignedShortName = (string) ($empRow['short_name'] ?? null);
            $assignedEmployee = $this->em->getRepository(Employee::class)->find($assignedToId);
            if (!$assignedEmployee) {
                return $this->json(['ok' => false, 'error' => 'Cleaner entity not found'], Response::HTTP_BAD_REQUEST);
            }
        }

        // Persist assignment (supports either relation setter or id setter depending on entity).
        $didSet = false;
        if (method_exists($hk, 'setAssignedTo')) {
            $hk->setAssignedTo($assignedEmployee);
            $didSet = true;
        } elseif (method_exists($hk, 'setAssignedToId')) {
            $hk->setAssignedToId($assignedEmployee ? (int) $assignedEmployee->getId() : null);
            $didSet = true;
        }

        if (!$didSet) {
            return $this->json(['ok' => false, 'error' => 'HKCleanings does not support assignment (missing setter)'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $this->em->flush();

        return $this->json([
            'ok' => true,
            'data' => [
                'cleaningId' => $hk->getId(),
                'assignedToId' => $assignedEmployee ? (int) $assignedEmployee->getId() : null,
                'assignedToShortName' => $assignedEmployee ? $assignedShortName : null,
            ],
        ]);
    }

    /**
     * Mark a cleaning as done and (in service) create the matching hk_transactions row.
     *
     * Frontend usage: POST /api/hk-cleanings/{id}/mark-done
     */
    #[Route('/api/hk-cleanings/{id}/mark-done', name: 'api_hk_cleanings_mark_done', methods: ['POST'])]
    public function markDone(int $id, Request $request): JsonResponse
    {
        $hk = $this->em->getRepository(HKCleanings::class)->find($id);
        if (!$hk) {
            return $this->json(['ok' => false, 'error' => 'Cleaning not found'], Response::HTTP_NOT_FOUND);
        }

        $dirty = false;

        // Update status to done if not already
        if (method_exists($hk, 'getStatus') && method_exists($hk, 'setStatus')) {
            if ($hk->getStatus() !== HKCleanings::STATUS_DONE) {
                $hk->setStatus(HKCleanings::STATUS_DONE);
                $dirty = true;
            }
        }

        // Auto-set reportStatus for Playa when marking done
        if (method_exists($hk, 'getCity') && method_exists($hk, 'getReportStatus') && method_exists($hk, 'setReportStatus')) {
            $city = strtolower(trim((string) $hk->getCity()));
            $rs   = $hk->getReportStatus();
            $rs   = $rs === '' ? null : $rs;
            if ($city === 'playa del carmen' && ($rs === null || $rs === '')) {
                $hk->setReportStatus('reported');
                $dirty = true;
            }
        }

        // Persist changes first
        if ($dirty) {
            $this->em->flush();
        }

        // Delegate transaction creation to the manager (idempotent inside the service)
        $txResult = null;
        try {
            if (method_exists($this->hkCleaningManager, 'markDoneAndCreateTransaction')) {
                $txResult = $this->hkCleaningManager->markDoneAndCreateTransaction($hk);
            }
        } catch (\Throwable $e) {
            // We do not fail the status update if tx creation fails; return warning for UI
            return $this->json([
                'ok' => true,
                'warning' => 'Status set to done, but transaction could not be created',
                'error' => $e->getMessage(),
            ], Response::HTTP_OK);
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'id' => $hk->getId(),
                'status' => $hk->getStatus(),
                'transactionId' => is_array($txResult) && array_key_exists('id', $txResult) ? $txResult['id'] : null,
                'transactionCode' => is_array($txResult) && array_key_exists('transactionCode', $txResult) ? $txResult['transactionCode'] : null,
                'transactionAlreadyExisted' => is_array($txResult) && array_key_exists('alreadyExisted', $txResult) ? (bool)$txResult['alreadyExisted'] : false,
                // Keep the raw object for backward compatibility
                'transaction' => $txResult,
            ],
        ]);
    }

    /**
     * Mark a cleaning as done by composite keys.
     *
     * POST /api/hk-cleanings/mark-done-by
     * Body JSON: { unitId: number, checkoutDate: 'YYYY-MM-DD', reservationCode?: string, createIfMissing?: bool }
     */
    #[Route('/api/hk-cleanings/mark-done-by', name: 'api_hk_cleanings_mark_done_by', methods: ['POST'])]
public function markDoneBy(Request $request): JsonResponse
{
    $data = json_decode($request->getContent() ?: '[]', true) ?: [];

    // Require reservationCode + checkoutDate. unitId optional (only used to prefill if we create a missing row).
    $resCode  = isset($data['reservationCode']) ? trim((string)$data['reservationCode']) : null;
    $dateStr  = $data['checkoutDate'] ?? null;
    $unitId   = $data['unitId'] ?? null; // optional
    $createIf = (bool)($data['createIfMissing'] ?? false);

    if (!$resCode || !$dateStr) {
        return $this->json(['ok' => false, 'error' => 'reservationCode and checkoutDate are required'], Response::HTTP_BAD_REQUEST);
    }

    try {
        $date = new \DateTimeImmutable($dateStr);
    } catch (\Throwable $e) {
        return $this->json(['ok' => false, 'error' => 'Invalid checkoutDate; expected YYYY-MM-DD'], Response::HTTP_BAD_REQUEST);
    }

    $repo = $this->em->getRepository(HKCleanings::class);

    // Look up strictly by (reservationCode, checkoutDate) only
    $matches = $repo->findBy(['reservationCode' => $resCode, 'checkoutDate' => $date]);

    // If multiple rows match → 409 Conflict (no changes made)
    if (\is_array($matches) && \count($matches) > 1) {
        return $this->json([
            'ok' => false,
            'error' => 'Multiple cleaning rows match the given reservationCode and checkoutDate',
            'conflictCount' => \count($matches),
        ], Response::HTTP_CONFLICT);
    }

    $hk = $matches[0] ?? null;

    // If no row and createIfMissing is true → create exactly one row with sane defaults and then proceed.
    if (!$hk && $createIf) {
        $payload = [[
            'unitId'          => $unitId ? (int)$unitId : null, // only to prefill; manager may infer city
            'city'            => null,
            'checkoutDate'    => $date->format('Y-m-d'),
            'cleaningType'    => HKCleanings::TYPE_CHECKOUT,
            'bookingId'       => null,
            'reservationCode' => $resCode,
            'status'          => HKCleanings::STATUS_PENDING,
        ]];

        try {
            $this->hkCleaningManager->bulkCreate($payload);
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Could not create missing cleaning row: '.$e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        // Fetch again strictly by (reservationCode, checkoutDate)
        $matches = $repo->findBy(['reservationCode' => $resCode, 'checkoutDate' => $date]);
        if (\count($matches) > 1) {
            return $this->json([
                'ok' => false,
                'error' => 'Multiple cleaning rows were created or already existed for the given keys',
                'conflictCount' => \count($matches),
            ], Response::HTTP_CONFLICT);
        }
        $hk = $matches[0] ?? null;
    }

    if (!$hk) {
        return $this->json(['ok' => false, 'error' => 'Cleaning entry not found'], Response::HTTP_NOT_FOUND);
    }

    $dirty = false;

    // Set status to done (only if not already)
    if (method_exists($hk, 'getStatus') && method_exists($hk, 'setStatus')) {
        if ($hk->getStatus() !== HKCleanings::STATUS_DONE) {
            $hk->setStatus(HKCleanings::STATUS_DONE);
            $dirty = true;
        }
    }

    // Auto-set reportStatus for Playa when marking done
    if (method_exists($hk, 'getCity') && method_exists($hk, 'getReportStatus') && method_exists($hk, 'setReportStatus')) {
        $city = strtolower(trim((string) $hk->getCity()));
        $rs   = $hk->getReportStatus();
        $rs   = $rs === '' ? null : $rs;
        if ($city === 'playa del carmen' && ($rs === null || $rs === '')) {
            $hk->setReportStatus('reported');
            $dirty = true;
        }
    }

    if ($dirty) {
        $this->em->flush();
    }

    // Call the manager to create/reuse the transaction (idempotent)
    $txResult = null;
    try {
        if (method_exists($this->hkCleaningManager, 'markDoneAndCreateTransaction')) {
            $txResult = $this->hkCleaningManager->markDoneAndCreateTransaction($hk);
        }
    } catch (\Throwable $e) {
        // Do not roll back status; surface warning for UI.
        return $this->json([
            'ok' => true,
            'warning' => 'Status set to done, but transaction could not be created',
            'error' => $e->getMessage(),
        ], Response::HTTP_OK);
    }

    // Return structured info including whether the transaction already existed.
    return $this->json([
        'ok' => true,
        'data' => [
            'id' => $hk->getId(),
            'status' => $hk->getStatus(),
            'transactionId' => is_array($txResult) && array_key_exists('id', $txResult) ? $txResult['id'] : null,
            'transactionCode' => is_array($txResult) && array_key_exists('transactionCode', $txResult) ? $txResult['transactionCode'] : null,
            'transactionAlreadyExisted' => is_array($txResult) && array_key_exists('alreadyExisted', $txResult) ? (bool)$txResult['alreadyExisted'] : false,
            'transaction' => $txResult,
        ],
    ]);
}

    /**
     * Update an existing hk_cleanings entry.
     *
     * PUT /api/hk-cleanings/{id}
     * Body JSON: { checkoutDate?: 'YYYY-MM-DD', status?: 'pending'|'done'|'cancelled', reportStatus?: 'pending'|'reported'|'needs_review', cleaningType?: string, billTo?: string|null, cleaningCost?: number|null, o2CollectedFee?: number|null, notes?: string|null }
     */
    #[Route('/api/hk-cleanings/{id<\d+>}', name: 'api_hk_cleanings_update', methods: ['PUT'])]
    public function updateCleaning(int $id, Request $request): JsonResponse
    {
        $hk = $this->em->getRepository(HKCleanings::class)->find($id);
        if (!$hk) {
            return $this->json(['ok' => false, 'error' => 'Cleaning not found'], Response::HTTP_NOT_FOUND);
        }

        $oldStatus = method_exists($hk, 'getStatus') ? strtolower((string)$hk->getStatus()) : null;

        $data = json_decode($request->getContent() ?: '[]', true) ?: [];

        $transitionToDone = false;
        $didTouchCleaningType = false;
        $incomingCleaningType = null;
        $didTouchBillTo = false;
        $incomingBillTo = null;

        // checkoutDate / checkout_date
        $checkoutVal = null;
        if (array_key_exists('checkoutDate', $data) && $data['checkoutDate']) {
            $checkoutVal = $data['checkoutDate'];
        } elseif (array_key_exists('checkout_date', $data) && $data['checkout_date']) {
            $checkoutVal = $data['checkout_date'];
        }

        if ($checkoutVal) {
            try {
                $d = new \DateTimeImmutable((string)$checkoutVal);
                if (method_exists($hk, 'setCheckoutDate')) {
                    $hk->setCheckoutDate($d);
                }
            } catch (\Throwable $e) {
                return $this->json(['ok' => false, 'error' => 'Invalid checkoutDate; expected YYYY-MM-DD'], Response::HTTP_BAD_REQUEST);
            }
        }

        // cleaningType / cleaning_type
        if (array_key_exists('cleaningType', $data) || array_key_exists('cleaning_type', $data)) {
            $raw = array_key_exists('cleaningType', $data) ? $data['cleaningType'] : $data['cleaning_type'];
            $val = is_string($raw) ? trim($raw) : '';

            if ($val !== '') {
                // Normalize to same canonical codes as createCleaning()
                $ctLc = strtolower($val);
                $map = [
                    'initial'   => 'Initial',
                    'mid-stay'  => 'Mid-stay',
                    'midstay'   => 'Mid-stay',
                    'mid stay'  => 'Mid-stay',
                    'owner'     => 'Owner',
                    'redo'      => 'Redo',
                    'refresh'   => 'Refresh',
                ];

                $val = array_key_exists($ctLc, $map) ? $map[$ctLc] : $val;

                $incomingCleaningType = $val;
                $didTouchCleaningType = true;
                if (method_exists($hk, 'setCleaningType')) {
                    $hk->setCleaningType($val);
                }
            }
        }

        // status
        if (array_key_exists('status', $data) && $data['status']) {
            $status = strtolower((string)$data['status']);
            $allowed = [
                strtolower(\defined(HKCleanings::class.'::STATUS_PENDING') ? HKCleanings::STATUS_PENDING : 'pending'),
                strtolower(\defined(HKCleanings::class.'::STATUS_DONE') ? HKCleanings::STATUS_DONE : 'done'),
                strtolower(\defined(HKCleanings::class.'::STATUS_CANCELLED') ? HKCleanings::STATUS_CANCELLED : 'cancelled'),
            ];
            if (!in_array($status, $allowed, true)) {
                return $this->json(['ok' => false, 'error' => 'Invalid status value'], Response::HTTP_BAD_REQUEST);
            }
            if (method_exists($hk, 'setStatus')) {
                // Map back to canonical constant if available
                if ($status === 'pending' && \defined(HKCleanings::class.'::STATUS_PENDING')) {
                    $hk->setStatus(HKCleanings::STATUS_PENDING);
                } elseif ($status === 'done' && \defined(HKCleanings::class.'::STATUS_DONE')) {
                    $hk->setStatus(HKCleanings::STATUS_DONE);
                } elseif ($status === 'cancelled' && \defined(HKCleanings::class.'::STATUS_CANCELLED')) {
                    $hk->setStatus(HKCleanings::STATUS_CANCELLED);
                } else {
                    $hk->setStatus($status);
                }
            }
        }

        // reportStatus / report_status (manual report state)
        if (array_key_exists('reportStatus', $data) || array_key_exists('report_status', $data)) {
            $raw = array_key_exists('reportStatus', $data) ? $data['reportStatus'] : $data['report_status'];
            $val = $raw;

            if ($val === '' || $val === null) {
                $val = null;
            }

            if ($val !== null) {
                $val = strtolower(trim((string) $val));
                $allowed = ['pending', 'reported', 'needs_review'];
                if (!in_array($val, $allowed, true)) {
                    return $this->json(['ok' => false, 'error' => 'Invalid reportStatus value'], Response::HTTP_BAD_REQUEST);
                }
            }

            // Only set if the entity supports it (keeps controller compatible if entity not updated yet)
            if (method_exists($hk, 'setReportStatus')) {
                $hk->setReportStatus($val);
            }
        }

        // cleaningCost
        if (array_key_exists('cleaningCost', $data)) {
            $val = $data['cleaningCost'];
            if ($val === '' || $val === null) {
                $val = null;
            }
            if (method_exists($hk, 'setCleaningCost')) {
                $hk->setCleaningCost($val);
            }
        }

        // o2CollectedFee / o2_collected_fee
        $o2Val = null;
        if (array_key_exists('o2CollectedFee', $data)) {
            $o2Val = $data['o2CollectedFee'];
        } elseif (array_key_exists('o2_collected_fee', $data)) {
            $o2Val = $data['o2_collected_fee'];
        }

        if (array_key_exists('o2CollectedFee', $data) || array_key_exists('o2_collected_fee', $data)) {
            if ($o2Val === '' || $o2Val === null) {
                $o2Val = null;
            }
            if (method_exists($hk, 'setO2CollectedFee')) {
                $hk->setO2CollectedFee($o2Val);
            }
        }

        // billTo / bill_to
        if (array_key_exists('billTo', $data) || array_key_exists('bill_to', $data)) {
            $raw = array_key_exists('billTo', $data) ? $data['billTo'] : $data['bill_to'];
            if ($raw === '' || $raw === null) {
                $incomingBillTo = null;
            } else {
                $incomingBillTo = (string) $raw;
            }
            $didTouchBillTo = true;
            if (method_exists($hk, 'setBillTo')) {
                $hk->setBillTo($incomingBillTo);
            }
        }

        // assign_notes (legacy payload key: notes)
        if (array_key_exists('notes', $data)) {
            $val = $data['notes'];
            if ($val === '') { $val = null; }
            if (method_exists($hk, 'setAssignNotes')) {
                $hk->setAssignNotes($val);
            }
        }

        $newStatus = method_exists($hk, 'getStatus') ? strtolower((string)$hk->getStatus()) : null;
        $transitionToDone = ($oldStatus !== 'done' && $newStatus === 'done');

        // Enforce bill_to defaulting rule on update:
        // If cleaning_type is owner AND bill_to is empty AND user did not explicitly set bill_to,
        // default bill_to to CLIENT.
        try {
            $ct = null;
            if ($didTouchCleaningType && $incomingCleaningType) {
                $ct = strtolower(trim((string) $incomingCleaningType));
            } elseif (method_exists($hk, 'getCleaningType')) {
                $ct = strtolower(trim((string) $hk->getCleaningType()));
            }

            $bt = null;
            if ($didTouchBillTo) {
                $bt = $incomingBillTo;
            } elseif (method_exists($hk, 'getBillTo')) {
                $bt = $hk->getBillTo();
            }

            $btEmpty = ($bt === null || (is_string($bt) && trim($bt) === ''));

            if ($ct === 'owner' && $btEmpty && !$didTouchBillTo) {
                if (method_exists($hk, 'setBillTo')) {
                    $hk->setBillTo('CLIENT');
                }
            }
        } catch (\Throwable $e) {
            // non-fatal
        }

        $this->em->flush();

        if ($transitionToDone) {
            $txResult = null;
            try {
                $txResult = $this->hkCleaningManager->markDoneAndCreateTransaction($hk);
            } catch (\Throwable $e) {
                return $this->json([
                    'ok' => true,
                    'warning' => 'Status set to done, but transaction could not be created',
                    'error' => $e->getMessage(),
                ], Response::HTTP_OK);
            }

            return $this->json([
                'ok' => true,
                'data' => [
                    'id' => $hk->getId(),
                    'status' => $hk->getStatus(),
                    'transactionId' => is_array($txResult) && array_key_exists('id', $txResult) ? $txResult['id'] : null,
                    'transactionCode' => is_array($txResult) && array_key_exists('transactionCode', $txResult) ? $txResult['transactionCode'] : null,
                    'transactionAlreadyExisted' => is_array($txResult) && array_key_exists('alreadyExisted', $txResult) ? (bool)$txResult['alreadyExisted'] : false,
                    'transaction' => $txResult,
                ],
            ]);
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'id' => $hk->getId(),
                'status' => method_exists($hk, 'getStatus') ? $hk->getStatus() : null,
            ],
        ]);
    }

    /**
     * Save a checklist draft (no submission) + optional photos.
     *
     * Endpoint intended for mobile cleaners:
     * POST /api/hk-cleanings/{id}/save-checklist-draft
     *
     * Expected payload (multipart/form-data):
     * - checklistData: JSON string
     * - checklistVersion: optional string
     * - notes: optional text
     * - employeeId: optional numeric id of the cleaner
     * - files[]: optional array of image files (appended)
     */
    #[Route('/api/hk-cleanings/{id}/save-checklist-draft', name: 'api_hk_cleanings_save_checklist_draft', methods: ['POST'])]
    public function saveChecklistDraft(int $id, Request $request): JsonResponse
    {
        $hk = $this->em->getRepository(HKCleanings::class)->find($id);
        if (!$hk) {
            return $this->json(['ok' => false, 'error' => 'Cleaning not found'], Response::HTTP_NOT_FOUND);
        }

        // Resolve cleaner (employee) either from explicit employeeId or from the logged-in user.
        $employee = null;
        $employeeId = $request->request->get('employeeId');
        if ($employeeId) {
            $employee = $this->em->getRepository(Employee::class)->find((int)$employeeId);
        } else {
            $user = $this->getUser();
            if ($user instanceof Employee) {
                $employee = $user;
            } elseif ($user && method_exists($user, 'getEmployee')) {
                $maybe = $user->getEmployee();
                if ($maybe instanceof Employee) {
                    $employee = $maybe;
                }
            }
        }

        if (!$employee instanceof Employee) {
            return $this->json(['ok' => false, 'error' => 'Cleaner (employee) could not be resolved'], Response::HTTP_BAD_REQUEST);
        }

        // checklistData is expected as a JSON string in a form field.
        $rawChecklist = $request->request->get('checklistData', '[]');
        $checklistData = [];
        if (is_string($rawChecklist) && $rawChecklist !== '') {
            $decoded = json_decode($rawChecklist, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                return $this->json(['ok' => false, 'error' => 'Invalid checklistData JSON'], Response::HTTP_BAD_REQUEST);
            }
            $checklistData = $decoded;
        }

        // checklistVersion (optional)
        $checklistVersion = $request->request->get('checklistVersion');
        if ($checklistVersion === '') {
            $checklistVersion = null;
        }

        // Notes (optional)
        $notes = $request->request->get('notes');
        if ($notes === '') {
            $notes = null;
        }

        // Files: may arrive as a single UploadedFile or an array under "files"
        $filesParam = $request->files->get('files');
        $files = [];
        if ($filesParam) {
            if (is_array($filesParam)) {
                $files = $filesParam;
            } else {
                $files = [$filesParam];
            }
        }

        try {
            $result = $this->hkCleaningManager->saveChecklistDraft(
                $hk,
                $employee,
                $checklistData,
                $notes,
                $checklistVersion,
                $files
            );
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Could not save checklist draft: '.$e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'cleaningId'   => $hk->getId(),
                'checklistId'  => $result['checklistId'] ?? null,
                'fileCount'    => $result['fileCount'] ?? 0,
                'hasIssues'    => $result['hasIssues'] ?? false,

                // Always return timezone-aware ISO strings when available.
                // Draft save should normally have submittedAt=null but updatedAt populated.
                'checklistSubmittedAt' => $this->fmtDt($result['submittedAt'] ?? null),
                'checklistUpdatedAt'   => $this->fmtDt($result['updatedAt'] ?? null),
                'checklistCleanerId'   => $result['cleanerId'] ?? null,
            ],
        ]);
    }

    /**
     * Get the latest checklist state (draft/submitted) for a cleaning.
     *
     * GET /api/hk-cleanings/{id}/checklist-state
     *
     * Rules:
     *  1) If current user is the checklist cleaner_id -> editable (readOnly=false)
     *  2) If current user is NOT the checklist cleaner_id -> readOnly=true
     *  3) If current user area is Cleaner AND user id != cleaner_id -> deny (403)
     */
    #[Route('/api/hk-cleanings/{id}/checklist-state', name: 'api_hk_cleanings_checklist_state', methods: ['GET'])]
    public function checklistState(int $id, Request $request): JsonResponse
    {
        $hk = $this->em->getRepository(HKCleanings::class)->find($id);
        if (!$hk) {
            return $this->json(['ok' => false, 'error' => 'Cleaning not found'], Response::HTTP_NOT_FOUND);
        }

        // Resolve current employee from the logged-in user.
        $employee = null;
        $user = $this->getUser();
        if ($user instanceof Employee) {
            $employee = $user;
        } elseif ($user && method_exists($user, 'getEmployee')) {
            $maybe = $user->getEmployee();
            if ($maybe instanceof Employee) {
                $employee = $maybe;
            }
        }

        if (!$employee instanceof Employee) {
            return $this->json(['ok' => false, 'error' => 'Employee could not be resolved'], Response::HTTP_BAD_REQUEST);
        }

        // Load latest checklist row (draft or submitted)
        try {
            $state = $this->hkCleaningManager->getChecklistState($hk);
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Could not load checklist state: ' . $e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $checklistCleanerId = isset($state['cleanerId']) ? (int) $state['cleanerId'] : null;
        $myEmployeeId = method_exists($employee, 'getId') ? (int) $employee->getId() : null;
        $myArea = method_exists($employee, 'getArea') ? (string) $employee->getArea() : '';
        $isCleaner = (strtolower(trim($myArea)) === 'cleaner');

        // Default: can open, but read-only unless you own it.
        $readOnly = true;

        if ($checklistCleanerId && $myEmployeeId && $checklistCleanerId === $myEmployeeId) {
            $readOnly = false; // owner cleaner can edit
        } else {
            // Other cleaners cannot open at all.
            if ($isCleaner && $checklistCleanerId && $myEmployeeId && $checklistCleanerId !== $myEmployeeId) {
                return $this->json(['ok' => false, 'error' => 'Forbidden'], Response::HTTP_FORBIDDEN);
            }
            $readOnly = true; // admin/manager can view
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'cleaningId' => $hk->getId(),
                'checklistId' => $state['checklistId'] ?? null,
                'cleanerId' => $state['cleanerId'] ?? null,
                'checklistSubmittedAt' => $this->fmtDt($state['submittedAt'] ?? null),
                'checklistUpdatedAt'   => $this->fmtDt($state['updatedAt'] ?? null),
                'hasDraft' => $state['hasDraft'] ?? false,
                'checklistData' => $state['checklistData'] ?? [],
                'notes' => $state['notes'] ?? null,
                'readOnly' => $readOnly,
            ],
        ]);
    }

    /**
     * Complete a cleaning with a checklist + optional photos.
     *
     * Endpoint intended for mobile cleaners:
     * POST /api/hk-cleanings/{id}/submit-checklist
     *
     * Expected payload (multipart/form-data):
     * - checklistData: JSON string (e.g. [{"key":"bedroom","checked":true}, ...])
     * - notes: optional text
     * - employeeId: optional numeric id of the cleaner (if not provided, controller will try to infer from logged-in user)
     * - files[]: optional array of image files
     */
    #[Route('/api/hk-cleanings/{id}/submit-checklist', name: 'api_hk_cleanings_submit_checklist', methods: ['POST'])]
    public function submitChecklist(int $id, Request $request): JsonResponse
    {
        $hk = $this->em->getRepository(HKCleanings::class)->find($id);
        if (!$hk) {
            return $this->json(['ok' => false, 'error' => 'Cleaning not found'], Response::HTTP_NOT_FOUND);
        }

        // Resolve cleaner (employee) either from explicit employeeId or from the logged-in user.
        $employee = null;
        $employeeId = $request->request->get('employeeId');
        if ($employeeId) {
            $employee = $this->em->getRepository(Employee::class)->find((int)$employeeId);
        } else {
            $user = $this->getUser();
            if ($user instanceof Employee) {
                $employee = $user;
            } elseif ($user && method_exists($user, 'getEmployee')) {
                $maybe = $user->getEmployee();
                if ($maybe instanceof Employee) {
                    $employee = $maybe;
                }
            }
        }

        if (!$employee instanceof Employee) {
            return $this->json(['ok' => false, 'error' => 'Cleaner (employee) could not be resolved'], Response::HTTP_BAD_REQUEST);
        }

        // checklistData is expected as a JSON string in a form field.
        $rawChecklist = $request->request->get('checklistData', '[]');
        $checklistData = [];
        if (is_string($rawChecklist) && $rawChecklist !== '') {
            $decoded = json_decode($rawChecklist, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                return $this->json(['ok' => false, 'error' => 'Invalid checklistData JSON'], Response::HTTP_BAD_REQUEST);
            }
            $checklistData = $decoded;
        }

        // Notes (optional)
        $notes = $request->request->get('notes');
        if ($notes === '') {
            $notes = null;
        }

        // Files: may arrive as a single UploadedFile or an array under "files"
        $filesParam = $request->files->get('files');
        $files = [];
        if ($filesParam) {
            if (is_array($filesParam)) {
                $files = $filesParam;
            } else {
                // Single file case
                $files = [$filesParam];
            }
        }

        try {
            $result = $this->hkCleaningManager->completeWithChecklist(
                $hk,
                $employee,
                $checklistData,
                $notes,
                $files
            );
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Could not complete cleaning with checklist: '.$e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'cleaningId'   => $hk->getId(),
                'status'       => method_exists($hk, 'getStatus') ? $hk->getStatus() : null,
                'checklistId'  => $result['checklistId'] ?? null,
                'fileCount'    => $result['fileCount'] ?? 0,
                'hasIssues'    => $result['hasIssues'] ?? false,

                // Always return timezone-aware ISO strings when available.
                'checklistSubmittedAt' => $this->fmtDt($result['submittedAt'] ?? null),
                'checklistUpdatedAt'   => $this->fmtDt($result['updatedAt'] ?? null),
                'checklistCleanerId'   => $result['cleanerId'] ?? null,

                'transaction'  => $result['transaction'] ?? null,
            ],
        ]);
    }
}
