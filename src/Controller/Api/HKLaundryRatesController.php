<?php

namespace App\Controller\Api;

use App\Entity\HKLaundryRates;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/hk-laundry-rates')]
class HKLaundryRatesController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(EntityManagerInterface $em): JsonResponse
    {
        $rows = $em->getRepository(HKLaundryRates::class)
            ->findBy([], ['city' => 'ASC', 'itemType' => 'ASC', 'effectiveFrom' => 'DESC']);

        $data = array_map(function (HKLaundryRates $r) {
            return [
                'id' => $r->getId(),
                'city' => $r->getCity(),
                'providerName' => $r->getProviderName(),
                'providerId' => $r->getProviderId(),
                'itemType' => $r->getItemType(),
                'unitPrice' => $r->getUnitPrice(),
                'effectiveFrom' => $r->getEffectiveFrom()?->format('Y-m-d'),
                'effectiveTo' => $r->getEffectiveTo()?->format('Y-m-d'),
                'isActive' => $r->getIsActive(),
                'notes' => $r->getNotes(),
            ];
        }, $rows);

        return $this->json($data);
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        $row = new HKLaundryRates();
        $row->setCity((string)($data['city'] ?? 'Playa'));
        $row->setProviderName($data['providerName'] ?? null);
        $row->setProviderId(isset($data['providerId']) && $data['providerId'] !== '' ? (int)$data['providerId'] : null);
        $row->setItemType((string)($data['itemType'] ?? 'kilo'));
        $row->setUnitPrice($data['unitPrice'] ?? 0);
        $row->setEffectiveFrom($data['effectiveFrom'] ?? 'today');
        $row->setEffectiveTo($data['effectiveTo'] ?? null);
        $row->setIsActive((bool)($data['isActive'] ?? true));
        $row->setNotes($data['notes'] ?? null);

        $em->persist($row);
        $em->flush();

        return $this->json(['id' => $row->getId()], 201);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $row = $em->getRepository(HKLaundryRates::class)->find($id);

        if (!$row) {
            return $this->json(['error' => 'Rate not found'], 404);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('city', $data)) $row->setCity((string)$data['city']);
        if (array_key_exists('providerName', $data)) $row->setProviderName($data['providerName']);
        if (array_key_exists('providerId', $data)) $row->setProviderId($data['providerId'] !== '' && $data['providerId'] !== null ? (int)$data['providerId'] : null);
        if (array_key_exists('itemType', $data)) $row->setItemType((string)$data['itemType']);
        if (array_key_exists('unitPrice', $data)) $row->setUnitPrice($data['unitPrice']);
        if (array_key_exists('effectiveFrom', $data)) $row->setEffectiveFrom($data['effectiveFrom']);
        if (array_key_exists('effectiveTo', $data)) $row->setEffectiveTo($data['effectiveTo']);
        if (array_key_exists('isActive', $data)) $row->setIsActive((bool)$data['isActive']);
        if (array_key_exists('notes', $data)) $row->setNotes($data['notes']);

        $em->flush();

        return $this->json(['success' => true]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $row = $em->getRepository(HKLaundryRates::class)->find($id);

        if (!$row) {
            return $this->json(['error' => 'Rate not found'], 404);
        }

        $em->remove($row);
        $em->flush();

        return $this->json(['success' => true]);
    }
}