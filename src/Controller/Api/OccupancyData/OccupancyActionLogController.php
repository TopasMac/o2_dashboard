<?php

namespace App\Controller\Api\OccupancyData;

use App\Entity\OccupancyData\OccupancyActionLog;
use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\SecurityBundle\Security;

#[Route('/api/occupancy-actions', name: 'api_occupancy_actions_')]
class OccupancyActionLogController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Security $security,
    ) {}

    #[Route('', name: 'list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        $unitId = $request->query->getInt('unitId', 0);
        $periodParam = $request->query->get('period'); // YYYY-MM

        if ($unitId <= 0 || empty($periodParam)) {
            return $this->json(['ok' => false, 'error' => 'missing_params', 'message' => 'unitId and period (YYYY-MM) are required'], 400);
        }

        $period = $this->normalizePeriod($periodParam);
        if (!$period) {
            return $this->json(['ok' => false, 'error' => 'invalid_period', 'message' => 'period must be in YYYY-MM format'], 400);
        }

        /** @var Unit|null $unit */
        $unit = $this->em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return $this->json(['ok' => false, 'error' => 'unit_not_found'], 404);
        }

        $repo = $this->em->getRepository(OccupancyActionLog::class);
        $rows = $repo->createQueryBuilder('a')
            ->andWhere('a.unit = :unit')
            ->andWhere('a.period = :period')
            ->setParameter('unit', $unit)
            ->setParameter('period', $period)
            ->orderBy('a.pinned', 'DESC')
            ->addOrderBy('a.createdAt', 'DESC')
            ->getQuery()->getResult();

        return $this->json([
            'ok' => true,
            'data' => array_map(fn(OccupancyActionLog $a) => $this->mapAction($a), $rows),
        ]);
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '[]', true);

        $unitId      = (int)($payload['unitId'] ?? 0);
        $periodParam = $payload['period'] ?? null; // YYYY-MM
        $actionType  = (string)($payload['actionType'] ?? OccupancyActionLog::TYPE_NOTE);
        $occPercent  = $payload['occPercent'] ?? null;
        $meta        = $payload['meta'] ?? null; // array|null
        $pinned      = (bool)($payload['pinned'] ?? false);

        if ($unitId <= 0 || empty($periodParam) || $actionType === '') {
            return $this->json(['ok' => false, 'error' => 'missing_params', 'message' => 'unitId, period (YYYY-MM), and actionType are required'], 400);
        }

        $period = $this->normalizePeriod($periodParam);
        if (!$period) {
            return $this->json(['ok' => false, 'error' => 'invalid_period', 'message' => 'period must be in YYYY-MM format'], 400);
        }

        /** @var Unit|null $unit */
        $unit = $this->em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return $this->json(['ok' => false, 'error' => 'unit_not_found'], 404);
        }

        $user = $this->security->getUser();
        if (!$user) {
            return $this->json(['ok' => false, 'error' => 'unauthorized'], 401);
        }

        $row = new OccupancyActionLog();
        $row->setUnit($unit)
            ->setPeriod($period)
            ->setActionType($actionType)
            ->setPinned($pinned)
            ->setCreatedBy($user);

        if ($occPercent !== null) {
            $row->setOccPercent((int)$occPercent);
        }
        if (is_array($meta)) {
            $row->setMeta($meta);
        }

        $this->em->persist($row);
        $this->em->flush();

        return $this->json(['ok' => true, 'data' => $this->mapAction($row)], 201);
    }

    #[Route('/{id}', name: 'update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        /** @var OccupancyActionLog|null $row */
        $row = $this->em->getRepository(OccupancyActionLog::class)->find($id);
        if (!$row) {
            return $this->json(['ok' => false, 'error' => 'not_found'], 404);
        }

        $payload = json_decode($request->getContent() ?: '[]', true);
        $changed = false;

        if (array_key_exists('actionType', $payload)) {
            $row->setActionType((string)$payload['actionType']);
            $changed = true;
        }
        if (array_key_exists('occPercent', $payload)) {
            $v = $payload['occPercent'];
            $row->setOccPercent($v === null ? null : (int)$v);
            $changed = true;
        }
        if (array_key_exists('meta', $payload) && (is_array($payload['meta']) || $payload['meta'] === null)) {
            $row->setMeta($payload['meta']);
            $changed = true;
        }
        if (array_key_exists('pinned', $payload)) {
            $row->setPinned((bool)$payload['pinned']);
            $changed = true;
        }

        if ($changed) {
            if (method_exists($row, 'setUpdatedAt')) {
                $row->setUpdatedAt(new \DateTimeImmutable());
            }
            $this->em->flush();
        }

        return $this->json(['ok' => true, 'data' => $this->mapAction($row)]);
    }

    private function mapAction(OccupancyActionLog $a): array
    {
        $createdBy = null;
        if (method_exists($a, 'getCreatedBy') && $a->getCreatedBy()) {
            $u = $a->getCreatedBy();
            $createdBy = [
                'id' => method_exists($u, 'getId') ? $u->getId() : null,
                'name' => method_exists($u, 'getFullName') ? $u->getFullName() : (method_exists($u, 'getUserIdentifier') ? $u->getUserIdentifier() : null),
            ];
        }

        return [
            'id' => $a->getId(),
            'unitId' => method_exists($a->getUnit(), 'getId') ? $a->getUnit()->getId() : null,
            'period' => $a->getPeriod()?->format('Y-m-01'),
            'actionType' => $a->getActionType(),
            'occPercent' => $a->getOccPercent(),
            'meta' => $a->getMeta(),
            'pinned' => $a->isPinned(),
            'createdBy' => $createdBy,
            'createdAt' => $a->getCreatedAt()?->format(DATE_ATOM),
            'updatedAt' => method_exists($a, 'getUpdatedAt') ? $a->getUpdatedAt()?->format(DATE_ATOM) : null,
        ];
    }

    private function normalizePeriod(?string $period): ?\DateTimeImmutable
    {
        if (!$period) return null;
        // Accept YYYY-MM or YYYY-MM-01
        if (preg_match('/^\d{4}-\d{2}$/', $period)) {
            return \DateTimeImmutable::createFromFormat('Y-m-d', $period . '-01') ?: null;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $period)) {
            $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $period);
            return $dt?->setDate((int)$dt->format('Y'), (int)$dt->format('m'), 1);
        }
        return null;
    }
}