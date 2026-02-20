<?php

namespace App\Controller\Api;

use App\Entity\EmployeeCashLedger;
use App\Entity\Employee;
use App\Entity\User;
use App\Service\EmployeeCashLedgerService;
use App\Repository\EmployeeCashLedgerRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/employee-cash-ledger')]
class EmployeeCashLedgerController extends AbstractController
{
    private EmployeeCashLedgerService $service;
    private EntityManagerInterface $em;

    public function __construct(EmployeeCashLedgerService $service, EntityManagerInterface $em)
    {
        $this->service = $service;
        $this->em = $em;
    }

    /**
     * List all entries (or filtered).
     * Employees only see their own entries.
     */
    #[Route('', name: 'employee_cash_ledger_list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        // If user is a regular employee (has employeeId and is not admin/manager), force filter by that.
        // Admin/manager can see all and optionally filter by employeeId query param.
        $employeeId = null;
        if ($user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId()) {
            if (!$this->isGranted('ROLE_ADMIN') && !$this->isGranted('ROLE_MANAGER')) {
                $employeeId = $user->getEmployeeId();
            } else {
                $employeeId = $request->query->getInt('employeeId') ?: null;
            }
        } else {
            $employeeId = $request->query->getInt('employeeId') ?: null;
        }

        $status   = $request->query->get('status') ?: null;
        $type     = $request->query->get('type') ?: null;
        $division = $request->query->get('division') ?: null;
        $city     = $request->query->get('city') ?: null;

        $month    = $request->query->get('month') ?: null;

        if ($month !== null) {
            $month = trim((string) $month);
            if ($month !== '' && preg_match('/^\d{4}-\d{2}$/', $month) !== 1) {
                return $this->json([
                    'success' => false,
                    'error' => 'Invalid month format. Expected YYYY-MM.',
                ], 400);
            }
            if ($month === '') {
                $month = null;
            }
        }

        $rows = $this->service->list($employeeId, $status, $type, $month, $division, $city);

        return $this->json([
            'success' => true,
            'rows' => $rows,
        ]);
    }

    /**
     * Show a single entry by id.
     * Employees can only view their own rows.
     */
    #[Route('/{id}', name: 'employee_cash_ledger_show', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(int $id): JsonResponse
    {
        $row = $this->em->getRepository(EmployeeCashLedger::class)->find($id);
        if (!$row) {
            return $this->json([
                'success' => false,
                'error' => 'Not found',
            ], 404);
        }

        /** @var User|null $user */
        $user = $this->getUser();

        // If the logged user is linked to an employee and is not admin/manager,
        // enforce that they can only see their own entries.
        if ($user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId()) {
            $hasEmployeeId    = true;
            $isAdminOrManager = $this->isGranted('ROLE_ADMIN') || $this->isGranted('ROLE_MANAGER');

            if (!$isAdminOrManager) {
                $employee = $row->getEmployee();
                if ($employee && $employee->getId() !== $user->getEmployeeId()) {
                    return $this->json([
                        'success' => false,
                        'error' => 'Forbidden',
                    ], 403);
                }
            }
        }

        return $this->json([
            'success' => true,
            'row' => $this->service->toArray($row),
        ]);
    }

    /**
     * Create a new cash ledger entry (Pending).
     * Employees can only create rows for themselves.
     */
    #[Route('', name: 'employee_cash_ledger_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        // Support both JSON and form-data (for mobile/file uploads)
        $contentType = $request->headers->get('Content-Type', '');
        if (is_string($contentType) && str_starts_with($contentType, 'application/json')) {
            $payload = json_decode($request->getContent(), true) ?? [];
        } else {
            // form-data or x-www-form-urlencoded
            $payload = $request->request->all();
        }

        // Normalize uploaded files (if any) and enforce max 2
        $files = $request->files->get('files', []);
        if ($files instanceof UploadedFile) {
            $files = [$files];
        } elseif (!is_array($files)) {
            $files = [];
        }

        if (count($files) > 2) {
            return $this->json([
                'success' => false,
                'error'   => 'You can upload a maximum of 2 files for each entry.',
            ], 400);
        }

        /** @var User $user */
        $user = $this->getUser();

        $hasEmployeeId    = $user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId();
        $isAdminOrManager = $this->isGranted('ROLE_ADMIN') || $this->isGranted('ROLE_MANAGER');
        $isPlainEmployee  = $hasEmployeeId && !$isAdminOrManager;

        // Role-based rules:
        //  - Plain employees/supervisors can only create rows for themselves,
        //    status is always Pending and certain types are disallowed.
        //  - Admin/Manager can choose employeeId explicitly; if omitted but the
        //    user is linked to an employee, we default to that employee.
        if ($isPlainEmployee) {
            // Force employeeId to the logged-in employee
            $payload['employeeId'] = $user->getEmployeeId();

            // Plain employees should not be able to spoof derived fields; the service
            // will recompute division/city/costCentre/code from the employee anyway,
            // but we unset them here as a defensive extra layer.
            unset($payload['division'], $payload['city'], $payload['costCentre'], $payload['code']);

            // Force status to Pending for employee-created entries (service can still
            // apply additional validation/defaulting if needed).
            $payload['status'] = EmployeeCashLedger::STATUS_PENDING;

            // Guard against disallowed types (even if the UI hides them).
            if (isset($payload['type']) && $payload['type'] === 'CashAdvance') {
                return $this->json([
                    'success' => false,
                    'error'   => 'Employees cannot create CashAdvance entries.',
                ], 403);
            }
        } elseif ($hasEmployeeId && $isAdminOrManager) {
            // User is linked to an employee but also has admin/manager role:
            // allow payload to choose employeeId explicitly, or fall back to own id
            // if omitted. Service will handle derived fields.
            if (!isset($payload['employeeId']) || !$payload['employeeId']) {
                $payload['employeeId'] = $user->getEmployeeId();
            }
        }

        try {
            $row = $this->service->create($payload, $files);
            return $this->json([
                'success' => true,
                'row' => $this->service->toArray($row),
            ], 201);
        } catch (\Throwable $e) {
            return $this->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Update an entry.
     * Employees can update only their own rows.
     */
    #[Route('/{id}', name: 'employee_cash_ledger_update', methods: ['PUT', 'PATCH', 'POST'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $row = $this->em->getRepository(EmployeeCashLedger::class)->find($id);
        if (!$row) {
            return $this->json(['success' => false, 'error' => 'Not found'], 404);
        }

        /** @var User $user */
        $user = $this->getUser();

        $hasEmployeeId    = $user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId();
        $isAdminOrManager = $this->isGranted('ROLE_ADMIN') || $this->isGranted('ROLE_MANAGER');
        $isPlainEmployee  = $hasEmployeeId && !$isAdminOrManager;

        // Employees can update only their own rows
        if ($hasEmployeeId) {
            if ($row->getEmployee()->getId() !== $user->getEmployeeId()) {
                return $this->json(['success' => false, 'error' => 'Forbidden'], 403);
            }
        }

        // Plain employees/supervisors:
        //  - cannot edit Approved entries
        //  - cannot change status/employeeId/derived fields (service will recompute)
        $contentType = $request->headers->get('Content-Type', '');
        if (is_string($contentType) && str_starts_with($contentType, 'application/json')) {
            $payload = json_decode($request->getContent(), true) ?? [];
        } else {
            // form-data or x-www-form-urlencoded (e.g. desktop/mobile with file uploads)
            $payload = $request->request->all();
        }

        if ($isPlainEmployee) {
            if ($row->getStatus() === EmployeeCashLedger::STATUS_APPROVED) {
                return $this->json([
                    'success' => false,
                    'error'   => 'Employees cannot edit approved entries.',
                ], 403);
            }

            // Defensive: strip fields employees should not control
            unset($payload['status'], $payload['employeeId'], $payload['division'], $payload['city'], $payload['costCentre'], $payload['code']);
        }

        // Normalize uploaded files (if any) and enforce max 2, same as create()
        $files = $request->files->get('files', []);
        if ($files instanceof UploadedFile) {
            $files = [$files];
        } elseif (!is_array($files)) {
            $files = [];
        }

        if (count($files) > 2) {
            return $this->json([
                'success' => false,
                'error'   => 'You can upload a maximum of 2 files for each entry.',
            ], 400);
        }

        try {
            $row = $this->service->update($row, $payload, $files);
            return $this->json([
                'success' => true,
                'payload' => $payload,
                'row' => $this->service->toArray($row),
            ]);
        } catch (\Throwable $e) {
            return $this->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Delete an entry.
     * Employees can delete only their own non-approved rows.
     */
    #[Route('/{id}', name: 'employee_cash_ledger_delete', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(int $id): JsonResponse
    {
        $row = $this->em->getRepository(EmployeeCashLedger::class)->find($id);
        if (!$row) {
            return $this->json(['success' => false, 'error' => 'Not found'], 404);
        }

        /** @var User $user */
        $user = $this->getUser();

        $hasEmployeeId    = $user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId();
        $isAdminOrManager = $this->isGranted('ROLE_ADMIN') || $this->isGranted('ROLE_MANAGER');
        $isPlainEmployee  = $hasEmployeeId && !$isAdminOrManager;

        if ($isPlainEmployee) {
            // Employees can delete only their own rows
            if ($row->getEmployee()->getId() !== $user->getEmployeeId()) {
                return $this->json(['success' => false, 'error' => 'Forbidden'], 403);
            }

            // Employees cannot delete approved entries
            if ($row->getStatus() === EmployeeCashLedger::STATUS_APPROVED) {
                return $this->json([
                    'success' => false,
                    'error'   => 'Employees cannot delete approved entries.',
                ], 403);
            }
        }

        $this->em->remove($row);
        $this->em->flush();

        return $this->json(['success' => true]);
    }

    /**
     * Approve an entry.
     */
    #[Route('/{id}/approve', name: 'employee_cash_ledger_approve', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function approve(int $id): JsonResponse
    {
        $row = $this->em->getRepository(EmployeeCashLedger::class)->find($id);
        if (!$row) {
            return $this->json(['success' => false, 'error' => 'Not found'], 404);
        }

        /** @var User $user */
        $user = $this->getUser();

        // Employees cannot self-approve
        if ($user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId()) {
            return $this->json(['success' => false, 'error' => 'Forbidden'], 403);
        }

        $row = $this->service->approve($row);

        return $this->json([
            'success' => true,
            'row' => $this->service->toArray($row),
        ]);
    }

    /**
     * Reject an entry.
     */
    #[Route('/{id}/reject', name: 'employee_cash_ledger_reject', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function reject(int $id): JsonResponse
    {
        $row = $this->em->getRepository(EmployeeCashLedger::class)->find($id);
        if (!$row) {
            return $this->json(['success' => false, 'error' => 'Not found'], 404);
        }

        /** @var User $user */
        $user = $this->getUser();

        // Employees cannot reject their own entries
        if ($user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId()) {
            return $this->json(['success' => false, 'error' => 'Forbidden'], 403);
        }

        $row = $this->service->reject($row);

        return $this->json([
            'success' => true,
            'row' => $this->service->toArray($row),
        ]);
    }

    /**
     * Allocate an entry.
     */
    #[Route('/{id}/allocate', name: 'employee_cash_ledger_allocate', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function allocate(int $id, Request $request): JsonResponse
    {
        $row = $this->em->getRepository(EmployeeCashLedger::class)->find($id);
        if (!$row) {
            return $this->json(['success' => false, 'error' => 'Not found'], 404);
        }

        /** @var User $user */
        $user = $this->getUser();

        // Employees cannot allocate
        if ($user && method_exists($user, 'getEmployeeId') && $user->getEmployeeId()) {
            return $this->json(['success' => false, 'error' => 'Forbidden'], 403);
        }

        $payload = json_decode($request->getContent(), true) ?? [];

        try {
            $row = $this->service->allocate($row, $payload, $user?->getEmployee());
            return $this->json([
                'success' => true,
                'row' => $this->service->toArray($row),
            ]);
        } catch (\Throwable $e) {
            return $this->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Form options for Employee Cash Ledger (admin/manager).
     * Currently returns a flat list of employees with basic fields.
     */
    #[Route('/form-options', name: 'employee_cash_ledger_form_options', methods: ['GET'])]
    public function formOptions(): JsonResponse
    {
        $repo = $this->em->getRepository(Employee::class);
        $employees = $repo->createQueryBuilder('e')
            ->orderBy('e.shortName', 'ASC')
            ->getQuery()
            ->getResult();

        $items = array_map(
            function (Employee $e): array {
                return [
                    'id' => $e->getId(),
                    'shortName' => method_exists($e, 'getShortName') ? $e->getShortName() : null,
                    'division' => method_exists($e, 'getDivision') ? $e->getDivision() : null,
                    'city' => method_exists($e, 'getCity') ? $e->getCity() : null,
                ];
            },
            $employees
        );

        return $this->json([
            'success' => true,
            'employees' => $items,
        ]);
    }
}