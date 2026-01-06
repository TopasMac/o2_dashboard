<?php

namespace App\Controller;

use App\Entity\EmployeeFinancialLedger;
use App\Service\EmployeeLedgerService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class EmployeeLedgerController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly EmployeeLedgerService $service,
        private readonly \App\Service\EmployeeTransactionsFormService $formService
    ) {}

    /**
     * GET /api/employee-ledger
     * Query params:
     *  - q: free-text search
     *  - employeeId: filter by employee
     *  - division: Owners2 / Housekeepers / etc.
     *  - city: Playa / Tulum / General
     *  - type: Payment | CashAdvance | GuestPayment | CashReturn | Expense
     *  - period (YYYY-MM)
     *  - date_from, date_to
     *  - page, limit, sort, dir
     */
    #[Route('/api/employee-ledger', name: 'api_employee_ledger_list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        try {
            $q = [
                'q'          => $request->query->get('q'),
                'employeeId' => $request->query->get('employeeId'),
                'division'   => $request->query->get('division'),
                'city'       => $request->query->get('city'),
                'type'       => $request->query->get('type'),
                'period'     => $request->query->get('period'),
                'date_from'  => $request->query->get('date_from'),
                'date_to'    => $request->query->get('date_to'),
                'page'       => $request->query->get('page', 1),
                'limit'      => $request->query->get('limit', 50),
                'sort'       => $request->query->get('sort', 'id'),
                'dir'        => $request->query->get('dir', 'DESC'),
            ];

            $result = $this->service->list($q);
            return $this->json($result);
        } catch (\Throwable $e) {
            return $this->json([
                'error' => 'exception',
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * POST /api/employee-ledger
     * Body: JSON {
     *   employeeId: int,
     *   type: "Payment" | "CashAdvance" | "GuestPayment" | "CashReturn" | "Expense",
     *   amount: number,
     *
     *   // Optional date range for salary/period-based items
     *   periodStart?: string (YYYY-MM-DD),
     *   periodEnd?: string (YYYY-MM-DD),
     *
     *   // Optional metadata
     *   division?: string,
     *   city?: string,
     *   costCentre?: string,
     *
     *   notes?: string,
     *   code?: string,
     * }
     */
    #[Route('/api/employee-ledger', name: 'api_employee_ledger_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
            $data = json_decode($request->getContent() ?: '[]', true);
            if (!is_array($data)) {
                return $this->json(['error' => 'invalid_json', 'message' => 'Invalid JSON body'], 400);
            }
        try {
            $row = $this->service->create($data);
            return $this->json([
                'success' => true,
                'row' => $this->service->toArray($row),
            ], 201);
        } catch (\Throwable $e) {
            return $this->json([
                'success' => false,
                'error' => 'exception',
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * PUT /api/employee-ledger/{id}
     * Body: JSON with any updatable fields
     */
    #[Route('/api/employee-ledger/{id}', name: 'api_employee_ledger_update', requirements: ['id' => '\d+'], methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        /** @var EmployeeFinancialLedger|null $row */
        $row = $this->em->getRepository(EmployeeFinancialLedger::class)->find($id);
        if (!$row) {
            return $this->json(['error' => 'not_found', 'message' => 'Ledger row not found'], 404);
        }

        $data = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($data)) {
            return $this->json(['error' => 'invalid_json', 'message' => 'Invalid JSON body'], 400);
        }

        try {
            $row = $this->service->update($row, $data);
            return $this->json([
                'success' => true,
                'row' => $this->service->toArray($row),
            ]);
        } catch (\Throwable $e) {
            return $this->json([
                'success' => false,
                'error' => 'exception',
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * DELETE /api/employee-ledger/{id}
     */
    #[Route('/api/employee-ledger/{id}', name: 'api_employee_ledger_delete', requirements: ['id' => '\d+'], methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        /** @var EmployeeFinancialLedger|null $row */
        $row = $this->em->getRepository(EmployeeFinancialLedger::class)->find($id);
        if (!$row) {
            return $this->json([
                'success' => false,
                'error' => 'not_found',
                'message' => 'Ledger row not found',
            ], 404);
        }

        try {
            $this->em->remove($row);
            $this->em->flush();

            return $this->json([
                'success' => true,
            ]);
        } catch (\Throwable $e) {
            return $this->json([
                'success' => false,
                'error' => 'exception',
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * GET /api/employee-transactions/form-options
     * Returns all dropdown/autocomplete data needed for the form.
     */
    #[Route('/api/employee-transactions/form-options', name: 'api_employee_trans_form_options', methods: ['GET'])]
    // #[Route('/form-options', name: 'api_employee_ledger_form_options', methods: ['GET'])] // Old route commented out
    public function formOptions(): JsonResponse
    {
        try {
            return $this->json([
                'success' => true,
                'data' => $this->formService->getFormOptions(),
            ]);
        } catch (\Throwable $e) {
            return $this->json([
                'success' => false,
                'error' => 'exception',
                'message' => $e->getMessage(),
            ], 400);
        }
    }
}