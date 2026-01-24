<?php

namespace App\Controller;

use App\Entity\Employee;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Response;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeAccessService;

#[Route('/api/employees')]
class EmployeeController extends AbstractController
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    /**
     * List employees with optional filters and simple pagination
     * Query params: division, area, city, status, q, page, pageSize
     */
    #[Route('', name: 'employees_index', methods: ['GET'])]
    public function index(Request $request, EmployeeRepository $repo): JsonResponse
    {
        $division = $request->query->get('division');
        $area     = $request->query->get('area');
        $city     = $request->query->get('city');
        $status   = $request->query->get('status');
        $q        = $request->query->get('q');
        $page     = max(1, (int) $request->query->get('page', 1));
        $pageSize = min(100, max(1, (int) $request->query->get('pageSize', 25)));

        $qb = $repo->createQueryBuilder('e');

        if ($division) { $qb->andWhere('e.division = :division')->setParameter('division', $division); }
        if ($area)     { $qb->andWhere('e.area = :area')->setParameter('area', $area); }
        if ($city)     { $qb->andWhere('e.city = :city')->setParameter('city', $city); }
        if ($status)   { $qb->andWhere('e.status = :status')->setParameter('status', $status); }
        if ($q) {
            $qb->andWhere('(LOWER(e.name) LIKE :q OR LOWER(e.shortName) LIKE :q OR LOWER(e.email) LIKE :q OR LOWER(e.phone) LIKE :q)')
               ->setParameter('q', '%' . strtolower($q) . '%');
        }

        $qb->orderBy('e.name', 'ASC');

        // clone for count
        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(e.id)')->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
                    ->setMaxResults($pageSize)
                    ->getQuery()->getResult();

        $data = array_map(fn(Employee $e) => $this->toArray($e), $items);

        return $this->json([
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $total,
            'member' => $data,
        ]);
    }

    /** Lightweight list for dropdowns (salary, HR, etc.) */
    #[Route('/options', name: 'employees_options', methods: ['GET'])]
    public function options(Request $request, EmployeeRepository $repo): JsonResponse
    {
        $q = $request->query->get('q');
        $limit = min(100, max(1, (int) $request->query->get('limit', 50)));
        $division = $request->query->get('division');
        $include = $request->query->get('include');
        $includeBank = ($include && str_contains((string) $include, 'bank'));
        // Default to only Active employees unless overridden by explicit status param
        $status = $request->query->get('status', 'Active');

        $qb = $repo->createQueryBuilder('e')
            ->select('e.id, e.employeeCode, e.shortName, e.division, e.city, e.currentSalary AS current_salary' . ($includeBank ? ', e.name, e.bankName, e.bankAccount, e.bankHolder AS bank_holder' : ''))
            ->orderBy('e.shortName', 'ASC')
            ->setMaxResults($limit);

        if ($q) {
            $qb->andWhere('(LOWER(e.shortName) LIKE :q OR LOWER(e.employeeCode) LIKE :q OR LOWER(e.name) LIKE :q)')
               ->setParameter('q', '%' . strtolower($q) . '%');
        }

        if ($division) {
            $qb->andWhere('e.division = :division')
               ->setParameter('division', $division);
        }

        if ($status) {
            $qb->andWhere('e.status = :status')
               ->setParameter('status', $status);
        }

        $rows = $qb->getQuery()->getArrayResult();
        $data = array_map(function($r) use ($includeBank) {
            $item = [
                'value' => $r['id'],
                'label' => $r['shortName'] ?? $r['employeeCode'],
                'code'  => $r['employeeCode'],
                'division' => $r['division'] ?? null,
                'city' => $r['city'] ?? null,
                'current_salary' => $r['current_salary'] ?? null,
            ];
            if ($includeBank) {
                $item['bankHolder'] = $r['bank_holder'] ?? $r['name'] ?? null;
                $item['bankName']   = $r['bankName'] ?? null;
                $item['bankAccount']= $r['bankAccount'] ?? null;
            }
            return $item;
        }, $rows);

        return $this->json($data);
    }

    /** Show by id */
    #[Route('/{id}', name: 'employees_show', methods: ['GET'])]
    public function show(int $id, EmployeeRepository $repo): JsonResponse
    {
        $e = $repo->find($id);
        if (!$e) {
            return $this->json(['message' => 'Employee not found'], Response::HTTP_NOT_FOUND);
        }
        return $this->json($this->toArray($e));
    }

    /**
     * Generate platform access (User account) for a given Employee.
     *
     * POST /api/employees/{id}/generate-access
     *
     * Returns:
     *  - employeeId
     *  - userId
     *  - email
     *  - roles
     *  - plainPassword (for one-time display / emailing)
     */
    #[Route('/{id}/generate-access', name: 'employees_generate_access', methods: ['POST'])]
    public function generateAccess(
        int $id,
        EmployeeRepository $repo,
        EmployeeAccessService $accessService,
        Request $request
    ): JsonResponse {
        $employee = $repo->find($id);
        if (!$employee) {
            return $this->json(['message' => 'Employee not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent() ?: '{}', true);
        if (!is_array($data)) {
            $data = [];
        }

        $plainPassword = null;
        if (isset($data['password']) && is_string($data['password']) && trim($data['password']) !== '') {
            $plainPassword = trim($data['password']);
            if (strlen($plainPassword) < 8) {
                return $this->json([
                    'message' => 'Password must be at least 8 characters long.',
                ], Response::HTTP_BAD_REQUEST);
            }
        }

        try {
            $result = $accessService->createUserForEmployee($employee, $plainPassword);
        } catch (\InvalidArgumentException|\LogicException $ex) {
            return $this->json([
                'message' => $ex->getMessage(),
            ], Response::HTTP_BAD_REQUEST);
        } catch (\Throwable $ex) {
            return $this->json([
                'message' => 'Failed to generate platform access',
                'error' => $ex->getMessage(),
            ], Response::HTTP_BAD_REQUEST);
        }

        /** @var \App\Entity\User $user */
        $user = $result['user'];
        $plainPassword = $result['plainPassword'];

        return $this->json([
            'employeeId'    => $employee->getId(),
            'employeeName'  => $employee->getName(),
            'userId'        => $user->getId(),
            'email'         => $user->getEmail(),
            'roles'         => $user->getRoles(),
            'plainPassword' => $plainPassword,
        ]);
    }

    /** Create */
    #[Route('', name: 'employees_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '[]', true) ?: [];

        // Minimal validation (employeeCode is auto-generated)
        $required = ['name', 'division', 'area', 'city', 'dateStarted'];
        foreach ($required as $field) {
            if (!array_key_exists($field, $payload) || $payload[$field] === '' || $payload[$field] === null) {
                return $this->json(['message' => "Missing required field: $field"], Response::HTTP_BAD_REQUEST);
            }
        }

        $e = new Employee();

        // Auto-generate employeeCode (format O2E00001)
        $last = $this->em->getRepository(Employee::class)->findOneBy([], ['id' => 'DESC']);
        $nextNum = $last ? $last->getId() + 1 : 1;
        $employeeCode = sprintf('O2E%05d', $nextNum);
        $e->setEmployeeCode($employeeCode);

        try {
            $this->hydrateEmployee($e, $payload, isCreate: true);
            // Salary defaults: make optional and keep current = initial when missing
            $initial = $e->getInitialSalary();
            $current = $e->getCurrentSalary();
            if ($initial === null || $initial === '') {
                $e->setInitialSalary('0');
                $e->setCurrentSalary('0');
            } elseif ($current === null || $current === '') {
                $e->setCurrentSalary((string) $initial);
            }
            // Default status to Active when not provided
            if (!$e->getStatus()) {
                $e->setStatus('Active');
            }
            $this->em->persist($e);
            $this->em->flush();
        } catch (\Throwable $ex) {
            return $this->json(['message' => 'Failed to create employee', 'error' => $ex->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        return $this->json($this->toArray($e), Response::HTTP_CREATED);
    }

    /** Update */
    #[Route('/{id}', name: 'employees_update', methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request, EmployeeRepository $repo, EmployeeAccessService $accessService): JsonResponse
    {
        $e = $repo->find($id);
        if (!$e) {
            return $this->json(['message' => 'Employee not found'], Response::HTTP_NOT_FOUND);
        }

        $previousPlatformEnabled = method_exists($e, 'isPlatformEnabled') ? $e->isPlatformEnabled() : false;

        $payload = json_decode($request->getContent() ?: '[]', true) ?: [];

        // Optional: extract admin-provided access password from payload
        $plainPassword = null;
        if (array_key_exists('accessPassword', $payload)) {
            $pwRaw = $payload['accessPassword'];
            if (is_string($pwRaw)) {
                $pw = trim($pwRaw);
                if ($pw !== '') {
                    if (strlen($pw) < 8) {
                        return $this->json([
                            'message' => 'Password must be at least 8 characters long.',
                        ], Response::HTTP_BAD_REQUEST);
                    }
                    // If confirmation provided, ensure it matches
                    if (array_key_exists('accessPasswordConfirm', $payload)) {
                        $pwConfRaw = $payload['accessPasswordConfirm'];
                        $pwConf = is_string($pwConfRaw) ? trim($pwConfRaw) : '';
                        if ($pwConf !== '' && $pwConf !== $pw) {
                            return $this->json([
                                'message' => 'Password confirmation does not match.',
                            ], Response::HTTP_BAD_REQUEST);
                        }
                    }
                    $plainPassword = $pw;
                }
            }
        }

        try {
            $this->hydrateEmployee($e, $payload, isCreate: false);
            // Salary defaults on update as well
            $initial = $e->getInitialSalary();
            $current = $e->getCurrentSalary();
            if ($initial === null || $initial === '') {
                $e->setInitialSalary('0');
                $e->setCurrentSalary('0');
            } elseif ($current === null || $current === '') {
                $e->setCurrentSalary((string) $initial);
            }
            $this->em->flush();

            // If platformEnabled was just turned on and there's no User linked yet,
            // automatically create platform access (using admin-provided password if present).
            if (
                !$previousPlatformEnabled
                && method_exists($e, 'isPlatformEnabled')
                && $e->isPlatformEnabled()
                && $e->getUser() === null
            ) {
                try {
                    $accessService->createUserForEmployee($e, $plainPassword);
                } catch (\Throwable $ex) {
                    // We don't want to fail the whole employee update if access creation fails,
                    // but you may want to log this in the future.
                }
            }

            // If a password was provided and a User already exists (and access is enabled),
            // update that user's password as well.
            if (
                $plainPassword !== null
                && $e->getUser() !== null
                && method_exists($e, 'isPlatformEnabled')
                && $e->isPlatformEnabled()
            ) {
                try {
                    $accessService->updateUserPasswordForEmployee($e, $plainPassword);
                } catch (\Throwable $ex) {
                    // Silently ignore failures here; optionally log in the future.
                }
            }
        } catch (\Throwable $ex) {
            return $this->json(['message' => 'Failed to update employee', 'error' => $ex->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        return $this->json($this->toArray($e));
    }

    /** Delete */
    #[Route('/{id}', name: 'employees_delete', methods: ['DELETE'])]
    public function delete(int $id, EmployeeRepository $repo): JsonResponse
    {
        $e = $repo->find($id);
        if (!$e) {
            return $this->json(['message' => 'Employee not found'], Response::HTTP_NOT_FOUND);
        }
        $this->em->remove($e);
        $this->em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    // ----------------- helpers -----------------

    private function toArray(Employee $e): array
    {
        return [
            'id' => $e->getId(),
            'employeeCode' => $e->getEmployeeCode(),
            'name' => $e->getName(),
            'shortName' => $e->getShortName(),
            'phone' => $e->getPhone(),
            'email' => $e->getEmail(),
            'bank' => $e->getBankName(),
            'accountNumber' => $e->getBankAccount(),
            'division' => $e->getDivision(),
            'area' => $e->getArea(),
            'city' => $e->getCity(),
            'dateStarted' => $e->getDateStarted()?->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d'),
            'dateEnded' => $e->getDateEnded()?->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d'),
            'initialSalary' => $e->getInitialSalary(),
            'currentSalary' => $e->getCurrentSalary(),
            'status' => $e->getStatus(),
            'platformEnabled' => method_exists($e, 'isPlatformEnabled') ? $e->isPlatformEnabled() : false,
            'notes' => $e->getNotes(),
            'userId' => $e->getUser()?->getId(),
        ];
    }

    /**
     * Assigns payload fields into the Employee entity. If `userId` is provided, link to User.
     * Accepts dates as `YYYY-MM-DD`.
     */
    private function hydrateEmployee(Employee $e, array $p, bool $isCreate = false): void
    {
        $set = function(string $key, callable $apply) use ($p) {
            if (array_key_exists($key, $p)) { $apply($p[$key]); }
        };

        if (!$isCreate) {
            // Allow updating code if explicitly sent (optional)
            $set('employeeCode', fn($v) => $e->setEmployeeCode((string) $v));
        }

        $set('name', fn($v) => $e->setName((string) $v));
        $set('shortName', fn($v) => $e->setShortName($v !== null && $v !== '' ? (string) $v : null));
        $set('phone', fn($v) => $e->setPhone($v !== null && $v !== '' ? (string) $v : null));
        $set('email', fn($v) => $e->setEmail($v !== null && $v !== '' ? (string) $v : null));
        $set('bank', fn($v) => $e->setBankName($v !== null && $v !== '' ? (string) $v : null));
        $set('bank_name', fn($v) => $e->setBankName($v !== null && $v !== '' ? (string) $v : null));
        $set('accountNumber', fn($v) => $e->setBankAccount($v !== null && $v !== '' ? (string) $v : null));
        $set('bank_account', fn($v) => $e->setBankAccount($v !== null && $v !== '' ? (string) $v : null));
        $set('division', fn($v) => $e->setDivision((string) $v));
        $set('area', fn($v) => $e->setArea((string) $v));
        $set('city', fn($v) => $e->setCity((string) $v));

        $set('dateStarted', function($v) use ($e) {
            if ($v) {
                $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $v, new \DateTimeZone('UTC'));
                if ($dt === false) { throw new \InvalidArgumentException('Invalid dateStarted format (expected YYYY-MM-DD)'); }
                $e->setDateStarted($dt);
            }
        });
        $set('dateEnded', function($v) use ($e) {
            if ($v === null || $v === '') { $e->setDateEnded(null); return; }
            $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $v, new \DateTimeZone('UTC'));
            if ($dt === false) { throw new \InvalidArgumentException('Invalid dateEnded format (expected YYYY-MM-DD)'); }
            $e->setDateEnded($dt);
        });

        // salaries come as strings/number; keep as string for DECIMAL field
        $set('initialSalary', fn($v) => $e->setInitialSalary((string) $v));
        $set('currentSalary', fn($v) => $e->setCurrentSalary((string) $v));

        // If initialSalary is provided but currentSalary is not (or is empty), mirror current = initial
        $initialProvided = array_key_exists('initialSalary', $p);
        $currentProvided = array_key_exists('currentSalary', $p);
        if ($initialProvided && (!$currentProvided || $p['currentSalary'] === null || $p['currentSalary'] === '')) {
            $e->setCurrentSalary((string) $e->getInitialSalary());
        }

        $set('status', fn($v) => $e->setStatus((string) $v));
        $set('notes', fn($v) => $e->setNotes($v !== null && $v !== '' ? (string) $v : null));
        $set('platformEnabled', function($v) use ($e) {
            // Accept booleans, "true"/"false", "1"/"0", 1/0
            if (is_bool($v)) {
                $e->setPlatformEnabled($v);
                return;
            }
            if (is_string($v)) {
                $val = strtolower(trim($v));
                $e->setPlatformEnabled($val === '1' || $val === 'true' || $val === 'yes');
                return;
            }
            if (is_int($v) || is_float($v)) {
                $e->setPlatformEnabled((int) $v === 1);
                return;
            }
            // Fallback: disable if value is null/empty/unrecognized
            $e->setPlatformEnabled(false);
        });

        // Link user if provided
        $set('userId', function($v) use ($e) {
            if ($v === null || $v === '') { $e->setUser(null); return; }
            $user = $this->em->getRepository(User::class)->find((int) $v);
            if (!$user) { throw new \InvalidArgumentException('User not found for id ' . $v); }
            $e->setUser($user);
        });

        // Basic rule: if terminated status then require dateEnded
        if ($e->getStatus() === 'Terminated' && $e->getDateEnded() === null) {
            throw new \InvalidArgumentException('dateEnded is required when status is Terminated');
        }
    }
}
