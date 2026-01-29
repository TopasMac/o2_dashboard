<?php

namespace App\Controller\Api;

use App\Entity\HKCleanings;
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

        // Update status to done if not already
        if (method_exists($hk, 'getStatus') && method_exists($hk, 'setStatus')) {
            if ($hk->getStatus() !== HKCleanings::STATUS_DONE) {
                $hk->setStatus(HKCleanings::STATUS_DONE);
            }
        }

        // Persist status change first
        $this->em->flush();

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

    // Set status to done (only if not already)
    if (method_exists($hk, 'getStatus') && method_exists($hk, 'setStatus')) {
        if ($hk->getStatus() !== HKCleanings::STATUS_DONE) {
            $hk->setStatus(HKCleanings::STATUS_DONE);
            $this->em->flush();
        }
    } else {
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
     * Body JSON: { checkoutDate?: 'YYYY-MM-DD', status?: 'pending'|'done'|'cancelled', cleaningCost?: number|null, o2CollectedFee?: number|null, notes?: string|null }
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

        // checkoutDate
        if (array_key_exists('checkoutDate', $data) && $data['checkoutDate']) {
            try {
                $d = new \DateTimeImmutable((string)$data['checkoutDate']);
                if (method_exists($hk, 'setCheckoutDate')) {
                    $hk->setCheckoutDate($d);
                }
            } catch (\Throwable $e) {
                return $this->json(['ok' => false, 'error' => 'Invalid checkoutDate; expected YYYY-MM-DD'], Response::HTTP_BAD_REQUEST);
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

        // o2CollectedFee
        if (array_key_exists('o2CollectedFee', $data)) {
            $val = $data['o2CollectedFee'];
            if ($val === '' || $val === null) {
                $val = null;
            }
            if (method_exists($hk, 'setO2CollectedFee')) {
                $hk->setO2CollectedFee($val);
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
