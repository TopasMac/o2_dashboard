<?php

namespace App\Controller\Api\OccupancyData;

use App\Entity\OccupancyData\OccupancyNote;
use App\Entity\OccupancyData\OccupancyActionLog;
use App\Entity\OccupancyData\OccupancyAlertState;
use App\Entity\Unit;
use App\Service\OccupancyData\OccupancyCalculator;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/occupancy-watch', name: 'api_occupancy_watch_')]
class OccupancyWatchController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly OccupancyCalculator $calculator,
    ) {}

    /**
     * Minimal aggregation endpoint for the Occupancy Watch widget.
     * Params:
     *  - period: YYYY-MM (defaults to current month)
     *  - low: int low threshold (optional)
     *  - high: int high threshold (optional)
     *  - city: optional string city code to filter units (PDC/TUL/etc.) — TODO if you store city on Unit
     */
    #[Route('', name: 'list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        $periodParam = $request->query->get('period') ?? (new \DateTimeImmutable('first day of this month'))->format('Y-m');
        $period = $this->normalizePeriod($periodParam);
        if (!$period) {
            return $this->json(['ok' => false, 'error' => 'invalid_period', 'message' => 'period must be YYYY-MM'], 400);
        }

        $lowParam = $request->query->get('low');
        $highParam = $request->query->get('high');

        // Compute smart defaults if not provided
        if ($lowParam === null || $highParam === null) {
            [$lowDefault, $highDefault] = $this->computeThresholds($period, new \DateTimeImmutable('now'));
            $low = (int)($lowParam ?? $lowDefault);
            $high = (int)($highParam ?? $highDefault);
        } else {
            $low = (int)$lowParam;
            $high = (int)$highParam;
        }
        $filter = $request->query->get('filter'); // 'crossing' to return only rows below/above thresholds
        $city = trim((string)($request->query->get('city') ?? '')) ?: null;

        // TODO: optionally filter by city when Unit has city stored
        $unitRepo = $this->em->getRepository(Unit::class);
        $qb = $unitRepo->createQueryBuilder('u')
            ->andWhere('u.status = :status')
            ->setParameter('status', 'ACTIVE')
            ->orderBy('u.id', 'ASC');

        // Optional: filter by city when provided and Unit has a `city` field
        if ($city) {
            // If your Unit entity does not have a `city` field, remove this where-clause.
            $qb->andWhere('u.city = :city')
               ->setParameter('city', $city);
        }
        // If your Unit has isActive flag, uncomment the next line
        // $qb->andWhere('u.isActive = 1');
        $units = $qb->getQuery()->getResult();

        $noteRepo = $this->em->getRepository(OccupancyNote::class);
        $actionRepo = $this->em->getRepository(OccupancyActionLog::class);
        $stateRepo = $this->em->getRepository(OccupancyAlertState::class);

        // Forward city to calculator/provider if they expose a setter
        if ($city && method_exists($this->calculator, 'setCity')) {
            $this->calculator->setCity($city);
        } elseif ($city && method_exists($this->calculator, 'getProvider')) {
            $prov = $this->calculator->getProvider();
            if ($prov && method_exists($prov, 'setCity')) {
                $prov->setCity($city);
            }
        }

        $rows = [];
        $statusFilter = strtolower((string)($request->query->get('status') ?? ''));
        foreach ($units as $unit) {
            // Latest note + count
            $notes = $noteRepo->createQueryBuilder('n')
                ->andWhere('n.unit = :unit')
                ->andWhere('n.period = :period')
                ->setParameter('unit', $unit)
                ->setParameter('period', $period)
                ->orderBy('n.pinned', 'DESC')
                ->addOrderBy('n.createdAt', 'DESC')
                ->setMaxResults(1)
                ->getQuery()->getResult();
            $notesCount = (int)$noteRepo->createQueryBuilder('n2')
                ->select('COUNT(n2.id)')
                ->andWhere('n2.unit = :unit')
                ->andWhere('n2.period = :period')
                ->setParameter('unit', $unit)
                ->setParameter('period', $period)
                ->getQuery()->getSingleScalarResult();
            $lastNote = null;
            if ($notes) {
                /** @var OccupancyNote $n */
                $n = $notes[0];
                $lastNote = [
                    'id' => $n->getId(),
                    'note' => method_exists($n, 'getNote') ? $n->getNote() : null,
                    'pinned' => $n->isPinned(),
                    'createdAt' => $n->getCreatedAt()?->format(DATE_ATOM),
                    'updatedAt' => method_exists($n, 'getUpdatedAt') ? $n->getUpdatedAt()?->format(DATE_ATOM) : null,
                ];
            }

            // Latest action + count
            $actions = $actionRepo->createQueryBuilder('a')
                ->andWhere('a.unit = :unit')
                ->andWhere('a.period = :period')
                ->setParameter('unit', $unit)
                ->setParameter('period', $period)
                ->orderBy('a.pinned', 'DESC')
                ->addOrderBy('a.createdAt', 'DESC')
                ->setMaxResults(1)
                ->getQuery()->getResult();
            $actionsCount = (int)$actionRepo->createQueryBuilder('a2')
                ->select('COUNT(a2.id)')
                ->andWhere('a2.unit = :unit')
                ->andWhere('a2.period = :period')
                ->setParameter('unit', $unit)
                ->setParameter('period', $period)
                ->getQuery()->getSingleScalarResult();
            $lastActionType = null; $lastActionAt = null;
            if ($actions) {
                /** @var OccupancyActionLog $a */
                $a = $actions[0];
                $lastActionType = $a->getActionType();
                $lastActionAt = $a->getCreatedAt()?->format(DATE_ATOM);
            }

            // Suppression state (latest version for this unit+period)
            /** @var OccupancyAlertState|null $sup */
            $sup = $stateRepo->createQueryBuilder('s')
                ->andWhere('s.unit = :unit')
                ->andWhere('s.period = :period')
                ->orderBy('s.version', 'DESC')
                ->setParameter('unit', $unit)
                ->setParameter('period', $period)
                ->setMaxResults(1)
                ->getQuery()->getOneOrNullResult();

            $suppression = null;
            if ($sup) {
                $suppression = [
                    'alertType' => $sup->getAlertType(),
                    'status' => $sup->getStatus(),
                    'snoozeUntil' => $sup->getSnoozeUntil()?->format('Y-m-d'),
                    'reason' => $sup->getReason(),
                    'version' => $sup->getVersion(),
                ];
            }

            // Compute occupancy via service
            $occ = $this->calculator->forMonth($unit, $period);
            $occupancyPercent = $occ['occupancyPercent'];
            $bookedDays = $occ['bookedDays'];
            $totalDays = $occ['totalDays'];
            $status = $this->calculator->classify($occupancyPercent, $low, $high);

            // Normalize status labels
            if ($status === 'ok') {
                $status = 'On Track';
            } elseif ($status === 'low') {
                $status = 'Low';
            } elseif ($status === 'high') {
                $status = 'High';
            }

            // Optional filter: only show items crossing thresholds
            if ($filter === 'crossing' && $status === 'On Track') {
                continue;
            }

            // Optional status query param filter
            if ($statusFilter && strtolower($status) !== $statusFilter && $statusFilter !== 'all') {
                continue;
            }

            $rows[] = [
                'unitId' => method_exists($unit, 'getId') ? $unit->getId() : null,
                'unitName' => method_exists($unit, 'getUnitName') ? $unit->getUnitName() : (method_exists($unit, 'getName') ? $unit->getName() : null),
                'city' => method_exists($unit, 'getCity') ? $unit->getCity() : null,
                'period' => $period->format('Y-m-01'),
                'occupancyPercent' => $occupancyPercent,
                'bookedDays' => $bookedDays,
                'totalDays' => $totalDays,
                'lowThreshold' => $low,
                'highThreshold' => $high,
                'status' => $status,
                'lastNote' => $lastNote,
                'notesCount' => $notesCount,
                'lastActionType' => $lastActionType,
                'lastActionAt' => $lastActionAt,
                'suppression' => $suppression,
            ];
        }

        // ---- Enrich with note fields in one batch (noteId, note, updatedAt) ----
        if (!empty($rows)) {
            // Determine YYYY-MM from the first row's period
            $ym = null;
            foreach ($rows as $r) {
                if (!empty($r['period'])) {
                    try {
                        $ym = (new \DateTimeImmutable($r['period']))->format('Y-m');
                        break;
                    } catch (\Throwable) {}
                }
            }
            if ($ym !== null) {
                $periodObj = new \DateTimeImmutable($ym . '-01 00:00:00');

                // Collect distinct unit IDs
                $unitIds = [];
                foreach ($rows as $r) {
                    if (!empty($r['unitId'])) {
                        $unitIds[(int)$r['unitId']] = true;
                    }
                }
                $unitIds = array_keys($unitIds);

                if (!empty($unitIds)) {
                    $noteRepo = $this->em->getRepository(OccupancyNote::class);
                    $notes = $noteRepo->createQueryBuilder('n')
                        ->andWhere('IDENTITY(n.unit) IN (:ids)')
                        ->andWhere('n.period = :period')
                        ->orderBy('n.pinned', 'DESC')
                        ->addOrderBy('n.createdAt', 'DESC')
                        ->setParameter('ids', $unitIds, Connection::PARAM_INT_ARRAY)
                        ->setParameter('period', $periodObj)
                        ->getQuery()
                        ->getResult();

                    // Only keep first note per unit (pinned first, then most recent)
                    $byUnit = [];
                    foreach ($notes as $n) {
                        /** @var OccupancyNote $n */
                        $uid = $n->getUnit()?->getId();
                        if ($uid !== null && !isset($byUnit[$uid])) {
                            $byUnit[$uid] = $n;
                        }
                    }

                    // Merge into $rows
                    foreach ($rows as $i => $r) {
                        $uid = (int)($r['unitId'] ?? 0);
                        if ($uid > 0 && isset($byUnit[$uid])) {
                            $n = $byUnit[$uid];
                            $rows[$i]['noteId']    = $n->getId();
                            $rows[$i]['note']      = method_exists($n, 'getNote') ? $n->getNote() : null;
                            $rows[$i]['updatedAt'] = method_exists($n, 'getUpdatedAt') && $n->getUpdatedAt() instanceof \DateTimeInterface ? $n->getUpdatedAt()->format(DATE_ATOM) : null;
                            // keep a boolean too for convenience
                            $rows[$i]['hasNote']   = true;

                            // also ensure notesCount >= 1 when we found a note
                            if (!isset($rows[$i]['notesCount']) || (int)$rows[$i]['notesCount'] < 1) {
                                $rows[$i]['notesCount'] = 1;
                            }
                        } else {
                            $rows[$i]['noteId']    = $rows[$i]['noteId']    ?? null;
                            $rows[$i]['note']      = $rows[$i]['note']      ?? null;
                            $rows[$i]['updatedAt'] = $rows[$i]['updatedAt'] ?? null;
                            $rows[$i]['hasNote']   = $rows[$i]['hasNote']   ?? false;
                        }
                    }
                }
            }
        }
        // ---- end enrichment ----
        return $this->json(['ok' => true, 'data' => $rows]);
    }

    /**
     * Get a single note for unit+period (under Occupancy Watch namespace).
     * GET /api/occupancy-watch/note?unitId=123&period=YYYY-MM
     */
    #[Route('/note', name: 'note_get', methods: ['GET'])]
    public function getNote(Request $request): JsonResponse
    {
        $unitId = (int)($request->query->get('unitId') ?? 0);
        $periodParam = $request->query->get('period');

        if ($unitId <= 0 || !$periodParam) {
            return $this->json(['ok' => false, 'error' => 'missing_params', 'message' => 'unitId and period (YYYY-MM) are required'], 400);
        }

        $period = $this->normalizePeriod($periodParam);
        if (!$period) {
            return $this->json(['ok' => false, 'error' => 'invalid_period', 'message' => 'period must be YYYY-MM'], 400);
        }

        $unit = $this->em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return $this->json(['ok' => false, 'error' => 'not_found', 'message' => 'Unit not found'], 404);
        }

        $repo = $this->em->getRepository(OccupancyNote::class);
        $note = $repo->createQueryBuilder('n')
            ->andWhere('IDENTITY(n.unit) = :uid')
            ->andWhere('n.period = :period')
            ->orderBy('n.pinned', 'DESC')
            ->addOrderBy('n.createdAt', 'DESC')
            ->setParameter('uid', $unitId)
            ->setParameter('period', $period, Types::DATE_IMMUTABLE)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();

        $data = [
            'noteId'     => $note?->getId(),
            'unitId'     => $unitId,
            'period'     => $period->format('Y-m-01'),
            'note'       => ($note && method_exists($note, 'getNote')) ? $note->getNote() : null,
            'pinned'     => $note?->isPinned() ?? false,
            'createdById'=> ($note && method_exists($note, 'getCreatedById')) ? ($note->getCreatedById() ?? 1) : 1,
            'createdAt'  => $note?->getCreatedAt()?->format(DATE_ATOM),
            'updatedAt'  => ($note && method_exists($note, 'getUpdatedAt')) ? $note->getUpdatedAt()?->format(DATE_ATOM) : null,
        ];

        return $this->json(['ok' => true, 'data' => $data]);
    }

    /**
     * Upsert a note for unit+period (under Occupancy Watch namespace).
     * POST /api/occupancy-watch/note
     * Body JSON: { unitId, period:"YYYY-MM", note, pinned }
     * - On creation, sets createdAt = now and updatedAt = createdAt
     * - Sets createdById = 1 (default) if supported by the entity
     */
    #[Route('/note', name: 'note_upsert', methods: ['POST'])]
    public function upsertNote(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '[]', true) ?: [];

        $unitId = isset($payload['unitId']) ? (int)$payload['unitId'] : 0;
        $periodParam = $payload['period'] ?? null;
        $text = (string)($payload['note'] ?? '');
        $pinned = (bool)($payload['pinned'] ?? false);

        if ($unitId <= 0 || !$periodParam) {
            return $this->json(['ok' => false, 'error' => 'missing_params', 'message' => 'unitId and period are required'], 400);
        }

        $period = $this->normalizePeriod($periodParam);
        if (!$period) {
            return $this->json(['ok' => false, 'error' => 'invalid_period', 'message' => 'period must be YYYY-MM'], 400);
        }

        $unit = $this->em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return $this->json(['ok' => false, 'error' => 'not_found', 'message' => 'Unit not found'], 404);
        }

        $repo = $this->em->getRepository(OccupancyNote::class);
        $existing = $repo->createQueryBuilder('n')
            ->andWhere('n.unit = :unit')
            ->andWhere('n.period = :period')
            ->setParameter('unit', $unit)
            ->setParameter('period', $period, Types::DATE_IMMUTABLE)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();

        if ($existing instanceof OccupancyNote) {
            if (method_exists($existing, 'setNote')) {
                $existing->setNote($text);
            }
            if (method_exists($existing, 'setPinned')) {
                $existing->setPinned($pinned);
            }
            if (method_exists($existing, 'setUpdatedAt')) {
                $existing->setUpdatedAt(new \DateTimeImmutable());
            }
            $this->em->flush();

            $res = [
                'noteId'     => $existing->getId(),
                'unitId'     => $unitId,
                'period'     => $period->format('Y-m-01'),
                'note'       => method_exists($existing, 'getNote') ? $existing->getNote() : null,
                'pinned'     => $existing->isPinned(),
                'createdById'=> method_exists($existing, 'getCreatedById') ? ($existing->getCreatedById() ?? 1) : 1,
                'createdAt'  => $existing->getCreatedAt()?->format(DATE_ATOM),
                'updatedAt'  => method_exists($existing, 'getUpdatedAt') ? $existing->getUpdatedAt()?->format(DATE_ATOM) : null,
            ];
            return $this->json(['ok' => true, 'data' => $res]);
        }

        // Create new
        $note = new OccupancyNote();
        $note->setUnit($unit);
        if (method_exists($note, 'setPeriod')) {
            $note->setPeriod($period);
        }
        if (method_exists($note, 'setNote')) {
            $note->setNote($text);
        }
        if (method_exists($note, 'setPinned')) {
            $note->setPinned($pinned);
        }

        // createdById default to 1 where possible
        if (method_exists($note, 'setCreatedById')) {
            $note->setCreatedById(1);
        } elseif (method_exists($note, 'setCreatedBy')) {
            // Attempt to set a User#1 if your model uses a relation
            try {
                $userRepo = $this->em->getRepository(\App\Entity\User::class);
                if ($userRepo) {
                    $u = $userRepo->find(1);
                    if ($u) {
                        $note->setCreatedBy($u);
                    }
                }
            } catch (\Throwable $e) {
                // ignore if User class/repo doesn't exist
            }
        }

        // timestamps on creation
        $now = new \DateTimeImmutable();
        if (method_exists($note, 'setCreatedAt') && null === $note->getCreatedAt()) {
            $note->setCreatedAt($now);
        }
        if (method_exists($note, 'setUpdatedAt')) {
            // updatedAt = createdAt on creation
            $created = method_exists($note, 'getCreatedAt') ? $note->getCreatedAt() : null;
            $note->setUpdatedAt($created instanceof \DateTimeInterface ? \DateTimeImmutable::createFromFormat('U', (string)$created->getTimestamp()) : $now);
        }

        $this->em->persist($note);
        $this->em->flush();

        $res = [
            'noteId'     => $note->getId(),
            'unitId'     => $unitId,
            'period'     => $period->format('Y-m-01'),
            'note'       => method_exists($note, 'getNote') ? $note->getNote() : null,
            'pinned'     => $note->isPinned(),
            'createdById'=> method_exists($note, 'getCreatedById') ? ($note->getCreatedById() ?? 1) : 1,
            'createdAt'  => $note->getCreatedAt()?->format(DATE_ATOM),
            'updatedAt'  => method_exists($note, 'getUpdatedAt') ? $note->getUpdatedAt()?->format(DATE_ATOM) : null,
        ];
        return $this->json(['ok' => true, 'data' => $res]);
    }

    /**
     * DELETE note by id (under Occupancy Watch namespace)
     */
    #[Route('/note/{id}', name: 'note_delete', requirements: ['id' => '\d+'], methods: ['DELETE'])]
    public function deleteNote(int $id): JsonResponse
    {
        $note = $this->em->getRepository(OccupancyNote::class)->find($id);
        if (!$note) {
            return $this->json(['ok' => false, 'error' => 'not_found'], 404);
        }
        $this->em->remove($note);
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    private function normalizePeriod(?string $period): ?\DateTimeImmutable
    {
        if (!$period) return null;
        if (preg_match('/^\d{4}-\d{2}$/', $period)) {
            return \DateTimeImmutable::createFromFormat('Y-m-d', $period . '-01') ?: null;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $period)) {
            $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $period);
            return $dt?->setDate((int)$dt->format('Y'), (int)$dt->format('m'), 1);
        }
        return null;
    }

    /**
     * Compute default thresholds based on: two phases (before/after 15th for current month)
     * and seasonality (Dec–Apr high, Jun–Aug mid, Sep–Nov low). For the current month,
     * the "high" threshold only applies on days 1–14; after that it's effectively disabled.
     *
     * Returns [low, high].
     */
    private function computeThresholds(\DateTimeImmutable $period, \DateTimeImmutable $today): array
    {
        $isCurrent = $period->format('Y-m') === $today->format('Y-m');
        $day = (int)$today->format('j');
        $month = (int)$period->format('n');

        // Seasonality adjustment applied to LOW only
        $seasonAdj = $this->seasonLowAdjust($month); // e.g. +5 high season, -5 low season

        if ($isCurrent) {
            if ($day <= 14) {
                $baseLow = 40; $baseHigh = 90; // early month
            } else {
                $baseLow = 60; $baseHigh = 100; // late month; disable HIGH logic by setting to 100
            }
        } else {
            // Future months (including next): set lower thresholds for earlier booking window
            $baseLow = 20; $baseHigh = 60;
        }

        $low = max(0, min(99, $baseLow + $seasonAdj));
        $high = max(0, min(100, $baseHigh));

        return [$low, $high];
    }

    /**
     * Seasonality buckets (by stay month):
     *  - Dec–Apr: high season → +5 to LOW
     *  - Jun–Aug: mid season → +0
     *  - Sep–Nov: low season → -5
     *  - May: neutral → +0
     */
    private function seasonLowAdjust(int $month): int
    {
        // PHP months: 1=Jan ... 12=Dec
        if (in_array($month, [12, 1, 2, 3, 4], true)) {
            return 5;   // High season: be stricter
        }
        if (in_array($month, [6, 7, 8], true)) {
            return 0;   // Mid season
        }
        if (in_array($month, [9, 10, 11], true)) {
            return -5;  // Low season: be looser
        }
        // May and any unspecified → neutral
        return 0;
    }
}