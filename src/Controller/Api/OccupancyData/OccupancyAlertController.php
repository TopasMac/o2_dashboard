<?php

namespace App\Controller\Api\OccupancyData;

use App\Entity\OccupancyData\OccupancyAlertState;
use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\SecurityBundle\Security;

#[Route('/api/occupancy-alerts', name: 'api_occupancy_alerts_')]
class OccupancyAlertController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Security $security,
    ) {}

    #[Route('/{unitId}/{period}/{alertType}/dismiss', name: 'dismiss', methods: ['POST'])]
    public function dismiss(int $unitId, string $period, string $alertType, Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '[]', true);
        $version = (int)($payload['version'] ?? 0);
        $reason  = isset($payload['reason']) ? trim((string)$payload['reason']) : null;

        return $this->applyState($unitId, $period, $alertType, OccupancyAlertState::STATUS_DISMISSED, null, $reason, $version);
    }

    #[Route('/{unitId}/{period}/{alertType}/snooze', name: 'snooze', methods: ['POST'])]
    public function snooze(int $unitId, string $period, string $alertType, Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '[]', true);
        $untilParam = $payload['until'] ?? null; // YYYY-MM-DD
        $version    = (int)($payload['version'] ?? 0);
        $reason     = isset($payload['reason']) ? trim((string)$payload['reason']) : null;

        if (!$untilParam || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $untilParam)) {
            return $this->json(['ok' => false, 'error' => 'invalid_until', 'message' => 'until must be YYYY-MM-DD'], 400);
        }
        $until = \DateTimeImmutable::createFromFormat('Y-m-d', $untilParam) ?: null;
        if (!$until) {
            return $this->json(['ok' => false, 'error' => 'invalid_until'], 400);
        }

        return $this->applyState($unitId, $period, $alertType, OccupancyAlertState::STATUS_SNOOZED, $until, $reason, $version);
    }

    #[Route('/{unitId}/{period}/{alertType}/activate', name: 'activate', methods: ['POST'])]
    public function activate(int $unitId, string $period, string $alertType, Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '[]', true);
        $version = (int)($payload['version'] ?? 0);

        return $this->applyState($unitId, $period, $alertType, OccupancyAlertState::STATUS_ACTIVE, null, null, $version, true);
    }

    private function applyState(
        int $unitId,
        string $periodParam,
        string $alertType,
        string $status,
        ?\DateTimeImmutable $snoozeUntil = null,
        ?string $reason = null,
        int $version = 0,
        bool $clear = false
    ): JsonResponse {
        $period = $this->normalizePeriod($periodParam);
        if (!$period) {
            return $this->json(['ok' => false, 'error' => 'invalid_period', 'message' => 'period must be YYYY-MM or YYYY-MM-01'], 400);
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

        // If no version provided, use latest existing version for this tuple, else default 1
        $repo = $this->em->getRepository(OccupancyAlertState::class);
        $qb = $repo->createQueryBuilder('s')
            ->andWhere('s.unit = :unit')
            ->andWhere('s.period = :period')
            ->andWhere('s.alertType = :type')
            ->setParameter('unit', $unit)
            ->setParameter('period', $period)
            ->setParameter('type', $alertType)
            ->orderBy('s.version', 'DESC')
            ->setMaxResults(1);

        /** @var OccupancyAlertState|null $latest */
        $latest = $qb->getQuery()->getOneOrNullResult();
        if ($version <= 0) {
            $version = $latest?->getVersion() ?? 1;
        }

        // Try find current version row
        $state = $repo->findOneBy([
            'unit' => $unit,
            'period' => $period,
            'alertType' => $alertType,
            'version' => $version,
        ]);

        if (!$state) {
            $state = new OccupancyAlertState();
            $state->setUnit($unit)
                ->setPeriod($period)
                ->setAlertType($alertType)
                ->setVersion($version)
                ->setCreatedBy($user);
            $this->em->persist($state);
        }

        if ($clear) {
            $state->setStatus(OccupancyAlertState::STATUS_ACTIVE)
                ->setSnoozeUntil(null)
                ->setReason(null);
        } else {
            $state->setStatus($status)
                ->setSnoozeUntil($snoozeUntil)
                ->setReason($reason);
        }

        if (method_exists($state, 'setUpdatedAt')) {
            $state->setUpdatedAt(new \DateTimeImmutable());
        }

        $this->em->flush();

        return $this->json(['ok' => true, 'data' => $this->mapState($state)]);
    }

    private function mapState(OccupancyAlertState $s): array
    {
        $createdBy = null;
        if (method_exists($s, 'getCreatedBy') && $s->getCreatedBy()) {
            $u = $s->getCreatedBy();
            $createdBy = [
                'id' => method_exists($u, 'getId') ? $u->getId() : null,
                'name' => method_exists($u, 'getFullName') ? $u->getFullName() : (method_exists($u, 'getUserIdentifier') ? $u->getUserIdentifier() : null),
            ];
        }

        return [
            'id' => $s->getId(),
            'unitId' => method_exists($s->getUnit(), 'getId') ? $s->getUnit()->getId() : null,
            'period' => $s->getPeriod()?->format('Y-m-01'),
            'alertType' => $s->getAlertType(),
            'status' => $s->getStatus(),
            'snoozeUntil' => $s->getSnoozeUntil()?->format('Y-m-d'),
            'reason' => $s->getReason(),
            'version' => $s->getVersion(),
            'createdBy' => $createdBy,
            'createdAt' => $s->getCreatedAt()?->format(DATE_ATOM),
            'updatedAt' => method_exists($s, 'getUpdatedAt') ? $s->getUpdatedAt()?->format(DATE_ATOM) : null,
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