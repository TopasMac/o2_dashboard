<?php

namespace App\Controller\Api;

use App\Entity\Unit;
use App\Entity\UnitMedia;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route(path: '/api/public', name: 'api_public_')]
class PublicUnitController extends AbstractController
{
    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    /**
     * List for Wix repeater cards.
     * Returns basic unit info + computed cover image (published-only; cover first fallback).
     */
    #[Route(path: '/units', name: 'units_list', methods: ['GET'])]
    public function list(Request $request): Response
    {
        $city = $request->query->get('city');

        $qb = $this->em->getRepository(Unit::class)->createQueryBuilder('u');

        // Only include units that have at least one PUBLISHED media
        $qb->andWhere($qb->expr()->exists(
            'SELECT 1 FROM ' . UnitMedia::class . ' um WHERE um.unit = u AND um.isPublished = 1'
        ));

        if ($city) {
            $qb->andWhere('u.city = :city')->setParameter('city', $city);
        }

        $units = $qb->getQuery()->getResult();

        $data = [];
        foreach ($units as $unit) {
            if (!$unit instanceof Unit) { continue; }

            $published = array_values(array_filter($unit->getUnitMedia()->toArray(), function ($mm) {
                return $mm instanceof UnitMedia && $mm->isPublished();
            }));

            // Pick cover (explicit cover first, else lowest sortOrder)
            usort($published, function (UnitMedia $a, UnitMedia $b) {
                if ($a->isCover() !== $b->isCover()) {
                    return $a->isCover() ? -1 : 1; // cover first
                }
                return ($a->getSortOrder() <=> $b->getSortOrder()) ?: ($a->getId() <=> $b->getId());
            });

            $cover = $published[0] ?? null;

            $data[] = [
                'id'        => $unit->getId(),
                'slug'      => method_exists($unit, 'getSlug') ? $unit->getSlug() : null,
                'listingName'  => method_exists($unit, 'getListingName') ? $unit->getListingName() : null,
                'city'      => method_exists($unit, 'getCity') ? $unit->getCity() : null,
                'pax'       => method_exists($unit, 'getPax') ? $unit->getPax() : null,
                'beds'      => method_exists($unit, 'getBeds') ? $unit->getBeds() : null,
                'baths'     => method_exists($unit, 'getBaths') ? $unit->getBaths() : null,
                'parking'   => method_exists($unit, 'getParking') ? $unit->getParking() : null,
                'seoShortDescription' => method_exists($unit, 'getSeoShortDescription') ? $unit->getSeoShortDescription() : null,
                'coverImage' => $cover ? $this->normalizeCover($cover) : null,
            ];
        }

        return $this->corsJson($data);
    }

    /**
     * Detail for a single unit including all published media.
     */
    #[Route(path: '/units/{id}', name: 'units_show', methods: ['GET'])]
    public function show(int $id): Response
    {
        /** @var Unit|null $unit */
        $unit = $this->em->getRepository(Unit::class)->find($id);
        if (!$unit) {
            return $this->corsJson(['error' => 'Unit not found'], 404);
        }

        $published = array_values(array_filter($unit->getUnitMedia()->toArray(), function ($mm) {
            return $mm instanceof UnitMedia && $mm->isPublished();
        }));

        usort($published, function (UnitMedia $a, UnitMedia $b) {
            if ($a->isCover() !== $b->isCover()) {
                return $a->isCover() ? -1 : 1; // cover first
            }
            return ($a->getSortOrder() <=> $b->getSortOrder()) ?: ($a->getId() <=> $b->getId());
        });

        $cover = $published[0] ?? null;

        $payload = [
            'id'        => $unit->getId(),
            'slug'      => method_exists($unit, 'getSlug') ? $unit->getSlug() : null,
            'listingName'  => method_exists($unit, 'getListingName') ? $unit->getListingName() : null,
            'city'      => method_exists($unit, 'getCity') ? $unit->getCity() : null,
            'pax'       => method_exists($unit, 'getPax') ? $unit->getPax() : null,
            'beds'      => method_exists($unit, 'getBeds') ? $unit->getBeds() : null,
            'baths'     => method_exists($unit, 'getBaths') ? $unit->getBaths() : null,
            'parking'   => method_exists($unit, 'getParking') ? $unit->getParking() : null,
            'seoShortDescription' => method_exists($unit, 'getSeoShortDescription') ? $unit->getSeoShortDescription() : null,
            'coverImage' => $cover ? $this->normalizeCover($cover) : null,
            'gallery'   => array_map(fn(UnitMedia $m) => $this->normalizeMedia($m), $published),
        ];

        return $this->corsJson($payload);
    }

    private function normalizeCover(UnitMedia $m): array
    {
        return [
            'url'    => $m->getUrl(),
            'alt'    => $m->getCaption() ?: ($m->getSeoDescription() ?: null),
            'width'  => method_exists($m, 'getWidth') ? $m->getWidth() : null,
            'height' => method_exists($m, 'getHeight') ? $m->getHeight() : null,
            'id'     => $m->getId(),
        ];
    }

    private function normalizeMedia(UnitMedia $m): array
    {
        return [
            'id' => $m->getId(),
            'url' => $m->getUrl(),
            'tags' => $m->getTags(),
            'sortOrder' => $m->getSortOrder(),
            'isCover' => $m->isCover(),
            'caption' => $m->getCaption(),
            'seoDescription' => $m->getSeoDescription(),
            'captionEs' => method_exists($m, 'getCaptionEs') ? $m->getCaptionEs() : null,
            'seoDescriptionEs' => method_exists($m, 'getSeoDescriptionEs') ? $m->getSeoDescriptionEs() : null,
        ];
    }

    private function corsJson(mixed $data, int $status = 200): JsonResponse
    {
        $resp = new JsonResponse($data, $status);

        // Ensure we only ever send a single Access-Control-Allow-Origin value
        // (browsers will reject multiple values). Remove any value set previously
        // by middleware or web-server and set ours explicitly.
        $resp->headers->remove('Access-Control-Allow-Origin');

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        // Whitelist of allowed origins (add/remove as needed)
        $allowedOrigins = [
            'https://www.owners2.com',
            'https://owners2.com',
            // Wix editor / preview related domains (optional; uncomment if needed)
            'https://editor.wix.com',
            'https://manage.wix.com',
            'https://www.wix.com',
            'https://static.parastorage.com',
            // If you also serve on a wixsite subdomain, add it here, e.g.:
            // 'https://<your-site>.wixsite.com',
        ];

        if ($origin && in_array($origin, $allowedOrigins, true)) {
            $resp->headers->set('Access-Control-Allow-Origin', $origin);
        } else {
            // Safe single-origin default for production site
            $resp->headers->set('Access-Control-Allow-Origin', 'https://www.owners2.com');
        }

        // Make caches/proxies differentiate by Origin
        $resp->headers->set('Vary', 'Origin');

        // Allow simple methods/headers
        $resp->headers->set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        $resp->headers->set('Access-Control-Allow-Headers', 'Content-Type');

        // Cache hints (tune as desired)
        $resp->setPublic();
        $resp->setMaxAge(60);

        return $resp;
    }
}