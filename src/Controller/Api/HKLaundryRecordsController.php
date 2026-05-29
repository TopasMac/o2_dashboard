<?php

namespace App\Controller\Api;

use App\Entity\HKLaundryRecords;
use App\Entity\HKLaundryRates;
use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/hk-laundry-records')]
class HKLaundryRecordsController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $unitId = $request->query->get('unitId');
        $from = $request->query->get('from');
        $to = $request->query->get('to');

        $qb = $em->getRepository(HKLaundryRecords::class)
            ->createQueryBuilder('r')
            ->leftJoin('r.unit', 'u')
            ->addSelect('u')
            ->orderBy('r.laundryDate', 'DESC');

        if (!empty($unitId)) {
            $qb->andWhere('u.id = :unitId')
               ->setParameter('unitId', (int) $unitId);
        }

        if (!empty($from)) {
            $qb->andWhere('r.laundryDate >= :from')
               ->setParameter('from', new \DateTimeImmutable($from));
        }

        if (!empty($to)) {
            $qb->andWhere('r.laundryDate <= :to')
               ->setParameter('to', new \DateTimeImmutable($to));
        }

        $rows = $qb->getQuery()->getResult();

        $data = array_map(function (HKLaundryRecords $r) {
            return [
                'id' => $r->getId(),
                'laundryDate' => $r->getLaundryDate()?->format('Y-m-d'),
                'unitId' => $r->getUnit()?->getId(),
                'unitName' => method_exists($r->getUnit(), 'getUnitName') ? $r->getUnit()?->getUnitName() : null,
                'quantity' => $r->getQuantity(),
                'rateSnapshot' => $r->getRateSnapshot(),
                'expectedAmount' => $r->getExpectedAmount(),
                'chargedAmount' => $r->getChargedAmount(),
                'providerId' => $r->getProviderId(),
                'createdBy' => $r->getCreatedBy(),
                'updatedBy' => $r->getUpdatedBy(),
                'notes' => $r->getNotes(),
                'rateId' => $r->getRate()?->getId(),
            ];
        }, $rows);

        return $this->json($data);
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        $unit = isset($data['unitId'])
            ? $em->getRepository(Unit::class)->find((int)$data['unitId'])
            : null;

        if (!$unit) {
            return $this->json(['error' => 'Unit not found'], 400);
        }

        $rate = null;
        if (!empty($data['rateId'])) {
            $rate = $em->getRepository(HKLaundryRates::class)->find((int)$data['rateId']);
        }

        $row = new HKLaundryRecords();
        $row->setUnit($unit);
        $row->setRate($rate);
        $row->setLaundryDate($data['laundryDate'] ?? 'today');
        $row->setQuantity($data['quantity'] ?? $data['weightKg'] ?? 0);
        $row->setRateSnapshot($data['rateSnapshot'] ?? $data['pricePerKgSnapshot'] ?? null);
        $row->setExpectedAmount($data['expectedAmount'] ?? null);
        $row->setChargedAmount($data['chargedAmount'] ?? $data['calculatedAmount'] ?? null);
        $row->setProviderId(isset($data['providerId']) && $data['providerId'] !== '' ? (int)$data['providerId'] : null);
        $row->setCreatedBy($data['createdBy'] ?? null);
        $row->setUpdatedBy($data['updatedBy'] ?? null);
        $row->setNotes($data['notes'] ?? null);

        $em->persist($row);
        $em->flush();

        return $this->json(['id' => $row->getId()], 201);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $row = $em->getRepository(HKLaundryRecords::class)->find($id);

        if (!$row) {
            return $this->json(['error' => 'Record not found'], 404);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('unitId', $data)) {
            $unit = $em->getRepository(Unit::class)->find((int)$data['unitId']);
            if (!$unit) {
                return $this->json(['error' => 'Unit not found'], 400);
            }
            $row->setUnit($unit);
        }

        if (array_key_exists('rateId', $data)) {
            $rate = !empty($data['rateId'])
                ? $em->getRepository(HKLaundryRates::class)->find((int)$data['rateId'])
                : null;
            $row->setRate($rate);
        }

        if (array_key_exists('laundryDate', $data)) $row->setLaundryDate($data['laundryDate']);
        if (array_key_exists('quantity', $data)) $row->setQuantity($data['quantity']);
        if (array_key_exists('weightKg', $data)) $row->setQuantity($data['weightKg']);
        if (array_key_exists('rateSnapshot', $data)) $row->setRateSnapshot($data['rateSnapshot']);
        if (array_key_exists('pricePerKgSnapshot', $data)) $row->setRateSnapshot($data['pricePerKgSnapshot']);
        if (array_key_exists('expectedAmount', $data)) $row->setExpectedAmount($data['expectedAmount']);
        if (array_key_exists('chargedAmount', $data)) $row->setChargedAmount($data['chargedAmount']);
        if (array_key_exists('calculatedAmount', $data)) $row->setChargedAmount($data['calculatedAmount']);
        if (array_key_exists('providerId', $data)) $row->setProviderId($data['providerId'] !== '' && $data['providerId'] !== null ? (int)$data['providerId'] : null);
        if (array_key_exists('createdBy', $data)) $row->setCreatedBy($data['createdBy']);
        if (array_key_exists('updatedBy', $data)) $row->setUpdatedBy($data['updatedBy']);
        if (array_key_exists('notes', $data)) $row->setNotes($data['notes']);

        $em->flush();

        return $this->json(['success' => true]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $row = $em->getRepository(HKLaundryRecords::class)->find($id);

        if (!$row) {
            return $this->json(['error' => 'Record not found'], 404);
        }

        $em->remove($row);
        $em->flush();

        return $this->json(['success' => true]);
    }
}