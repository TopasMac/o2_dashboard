<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\ServiceJob;
use App\Entity\ServiceProvider;
use App\Entity\TransactionCategory;
use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/service-jobs', name: 'api_service_jobs_')]
final class ServiceJobsController extends AbstractController
{
    private const CATEGORY_NAMES = ['Mantenimiento', 'Equipamiento', 'Servicios Externos'];

    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    #[Route('', name: 'list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        $jobs = $this->em->createQueryBuilder()
            ->select('job', 'unit', 'category', 'provider')
            ->from(ServiceJob::class, 'job')
            ->join('job.unit', 'unit')
            ->join('job.category', 'category')
            ->leftJoin('job.provider', 'provider')
            ->orderBy('job.scheduledDate', 'ASC')
            ->addOrderBy('job.id', 'ASC')
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

        return $this->respond(['units' => $units, 'categories' => $categories]);
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        return $this->save($request);
    }

    #[Route('/{id<\d+>}', name: 'update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $job = $this->em->find(ServiceJob::class, $id);
        if ($job === null) {
            return $this->respond(['error' => 'Service job not found.'], 404);
        }

        return $this->save($request, $job);
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
            'unit' => ['id' => $unit->getId(), 'name' => $unit->getUnitName()],
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
