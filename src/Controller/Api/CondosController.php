<?php

namespace App\Controller\Api;

use App\Entity\Condo;
use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Request;

class CondosController extends AbstractController
{
    #[Route('/api/condos-list', name: 'api_condos_list', methods: ['GET'])]
    public function index(EntityManagerInterface $entityManager): JsonResponse
    {
        $qb = $entityManager->getRepository(Condo::class)->createQueryBuilder('co')
            ->innerJoin(Unit::class, 'u', 'WITH', 'u.condo = co')
            ->andWhere('u.dateEnded IS NULL')
            ->andWhere("LOWER(COALESCE(u.status,'')) NOT IN ('inactive','onboarding','alor','internal')")
            ->groupBy('co.id')
            ->orderBy('co.condoName', 'ASC');

        $condos = $qb->getQuery()->getResult();

        $data = array_map(function ($condo) {
            return [
                'id' => $condo->getId(),
                'condoName' => $condo->getCondoName(),
                'name' => $condo->getCondoName(),
                'city' => $condo->getCity(),
                'doorCode' => $condo->getDoorCode(),
                'googleMaps' => $condo->getGoogleMaps(),
                'notes' => $condo->getNotes(),
                'hoaBank' => $condo->getHoaBank(),
                'hoaAccountName' => $condo->getHoaAccountName(),
                'hoaAccountNr' => $condo->getHoaAccountNr(),
                'hoaEmail' => $condo->getHoaEmail(),
                'hoaDueDay' => $condo->getHoaDueDay(),
            ];
        }, $condos);

        return $this->json($data);
    }

    #[Route('/api/condos', name: 'api_condos_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        // Accept both camelCase and snake_case payloads (frontend varies by form)
        $condoName = $data['condoName'] ?? $data['condo_name'] ?? null;
        $city = $data['city'] ?? null;

        // Optional fields (support both naming styles)
        $doorCode = $data['doorCode'] ?? $data['door_code'] ?? null;
        $notes = $data['notes'] ?? null;
        $googleMaps = $data['googleMaps'] ?? $data['google_maps'] ?? null;

        $hoaBank = $data['hoaBank'] ?? $data['hoa_bank'] ?? null;
        $hoaAccountName = $data['hoaAccountName'] ?? $data['hoa_account_name'] ?? null;
        $hoaAccountNr = $data['hoaAccountNr'] ?? $data['hoa_account_nr'] ?? null;
        $hoaEmail = $data['hoaEmail'] ?? $data['hoa_email'] ?? null;

        // Due day can come as hoaDueDay or hoa_due_date (legacy naming mismatch)
        $hoaDueDayRaw = $data['hoaDueDay'] ?? $data['hoa_due_day'] ?? $data['hoa_due_date'] ?? null;
        $hoaDueDay = ($hoaDueDayRaw === '' || $hoaDueDayRaw === null) ? null : (int) $hoaDueDayRaw;

        if (!$condoName) {
            return $this->json(['error' => 'Condo name is required'], 400);
        }
        if (!$city) {
            return $this->json(['error' => 'City is required'], 400);
        }

        $existing = $entityManager->getRepository(Condo::class)
            ->findOneBy(['condoName' => $condoName]);

        if ($existing) {
            return $this->json(['error' => 'Condo Name already exists'], 400);
        }

        $condo = new Condo();
        $condo->setCondoName($condoName);
        $condo->setCity($city);
        $condo->setDoorCode($doorCode);
        $condo->setNotes($notes);
        $condo->setGoogleMaps($googleMaps);
        $condo->setHoaBank($hoaBank);
        $condo->setHoaAccountName($hoaAccountName);
        $condo->setHoaAccountNr($hoaAccountNr);
        $condo->setHoaEmail($hoaEmail);
        $condo->setHoaDueDay($hoaDueDay);

        $entityManager->persist($condo);
        $entityManager->flush();

        return $this->json(['message' => 'Condo created', 'id' => $condo->getId()]);
    }

    #[Route('/api/condos/{id}', name: 'api_condos_show', methods: ['GET'])]
    public function show(int $id, EntityManagerInterface $entityManager): JsonResponse
    {
        $condo = $entityManager->getRepository(Condo::class)->find($id);

        if (!$condo) {
            return $this->json(['error' => 'Condo not found'], 404);
        }

        return $this->json([
            'id' => $condo->getId(),
            'condoName' => $condo->getCondoName(),
            'city' => $condo->getCity(),
            'doorCode' => $condo->getDoorCode(),
            'googleMaps' => $condo->getGoogleMaps(),
            'notes' => $condo->getNotes(),
            'hoaBank' => $condo->getHoaBank(),
            'hoaAccountName' => $condo->getHoaAccountName(),
            'hoaAccountNr' => $condo->getHoaAccountNr(),
            'hoaEmail' => $condo->getHoaEmail(),
            'hoaDueDay' => $condo->getHoaDueDay(),
        ]);
    }

    #[Route('/api/condos/{id}', name: 'api_condos_update', methods: ['PUT'])]
    public function update(int $id, Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $condo = $entityManager->getRepository(Condo::class)->find($id);

        if (!$condo) {
            return $this->json(['error' => 'Condo not found'], 404);
        }

        $data = json_decode($request->getContent(), true);

        $condo->setCity($data['city'] ?? $condo->getCity());
        $condo->setDoorCode($data['doorCode'] ?? $condo->getDoorCode());
        $condo->setNotes($data['notes'] ?? $condo->getNotes());
        $condo->setGoogleMaps($data['googleMaps'] ?? $condo->getGoogleMaps());
        $condo->setHoaBank($data['hoaBank'] ?? $condo->getHoaBank());
        $condo->setHoaAccountName($data['hoaAccountName'] ?? $condo->getHoaAccountName());
        $condo->setHoaAccountNr($data['hoaAccountNr'] ?? $condo->getHoaAccountNr());
        $condo->setHoaEmail($data['hoaEmail'] ?? $condo->getHoaEmail());
        $condo->setHoaDueDay(isset($data['hoaDueDay']) ? (int) $data['hoaDueDay'] : $condo->getHoaDueDay());

        $entityManager->flush();

        return $this->json(['message' => 'Condo updated']);
    }
}