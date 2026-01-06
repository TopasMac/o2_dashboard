<?php

namespace App\Controller\Api;

use App\Entity\PurchaseCatalogItem;
use App\Repository\PurchaseCatalogItemRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api', name: 'api_purchase_catalog_')]
class PurchaseCatalogController extends AbstractController
{
    private EntityManagerInterface $em;
    private PurchaseCatalogItemRepository $repo;

    public function __construct(EntityManagerInterface $em, PurchaseCatalogItemRepository $repo)
    {
        $this->em = $em;
        $this->repo = $repo;
    }

    /**
     * GET /api/purchase-catalog
     * Query params:
     *  - q: search by name (contains)
     *  - category
     *  - unitType
     *  - alwaysNeeded=1|0
     */
    #[Route('/purchase-catalog', name: 'list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        $q = trim((string) $request->query->get('q', ''));
        $category = trim((string) $request->query->get('category', ''));
        $unitType = trim((string) $request->query->get('unitType', ''));
        $alwaysNeededRaw = $request->query->get('alwaysNeeded', null);
        $alwaysNeeded = null;
        if ($alwaysNeededRaw !== null && $alwaysNeededRaw !== '') {
            $alwaysNeeded = (bool) ((string) $alwaysNeededRaw === '1' || strtolower((string) $alwaysNeededRaw) === 'true');
        }

        $qb = $this->repo->createQueryBuilder('i');

        if ($q !== '') {
            $qb->andWhere('i.name LIKE :q')
               ->setParameter('q', '%' . $q . '%');
        }

        if ($category !== '') {
            $qb->andWhere('i.category = :cat')
               ->setParameter('cat', $category);
        }

        if ($unitType !== '') {
            // match exact unitType or generic (NULL) if requested via includeGeneric=1
            $includeGeneric = (string) $request->query->get('includeGeneric', '1');
            if ($includeGeneric === '1' || strtolower($includeGeneric) === 'true') {
                $qb->andWhere('(i.unitType IS NULL OR i.unitType = :ut)')
                   ->setParameter('ut', $unitType);
            } else {
                $qb->andWhere('i.unitType = :ut')
                   ->setParameter('ut', $unitType);
            }
        }

        if ($alwaysNeeded !== null) {
            $qb->andWhere('i.isAlwaysNeeded = :an')
               ->setParameter('an', $alwaysNeeded);
        }

        $qb->addOrderBy('i.category', 'ASC')
           ->addOrderBy('i.name', 'ASC');

        $items = $qb->getQuery()->getResult();

        $out = [];
        foreach ($items as $item) {
            if (!$item instanceof PurchaseCatalogItem) {
                continue;
            }
            $out[] = $this->serializeItem($item);
        }

        return $this->json(['ok' => true, 'items' => $out]);
    }

    /**
     * POST /api/purchase-catalog
     * Body JSON:
     *  - name (required)
     *  - category, is_always_needed, bed_size,
     *    qty_basis, qty_per_basis, qty_per_bed_by_size,
     *    purchase_source, purchase_url, cost, sell_price, notes
     */
    #[Route('/purchase-catalog', name: 'create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $payload = [];
        $raw = (string) $request->getContent();
        if (trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'Field "name" is required'], 422);
        }

        $item = new PurchaseCatalogItem();
        $item->setName($name);

        $item->setCategory($this->nullifyString($payload['category'] ?? null));
        $item->setIsAlwaysNeeded((bool) ($payload['is_always_needed'] ?? false));

        $item->setQtyBasis($this->nullifyQtyBasis($payload['qty_basis'] ?? null));
        $item->setQtyPerBasis($this->nullifyInt($payload['qty_per_basis'] ?? null));
        $item->setQtyPerBedBySize($this->nullifyJsonArray($payload['qty_per_bed_by_size'] ?? null));

        // bed_size examples: king | queen | single | sofa | null
        $item->setBedSize($this->nullifyString($payload['bed_size'] ?? null));

        $item->setPurchaseSource($this->nullifyString($payload['purchase_source'] ?? null));
        $item->setPurchaseUrl($this->nullifyString($payload['purchase_url'] ?? null));

        // decimals as strings
        $item->setCost($this->nullifyDecimal($payload['cost'] ?? null));
        $item->setSellPrice($this->nullifyDecimal($payload['sell_price'] ?? null));

        $item->setNotes($this->nullifyString($payload['notes'] ?? null));

        $this->em->persist($item);
        $this->em->flush();

        return $this->json(['ok' => true, 'item' => $this->serializeItem($item)], 201);
    }

    /**
     * PATCH /api/purchase-catalog/{id}
     * Partial update.
     * Body JSON may include any of:
     *  - name
     *  - category
     *  - is_always_needed
     *  - bed_size
     *  - qty_basis
     *  - qty_per_basis
     *  - qty_per_bed_by_size
     *  - purchase_source
     *  - purchase_url
     *  - cost
     *  - sell_price
     *  - notes
     */
    #[Route('/purchase-catalog/{id}', name: 'update', methods: ['PATCH'])]
    public function update(Request $request, int $id): JsonResponse
    {
        $item = $this->repo->find($id);
        if (!$item instanceof PurchaseCatalogItem) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $payload = [];
        $raw = (string) $request->getContent();
        if (trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        // Update only provided keys
        if (array_key_exists('name', $payload)) {
            $name = trim((string) ($payload['name'] ?? ''));
            if ($name === '') {
                return $this->json(['error' => 'Field "name" cannot be empty'], 422);
            }
            $item->setName($name);
        }

        if (array_key_exists('category', $payload)) {
            $item->setCategory($this->nullifyString($payload['category'] ?? null));
        }

        if (array_key_exists('is_always_needed', $payload)) {
            $item->setIsAlwaysNeeded((bool) ($payload['is_always_needed'] ?? false));
        }

        if (array_key_exists('bed_size', $payload)) {
            $item->setBedSize($this->nullifyString($payload['bed_size'] ?? null));
        }

        if (array_key_exists('qty_basis', $payload)) {
            $item->setQtyBasis($this->nullifyQtyBasis($payload['qty_basis'] ?? null));
        }

        if (array_key_exists('qty_per_basis', $payload)) {
            $item->setQtyPerBasis($this->nullifyInt($payload['qty_per_basis'] ?? null));
        }

        if (array_key_exists('qty_per_bed_by_size', $payload)) {
            $item->setQtyPerBedBySize($this->nullifyJsonArray($payload['qty_per_bed_by_size'] ?? null));
        }

        if (array_key_exists('purchase_source', $payload)) {
            $item->setPurchaseSource($this->nullifyString($payload['purchase_source'] ?? null));
        }

        if (array_key_exists('purchase_url', $payload)) {
            $item->setPurchaseUrl($this->nullifyString($payload['purchase_url'] ?? null));
        }

        if (array_key_exists('cost', $payload)) {
            $item->setCost($this->nullifyDecimal($payload['cost'] ?? null));
        }

        if (array_key_exists('sell_price', $payload)) {
            $item->setSellPrice($this->nullifyDecimal($payload['sell_price'] ?? null));
        }

        if (array_key_exists('notes', $payload)) {
            $item->setNotes($this->nullifyString($payload['notes'] ?? null));
        }

        $this->em->flush();

        return $this->json(['ok' => true, 'item' => $this->serializeItem($item)]);
    }

    /**
     * DELETE /api/purchase-catalog/{id}
     */
    #[Route('/purchase-catalog/{id}', name: 'delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $item = $this->repo->find($id);
        if (!$item instanceof PurchaseCatalogItem) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $this->em->remove($item);
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    private function serializeItem(PurchaseCatalogItem $item): array
    {
        return [
            'id' => $item->getId(),
            'name' => $item->getName(),
            'category' => $item->getCategory(),
            'is_always_needed' => $item->isAlwaysNeeded(),
            'bed_size' => $item->getBedSize(),
            'qty_basis' => $item->getQtyBasis(),
            'qty_per_basis' => $item->getQtyPerBasis(),
            'qty_per_bed_by_size' => $item->getQtyPerBedBySize(),
            'purchase_source' => $item->getPurchaseSource(),
            'purchase_url' => $item->getPurchaseUrl(),
            'cost' => $item->getCost(),
            'sell_price' => $item->getSellPrice(),
            'notes' => $item->getNotes(),
        ];
    }

    private function nullifyString($v): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }

    private function nullifyInt($v): ?int
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v)) {
            return null;
        }
        return (int) $v;
    }

    private function nullifyDecimal($v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        // Accept numeric strings like "123", "123.45"
        $s = trim((string) $v);
        if ($s === '') {
            return null;
        }
        // Normalize comma decimals
        $s = str_replace(',', '.', $s);
        if (!is_numeric($s)) {
            return null;
        }
        // Keep as string with max 2 decimals
        return number_format((float) $s, 2, '.', '');
    }


    private function nullifyQtyBasis($v): ?string
    {
        $s = $this->nullifyString($v);
        if ($s === null) {
            return null;
        }
        $s = strtolower($s);
        $allowed = ['unit', 'guest', 'bath', 'bed', 'pillow'];
        return in_array($s, $allowed, true) ? $s : null;
    }

    private function nullifyJsonArray($v): ?array
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (is_string($v)) {
            $decoded = json_decode($v, true);
            if (is_array($decoded)) {
                return $decoded;
            }
            return null;
        }
        return is_array($v) ? $v : null;
    }
}