<?php

namespace App\Controller\Api;

use App\Entity\HKCleaningsReconcile;
use App\Entity\Unit;
use App\Service\HKReconcileService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/hk-reconcile')]
class HKCleaningsReconcileController extends AbstractController
{
    #[Route('', name: 'api_hk_reconcile_list', methods: ['GET'])]
    public function list(Request $request, HKReconcileService $reconcileService): JsonResponse
    {
        $month = (string) $request->query->get('month', '');
        $city  = (string) $request->query->get('city', 'Tulum');

        if ($month === '' || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            return $this->json(['error' => 'Invalid or missing month (YYYY-MM)'], 400);
        }

        try {
            $view = $reconcileService->getMonthView($month, $city);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (\Throwable $e) {
            return $this->json(['error' => 'exception', 'message' => $e->getMessage()], 500);
        }

        return $this->json([
            'ok' => true,
            'month' => $month,
            'city' => $city,
            // keep payload backward-compatible for the current frontend page:
            // `data` is the table rows.
            'data' => $view['rows'] ?? [],
            // extra month totals for later UI (optional to render now)
            'totals' => $view['totals'] ?? null,
        ]);
    }

    #[Route('', name: 'api_hk_reconcile_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], 400);
        }

        foreach (['month', 'unit_id', 'service_date', 'cleaning_cost'] as $f) {
            if (!isset($data[$f]) || $data[$f] === '' || $data[$f] === null) {
                return $this->json(['error' => "Missing field: $f"], 400);
            }
        }

        $month = (string) $data['month'];
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            return $this->json(['error' => 'Invalid month (YYYY-MM)'], 400);
        }

        $city = (string) ($data['city'] ?? 'Tulum');

        $unit = $em->getRepository(Unit::class)->find((int) $data['unit_id']);
        if (!$unit) {
            return $this->json(['error' => 'Invalid unit'], 400);
        }

        try {
            $serviceDate = new \DateTimeImmutable((string) $data['service_date']);
        } catch (\Throwable) {
            return $this->json(['error' => 'Invalid service_date (YYYY-MM-DD)'], 400);
        }

        $row = new HKCleaningsReconcile();
        $row->setCity($city);
        $row->setReportMonth($month);
        $row->setUnit($unit);
        $row->setServiceDate($serviceDate);
        $row->setCleaningCost((string) $data['cleaning_cost']);
        $row->setLaundryCost((string) ($data['laundry_cost'] ?? '0'));
        $row->setNotes($data['notes'] ?? null);

        $em->persist($row);
        $em->flush();

        return $this->json(['ok' => true, 'id' => $row->getId()]);
    }

    #[Route('/{id<\d+>}', name: 'api_hk_reconcile_update', methods: ['PUT'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        /** @var HKCleaningsReconcile|null $row */
        $row = $em->getRepository(HKCleaningsReconcile::class)->find($id);
        if (!$row) {
            return $this->json(['error' => 'Not found'], 404);
        }

        $data = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], 400);
        }

        if (isset($data['unit_id'])) {
            $unit = $em->getRepository(Unit::class)->find((int) $data['unit_id']);
            if (!$unit) {
                return $this->json(['error' => 'Invalid unit'], 400);
            }
            $row->setUnit($unit);
        }

        if (isset($data['service_date'])) {
            try {
                $row->setServiceDate(new \DateTimeImmutable((string) $data['service_date']));
            } catch (\Throwable) {
                return $this->json(['error' => 'Invalid service_date (YYYY-MM-DD)'], 400);
            }
        }

        if (isset($data['cleaning_cost'])) {
            $row->setCleaningCost((string) $data['cleaning_cost']);
        }
        if (isset($data['laundry_cost'])) {
            $row->setLaundryCost((string) $data['laundry_cost']);
        }
        if (array_key_exists('notes', $data)) {
            $row->setNotes($data['notes']);
        }

        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/{id<\d+>}', name: 'api_hk_reconcile_delete', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        /** @var HKCleaningsReconcile|null $row */
        $row = $em->getRepository(HKCleaningsReconcile::class)->find($id);
        if (!$row) {
            return $this->json(['ok' => true]);
        }

        $em->remove($row);
        $em->flush();

        return $this->json(['ok' => true]);
    }
}