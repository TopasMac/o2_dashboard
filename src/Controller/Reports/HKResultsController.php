<?php

namespace App\Controller\Reports;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use App\Service\Reports\HKMonthlySummaryService;
use Symfony\Component\HttpFoundation\Request;

class HKResultsController extends AbstractController
{
    #[Route('/api/reports/hk/monthly-summary', name: 'api_reports_hk_monthly_summary', methods: ['GET'])]
    public function monthlySummary(Request $request, HKMonthlySummaryService $svc): Response
    {
        $yearParam  = $request->query->get('year');
        $monthParam = $request->query->get('month');

        $cityParam  = $request->query->get('city');
        $city = null;
        if ($cityParam !== null && $cityParam !== '' && strtolower((string)$cityParam) !== 'all') {
            $city = (string)$cityParam;
        }

        if ($yearParam !== null && $monthParam !== null && $yearParam !== '' && $monthParam !== '') {
            $year  = (int)$yearParam;
            $month = (int)$monthParam;
            if ($year >= 2000 && $year <= 2100 && $month >= 1 && $month <= 12) {
                $yearOut = $year;
                $monthOut = $month;
            } else {
                $yearOut = null;
                $monthOut = null;
            }
        } else {
            $now = new \DateTimeImmutable('now');
            $yearOut = (int) $now->format('Y');
            $monthOut = (int) $now->format('n');
        }

        $yearMonth = ($yearOut !== null && $monthOut !== null)
            ? sprintf('%04d-%02d', $yearOut, $monthOut)
            : null;

        $rows = [];
        if ($yearOut !== null && $monthOut !== null) {
            $rows = $svc->getCleaningsByMonth($yearOut, $monthOut, $city);
        }

        $charged = 0.0;
        $paid = 0.0;
        foreach ($rows as $r) {
            $charged += (float)($r['charged'] ?? 0);
            $paid += (float)($r['paid'] ?? 0);
        }

        $summary = [
            'count' => count($rows),
            'charged' => $charged,
            'paid' => $paid,
            'balance' => ($charged - $paid),
        ];

        return $this->json([
            'ok' => true,
            'year' => $yearOut,
            'month' => $monthOut,
            'yearMonth' => $yearMonth,
            'data' => $rows,
            'summary' => $summary,
        ]);
    }
}