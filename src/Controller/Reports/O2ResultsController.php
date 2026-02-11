<?php

namespace App\Controller\Reports;

use App\Service\Reports\O2MonthlySummaryService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class O2ResultsController extends AbstractController
{
    #[Route('/api/reports/o2/monthly-summary', name: 'api_reports_o2_monthly_summary', methods: ['GET'])]
    public function monthlySummary(Request $request, O2MonthlySummaryService $service): JsonResponse
    {
        $year = (int)($request->query->get('year') ?? date('Y'));
        $month = (int)($request->query->get('month') ?? date('n'));

        $includeBookings = filter_var(
            $request->query->get('includeBookings', false),
            FILTER_VALIDATE_BOOLEAN
        );

        try {
            $data = $service->getMonthlySummary($year, $month, [
                'includeBookings' => $includeBookings,
            ]);
            return $this->json($data);
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Unable to compute monthly summary',
                'message' => $e->getMessage(),
            ], 400);
        }
    }
}