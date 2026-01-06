<?php

namespace App\Controller;

use App\Service\HKCleaningManager;
use App\Service\HKCleaningRateResolver;
use Doctrine\DBAL\Connection;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class HKCleaningController
{
    private HKCleaningManager $manager;
    private Connection $db;
    private HKCleaningRateResolver $rateResolver;

    public function __construct(
        HKCleaningManager $manager,
        Connection $db,
        HKCleaningRateResolver $rateResolver
    ) {
        $this->manager = $manager;
        $this->db = $db;
        $this->rateResolver = $rateResolver;
    }

    #[Route('/api/hk-cleanings/bulk', name: 'api_hk_cleanings_bulk', methods: ['POST'])]
    public function bulk(Request $request): JsonResponse
    {
        try {
            $payload = json_decode($request->getContent(), true);
            if (!is_array($payload)) {
                return new JsonResponse(['ok' => false, 'error' => 'Invalid JSON body'], 400);
            }

            $items = $payload['items'] ?? null;
            if (!is_array($items) || count($items) === 0) {
                return new JsonResponse(['ok' => false, 'error' => 'Missing required field: items[]'], 400);
            }

            $withLedger = (bool)($payload['createLedgerForTulum'] ?? true);

            // Normalize items array (only keep supported keys)
            $normalized = [];
            foreach ($items as $i) {
                if (!is_array($i)) { continue; }
                $normalized[] = [
                    'unitId'         => $i['unitId']         ?? null,
                    'city'           => $i['city']           ?? null,
                    'checkoutDate'   => $i['checkoutDate']   ?? null, // expected Y-m-d
                    'cleaningType'   => $i['cleaningType']   ?? null, // will default to 'checkout' in service
                    'bookingId'      => $i['bookingId']      ?? null,
                    'reservationCode'=> $i['reservationCode']?? null,
                    'status'         => 'done', // checkbox implies completion
                ];
            }

            $result = $this->manager->bulkCreate($normalized, $withLedger);

            return new JsonResponse(array_merge(['ok' => true], $result));
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    #[Route('/api/hk-cleaning-rate', name: 'api_hk_cleaning_rate_get', methods: ['GET'])]
    public function getRate(Request $request): JsonResponse
    {
        $unitId = $request->query->get('unitId');
        if ($unitId === null || !is_numeric($unitId)) {
            return new JsonResponse(['ok' => false, 'error' => 'Missing or invalid unitId'], 400);
        }
        $city = $request->query->get('city');
        try {
            if (is_string($city) && $city !== '') {
                $rate = $this->rateResolver->getLatestForUnitCity((int)$unitId, $city);
                return new JsonResponse(['ok' => true, 'rate' => $rate]);
            }
            $rate = $this->rateResolver->getLatestForUnit((int)$unitId);
            return new JsonResponse(['ok' => true, 'rate' => $rate]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    #[Route('/api/hk-cleaning-rate', name: 'api_hk_cleaning_rate_post', methods: ['POST'])]
    public function saveRate(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);
            if (!is_array($data)) {
                return new JsonResponse(['ok' => false, 'error' => 'Invalid JSON body'], 400);
            }
            // Validate required fields
            if (!isset($data['unit_id']) || !is_numeric($data['unit_id'])) {
                return new JsonResponse(['ok' => false, 'error' => 'Missing or invalid unit_id'], 400);
            }
            $unitId = (int)$data['unit_id'];
            // amount: can be null or numeric >= 0
            $amount = isset($data['amount']) ? $data['amount'] : null;
            if ($amount !== null && (!is_numeric($amount) || $amount < 0)) {
                return new JsonResponse(['ok' => false, 'error' => 'Invalid amount'], 400);
            }
            // date: required, normalize to Y-m-d
            $date = $data['date'] ?? date('Y-m-d');
            $dateObj = \DateTime::createFromFormat('Y-m-d', $date);
            if (!$dateObj) {
                return new JsonResponse(['ok' => false, 'error' => 'Invalid date, expected Y-m-d'], 400);
            }
            $date = $dateObj->format('Y-m-d');
            // effective_from: default to date if not provided
            $effectiveFrom = $data['effective_from'] ?? $date;
            $effectiveFromObj = \DateTime::createFromFormat('Y-m-d', $effectiveFrom);
            if (!$effectiveFromObj) {
                return new JsonResponse(['ok' => false, 'error' => 'Invalid effective_from, expected Y-m-d'], 400);
            }
            $effectiveFrom = $effectiveFromObj->format('Y-m-d');
            // effective_to: optional, can be null
            $effectiveTo = $data['effective_to'] ?? null;
            if ($effectiveTo !== null) {
                $effectiveToObj = \DateTime::createFromFormat('Y-m-d', $effectiveTo);
                if (!$effectiveToObj) {
                    return new JsonResponse(['ok' => false, 'error' => 'Invalid effective_to, expected Y-m-d'], 400);
                }
                $effectiveTo = $effectiveToObj->format('Y-m-d');
            }
            // city: string or null
            $city = isset($data['city']) ? (is_string($data['city']) ? $data['city'] : null) : null;
            // notes: string or null
            $notes = isset($data['notes']) ? (is_string($data['notes']) ? $data['notes'] : null) : null;

            $cityStr = $city ?? '';

            $this->rateResolver->setRate(
                $unitId,
                $cityStr,
                $amount === null ? 0.0 : (float)$amount,
                new \DateTimeImmutable($effectiveFrom),
                $notes
            );

            $rate = $this->rateResolver->getLatestForUnitCity($unitId, $cityStr);

            return new JsonResponse(['ok' => true, 'rate' => $rate]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }
}