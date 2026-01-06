<?php

namespace App\Controller;

use App\Service\Reports\MonthWorkflowService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Lightweight month workflow summary endpoint.
 *
 * Returns a per‑unit summary for the given YYYY-MM without fetching
 * heavy per‑unit report bundles. Designed to be consumed by the
 * Month Workflow drawer.
 */
final class MonthWorkflowController extends AbstractController
{
    #[Route('/api/month-workflow', name: 'api_month_workflow', methods: ['GET'])]
    public function monthWorkflow(Request $request, MonthWorkflowService $service): JsonResponse
    {
        $ym = trim((string) $request->query->get('yearMonth', ''));
        if ($ym === '' || !preg_match('/^\d{4}-\d{2}$/', $ym)) {
            return $this->json([
                'ok' => false,
                'error' => 'Missing or invalid yearMonth. Expected format YYYY-MM.',
            ], 400);
        }

        $items = $service->getMonthWorkflow($ym);

        // Remove documentId and publicUrl from report if present
        foreach ($items as &$item) {
            if (isset($item['report'])) {
                unset($item['report']['documentId'], $item['report']['publicUrl']);
            }
        }
        unset($item);

        return $this->json([
            'ok'        => true,
            'yearMonth' => $ym,
            'units'     => $items,
        ]);
    }
}