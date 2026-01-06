<?php

namespace App\Service;

use App\Entity\PurchaseCatalogItem;
use App\Entity\Unit;
use App\Entity\UnitPurchaseList;
use App\Entity\UnitPurchaseListLine;
use App\Repository\PurchaseCatalogItemRepository;
use App\Repository\UnitPurchaseListLineRepository;
use App\Repository\UnitPurchaseListRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Generates a “to-buy” list (draft) for a unit.
 *
 * Rules:
 * - Catalog items can define qty rules:
 *   - per_bed_qty * beds
 *   - per_guest_qty * pax
 *   - min_qty floor
 *   - default_qty for suggested extras
 * - If bed_config exists, beds is derived from bed_config length.
 * - Snapshot fields are stored on list lines so catalog edits do not affect historical lists.
 */
class UnitPurchaseListGenerator
{
    private EntityManagerInterface $em;
    private PurchaseCatalogItemRepository $catalogRepo;
    private UnitPurchaseListRepository $listRepo;
    private UnitPurchaseListLineRepository $lineRepo;

    public function __construct(
        EntityManagerInterface $em,
        PurchaseCatalogItemRepository $catalogRepo,
        UnitPurchaseListRepository $listRepo,
        UnitPurchaseListLineRepository $lineRepo
    ) {
        $this->em = $em;
        $this->catalogRepo = $catalogRepo;
        $this->listRepo = $listRepo;
        $this->lineRepo = $lineRepo;
    }

    /**
     * @param int $unitId
     * @param array{includeExtras?:bool, onlyAlwaysNeeded?:bool, resetLines?:bool} $options
     */
    public function generateDraftForUnit(int $unitId, array $options = []): UnitPurchaseList
    {
        $includeExtras = (bool)($options['includeExtras'] ?? true);
        $onlyAlwaysNeeded = (bool)($options['onlyAlwaysNeeded'] ?? false);
        $resetLines = (bool)($options['resetLines'] ?? true);

        /** @var Unit|null $unit */
        $unit = $this->em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            throw new \InvalidArgumentException('Unit not found: ' . $unitId);
        }

        // Resolve beds: prefer bed_config rows count if present.
        $beds = $this->resolveBeds($unit);
        $pax = (int)($unit->getPax() ?? 0);
        $unitType = $unit->getType();
        $baths = (int)($unit->getBaths() ?? 0);

        $bedCounts = $this->resolveBedCounts($unit);

        // Draft list: reuse if exists.
        $list = $this->listRepo->findDraftForUnit($unitId);
        if (!$list) {
            $list = new UnitPurchaseList();

            // Attach a managed Unit instance from the current EntityManager.
            // This prevents Doctrine from treating the Unit as a NEW/unmanaged entity.
            /** @var Unit|null $unitManaged */
            $unitManaged = $this->em->getRepository(Unit::class)->find($unitId);
            if (!$unitManaged) {
                throw new \InvalidArgumentException('Unit not found: ' . $unitId);
            }
            $list->setUnit($unitManaged);

            $list->setStatus(UnitPurchaseList::STATUS_DRAFT);
            $this->em->persist($list);
            $this->em->flush();
        }

        if ($resetLines) {
            $this->lineRepo->deleteByListId((int)$list->getId());
            // Avoid clearing the EntityManager here; it can detach managed entities in some setups.
        }

        // Pull applicable catalog items: generic + matching unit type.
        $catalogItems = $this->catalogRepo->findForUnitType($unitType, $onlyAlwaysNeeded);

        $lines = [];
        $sort = 10;
        foreach ($catalogItems as $item) {
            if (!$item instanceof PurchaseCatalogItem) {
                continue;
            }

            // Skip extras if disabled
            if (!$includeExtras && !$item->isAlwaysNeeded()) {
                continue;
            }

            $bedSize = $item->getBedSize();
            $bedsForItem = $beds;

            if ($bedSize !== null && $bedSize !== '') {
                $key = strtolower(trim((string)$bedSize));
                $bedsForItem = (int)($bedCounts[$key] ?? 0);
                if ($bedsForItem <= 0) {
                    // This unit does not have this bed size; skip size-specific items.
                    continue;
                }
            }

            $qty = $this->computeQty($item, $bedsForItem, $pax, $baths);
            if ($qty <= 0) {
                continue;
            }

            $desc = (string)$item->getName();
            if ($bedSize !== null && $bedSize !== '') {
                $label = ucwords(strtolower(trim((string)$bedSize)));
                $desc = $desc . ' (' . $label . ')';
            }

            $line = new UnitPurchaseListLine();
            $line->setPurchaseList($list);
            $line->setCatalogItem($item);
            $line->setDescription($desc);
            $line->setQty($qty);
            $line->setUnitCost($item->getCost());
            $line->setUnitSellPrice($item->getSellPrice());
            $line->setPurchaseSource($item->getPurchaseSource());
            $line->setPurchaseUrl($item->getPurchaseUrl());
            $line->setSortOrder($sort);

            $this->em->persist($line);
            $lines[] = $line;

            $sort += 10;
        }

        $this->em->flush();

        // Update totals snapshots (optional)
        $this->recalculateListTotals($list, $lines);
        $this->em->persist($list);
        $this->em->flush();

        return $list;
    }

    private function resolveBeds(Unit $unit): int
    {
        $cfg = $unit->getBedConfig();
        if (is_array($cfg) && count($cfg) > 0) {
            $total = 0;
            foreach ($cfg as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $c = (int)($row['count'] ?? 1);
                if ($c < 1) {
                    $c = 1;
                }
                $total += $c;
            }
            return $total;
        }

        $beds = $unit->getBeds();
        return (int)($beds ?? 0);
    }

    /**
     * @return array<string,int> map of bed size/type -> count, e.g. ['king' => 1, 'single' => 2]
     */
    private function resolveBedCounts(Unit $unit): array
    {
        $cfg = $unit->getBedConfig();
        if (!is_array($cfg) || count($cfg) === 0) {
            return [];
        }

        $out = [];
        foreach ($cfg as $row) {
            if (!is_array($row)) {
                continue;
            }
            $type = (string)($row['type'] ?? $row['size'] ?? '');
            $type = strtolower(trim($type));
            if ($type === '') {
                continue;
            }
            $c = (int)($row['count'] ?? 1);
            if ($c < 1) {
                $c = 1;
            }
            $out[$type] = ($out[$type] ?? 0) + $c;
        }

        return $out;
    }

    private function computeQty(PurchaseCatalogItem $item, int $beds, int $pax, int $baths): int
    {
        $qty = 0;

        // New canonical rule: qty_basis + qty_per_basis
        $basis = $item->getQtyBasis();          // expected: 'guest', 'bed', 'bath', 'unit', null
        $per   = (int)($item->getQtyPerBasis() ?? 0);

        if ($basis && $per > 0) {
            switch ($basis) {
                case 'guest':
                    if ($pax > 0) {
                        $qty = $per * $pax;
                    }
                    break;

                case 'bed':
                    if ($beds > 0) {
                        $qty = $per * $beds;
                    }
                    break;

                case 'bath':
                    if ($baths > 0) {
                        $qty = $per * $baths;
                    }
                    break;

                case 'unit':
                    $qty = $per;
                    break;
            }
        }

        // Floor with min_qty if defined
        $min = $item->getMinQty();
        if ($min !== null) {
            $qty = max($qty, (int)$min);
        }

        // Always-needed safety fallback
        if ($item->isAlwaysNeeded() && $qty <= 0) {
            $qty = 1;
        }

        return (int)$qty;
    }

    /**
     * @param UnitPurchaseList $list
     * @param UnitPurchaseListLine[] $lines
     */
    private function recalculateListTotals(UnitPurchaseList $list, array $lines): void
    {
        $totalCost = '0.00';
        $totalSell = '0.00';

        foreach ($lines as $line) {
            if (!$line instanceof UnitPurchaseListLine) {
                continue;
            }
            $qty = (string)$line->getQty();

            $uc = $line->getUnitCost();
            if ($uc !== null) {
                $totalCost = \bcadd($totalCost, \bcmul((string)$uc, $qty, 2), 2);
            }

            $us = $line->getUnitSellPrice();
            if ($us !== null) {
                $totalSell = \bcadd($totalSell, \bcmul((string)$us, $qty, 2), 2);
            }
        }

        $list->setTotalCost($totalCost);
        $list->setTotalSellPrice($totalSell);
    }
}