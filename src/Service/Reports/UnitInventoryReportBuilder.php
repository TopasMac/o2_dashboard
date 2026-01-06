<?php
declare(strict_types=1);

namespace App\Service\Reports;

use Doctrine\ORM\EntityManagerInterface;
use App\Entity\NewUnit\UnitInventorySession;

/**
 * Builds a normalized data structure for rendering Inventory reports (HTML/PDF).
 *
 * Output shape:
 * [
 *   'meta' => [
 *      'sessionId' => 2,
 *      'unitId' => 48,
 *      'unitName' => 'TestUnit',
 *      'city' => 'Playa del Carmen',
 *      'status' => 'collecting|submitted|inv_issued|photos_issued|ready|sent|signed',
 *      'readOnly' => bool,
 *      'startedAt' => \DateTimeInterface|null,
 *      'submittedAt' => \DateTimeInterface|null,
 *      'invIssuedAt' => \DateTimeInterface|null,
 *      'photoIssuedAt' => \DateTimeInterface|null,
 *      'sentAt' => \DateTimeInterface|null,
 *      'signedAt' => \DateTimeInterface|null,
 *      'notes' => string|null,
 *      'generatedAt' => \DateTimeImmutable,
 *   ],
 *   'areas' => [
 *      [
 *         'name' => 'Cocina',
 *         'items' => [ ['name'=>'Cafetera','qty'=>1,'notes'=>null], ... ],
 *         'photos' => [ ['url'=>'https://…','caption'=>'Mesa'], ... ],
 *      ],
 *      ...
 *   ],
 *   'itemsCount'  => 5,
 *   'photosCount' => 3,
 * ]
 */
class UnitInventoryReportBuilder
{
    public const MODE_ITEMS  = 'items';
    public const MODE_PHOTOS = 'photos';
    public const MODE_BOTH   = 'both';

    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    /**
     * Build normalized data for a given inventory session.
     *
     * @param int    $sessionId The UnitInventorySession id.
     * @param string $mode      'items' | 'photos' | 'both'
     */
    public function build(int $sessionId, string $mode = self::MODE_ITEMS): array
    {
        $mode = $this->normalizeMode($mode);

        /** @var UnitInventorySession|null $session */
        $session = $this->em->getRepository(UnitInventorySession::class)->find($sessionId);
        if (!$session) {
            throw new \InvalidArgumentException(sprintf('UnitInventorySession #%d not found', $sessionId));
        }

        // Pull related info. We rely on getters on the Session entity (unit, items, photos).
        $unit     = $session->getUnit();
        $unitId   = method_exists($unit, 'getId') ? (int) $unit->getId() : null;
        $unitName = method_exists($unit, 'getUnitName') ? (string) $unit->getUnitName() : (method_exists($unit, 'getName') ? (string) $unit->getName() : '');
        $city     = method_exists($unit, 'getCity') ? (string) $unit->getCity() : '';

        // Collect items / photos
        $items  = ($mode !== self::MODE_PHOTOS) ? $this->collectItems($session) : [];
        $photos = ($mode !== self::MODE_ITEMS)  ? $this->collectPhotos($session) : [];

        // Group by area
        $areas = $this->groupByArea($items, $photos, $mode);

        // Sort areas A->Z for stable rendering
        usort($areas, static fn(array $a, array $b) => strcmp($a['name'], $b['name']));

        // Derive status/readOnly safely (entity has no isReadOnly())
        $rawStatus = method_exists($session, 'getStatus') ? (string) $session->getStatus() : '';
        $readOnly = in_array($rawStatus, [
            'submitted',
            'items_issued',
            'photos_issued',
            'ready',
            'sent',
            'signed',
        ], true);

        $meta = [
            'sessionId'   => (int) $session->getId(),
            'unitId'      => $unitId,
            'unitName'    => $unitName,
            'city'        => $city,
            'status'      => $rawStatus,
            'readOnly'    => $readOnly,
            'startedAt'   => $session->getStartedAt(),
            'submittedAt' => $session->getSubmittedAt(),
            'invIssuedAt' => method_exists($session, 'getInvIssuedAt') ? $session->getInvIssuedAt() : null,
            'photoIssuedAt' => method_exists($session, 'getPhotoIssuedAt') ? $session->getPhotoIssuedAt() : null,
            'sentAt'      => method_exists($session, 'getSentAt') ? $session->getSentAt() : null,
            'signedAt'    => method_exists($session, 'getSignedAt') ? $session->getSignedAt() : null,
            'notes'       => $session->getNotes(),
            'generatedAt' => new \DateTimeImmutable('now', new \DateTimeZone('UTC')),
        ];

        return [
            'meta'         => $meta,
            'areas'        => $areas,
            'itemsCount'   => \count($items),
            'photosCount'  => \count($photos),
            // convenient flags for twig
            'mode'         => $mode,
            'isItems'      => $mode === self::MODE_ITEMS,
            'isPhotos'     => $mode === self::MODE_PHOTOS,
            'isBoth'       => $mode === self::MODE_BOTH,
        ];
    }

    private function normalizeMode(string $mode): string
    {
        $mode = strtolower($mode);
        return match ($mode) {
            self::MODE_ITEMS, self::MODE_PHOTOS, self::MODE_BOTH => $mode,
            default => self::MODE_ITEMS,
        };
    }

    /**
     * @return array<int, array{name:string, qty:int|string|null, notes:?string, area:string}>
     */
    private function collectItems(UnitInventorySession $session): array
    {
        $out = [];
        // We try a generic accessor to avoid tight coupling with field names.
        $items = method_exists($session, 'getItems') ? $session->getItems() : (method_exists($session, 'getInventoryItems') ? $session->getInventoryItems() : []);
        foreach ($items as $it) {
            $area = $this->normalizeArea($this->callGetter($it, ['getArea', 'getAreaName']));

            $out[] = [
                'area'  => $area,
                'name'  => (string) $this->callGetter($it, ['getDescripcion', 'getDescription', 'getItemName']),
                'qty'   => $this->callGetter($it, ['getCantidad', 'getQuantity', 'getQty']),
                'notes' => $this->callGetter($it, ['getNotas', 'getNotes']),
            ];
        }
        return $out;
    }

    /**
     * @return array<int, array{url:string, caption:?string, area:string}>
     */
    private function collectPhotos(UnitInventorySession $session): array
    {
        $out = [];
        $photos = method_exists($session, 'getPhotos') ? $session->getPhotos() : [];
        foreach ($photos as $ph) {
            $area = $this->normalizeArea($this->callGetter($ph, ['getArea', 'getAreaName']));
            $url  = (string) $this->callGetter($ph, ['getFileUrl', 'getUrl', 'getPath']);
            $caption = $this->callGetter($ph, ['getCaption']);

            $out[] = [
                'area'    => $area,
                'url'     => $url,
                'caption' => $caption ? (string) $caption : null,
            ];
        }
        return $out;
    }

    /**
     * Merge Items and Photos into area buckets.
     *
     * @param array $items
     * @param array $photos
     * @param string $mode
     * @return array<int, array{name:string, items?:array, photos?:array}>
     */
    private function groupByArea(array $items, array $photos, string $mode): array
    {
        $buckets = [];

        foreach ($items as $it) {
            $area = $it['area'] ?: '—';
            $buckets[$area]['name']  = $area;
            $buckets[$area]['items'] ??= [];
            $buckets[$area]['items'][] = [
                'name'  => $it['name'],
                'qty'   => $it['qty'],
                'notes' => $it['notes'],
            ];
        }

        foreach ($photos as $ph) {
            $area = $ph['area'] ?: '—';
            $buckets[$area]['name']   = $area;
            $buckets[$area]['photos'] ??= [];
            $buckets[$area]['photos'][] = [
                'url'     => $ph['url'],
                'caption' => $ph['caption'],
            ];
        }

        // Sort items inside each area for consistent output
        foreach ($buckets as &$b) {
            if (isset($b['items'])) {
                usort($b['items'], static fn($a, $c) => strcmp((string)$a['name'], (string)$c['name']));
            }
        }
        unset($b);

        // If mode == items|photos, we can prune other key to reduce output size (optional).
        if ($mode === self::MODE_ITEMS) {
            foreach ($buckets as &$b) {
                unset($b['photos']);
            }
            unset($b);
        } elseif ($mode === self::MODE_PHOTOS) {
            foreach ($buckets as &$b) {
                unset($b['items']);
            }
            unset($b);
        }

        return \array_values($buckets);
    }

    private function normalizeArea(?string $area): string
    {
        $area = $area ? trim($area) : '';
        if ($area === '') {
            return '—';
        }
        // Basic normalization (avoid escaped UTF-8 artifacts in some inputs)
        return \html_entity_decode($area, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Tries a list of getters on an object and returns the first non-null value.
     *
     * @param object $obj
     * @param string[] $methods
     * @return mixed
     */
    private function callGetter(object $obj, array $methods): mixed
    {
        foreach ($methods as $m) {
            if (method_exists($obj, $m)) {
                $val = $obj->{$m}();
                return $val;
            }
        }
        return null;
    }
}