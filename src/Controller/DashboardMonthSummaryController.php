<?php

namespace App\Controller;

use App\Service\Reports\DashboardMonthSummaryService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Single-call dashboard month summary endpoint.
 *
 * Example:
 *   GET /api/month-summary?yearMonth=2025-09
 */
final class DashboardMonthSummaryController extends AbstractController
{
    #[Route('/api/month-summary', name: 'api_month_summary', methods: ['GET'])]
    public function monthSummary(Request $request, DashboardMonthSummaryService $service): JsonResponse
    {
        $ym = trim((string) $request->query->get('yearMonth', ''));
        if ($ym === '' || !preg_match('/^\d{4}-\d{2}$/', $ym)) {
            return $this->json([
                'ok' => false,
                'error' => 'Missing or invalid yearMonth. Expected format YYYY-MM.',
            ], 400);
        }

        // Reviews filter defaults: only consider checkOut in month, source=Airbnb, status=Past
        // Allow optional overrides via query params if ever needed.
        $reviewsSource = (string) $request->query->get('reviewsSource', 'Airbnb');
        $reviewsStatus = (string) $request->query->get('reviewsStatus', 'Past');
        $options = [
            'reviews' => [
                'source' => $reviewsSource,
                'status' => $reviewsStatus,
            ],
        ];

        try {
            // TODO: next step will wire $options into the service signature and logic.
            // $data = $service->getDashboardMonthSummary($ym, $options);
            $data = $service->getDashboardMonthSummary($ym);
            // Include the effective filters in the response meta so frontend can rely on them.
            if (is_array($data)) {
                $data['_meta']['reviewsFilters'] = $options['reviews'];
            }
            return $this->json($data);
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Failed to build month summary',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}