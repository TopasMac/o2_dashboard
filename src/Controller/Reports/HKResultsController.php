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

        if ($yearParam !== null && $monthParam !== null && $yearParam !== '' && $monthParam !== '') {
            $year  = (int)$yearParam;
            $month = (int)$monthParam;
            if ($year >= 2000 && $year <= 2100 && $month >= 1 && $month <= 12) {
                $yearOut = $year;
                $monthOut = $month;
                $yearMonth = sprintf('%04d-%02d', $yearOut, $monthOut);
                $rows = $svc->getTransactionsByMonth($year, $month);
            } else {
                $rows = [];
                $yearOut = null;
                $monthOut = null;
                $yearMonth = null;
            }
        } else {
            $now = new \DateTimeImmutable('now');
            $yearOut = (int) $now->format('Y');
            $monthOut = (int) $now->format('n');
            $yearMonth = sprintf('%04d-%02d', $yearOut, $monthOut);
            $rows = $svc->getTransactionsByMonth($yearOut, $monthOut);
        }

        return $this->json([
            'ok' => true,
            'year' => $yearOut,
            'month' => $monthOut,
            'yearMonth' => $yearMonth,
            'data' => $rows,
        ]);
    }
}