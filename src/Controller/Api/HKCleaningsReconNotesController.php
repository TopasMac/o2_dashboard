<?php

namespace App\Controller\Api;

use App\Entity\HKCleaningsReconNotes;
use App\Repository\HKCleaningsReconNotesRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/hk-reconcile/notes')]
class HKCleaningsReconNotesController extends AbstractController
{
    #[Route('', name: 'api_hk_reconcile_notes_list', methods: ['GET'])]
    public function list(Request $request, HKCleaningsReconNotesRepository $repo): JsonResponse
    {
        $month = (string) $request->query->get('month', '');
        $city  = (string) $request->query->get('city', 'Tulum');

        $hkCleaningIdParam = $request->query->get('hk_cleaning_id', null);
        $hkCleaningId = null;
        if ($hkCleaningIdParam !== null && $hkCleaningIdParam !== '') {
            if (!is_numeric($hkCleaningIdParam)) {
                return $this->json(['ok' => false, 'error' => 'invalid_hk_cleaning_id', 'message' => 'hk_cleaning_id must be numeric'], 400);
            }
            $hkCleaningId = (int) $hkCleaningIdParam;
            if ($hkCleaningId <= 0) {
                return $this->json(['ok' => false, 'error' => 'invalid_hk_cleaning_id', 'message' => 'hk_cleaning_id must be > 0'], 400);
            }
        }

        $unitIdParam = $request->query->get('unit_id', null);
        $unitId = null;
        if ($unitIdParam !== null && $unitIdParam !== '') {
            if (!is_numeric($unitIdParam)) {
                return $this->json(['ok' => false, 'error' => 'invalid_unit_id', 'message' => 'unit_id must be numeric'], 400);
            }
            $unitId = (int) $unitIdParam;
            if ($unitId <= 0) {
                return $this->json(['ok' => false, 'error' => 'invalid_unit_id', 'message' => 'unit_id must be > 0'], 400);
            }
        }

        if ($month === '' || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            return $this->json(['ok' => false, 'error' => 'invalid_month', 'message' => 'Invalid or missing month (YYYY-MM)'], 400);
        }

        $cityTrim = trim($city);
        if ($cityTrim === '') {
            $cityTrim = 'Tulum';
        }

        try {
            $items = $repo->findByCityMonthAndOptionalCleaning($cityTrim, $month, $hkCleaningId, $unitId);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => 'exception', 'message' => $e->getMessage()], 500);
        }

        $data = array_map(static function ($it) {
            /** @var HKCleaningsReconNotes $it */
            return [
                'id' => $it->getId(),
                'city' => $it->getCity(),
                'month' => $it->getMonth(),
                'hk_cleaning_id' => $it->getHkCleaningId(),
                'unit_id' => method_exists($it, 'getUnitId') ? $it->getUnitId() : null,
                'text' => $it->getItemText(),
                'status' => $it->getStatus(),
                'resolution' => $it->getResolution(),
                'resolved_at' => $it->getResolvedAt()?->format('Y-m-d H:i:s'),
                'resolved_by_user_id' => $it->getResolvedByUserId(),
                'created_at' => $it->getCreatedAt()->format('Y-m-d H:i:s'),
                'updated_at' => $it->getUpdatedAt()->format('Y-m-d H:i:s'),
            ];
        }, $items);

        return $this->json([
            'ok' => true,
            'city' => $cityTrim,
            'month' => $month,
            'data' => $data,
        ]);
    }

    #[Route('/{id<\d+>}', name: 'api_hk_reconcile_notes_update', methods: ['PUT'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $payload = [];
        try {
            $payload = $request->toArray();
        } catch (\Throwable $e) {
            // keep empty
        }

        /** @var HKCleaningsReconNotes|null $row */
        $row = $em->getRepository(HKCleaningsReconNotes::class)->find($id);
        if (!$row) {
            return $this->json([
                'ok' => false,
                'error' => 'not_found',
                'message' => 'Note item not found',
            ], Response::HTTP_NOT_FOUND);
        }

        $text = array_key_exists('text', $payload) ? (string)$payload['text'] : null;
        $status = array_key_exists('status', $payload) ? (string)$payload['status'] : null;
        $resolution = array_key_exists('resolution', $payload) ? $payload['resolution'] : null;
        $unitId = array_key_exists('unit_id', $payload) ? $payload['unit_id'] : null;

        if ($text !== null) {
            $t = trim($text);
            if ($t === '') {
                return $this->json(['ok' => false, 'error' => 'invalid_text', 'message' => 'text cannot be empty'], 400);
            }
            $row->setItemText($t);
        }

        if ($resolution !== null) {
            $r = trim((string)$resolution);
            $row->setResolution($r === '' ? null : $r);
        }

        if (array_key_exists('unit_id', $payload)) {
            if ($unitId === null || $unitId === '') {
                $row->setUnitId(null);
            } else {
                if (!is_numeric($unitId)) {
                    return $this->json(['ok' => false, 'error' => 'invalid_unit_id', 'message' => 'unit_id must be numeric'], 400);
                }
                $u = (int) $unitId;
                if ($u <= 0) {
                    return $this->json(['ok' => false, 'error' => 'invalid_unit_id', 'message' => 'unit_id must be > 0'], 400);
                }
                $row->setUnitId($u);
            }
        }

        if ($status !== null) {
            $s = strtolower(trim($status));
            if (!in_array($s, ['open', 'done'], true)) {
                return $this->json(['ok' => false, 'error' => 'invalid_status', 'message' => 'status must be open or done'], 400);
            }

            if ($s === 'done') {
                $user = method_exists($this, 'getUser') ? $this->getUser() : null;
                $uid = null;
                if ($user && method_exists($user, 'getId') && is_int($user->getId())) {
                    $uid = $user->getId();
                }
                $row->markDone($uid);
            } else {
                $row->markOpen();
            }
        } else {
            // still touch timestamps when editing text/resolution
            $row->touchUpdatedAt();
        }

        try {
            $em->flush();
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => 'exception', 'message' => $e->getMessage()], 500);
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'id' => $row->getId(),
                'city' => $row->getCity(),
                'month' => $row->getMonth(),
                'hk_cleaning_id' => $row->getHkCleaningId(),
                'unit_id' => $row->getUnitId(),
                'text' => $row->getItemText(),
                'status' => $row->getStatus(),
                'resolution' => $row->getResolution(),
                'resolved_at' => $row->getResolvedAt()?->format('Y-m-d H:i:s'),
                'resolved_by_user_id' => $row->getResolvedByUserId(),
                'created_at' => $row->getCreatedAt()->format('Y-m-d H:i:s'),
                'updated_at' => $row->getUpdatedAt()->format('Y-m-d H:i:s'),
            ],
        ]);
    }

    #[Route('', name: 'api_hk_reconcile_notes_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $payload = [];
        try {
            $payload = $request->toArray();
        } catch (\Throwable $e) {
            // keep empty
        }

        $month = (string)($payload['month'] ?? '');
        $city  = (string)($payload['city'] ?? 'Tulum');
        $text  = (string)($payload['text'] ?? '');

        $hkCleaningId = null;
        if (array_key_exists('hk_cleaning_id', $payload) && $payload['hk_cleaning_id'] !== null && $payload['hk_cleaning_id'] !== '') {
            if (!is_numeric($payload['hk_cleaning_id'])) {
                return $this->json(['ok' => false, 'error' => 'invalid_hk_cleaning_id', 'message' => 'hk_cleaning_id must be numeric'], 400);
            }
            $hkCleaningId = (int) $payload['hk_cleaning_id'];
            if ($hkCleaningId <= 0) {
                return $this->json(['ok' => false, 'error' => 'invalid_hk_cleaning_id', 'message' => 'hk_cleaning_id must be > 0'], 400);
            }
        }

        $unitId = null;
        if (array_key_exists('unit_id', $payload) && $payload['unit_id'] !== null && $payload['unit_id'] !== '') {
            if (!is_numeric($payload['unit_id'])) {
                return $this->json(['ok' => false, 'error' => 'invalid_unit_id', 'message' => 'unit_id must be numeric'], 400);
            }
            $unitId = (int) $payload['unit_id'];
            if ($unitId <= 0) {
                return $this->json(['ok' => false, 'error' => 'invalid_unit_id', 'message' => 'unit_id must be > 0'], 400);
            }
        }

        if ($month === '' || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            return $this->json(['ok' => false, 'error' => 'invalid_month', 'message' => 'Invalid or missing month (YYYY-MM)'], 400);
        }

        $cityTrim = trim($city);
        if ($cityTrim === '') {
            $cityTrim = 'Tulum';
        }

        $textTrim = trim($text);
        if ($textTrim === '') {
            return $this->json(['ok' => false, 'error' => 'invalid_text', 'message' => 'text is required'], 400);
        }

        $row = new HKCleaningsReconNotes();
        $row->setCity($cityTrim);
        $row->setMonth($month);
        $row->setItemText($textTrim);
        $row->setStatus('open');
        if ($hkCleaningId !== null) {
            $row->setHkCleaningId($hkCleaningId);
        }
        if ($unitId !== null) {
            $row->setUnitId($unitId);
        }

        if (array_key_exists('resolution', $payload)) {
            $r = trim((string)($payload['resolution'] ?? ''));
            $row->setResolution($r === '' ? null : $r);
        }

        try {
            $em->persist($row);
            $em->flush();
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => 'exception', 'message' => $e->getMessage()], 500);
        }

        return $this->json([
            'ok' => true,
            'data' => [
                'id' => $row->getId(),
                'city' => $row->getCity(),
                'month' => $row->getMonth(),
                'hk_cleaning_id' => $row->getHkCleaningId(),
                'unit_id' => $row->getUnitId(),
                'text' => $row->getItemText(),
                'status' => $row->getStatus(),
                'resolution' => $row->getResolution(),
                'resolved_at' => $row->getResolvedAt()?->format('Y-m-d H:i:s'),
                'resolved_by_user_id' => $row->getResolvedByUserId(),
                'created_at' => $row->getCreatedAt()->format('Y-m-d H:i:s'),
                'updated_at' => $row->getUpdatedAt()->format('Y-m-d H:i:s'),
            ],
        ], Response::HTTP_CREATED);
    }

    #[Route('/{id<\d+>}', name: 'api_hk_reconcile_notes_delete', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        /** @var HKCleaningsReconNotes|null $row */
        $row = $em->getRepository(HKCleaningsReconNotes::class)->find($id);
        if (!$row) {
            return $this->json([
                'ok' => false,
                'error' => 'not_found',
                'message' => 'Note item not found',
            ], Response::HTTP_NOT_FOUND);
        }

        try {
            $em->remove($row);
            $em->flush();
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => 'exception', 'message' => $e->getMessage()], 500);
        }

        return $this->json(['ok' => true, 'deleted_id' => $id]);
    }
}