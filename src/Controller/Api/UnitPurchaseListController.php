<?php

namespace App\Controller\Api;

use App\Entity\UnitPurchaseList;
use App\Entity\UnitPurchaseListLine;
use App\Entity\Unit;
use App\Repository\UnitPurchaseListLineRepository;
use App\Repository\UnitPurchaseListRepository;
use App\Service\UnitPurchaseListGenerator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api', name: 'api_purchase_lists_')]
class UnitPurchaseListController extends AbstractController
{
    private UnitPurchaseListGenerator $generator;
    private UnitPurchaseListRepository $listRepo;
    private UnitPurchaseListLineRepository $lineRepo;
    private EntityManagerInterface $em;

    public function __construct(
        UnitPurchaseListGenerator $generator,
        UnitPurchaseListRepository $listRepo,
        UnitPurchaseListLineRepository $lineRepo,
        EntityManagerInterface $em
    ) {
        $this->generator = $generator;
        $this->listRepo = $listRepo;
        $this->lineRepo = $lineRepo;
        $this->em = $em;
    }

    /**
     * Generate (or regenerate) a DRAFT “to-buy” list for a unit.
     *
     * POST /api/units/{id}/purchase-list/generate
     * Body (optional JSON):
     *  - includeExtras: bool (default true)
     *  - onlyAlwaysNeeded: bool (default false)
     *  - resetLines: bool (default true)
     */
    #[Route('/units/{id}/purchase-list/generate', name: 'generate_for_unit', methods: ['POST'])]
    public function generateForUnit(Request $request, int $id): JsonResponse
    {
        $payload = [];
        $raw = (string) $request->getContent();
        if (trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        $options = [
            'includeExtras' => array_key_exists('includeExtras', $payload) ? (bool) $payload['includeExtras'] : true,
            'onlyAlwaysNeeded' => array_key_exists('onlyAlwaysNeeded', $payload) ? (bool) $payload['onlyAlwaysNeeded'] : false,
            'resetLines' => array_key_exists('resetLines', $payload) ? (bool) $payload['resetLines'] : true,
        ];

        try {
            $list = $this->generator->generateDraftForUnit($id, $options);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], 404);
        } catch (\Throwable $e) {
            @error_log('[UnitPurchaseListController.generateForUnit] ' . get_class($e) . ': ' . $e->getMessage());
            @error_log('[UnitPurchaseListController.generateForUnit] trace: ' . $e->getTraceAsString());
            // Return message for debugging on dev (safe enough here; we can later hide behind APP_ENV)
            return $this->json([
                'error' => 'Failed to generate purchase list',
                'details' => $e->getMessage(),
                'exception' => get_class($e),
            ], 500);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * Ensure a DRAFT purchase list exists for a unit and return it (with lines).
     *
     * POST /api/units/{id}/purchase-list/draft/ensure
     *
     * If a latest DRAFT exists, returns it.
     * Otherwise creates a new empty DRAFT list (no lines) and returns it.
     */
    #[Route('/units/{id}/purchase-list/draft/ensure', name: 'ensure_draft_for_unit', methods: ['POST'])]
    public function ensureDraftForUnit(int $id): JsonResponse
    {
        // Find latest draft for unit
        $qb = $this->listRepo->createQueryBuilder('l')
            ->innerJoin('l.unit', 'u')
            ->andWhere('u.id = :uid')
            ->andWhere('l.status = :st')
            ->setParameter('uid', $id)
            ->setParameter('st', 'DRAFT')
            ->orderBy('l.id', 'DESC')
            ->setMaxResults(1);

        /** @var UnitPurchaseList|null $existing */
        $existing = $qb->getQuery()->getOneOrNullResult();
        if ($existing) {
            return $this->json($this->serializeListWithLines($existing));
        }

        /** @var Unit|null $unit */
        $unit = $this->em->find(Unit::class, $id);
        if (!$unit) {
            return $this->json(['error' => 'Unit not found'], 404);
        }

        try {
            $list = new UnitPurchaseList();

            if (method_exists($list, 'setUnit')) {
                $list->setUnit($unit);
            }

            if (method_exists($list, 'setStatus')) {
                $list->setStatus('DRAFT');
            }

            if (method_exists($list, 'setCreatedAt')) {
                $list->setCreatedAt(new \DateTimeImmutable());
            }

            $this->em->persist($list);
            $this->em->flush();
        } catch (\Throwable $e) {
            @error_log('[UnitPurchaseListController.ensureDraftForUnit] ' . get_class($e) . ': ' . $e->getMessage());
            return $this->json([
                'error' => 'Failed to ensure draft list',
                'details' => $e->getMessage(),
            ], 500);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * List units that have at least one purchase list, optionally filtered by list status.
     *
     * GET /api/unit-purchase-lists/units?status=DRAFT
     * GET /api/unit-purchase-lists/units?status=DRAFT,ACTIVE
     * If status is omitted or "ALL", returns units that have any purchase list.
     */
    #[Route('/unit-purchase-lists/units', name: 'units_with_lists', methods: ['GET'])]
    public function unitsWithLists(Request $request): JsonResponse
    {
        $statusRaw = strtoupper(trim((string) $request->query->get('status', $request->query->get('listStatus', ''))));

        // Normalize statuses: allow comma-separated list. Empty/ALL means no filter.
        $statuses = [];
        if ($statusRaw !== '' && $statusRaw !== 'ALL') {
            foreach (preg_split('/\s*,\s*/', $statusRaw) as $s) {
                $s = strtoupper(trim((string) $s));
                if ($s !== '') {
                    $statuses[] = $s;
                }
            }
            $statuses = array_values(array_unique($statuses));
        }

        // Query: distinct units that appear in UnitPurchaseList, optionally filtered by status.
        // We use the repository QB so we don't hardcode table names.
        $qb = $this->listRepo->createQueryBuilder('l')
            ->select('DISTINCT u.id AS id, u.unitName AS unit_name')
            ->innerJoin('l.unit', 'u')
            ->orderBy('u.unitName', 'ASC');

        if (!empty($statuses)) {
            if (count($statuses) === 1) {
                $qb->andWhere('UPPER(l.status) = :st')->setParameter('st', $statuses[0]);
            } else {
                // DQL doesn't support UPPER(field) IN (:arr) cleanly on all platforms,
                // so we compare exact values assuming statuses are stored consistently.
                $qb->andWhere('l.status IN (:sts)')->setParameter('sts', $statuses);
            }
        }

        $rows = $qb->getQuery()->getArrayResult();

        // Ensure stable shape
        $items = [];
        foreach ($rows as $r) {
            $items[] = [
                'id' => isset($r['id']) ? (int) $r['id'] : null,
                'name' => (string) ($r['unit_name'] ?? ''),
            ];
        }

        return $this->json(['ok' => true, 'items' => $items]);
    }

    /**
     * List units that can be used to create a NEW purchase list (from Unit table).
     *
     * GET /api/units/purchase-list-candidates
     * Optional query params:
     *  - status=ACTIVE,ONBOARDING  (default: ACTIVE,ONBOARDING)
     *
     * Returns: id, unit_name, status, type, pax, baths, beds
     */
    #[Route('/unit-purchase-lists/candidates', name: 'unit_purchase_list_candidates_alt', methods: ['GET'])]
    public function unitPurchaseListCandidates(Request $request): JsonResponse
    {
        @error_log('[UnitPurchaseListController.unitPurchaseListCandidates] HIT');

        // TEMP DEBUG: confirm this controller is being hit in the environment serving dev.dashboard.owners2.com
        if ((string) $request->query->get('debug', '') === '1') {
            return $this->json([
                'ok' => true,
                'debug' => 'unitPurchaseListCandidates HIT',
                'ts' => (new \DateTimeImmutable())->format('Y-m-d H:i:s'),
            ]);
        }

        try {
            $statusRaw = strtoupper(trim((string) $request->query->get('status', 'ACTIVE,ONBOARDING')));

            $allowed = [];
            foreach (preg_split('/\s*,\s*/', $statusRaw) as $s) {
                $s = strtoupper(trim((string) $s));
                if ($s !== '') {
                    $allowed[] = $s;
                }
            }
            $allowed = array_values(array_unique($allowed));
            if (empty($allowed)) {
                $allowed = ['ACTIVE', 'ONBOARDING'];
            }

            // Load units (we filter in PHP defensively because Unit field names vary across installs)
            $repo = $this->em->getRepository(Unit::class);

            // Try common ordering key; fallback to unsorted list if it fails.
            try {
                $units = $repo->findBy([], ['unitName' => 'ASC']);
            } catch (\Throwable) {
                $units = $repo->findAll();
            }

            $items = [];
            foreach ($units as $u) {
                if (!$u instanceof Unit) {
                    continue;
                }

                // --- status (unit lifecycle status, NOT purchase list status) ---
                $unitStatus = null;
                if (method_exists($u, 'getStatus')) {
                    $unitStatus = $u->getStatus();
                } elseif (method_exists($u, 'getUnitStatus')) {
                    $unitStatus = $u->getUnitStatus();
                } elseif (method_exists($u, 'getLifecycleStatus')) {
                    $unitStatus = $u->getLifecycleStatus();
                }
                $unitStatusStr = strtoupper(trim((string) ($unitStatus ?? '')));

                // If we can’t read status reliably, include the unit (safer than hiding it).
                if ($unitStatusStr !== '' && !in_array($unitStatusStr, $allowed, true)) {
                    continue;
                }

                // --- name ---
                $name = null;
                if (method_exists($u, 'getUnitName')) {
                    $name = $u->getUnitName();
                } elseif (method_exists($u, 'getUnitNameLabel')) {
                    $name = $u->getUnitNameLabel();
                } elseif (method_exists($u, 'getName')) {
                    $name = $u->getName();
                } elseif (method_exists($u, 'getUnitNameRaw')) {
                    $name = $u->getUnitNameRaw();
                } elseif (method_exists($u, 'getUnitNameOrFallback')) {
                    $name = $u->getUnitNameOrFallback();
                } elseif (property_exists($u, 'unitName')) {
                    $name = $u->unitName;
                }
                if ($name === null && method_exists($u, 'getUnitName')) {
                    $name = $u->getUnitName();
                }

                // --- type ---
                $type = null;
                if (method_exists($u, 'getType')) {
                    $type = $u->getType();
                } elseif (method_exists($u, 'getUnitType')) {
                    $type = $u->getUnitType();
                } elseif (method_exists($u, 'getPropertyType')) {
                    $type = $u->getPropertyType();
                }

                // --- pax ---
                $pax = null;
                if (method_exists($u, 'getPax')) {
                    $pax = $u->getPax();
                } elseif (method_exists($u, 'getMaxGuests')) {
                    $pax = $u->getMaxGuests();
                } elseif (method_exists($u, 'getMaxPax')) {
                    $pax = $u->getMaxPax();
                }

                // --- baths ---
                $baths = null;
                if (method_exists($u, 'getBaths')) {
                    $baths = $u->getBaths();
                } elseif (method_exists($u, 'getBathrooms')) {
                    $baths = $u->getBathrooms();
                } elseif (method_exists($u, 'getBathCount')) {
                    $baths = $u->getBathCount();
                }

                // --- beds (PRIMARY: bed_config objects [{type, count}], FALLBACK: beds field) ---
                $beds = null;

                // 1) Prefer bed_config when available
                if (method_exists($u, 'getBedConfig')) {
                    $cfg = $u->getBedConfig();

                    if (is_array($cfg)) {
                        $sum = 0;

                        foreach ($cfg as $row) {
                            if (is_array($row) && isset($row['count']) && is_numeric($row['count'])) {
                                $sum += (int) $row['count'];
                            } elseif (is_object($row) && isset($row->count) && is_numeric($row->count)) {
                                $sum += (int) $row->count;
                            }
                        }

                        if ($sum > 0) {
                            $beds = $sum;
                        }
                    }
                }

                // 2) Fallback to simple beds field if bed_config missing/empty
                if ($beds === null) {
                    if (method_exists($u, 'getBeds')) {
                        $beds = $u->getBeds();
                    } elseif (method_exists($u, 'getBedCount')) {
                        $beds = $u->getBedCount();
                    }
                }

                $items[] = [
                    'id' => (int) $u->getId(),
                    'unit_name' => (string) ($name ?? ('Unit #' . (int) $u->getId())),
                    'status' => $unitStatusStr !== '' ? $unitStatusStr : null,
                    'type' => $type !== null ? (string) $type : null,
                    'pax' => is_numeric($pax) ? (int) $pax : null,
                    'baths' => is_numeric($baths) ? (float) $baths : null,
                    'beds' => is_numeric($beds) ? (int) $beds : null,
                ];
            }

            // Secondary sort by unit_name (safe)
            usort($items, static function ($a, $b) {
                return strcmp((string) ($a['unit_name'] ?? ''), (string) ($b['unit_name'] ?? ''));
            });

            return $this->json(['ok' => true, 'items' => $items]);
        } catch (\Throwable $e) {
            @error_log('[UnitPurchaseListController.unitPurchaseListCandidates] ' . get_class($e) . ': ' . $e->getMessage());
            @error_log('[UnitPurchaseListController.unitPurchaseListCandidates] trace: ' . $e->getTraceAsString());

            return $this->json([
                'error' => 'Failed to load purchase list candidates',
                'details' => $e->getMessage(),
                'exception' => get_class($e),
            ], 500);
        }
    }

    /**
     * Get the latest purchase list (any status) for a unit.
     * GET /api/units/{id}/purchase-list/latest
     */
    #[Route('/units/{id}/purchase-list/latest', name: 'latest_for_unit', methods: ['GET'])]
    public function latestForUnit(int $id): JsonResponse
    {
        $list = $this->listRepo->findLatestForUnit($id);
        if (!$list) {
            return $this->json(['ok' => true, 'list' => null]);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * Get the latest purchase list for a unit filtered by status.
     *
     * GET /api/units/{id}/purchase-list?status=DRAFT
     * GET /api/units/{id}/purchase-list?status=SENT
     * GET /api/units/{id}/purchase-list?status=APPROVED
     * GET /api/units/{id}/purchase-list?status=DONE
     *
     * If status is omitted or set to ALL, returns the latest list regardless of status.
     */
    #[Route('/units/{id}/purchase-list', name: 'by_status_for_unit', methods: ['GET'])]
    public function byStatusForUnit(Request $request, int $id): JsonResponse
    {
        $status = strtoupper(trim((string) $request->query->get('status', 'ALL')));
        if ($status === '') {
            $status = 'ALL';
        }

        // Find latest list for this unit with the requested status.
        // We use a QB here to avoid adding repo methods for now.
        $qb = $this->listRepo->createQueryBuilder('l')
            ->innerJoin('l.unit', 'u')
            ->andWhere('u.id = :uid')
            ->setParameter('uid', $id)
            ->orderBy('l.id', 'DESC')
            ->setMaxResults(1);

        if ($status !== 'ALL') {
            $qb->andWhere('l.status = :st')
               ->setParameter('st', $status);
        }

        /** @var UnitPurchaseList|null $list */
        $list = $qb->getQuery()->getOneOrNullResult();

        if (!$list) {
            return $this->json(['ok' => true, 'list' => null, 'lines' => []]);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * Get the latest DRAFT purchase list for a unit (with lines).
     * GET /api/units/{id}/purchase-list/draft
     */
    #[Route('/units/{id}/purchase-list/draft', name: 'draft_for_unit', methods: ['GET'])]
    public function draftForUnit(int $id): JsonResponse
    {
        // Reuse existing repo method and filter for draft (best-effort without adding new repo methods)
        $list = $this->listRepo->findLatestForUnit($id);

        if (!$list) {
            return $this->json(['ok' => true, 'list' => null, 'lines' => []]);
        }

        // Only return if it's a draft; otherwise treat as "no draft"
        if (strtoupper((string) $list->getStatus()) !== 'DRAFT') {
            return $this->json(['ok' => true, 'list' => null, 'lines' => []]);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * Get a specific purchase list by id (with lines).
     * GET /api/purchase-lists/{id}
     */
    #[Route('/purchase-lists/{id}', name: 'get_one', methods: ['GET'])]
    public function getOne(int $id): JsonResponse
    {
        /** @var UnitPurchaseList|null $list */
        $list = $this->listRepo->find($id);
        if (!$list) {
            return $this->json(['error' => 'Purchase list not found'], 404);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * Delete a specific purchase list by id (and all its lines).
     *
     * DELETE /api/purchase-lists/{id}
     *
     * By default we only allow deleting DRAFT lists to avoid accidental removal of sent/approved history.
     */
    #[Route('/purchase-lists/{id}', name: 'delete_one', methods: ['DELETE'])]
    public function deleteOne(int $id): JsonResponse
    {
        /** @var UnitPurchaseList|null $list */
        $list = $this->listRepo->find($id);
        if (!$list) {
            return $this->json(['error' => 'Purchase list not found'], 404);
        }

        // Only allow delete in DRAFT (safety)
        $st = strtoupper((string) $list->getStatus());
        if ($st !== 'DRAFT') {
            return $this->json(['error' => 'Only DRAFT lists can be deleted'], 400);
        }

        try {
            // Delete lines explicitly (do not rely on cascade)
            $lines = $this->lineRepo->findByListId((int) $list->getId());
            foreach ($lines as $ln) {
                $this->em->remove($ln);
            }

            // Delete list
            $this->em->remove($list);
            $this->em->flush();
        } catch (\Throwable $e) {
            @error_log('[UnitPurchaseListController.deleteOne] ' . get_class($e) . ': ' . $e->getMessage());
            return $this->json([
                'error' => 'Failed to delete purchase list',
                'details' => $e->getMessage(),
            ], 500);
        }

        return $this->json(['ok' => true]);
    }

    /**
     * Add a line to an existing purchase list.
     *
     * POST /api/purchase-lists/{id}/lines
     * Body JSON:
     *  - description: string (required if catalog_item_id not provided)
     *  - catalog_item_id: int (optional; stored as relation if supported later)
     *  - category: string|null (optional; for list-only items)
     *  - qty: number (default 1)
     *  - existing_qty: int (default 0)
     *  - notes: string|null
     *  - unit_cost: number|null
     *  - unit_sell_price: number|null
     *  - purchase_source: string|null
     *  - purchase_url: string|null
     *  - sort_order: int|null
     */
    #[Route('/purchase-lists/{id}/lines', name: 'add_line', methods: ['POST'])]
    public function addLine(Request $request, int $id): JsonResponse
    {
        /** @var UnitPurchaseList|null $list */
        $list = $this->listRepo->find($id);
        if (!$list) {
            return $this->json(['error' => 'Purchase list not found'], 404);
        }

        $payload = [];
        $raw = (string) $request->getContent();
        if (trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        $description = trim((string) ($payload['description'] ?? ''));
        $catalogItemId = isset($payload['catalog_item_id']) ? (int) $payload['catalog_item_id'] : null;
        $category = array_key_exists('category', $payload) ? $payload['category'] : null;
        $category = ($category === null) ? null : trim((string) $category);
        if ($category === '') {
            $category = null;
        }

        if ($description === '' && (!$catalogItemId || $catalogItemId <= 0)) {
            return $this->json(['error' => 'description is required (or provide catalog_item_id)'], 400);
        }

        $qty = $payload['qty'] ?? 1;
        $qty = is_numeric($qty) ? (float) $qty : 1.0;
        if ($qty <= 0) {
            $qty = 1.0;
        }

        $unitCost = $payload['unit_cost'] ?? null;
        $unitSell = $payload['unit_sell_price'] ?? null;

        $unitCost = (is_numeric($unitCost) ? (float) $unitCost : null);
        $unitSell = (is_numeric($unitSell) ? (float) $unitSell : null);

        $purchaseSource = isset($payload['purchase_source']) ? (string) $payload['purchase_source'] : null;
        $purchaseUrl = isset($payload['purchase_url']) ? (string) $payload['purchase_url'] : null;
        $sortOrder = isset($payload['sort_order']) && is_numeric($payload['sort_order']) ? (int) $payload['sort_order'] : null;

        $existingQty = isset($payload['existing_qty']) && is_numeric($payload['existing_qty']) ? (int) $payload['existing_qty'] : 0;
        if ($existingQty < 0) {
            $existingQty = 0;
        }

        $notes = array_key_exists('notes', $payload) ? $payload['notes'] : null;
        $notes = ($notes === null) ? null : (string) $notes;

        try {
            $ln = new UnitPurchaseListLine();

            // Attach to list (method names may vary; be defensive)
            if (method_exists($ln, 'setPurchaseList')) {
                $ln->setPurchaseList($list);
            } elseif (method_exists($ln, 'setList')) {
                $ln->setList($list);
            }

            if (method_exists($ln, 'setDescription')) {
                $ln->setDescription($description);
            }

            if (method_exists($ln, 'setCategory')) {
                $ln->setCategory($category);
            }

            if (method_exists($ln, 'setQty')) {
                $ln->setQty($qty);
            }

            if (method_exists($ln, 'setExistingQty')) {
                $ln->setExistingQty($existingQty);
            }

            if (method_exists($ln, 'setNotes')) {
                $ln->setNotes($notes);
            }

            if (method_exists($ln, 'setUnitCost')) {
                $ln->setUnitCost($unitCost);
            }

            if (method_exists($ln, 'setUnitSellPrice')) {
                $ln->setUnitSellPrice($unitSell);
            }

            if (method_exists($ln, 'setPurchaseSource')) {
                $ln->setPurchaseSource($purchaseSource);
            }

            if (method_exists($ln, 'setPurchaseUrl')) {
                $ln->setPurchaseUrl($purchaseUrl);
            }

            if (method_exists($ln, 'setSortOrder') && $sortOrder !== null) {
                $ln->setSortOrder($sortOrder);
            }

            // NOTE: We intentionally do NOT resolve catalog_item_id yet to avoid tight coupling here.
            // We'll store it via relation once the modal is wired and entity/repo is confirmed.

            $this->em->persist($ln);
            $this->em->flush();
        } catch (\Throwable $e) {
            @error_log('[UnitPurchaseListController.addLine] ' . get_class($e) . ': ' . $e->getMessage());
            return $this->json([
                'error' => 'Failed to add line',
                'details' => $e->getMessage(),
            ], 500);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * Update an existing line in a purchase list (auto-save support).
     *
     * PATCH /api/purchase-lists/{listId}/lines/{lineId}
     * Body JSON (any subset):
     *  - description: string
     *  - category: string|null
     *  - qty: number
     *  - existing_qty: int
     *  - notes: string|null
     *  - unit_cost: number|null
     *  - unit_sell_price: number|null
     *  - purchase_source: string|null
     *  - purchase_url: string|null
     *  - sort_order: int|null
     */
    #[Route('/purchase-lists/{listId}/lines/{lineId}', name: 'patch_line', methods: ['PATCH'])]
    public function patchLine(Request $request, int $listId, int $lineId): JsonResponse
    {
        /** @var UnitPurchaseList|null $list */
        $list = $this->listRepo->find($listId);
        if (!$list) {
            return $this->json(['error' => 'Purchase list not found'], 404);
        }

        /** @var UnitPurchaseListLine|null $ln */
        $ln = $this->lineRepo->find($lineId);
        if (!$ln) {
            return $this->json(['error' => 'Line not found'], 404);
        }

        // Validate line belongs to list
        $belongs = false;
        if (method_exists($ln, 'getPurchaseList') && $ln->getPurchaseList()) {
            $belongs = ((int) $ln->getPurchaseList()->getId() === (int) $listId);
        } elseif (method_exists($ln, 'getList') && $ln->getList()) {
            $belongs = ((int) $ln->getList()->getId() === (int) $listId);
        }
        if (!$belongs) {
            return $this->json(['error' => 'Line does not belong to this purchase list'], 400);
        }

        $payload = [];
        $raw = (string) $request->getContent();
        if (trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        try {
            if (array_key_exists('description', $payload) && method_exists($ln, 'setDescription')) {
                $ln->setDescription(trim((string) $payload['description']));
            }

            if (array_key_exists('category', $payload) && method_exists($ln, 'setCategory')) {
                $v = $payload['category'];
                $v = ($v === null) ? null : trim((string) $v);
                if ($v === '') {
                    $v = null;
                }
                $ln->setCategory($v);
            }

            if (array_key_exists('qty', $payload) && method_exists($ln, 'setQty')) {
                $qty = $payload['qty'];
                $qty = is_numeric($qty) ? (float) $qty : 0.0;
                if ($qty < 0) $qty = 0.0;
                $ln->setQty($qty);
            }

            if (array_key_exists('existing_qty', $payload) && method_exists($ln, 'setExistingQty')) {
                $v = $payload['existing_qty'];
                $v = is_numeric($v) ? (int) $v : 0;
                if ($v < 0) $v = 0;
                $ln->setExistingQty($v);
            }

            if (array_key_exists('unit_cost', $payload) && method_exists($ln, 'setUnitCost')) {
                $v = $payload['unit_cost'];
                $ln->setUnitCost(is_numeric($v) ? (float) $v : null);
            }

            if (array_key_exists('unit_sell_price', $payload) && method_exists($ln, 'setUnitSellPrice')) {
                $v = $payload['unit_sell_price'];
                $ln->setUnitSellPrice(is_numeric($v) ? (float) $v : null);
            }

            if (array_key_exists('purchase_source', $payload) && method_exists($ln, 'setPurchaseSource')) {
                $v = $payload['purchase_source'];
                $ln->setPurchaseSource($v === null ? null : (string) $v);
            }

            if (array_key_exists('purchase_url', $payload) && method_exists($ln, 'setPurchaseUrl')) {
                $v = $payload['purchase_url'];
                $ln->setPurchaseUrl($v === null ? null : (string) $v);
            }

            if (array_key_exists('notes', $payload) && method_exists($ln, 'setNotes')) {
                $v = $payload['notes'];
                $ln->setNotes($v === null ? null : (string) $v);
            }

            if (array_key_exists('sort_order', $payload) && method_exists($ln, 'setSortOrder')) {
                $v = $payload['sort_order'];
                $ln->setSortOrder(is_numeric($v) ? (int) $v : null);
            }

            $this->em->flush();
        } catch (\Throwable $e) {
            @error_log('[UnitPurchaseListController.patchLine] ' . get_class($e) . ': ' . $e->getMessage());
            return $this->json([
                'error' => 'Failed to update line',
                'details' => $e->getMessage(),
            ], 500);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    /**
     * Delete an existing line from a purchase list.
     *
     * DELETE /api/purchase-lists/{listId}/lines/{lineId}
     *
     * Only allowed when the purchase list status is DRAFT.
     */
    #[Route('/purchase-lists/{listId}/lines/{lineId}', name: 'delete_line', methods: ['DELETE'])]
    public function deleteLine(int $listId, int $lineId): JsonResponse
    {
        /** @var UnitPurchaseList|null $list */
        $list = $this->listRepo->find($listId);
        if (!$list) {
            return $this->json(['error' => 'Purchase list not found'], 404);
        }

        // Only allow delete in DRAFT
        $st = strtoupper((string) $list->getStatus());
        if ($st !== 'DRAFT') {
            return $this->json(['error' => 'Only DRAFT lists can be edited'], 400);
        }

        /** @var UnitPurchaseListLine|null $ln */
        $ln = $this->lineRepo->find($lineId);
        if (!$ln) {
            return $this->json(['error' => 'Line not found'], 404);
        }

        // Validate line belongs to list
        $belongs = false;
        if (method_exists($ln, 'getPurchaseList') && $ln->getPurchaseList()) {
            $belongs = ((int) $ln->getPurchaseList()->getId() === (int) $listId);
        } elseif (method_exists($ln, 'getList') && $ln->getList()) {
            $belongs = ((int) $ln->getList()->getId() === (int) $listId);
        }
        if (!$belongs) {
            return $this->json(['error' => 'Line does not belong to this purchase list'], 400);
        }

        try {
            $this->em->remove($ln);
            $this->em->flush();
        } catch (\Throwable $e) {
            @error_log('[UnitPurchaseListController.deleteLine] ' . get_class($e) . ': ' . $e->getMessage());
            return $this->json([
                'error' => 'Failed to delete line',
                'details' => $e->getMessage(),
            ], 500);
        }

        return $this->json($this->serializeListWithLines($list));
    }

    private function serializeListWithLines(UnitPurchaseList $list): array
    {
        $listId = (int) $list->getId();
        $lines = $this->lineRepo->findByListId($listId);

        $outLines = [];
        foreach ($lines as $ln) {
            $cat = null;
            if ($ln->getCatalogItem()) {
                $ci = $ln->getCatalogItem();
                if (method_exists($ci, 'getCategory')) {
                    $cat = $ci->getCategory();
                } elseif (method_exists($ci, 'getItemCategory')) {
                    $cat = $ci->getItemCategory();
                }
            } else {
                if (method_exists($ln, 'getCategory')) {
                    $cat = $ln->getCategory();
                }
            }
            $outLines[] = [
                'id' => $ln->getId(),
                'purchase_list_id' => $listId,
                'catalog_item_id' => $ln->getCatalogItem() ? $ln->getCatalogItem()->getId() : null,
                'category' => $cat,
                'description' => $ln->getDescription(),
                'qty' => $ln->getQty(),
                'existing_qty' => method_exists($ln, 'getExistingQty') ? $ln->getExistingQty() : 0,
                'needed_qty' => method_exists($ln, 'getNeededQty') ? $ln->getNeededQty() : max(0, ((int) $ln->getQty()) - (method_exists($ln, 'getExistingQty') ? (int) $ln->getExistingQty() : 0)),
                'notes' => method_exists($ln, 'getNotes') ? $ln->getNotes() : null,
                'unit_cost' => $ln->getUnitCost(),
                'unit_sell_price' => $ln->getUnitSellPrice(),
                'purchase_source' => $ln->getPurchaseSource(),
                'purchase_url' => $ln->getPurchaseUrl(),
                'sort_order' => $ln->getSortOrder(),
                'line_total_cost' => $ln->getLineTotalCost(),
                'line_total_sell_price' => $ln->getLineTotalSellPrice(),
            ];
        }

        return [
            'ok' => true,
            'list' => [
                'id' => $listId,
                'unit_id' => $list->getUnit() ? $list->getUnit()->getId() : null,
                'status' => $list->getStatus(),
                'created_at' => $list->getCreatedAt()->format('Y-m-d H:i:s'),
                'sent_at' => $list->getSentAt() ? $list->getSentAt()->format('Y-m-d H:i:s') : null,
                'notes' => $list->getNotes(),
                'total_cost' => $list->getTotalCost(),
                'total_sell_price' => $list->getTotalSellPrice(),
            ],
            'lines' => $outLines,
        ];
    }
}