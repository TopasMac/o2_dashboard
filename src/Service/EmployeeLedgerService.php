<?php

namespace App\Service;

use App\Entity\Employee;
use App\Entity\EmployeeFinancialLedger;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Central service to manage Employee Financial Ledger rows:
 * - list(): filter/paginate
 * - create(): validate + persist
 * - update(): validate + persist
 * - toArray(): normalized API shape
 */
class EmployeeLedgerService
{
    private EntityManagerInterface $em;

    // Canonical type values for the ledger "type" column
    public const TYPE_PAYMENT        = 'Payment';
    public const TYPE_CASH_ADVANCE   = 'CashAdvance';
    public const TYPE_GUEST_PAYMENT  = 'GuestPayment';
    public const TYPE_CASH_RETURN    = 'CashReturn';
    public const TYPE_EXPENSE        = 'Expense';

    /**
     * Allowed types for the "type" column.
     *
     * Canonical (new) types for the cash ledger:
     *  - Payment        (salary/bonus/reimbursement paid to employee)
     *  - CashAdvance    (cash given to employee for future expenses)
     *  - GuestPayment   (cash received from guest and held by employee)
     *  - CashReturn     (cash returned from employee back to Owners2)
     *  - Expense        (employee-submitted expense with receipt)
     *
     * Legacy lowercase types are still accepted so existing rows
     * and older flows (HRTransactions) continue to work:
     *  - salary
     *  - bonus
     *  - advance
     *  - deduction
     */
    private const ALLOWED_TYPES = [
        // New canonical types
        self::TYPE_PAYMENT,
        self::TYPE_CASH_ADVANCE,
        self::TYPE_GUEST_PAYMENT,
        self::TYPE_CASH_RETURN,
        self::TYPE_EXPENSE,

        // Backwards-compatible legacy values
        'salary',
        'bonus',
        'advance',
        'deduction',
    ];

    public function __construct(EntityManagerInterface $em)
    {
        $this->em = $em;
    }

    /**
     * List ledger rows with simple filtering / sorting / pagination.
     * Supported filters:
     *  - q (search in employee.shortName/code and notes)
     *  - employeeId
     *  - division
     *  - city
     *  - type
     *  - period (YYYY-MM) OR date_from/date_to (YYYY-MM-DD)
     * Sorting:
     *  - sort (field), dir (ASC|DESC)
     * Pagination:
     *  - page (1-based), limit
     */
    public function list(array $q): array
    {
        $repo = $this->em->getRepository(EmployeeFinancialLedger::class);

        $qb = $repo->createQueryBuilder('l')
            ->leftJoin('l.employee', 'e')
            ->addSelect('e');

        // Filters
        $employeeId = isset($q['employeeId']) && $q['employeeId'] !== '' ? (int) $q['employeeId'] : null;
        if ($employeeId) {
            $qb->andWhere('e.id = :eid')->setParameter('eid', $employeeId);
        }

        if (!empty($q['division'])) {
            $qb->andWhere('l.division = :division')->setParameter('division', (string) $q['division']);
        }

        if (!empty($q['city'])) {
            $qb->andWhere('l.city = :city')->setParameter('city', (string) $q['city']);
        }

        if (!empty($q['type'])) {
            $qb->andWhere('l.type = :type')->setParameter('type', (string) $q['type']);
        }

        // Date filters: period (YYYY-MM) OR date_from/date_to
        $utc = new \DateTimeZone('UTC');
        if (!empty($q['period']) && preg_match('/^\d{4}-\d{2}$/', (string) $q['period'])) {
            [$yy, $mm] = explode('-', (string) $q['period']);
            $from = \DateTimeImmutable::createFromFormat('!Y-m-d', sprintf('%04d-%02d-01', (int) $yy, (int) $mm), $utc);
            $to = $from->modify('last day of this month');
            $qb->andWhere('l.periodStart IS NULL OR l.periodStart <= :to')
                ->andWhere('l.periodEnd IS NULL OR l.periodEnd >= :from')
                ->setParameter('from', $from)
                ->setParameter('to', $to);
        } else {
            if (!empty($q['date_from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $q['date_from'])) {
                $from = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $q['date_from'], $utc);
                $qb->andWhere('l.periodEnd IS NULL OR l.periodEnd >= :from')->setParameter('from', $from);
            }
            if (!empty($q['date_to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $q['date_to'])) {
                $to = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $q['date_to'], $utc);
                $qb->andWhere('l.periodStart IS NULL OR l.periodStart <= :to')->setParameter('to', $to);
            }
        }

        // Free text search
        if (!empty($q['q'])) {
            $qstr = '%' . mb_strtolower((string) $q['q']) . '%';
            $qb->andWhere('LOWER(e.shortName) LIKE :q OR LOWER(e.name) LIKE :q OR LOWER(e.employeeCode) LIKE :q OR LOWER(l.notes) LIKE :q OR LOWER(l.employeeShortName) LIKE :q')
                ->setParameter('q', $qstr);
        }

        // Sorting
        $sort = $q['sort'] ?? 'id';
        $dir  = strtoupper((string) ($q['dir'] ?? 'DESC')) === 'ASC' ? 'ASC' : 'DESC';
        $allowedSorts = ['id', 'code', 'type', 'amount', 'division', 'city', 'periodStart', 'periodEnd', 'createdAt'];
        if (!in_array($sort, $allowedSorts, true)) {
            $sort = 'id';
        }
        $qb->orderBy('l.' . $sort, $dir);

        // Pagination
        $page  = max(1, (int) ($q['page'] ?? 1));
        $limit = min(200, max(1, (int) ($q['limit'] ?? 50)));
        $qb->setFirstResult(($page - 1) * $limit)->setMaxResults($limit);

        $rows = $qb->getQuery()->getResult();

        $data = array_map(
            function (EmployeeFinancialLedger $l) {
                return $this->toArray($l, null);
            },
            $rows
        );

        return [
            'page'  => $page,
            'limit' => $limit,
            'rows'  => $data,
        ];
    }

    /**
     * Create a new ledger row and persist it.
     * Required: employeeId, type, amount
     * Optional: periodStart, periodEnd, division, city, costCentre, notes, code
     */
    public function create(array $payload): EmployeeFinancialLedger
    {
        $employeeId = (int) ($payload['employeeId'] ?? 0);
        if ($employeeId <= 0) {
            throw new \InvalidArgumentException('employeeId is required');
        }

        /** @var Employee|null $emp */
        $emp = $this->em->getRepository(Employee::class)->find($employeeId);
        if (!$emp) {
            throw new \InvalidArgumentException('Employee not found: ' . $employeeId);
        }

        $type = (string) ($payload['type'] ?? '');
        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            throw new \InvalidArgumentException('Invalid type. Allowed: ' . implode(', ', self::ALLOWED_TYPES));
        }

        $amount = (string) ($payload['amount'] ?? '0.00');

        $utc = new \DateTimeZone('UTC');
        $periodStart = null;
        $periodEnd   = null;
        if (!empty($payload['periodStart'])) {
            $periodStart = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $payload['periodStart'], $utc);
            if ($periodStart === false) {
                throw new \InvalidArgumentException('Invalid periodStart (YYYY-MM-DD)');
            }
        }
        if (!empty($payload['periodEnd'])) {
            $periodEnd = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $payload['periodEnd'], $utc);
            if ($periodEnd === false) {
                throw new \InvalidArgumentException('Invalid periodEnd (YYYY-MM-DD)');
            }
        }

        // Division / City defaults
        $division = $payload['division'] ?? (method_exists($emp, 'getDivision') ? $emp->getDivision() : null);
        $city     = $payload['city'] ?? (method_exists($emp, 'getCity') ? $emp->getCity() : null);

        // costCentre: explicit value from payload, or infer from division + city.
        $costCentre = $payload['costCentre'] ?? null;

        // Non-Unit cost centres: infer if not explicitly provided
        if ($costCentre === null && $division) {
            $divisionNorm = strtolower((string) $division);
            $cityKey = $this->normalizeCityKey($city);

            if ($divisionNorm === 'owners2') {
                $costCentre = 'O2_' . $cityKey;
            } elseif ($divisionNorm === 'housekeepers') {
                $costCentre = 'HK_' . $cityKey;
            }
        }


        $row = new EmployeeFinancialLedger();
        $row->setEmployee($emp);
        $row->setEmployeeShortName(method_exists($emp, 'getShortName') ? $emp->getShortName() : null);
        $row->setType($type);
        $row->setAmount($amount);
        $row->setDivision($division);
        $row->setCity($city);
        $row->setCostCentre($costCentre);
        $row->setNotes($payload['notes'] ?? null);

        // Area: from payload or fall back to employee record
        $row->setArea($payload['area'] ?? (method_exists($emp, 'getArea') ? $emp->getArea() : null));
        $row->setPeriodStart($periodStart);
        $row->setPeriodEnd($periodEnd);

        // Code generation (EFLXXXXX) if not provided
        $code = $payload['code'] ?? null;
        if (!$code) {
            $code = $this->generateCode();
        }
        $row->setCode($code);

        $this->em->persist($row);
        $this->em->flush();

        return $row;
    }

    /**
     * Convenience helper: create a Cash Advance row.
     *
     * This enforces type="CashAdvance" and then delegates to create().
     * You can still pass employeeId, amount, city, costCentre, notes, etc. in $payload.
     */
    public function createCashAdvanceRow(array $payload): EmployeeFinancialLedger
    {
        $payload['type'] = self::TYPE_CASH_ADVANCE;

        return $this->create($payload);
    }

    /**
     * Convenience helper: create an Expense row.
     *
     * This enforces type="Expense" and then delegates to create().
     * Use this from employee-facing or admin pages when registering expenses.
     */
    public function createExpenseRow(array $payload): EmployeeFinancialLedger
    {
        $payload['type'] = self::TYPE_EXPENSE;

        return $this->create($payload);
    }

    /**
     * Update an existing ledger row.
     */
    public function update(EmployeeFinancialLedger $row, array $payload): EmployeeFinancialLedger
    {
        if (isset($payload['employeeId']) && $payload['employeeId'] !== '') {
            $emp = $this->em->getRepository(Employee::class)->find((int) $payload['employeeId']);
            if (!$emp) {
                throw new \InvalidArgumentException('Employee not found: ' . (int) $payload['employeeId']);
            }
            $row->setEmployee($emp);
            $row->setEmployeeShortName(method_exists($emp, 'getShortName') ? $emp->getShortName() : null);
        }


        if (isset($payload['type'])) {
            $type = (string) $payload['type'];
            if (!in_array($type, self::ALLOWED_TYPES, true)) {
                throw new \InvalidArgumentException('Invalid type. Allowed: ' . implode(', ', self::ALLOWED_TYPES));
            }
            $row->setType($type);
        }

        if (isset($payload['amount'])) {
            $row->setAmount((string) $payload['amount']);
        }

        if (array_key_exists('division', $payload)) {
            $row->setDivision($payload['division'] ?? null);
        }
        if (array_key_exists('city', $payload)) {
            $row->setCity($payload['city'] ?? null);
        }
        if (array_key_exists('costCentre', $payload)) {
            $row->setCostCentre($payload['costCentre'] ?? null);
        }
        if (array_key_exists('notes', $payload)) {
            $row->setNotes($payload['notes'] ?? null);
        }
        if (array_key_exists('area', $payload)) {
            $row->setArea($payload['area'] ?? null);
        }


        $utc = new \DateTimeZone('UTC');
        if (array_key_exists('periodStart', $payload)) {
            if ($payload['periodStart'] === null || $payload['periodStart'] === '') {
                $row->setPeriodStart(null);
            } else {
                $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $payload['periodStart'], $utc);
                if ($dt === false) {
                    throw new \InvalidArgumentException('Invalid periodStart (YYYY-MM-DD)');
                }
                $row->setPeriodStart($dt);
            }
        }
        if (array_key_exists('periodEnd', $payload)) {
            if ($payload['periodEnd'] === null || $payload['periodEnd'] === '') {
                $row->setPeriodEnd(null);
            } else {
                $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $payload['periodEnd'], $utc);
                if ($dt === false) {
                    throw new \InvalidArgumentException('Invalid periodEnd (YYYY-MM-DD)');
                }
                $row->setPeriodEnd($dt);
            }
        }

        // Code is immutable once set; ignore changes unless it's empty for some reason
        if ($row->getCode() === null || $row->getCode() === '') {
            $row->setCode($this->generateCode());
        }

        $this->em->flush();

        return $row;
    }

    /**
     * Normalize entity to array for API responses.
     */
    public function toArray(EmployeeFinancialLedger $l, ?string $balance = null): array
    {
        $utc = new \DateTimeZone('UTC');
        $fmt = static function (?\DateTimeImmutable $d) use ($utc): ?string {
            return $d ? $d->setTimezone($utc)->format('Y-m-d') : null;
        };

        $emp = $l->getEmployee();

        return [
            'id' => $l->getId(),
            'code' => $l->getCode(),
            'employee' => $emp ? [
                'id' => $emp->getId(),
                'shortName' => method_exists($emp, 'getShortName') ? $emp->getShortName() : null,
                'division' => method_exists($emp, 'getDivision') ? $emp->getDivision() : null,
                'city' => method_exists($emp, 'getCity') ? $emp->getCity() : null,
            ] : null,
            'employeeShortName' => $l->getEmployeeShortName(),
            'type' => $l->getType(),
            'amount' => $l->getAmount(),
            'balance' => $balance,
            'division' => $l->getDivision(),
            'city' => $l->getCity(),
            'area' => $l->getArea(),
            'costCentre' => $l->getCostCentre(),
            'periodStart' => $fmt($l->getPeriodStart()),
            'periodEnd' => $fmt($l->getPeriodEnd()),
            'notes' => $l->getNotes(),
            'createdAt' => $l->getCreatedAt()->setTimezone($utc)->format('Y-m-d H:i:s'),
        ];
    }

    /**
     * Generate a code like "EFL000001".
     * Simple monotonic generator based on the current max numeric suffix.
     * This is safe enough for low concurrency; if you expect bursts, prefer a DB-level sequence.
     */
    private function generateCode(): string
    {
        $conn = $this->em->getConnection();
        $sql  = "SELECT code FROM employee_financial_ledger WHERE code LIKE 'EFL%' ORDER BY code DESC LIMIT 1";
        $last = $conn->fetchOne($sql);
        $next = 1;
        if ($last && preg_match('/^EFL(\d{5,})$/', (string) $last, $m)) {
            $next = (int) $m[1] + 1;
        }
        return 'EFL' . str_pad((string) $next, 6, '0', STR_PAD_LEFT);
    }

    /**
     * Build a city key like "General", "PlayadelCarmen", etc.
     */
    private function normalizeCityKey(?string $city): string
    {
        $city = trim((string) $city);
        if ($city === '') {
            return 'General';
        }

        $lower = mb_strtolower($city);

        if (str_contains($lower, 'playa')) {
            return 'Playa';
        }

        if (str_contains($lower, 'tulum')) {
            return 'Tulum';
        }

        // Fallback
        return 'General';
    }
}