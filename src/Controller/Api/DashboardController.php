<?php

namespace App\Controller\Api;

use App\Service\DashboardAlertsService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class DashboardController
{
    #[Route('/api/dashboard/month-earnings', name: 'api_dashboard_month_earnings', methods: ['GET'])]
    public function monthEarnings(Request $request, EntityManagerInterface $em): JsonResponse
    {
        // Resolve yearMonth (YYYY-MM) and optional city
        $yearMonth = $request->query->get('yearMonth') ?: (new \DateTimeImmutable('today'))->format('Y-m');
        $city      = $request->query->get('city'); // optional exact match

        $conn = $em->getConnection();

        // --- TOTAL directly from booking_month_slice (no join) ---
        $params = ['ym' => $yearMonth];
        $sqlTotal = "
            SELECT ROUND(COALESCE(SUM(bms.o2_commission_in_month), 0), 2) AS total
            FROM booking_month_slice bms
            WHERE bms.year_month = :ym
        ";
        if ($city) {
            $sqlTotal .= " AND bms.city = :city";
            $params['city'] = $city;
        }
        $total = (float) ($conn->fetchOne($sqlTotal, $params) ?? 0);

        // --- BY CITY breakdown (grouped). Keep existing behavior: no city filter here ---
        $sqlByCity = "
            SELECT COALESCE(bms.city, 'Unknown') AS city,
                   ROUND(COALESCE(SUM(bms.o2_commission_in_month), 0), 2) AS total
            FROM booking_month_slice bms
            WHERE bms.year_month = :ym
            GROUP BY COALESCE(bms.city, 'Unknown')
            ORDER BY total DESC
        ";
        $byCityRows = $conn->fetchAllAssociative($sqlByCity, ['ym' => $yearMonth]) ?: [];

        $byCity = [];
        foreach ($byCityRows as $r) {
            $label = ($r['city'] !== null && $r['city'] !== '') ? (string)$r['city'] : 'Unknown';
            $byCity[$label] = (float) $r['total'];
        }

        return new JsonResponse([
            'yearMonth' => $yearMonth,
            'filters'   => ['city' => $city],
            'total'     => $total,
            'byCity'    => $byCity,
        ]);
    }

    #[Route('/api/dashboard/alerts', name: 'api_dashboard_alerts', methods: ['GET'])]
    public function alerts(DashboardAlertsService $alertsService, Security $security): JsonResponse
    {
        $user = $security->getUser();
        $data = $alertsService->getAlertsForDashboard($user);

        return new JsonResponse($data);
    }
}