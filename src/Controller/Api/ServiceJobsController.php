<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\HKTransactions;
use App\Entity\ServiceJob;
use App\Entity\ServiceProvider;
use App\Entity\TransactionCategory;
use App\Entity\Unit;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/service-jobs', name: 'api_service_jobs_')]
final class ServiceJobsController extends AbstractController
{
    private const CATEGORY_NAMES = ['Mantenimiento', 'Equipamiento', 'Servicios Externos'];
    private const ALLOCATION_CATEGORY_NAMES = ['Equipamiento', 'Limpieza_extra', 'Mantenimiento', 'Otros', 'Servicios Externos'];

    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    #[Route('', name: 'list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        $jobs = $this->em->createQueryBuilder()
            ->select('job', 'unit', 'category', 'provider', 'allocation')
            ->from(ServiceJob::class, 'job')
            ->join('job.unit', 'unit')
            ->join('job.category', 'category')
            ->leftJoin('job.provider', 'provider')
            ->leftJoin('job.allocations', 'allocation')
            ->orderBy('job.scheduledDate', 'ASC')
            ->addOrderBy('job.id', 'ASC')
            ->addOrderBy('allocation.id', 'ASC')
            ->getQuery()
            ->getResult();

        return $this->respond(['jobs' => array_map(self::row(...), $jobs)]);
    }

    #[Route('/options', name: 'options', methods: ['GET'])]
    public function options(): JsonResponse
    {
        $units = $this->em->createQueryBuilder()
            ->select('unit.id', 'unit.unitName AS name')
            ->from(Unit::class, 'unit')
            ->where('unit.status = :status')
            ->setParameter('status', 'Active')
            ->orderBy('unit.unitName', 'ASC')
            ->getQuery()
            ->getArrayResult();

        $categories = $this->em->createQueryBuilder()
            ->select('category.id', 'category.name')
            ->from(TransactionCategory::class, 'category')
            ->where('category.name IN (:names)')
            ->setParameter('names', self::CATEGORY_NAMES)
            ->orderBy('category.name', 'ASC')
            ->getQuery()
            ->getArrayResult();

        // Apply the same exact-name policy as writes, independent of MySQL collation.
        $categories = array_values(array_filter($categories, static fn (array $category): bool =>
            in_array($category['name'], self::CATEGORY_NAMES, true)
        ));

        $allocationCategories = $this->em->createQueryBuilder()
            ->select('category.id', 'category.name', 'category.type')
            ->from(TransactionCategory::class, 'category')
            ->where('category.name IN (:names) AND category.type IN (:types)')
            ->setParameter('names', self::ALLOCATION_CATEGORY_NAMES)
            ->setParameter('types', ['Gasto', 'Both'])
            ->orderBy('category.name', 'ASC')
            ->getQuery()
            ->getArrayResult();

        $allocationCategories = array_values(array_filter($allocationCategories, static fn (array $category): bool =>
            in_array($category['name'], self::ALLOCATION_CATEGORY_NAMES, true)
        ));

        return $this->respond(['units' => $units, 'categories' => $categories, 'allocationCategories' => $allocationCategories]);
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        return $this->save($request);
    }

    #[Route('/{id<\d+>}', name: 'update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        return $this->em->wrapInTransaction(function () use ($id, $request): JsonResponse {
            $job = $this->em->find(ServiceJob::class, $id, LockMode::PESSIMISTIC_WRITE);
            if ($job === null) {
                return $this->respond(['error' => 'Service job not found.'], 404);
            }

            return $this->save($request, $job);
        });
    }

    #[Route('/{id<\d+>}/allocations', name: 'allocation_save', methods: ['PUT'])]
    public function saveAllocation(int $id, Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $date = $data['date'] ?? null;
        $transactionDate = is_string($date) && preg_match('/^[1-9]\d{3}-\d{2}-\d{2}$/D', $date) ? \DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
        if (!$transactionDate || $transactionDate->format('Y-m-d') !== $date) {
            return $this->respond(['error' => 'Enter a valid transaction date.'], 400);
        }

        $target = $data['allocationTarget'] ?? null;
        if (!in_array($target, [HKTransactions::ALLOC_CLIENT, HKTransactions::ALLOC_OWNERS2], true)) {
            return $this->respond(['error' => 'Choose Client or Owners2 for Charge to.'], 400);
        }

        $categoryId = filter_var($data['categoryId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $category = $categoryId ? $this->em->find(TransactionCategory::class, $categoryId) : null;
        if (!$category || !in_array($category->getType(), ['Gasto', 'Both'], true) || !in_array($category->getName(), self::ALLOCATION_CATEGORY_NAMES, true)) {
            return $this->respond(['error' => 'Choose a housekeeping expense category.'], 400);
        }

        $lineType = $category->getName() === 'Equipamiento' ? HKTransactions::LINE_EQUIPMENT : HKTransactions::LINE_LABOUR;
        $allocationId = $data['allocationId'] ?? null;
        if ($allocationId !== null && (!is_int($allocationId) || $allocationId < 1)) {
            return $this->respond(['error' => 'Invalid allocation reference.'], 400);
        }

        $requestKey = $data['requestKey'] ?? null;
        if ($allocationId === null && (!is_string($requestKey) || !preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/D', $requestKey))) {
            return $this->respond(['error' => 'A valid allocation request key is required.'], 400);
        }

        $paid = $data['paid'] ?? null;
        if ($paid === null || $paid === '') {
            return $this->respond(['error' => 'Enter a Paid amount.'], 400);
        }

        $charged = $data['charged'] ?? '';
        $data['charged'] = $charged === '' ? $paid : $charged;

        foreach (['paid', 'charged'] as $field) {
            $value = $data[$field] ?? null;
            if ((!is_int($value) && !is_float($value) && !is_string($value)) || !preg_match('/^\d{1,8}(?:\.\d{1,2})?$/D', (string) $value)) {
                return $this->respond(['error' => 'Enter valid Paid and Charged amounts, including zero when applicable.'], 400);
            }
        }

        $description = $data['description'] ?? null;
        $notes = $data['notes'] ?? null;
        if (!is_string($description) || trim($description) === '' || ($notes !== null && !is_string($notes))) {
            return $this->respond(['error' => 'Enter a description and use text for comments.'], 400);
        }

        return $this->em->wrapInTransaction(function () use ($id, $lineType, $allocationId, $requestKey, $transactionDate, $category, $target, $description, $notes, $data): JsonResponse {
            // Serialize saves for this job so a retry can update the same line.
            $job = $this->em->find(ServiceJob::class, $id, LockMode::PESSIMISTIC_WRITE);
            if (!$job) {
                return $this->respond(['error' => 'Service job not found.'], 404);
            }
            if ($job->getStatus() !== ServiceJob::DONE) {
                return $this->respond(['error' => 'Only Done service jobs can be allocated.'], 409);
            }

            $allocations = $this->em->getRepository(HKTransactions::class);
            if ($allocationId !== null) {
                $transaction = $allocations->findOneBy(['id' => $allocationId, 'serviceJob' => $job]);
                if (!$transaction) {
                    return $this->respond(['error' => 'Allocation not found for this service job.'], 404);
                }
            } else {
                $transaction = $allocations->findOneBy(['serviceJob' => $job, 'allocationRequestKey' => $requestKey]);
                if ($transaction) {
                    return $this->respond(['allocation' => self::allocationRow($transaction)]);
                }
            }

            if (!$transaction) {
                $transaction = new HKTransactions();
                $transaction->generateTransactionCode();
                $transaction->setAllocationRequestKey($requestKey);
                $this->em->persist($transaction);
            }

            $transaction->linkServiceJob($job, $lineType);
            $unit = $job->getUnit();
            $city = $unit->getCity();
            $transaction
                ->setUnit($unit)
                ->setCity($city)
                ->setCostCentre(match ($city) {
                    'Playa del Carmen' => 'HK_Playa',
                    'Tulum' => 'HK_Tulum',
                    default => 'HK_General',
                })
                ->setDate($transactionDate)
                ->setCategory($category)
                ->setAllocationTarget($target)
                ->setDescription(trim($description))
                ->setNotes($notes)
                ->setPaid((string) $data['paid'])
                ->setCharged((string) $data['charged']);
            $this->em->flush();

            return $this->respond(['allocation' => self::allocationRow($transaction)]);
        });
    }

    #[Route('/{id<\d+>}/allocations/{allocationId<\d+>}', name: 'allocation_delete', methods: ['DELETE'])]
    public function deleteAllocation(int $id, int $allocationId): JsonResponse
    {
        return $this->em->wrapInTransaction(function () use ($id, $allocationId): JsonResponse {
            $job = $this->em->find(ServiceJob::class, $id, LockMode::PESSIMISTIC_WRITE);
            $transaction = $job ? $this->em->getRepository(HKTransactions::class)->findOneBy([
                'id' => $allocationId,
                'serviceJob' => $job,
            ]) : null;
            if (!$transaction) {
                return $this->respond(['error' => 'Allocation not found for this service job.'], 404);
            }

            $this->em->lock($transaction, LockMode::PESSIMISTIC_WRITE);
            $this->em->remove($transaction);

            return $this->respond([]);
        });
    }

    private static function allocationRow(HKTransactions $allocation): array
    {
        return [
            'id' => $allocation->getId(),
            'lineType' => $allocation->getAllocationLineType(),
            'attachmentCount' => $allocation->getUnitDocuments()->count(),
            'transactionCode' => $allocation->getTransactionCode(),
            'date' => $allocation->getDate()?->format('Y-m-d'),
            'categoryId' => $allocation->getCategory()?->getId(),
            'allocationTarget' => $allocation->getAllocationTarget(),
            'description' => $allocation->getDescription(),
            'notes' => $allocation->getNotes(),
            'paid' => $allocation->getPaid(),
            'charged' => $allocation->getCharged(),
        ];
    }

    private function save(Request $request, ?ServiceJob $job = null): JsonResponse
    {
        $payload = json_decode($request->getContent());
        if (!$payload instanceof \stdClass) {
            return $this->respond(['error' => 'Expected a JSON object.'], 400);
        }

        $existingCategory = $job?->getCategory();
        $data = (array) $payload + [
            'unitId' => $job?->getUnit()->getId(),
            'categoryId' => $existingCategory?->getId(),
            'providerId' => $job?->getProvider()?->getId(),
            'scheduledDate' => $job?->getScheduledDate()->format('Y-m-d'),
            'description' => $job?->getDescription(),
            'status' => $job?->getStatus() ?? ServiceJob::PENDING,
            'notes' => $job?->getNotes(),
            'bill_to' => $job?->getBillTo() ?? ServiceJob::BILL_TO_CLIENT,
        ];

        $unit = is_int($data['unitId']) ? $this->em->find(Unit::class, $data['unitId']) : null;
        if ($unit === null || ($unit->getStatus() !== 'Active' && $unit !== $job?->getUnit())) {
            return $this->respond(['error' => 'Choose an active unit.'], 400);
        }

        if ($job && $unit !== $job->getUnit() && !$job->getAllocations()->isEmpty()) {
            return $this->respond(['error' => 'The unit cannot change after allocation.'], 409);
        }

        $category = is_int($data['categoryId']) ? $this->em->find(TransactionCategory::class, $data['categoryId']) : null;
        if ($category === null || ($category !== $existingCategory && !in_array($category->getName(), self::CATEGORY_NAMES, true))) {
            return $this->respond(['error' => 'Choose a service category.'], 400);
        }

        $provider = null;
        if ($data['providerId'] !== null) {
            $provider = is_int($data['providerId']) ? $this->em->find(ServiceProvider::class, $data['providerId']) : null;
            if ($provider === null || (!$provider->isActive() && $provider !== $job?->getProvider())) {
                return $this->respond(['error' => 'Choose an active service provider or leave the provider blank.'], 400);
            }
        }

        $date = $data['scheduledDate'];
        if (!is_string($date) || !preg_match('/^[1-9]\d{3}-\d{2}-\d{2}$/D', $date)) {
            return $this->respond(['error' => 'Enter a valid scheduled date.'], 400);
        }
        $scheduledDate = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$scheduledDate || $scheduledDate->format('Y-m-d') !== $date) {
            return $this->respond(['error' => 'Enter a valid scheduled date.'], 400);
        }

        $description = is_string($data['description']) ? trim($data['description']) : '';
        if ($description === '' || mb_strlen($description) > 255) {
            return $this->respond(['error' => 'Enter a description up to 255 characters.'], 400);
        }
        if ($data['notes'] !== null && !is_string($data['notes'])) {
            return $this->respond(['error' => 'Notes must be text.'], 400);
        }
        $notes = trim($data['notes'] ?? '');
        $notes = $notes === '' ? null : $notes;

        if (!is_string($data['status']) || ($job === null && $data['status'] !== ServiceJob::PENDING)) {
            return $this->respond(['error' => 'New jobs must start as Pending.'], 400);
        }
        if (!is_string($data['bill_to']) || !in_array($data['bill_to'], [ServiceJob::BILL_TO_CLIENT, ServiceJob::BILL_TO_OWNERS2], true)) {
            return $this->respond(['error' => 'Choose Client or Owners2 for Bill To.'], 400);
        }

        $creating = $job === null;
        $job ??= new ServiceJob($unit, $category, $scheduledDate, $description, $provider, $notes);
        try {
            $job->setStatus($data['status']);
        } catch (\InvalidArgumentException $exception) {
            return $this->respond(['error' => $exception->getMessage()], 400);
        }

        $job->setBillTo($data['bill_to']);

        if ($creating) {
            $this->em->persist($job);
        } else {
            $job->schedule($unit, $category, $scheduledDate, $description, $provider, $notes);
        }
        $this->em->flush();

        return $this->respond(['job' => self::row($job)], $creating ? 201 : 200);
    }

    private static function row(ServiceJob $job): array
    {
        $unit = $job->getUnit();
        $category = $job->getCategory();
        $provider = $job->getProvider();

        return [
            'id' => $job->getId(),
            'unit' => ['id' => $unit->getId(), 'name' => $unit->getUnitName(), 'city' => $unit->getCity()],
            'allocations' => array_values($job->getAllocations()->map(self::allocationRow(...))->toArray()),
            'category' => ['id' => $category->getId(), 'name' => $category->getName()],
            'provider' => $provider ? ['id' => $provider->getId(), 'name' => $provider->getName()] : null,
            'scheduledDate' => $job->getScheduledDate()->format('Y-m-d'),
            'description' => $job->getDescription(),
            'status' => $job->getStatus(),
            'notes' => $job->getNotes(),
            'bill_to' => $job->getBillTo(),
        ];
    }

    private function respond(array $data, int $status = 200): JsonResponse
    {
        return $this->json(['ok' => $status < 400] + $data, $status, ['Cache-Control' => 'private, no-store']);
    }
}
