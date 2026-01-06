<?php

namespace App\Controller\Api;

use App\Service\HousekeepingQueryService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class HKSummaryController
{
    public function __construct(private HousekeepingQueryService $query)
    {
    }

    #[Route('/api/housekeepers/summary', name: 'api_housekeepers_summary', methods: ['GET'])]
    public function summary(Request $request): JsonResponse
    {
        $start = (string) $request->query->get('start', '');
        $end   = (string) $request->query->get('end', '');
        $city  = $request->query->get('city');
        if ($city !== null) { $city = (string) $city; }

        if ($start === '' || $end === '') {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Missing required query params: start, end (YYYY-MM-DD)'
            ], 400);
        }

        try {
            $data = $this->query->getSummary($start, $end, $city ?: null);
            return new JsonResponse(['ok' => true, 'data' => $data]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }
}