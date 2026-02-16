<?php

namespace App\Controller\Reports;

use App\Service\Reports\HKMonthlySummaryService;
use App\Service\Reports\O2MonthlySummaryService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Unified monthly results endpoint with scope.
 *
 * GET /api/reports/monthly-results?year=YYYY&month=M&scope=owners2|hk|all
 * Optional:
 *  - includeBookings=1 (passed to Owners2 service if supported)
 *  - city=Playa del Carmen|Tulum|... (applies to HK only; "All" disables)
 */
class O2MonthlyResultsController extends AbstractController
{
    #[Route('/api/reports/monthly-results', name: 'api_reports_monthly_results', methods: ['GET'])]
    public function monthlyResults(
        Request $request,
        O2MonthlySummaryService $o2Svc,
        HKMonthlySummaryService $hkSvc
    ): Response {
        $scope = strtolower((string)($request->query->get('scope') ?? 'owners2'));
        if (!in_array($scope, ['owners2', 'hk', 'all'], true)) {
            $scope = 'owners2';
        }

        // year/month parsing (same rules as other controllers)
        $yearParam  = $request->query->get('year');
        $monthParam = $request->query->get('month');

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

        // Optional filters
        $includeBookings = (string)($request->query->get('includeBookings') ?? '0');
        $includeBookingsBool = in_array($includeBookings, ['1', 'true', 'yes'], true);

        $cityParam  = $request->query->get('city');
        $city = null;
        if ($cityParam !== null && $cityParam !== '' && strtolower((string)$cityParam) !== 'all') {
            $city = (string)$cityParam;
        }

        if ($yearOut === null || $monthOut === null) {
            return $this->json([
                'ok' => true,
                'scope' => $scope,
                'year' => null,
                'month' => null,
                'yearMonth' => null,
                'data' => null,
            ]);
        }

        // Helpers
        $buildHkBlock = function () use ($hkSvc, $yearOut, $monthOut, $city): array {
            $rows = $hkSvc->getCleaningsByMonth($yearOut, $monthOut, $city);
            $hrRows = $hkSvc->getHrByMonth($yearOut, $monthOut);
            $hrRowsWithDeductions = $hkSvc->getHrByMonth($yearOut, $monthOut, true);

            $charged = 0.0;
            $paid = 0.0;
            foreach ($rows as $r) {
                $charged += (float)($r['charged'] ?? 0);
                $paid += (float)($r['paid'] ?? 0);
            }

            // Sum ONLY salary and advance for HR cash total
            $hrSalary = 0.0;
            $hrAdvances = 0.0;
            foreach ($hrRows as $r) {
                $type = strtolower((string)($r['type'] ?? ''));
                $amt = (float)($r['amount'] ?? 0);

                if ($type === 'salary') {
                    $hrSalary += $amt;
                } elseif ($type === 'advance') {
                    $hrAdvances += $amt;
                }
            }
            $hrAmount = $hrSalary + $hrAdvances;

            // Playa cleaning results (fixed HR cost for Cleaners only; salary + deduction; ignore advances)
            $playaCharged = 0.0;
            $playaLaundry = 0.0;
            foreach ($rows as $r) {
                $rawCity = strtolower(trim((string)($r['city'] ?? '')));
                $isPlaya = ($rawCity !== '' && str_contains($rawCity, 'playa'));

                $catId = (int)($r['category_id'] ?? 0);
                if ($isPlaya) {
                    if ($catId === 7 || $catId === 8) {
                        $playaCharged += (float)($r['charged'] ?? 0);
                    }
                    if ($catId === 14) {
                        $playaLaundry += (float)($r['paid'] ?? 0);
                    }
                }
            }

            $playaFixedHr = 0.0;
            foreach ($hrRowsWithDeductions as $r) {
                $cc = (string)($r['cost_centre'] ?? '');
                $area = (string)($r['area'] ?? '');
                $type = strtolower((string)($r['type'] ?? ''));
                if ($cc === 'HK_Playa' && $area === 'Cleaner' && ($type === 'salary' || $type === 'deduction')) {
                    $playaFixedHr += (float)($r['amount'] ?? 0);
                }
            }

            $playaResult = $playaCharged - $playaLaundry - $playaFixedHr;

            // Tulum cleanings (simple: charged - paid on categories 7/8/14)
            $tulumCharged = 0.0;
            $tulumPaid = 0.0;
            foreach ($rows as $r) {
                $rawCity = strtolower(trim((string)($r['city'] ?? '')));
                $isTulum = ($rawCity !== '' && str_contains($rawCity, 'tulum'));

                $catId = (int)($r['category_id'] ?? 0);
                if ($isTulum && ($catId === 7 || $catId === 8 || $catId === 14)) {
                    $tulumCharged += (float)($r['charged'] ?? 0);
                    $tulumPaid += (float)($r['paid'] ?? 0);
                }
            }
            $tulumResult = $tulumCharged - $tulumPaid;

            return [
                'data' => $rows,
                'hr' => [
                    'rows' => $hrRows,
                    'summary' => [
                        'count' => count($hrRows),
                        'amount' => round($hrAmount, 2),
                        'salary' => round($hrSalary, 2),
                        'advances' => round($hrAdvances, 2),
                    ],
                ],
                'summary' => [
                    'count' => count($rows),
                    'charged' => round($charged, 2),
                    'paid' => round($paid, 2),
                    'balance' => round(($charged - $paid), 2),
                    'hr_amount' => round($hrAmount, 2),
                    'hr_salary' => round($hrSalary, 2),
                    'hr_advances' => round($hrAdvances, 2),
                    'playa_cleanings' => [
                        'charged' => round($playaCharged, 2),
                        'laundry' => round($playaLaundry, 2),
                        'fixed_hr_cost' => round($playaFixedHr, 2),
                        'result' => round($playaResult, 2),
                    ],
                    'tulum_cleanings' => [
                        'charged' => round($tulumCharged, 2),
                        'paid' => round($tulumPaid, 2),
                        'result' => round($tulumResult, 2),
                    ],
                ],
            ];
        };

        $extractOwners2Net = static function (array $o2Payload): float {
            // O2MonthlySummaryService payload does not provide a single "net" field.
            // Compute a pragmatic Owners2 monthly net:
            //   net = commissions (commissionTotals.overall)
            //         + sum(o2transactions income)
            //         - sum(o2transactions expense)
            //         - sum(employeeLedger amounts)

            $net = 0.0;

            // commissions
            if (isset($o2Payload['commissionTotals']['overall'])) {
                $net += (float)$o2Payload['commissionTotals']['overall'];
            }

            // o2transactions
            if (isset($o2Payload['transactions']) && is_array($o2Payload['transactions'])) {
                foreach ($o2Payload['transactions'] as $tx) {
                    $type = strtolower((string)($tx['type'] ?? ''));
                    $amt = (float)($tx['amount'] ?? 0);

                    if ($type === 'income' || $type === 'ingreso' || $type === 'in') {
                        $net += $amt;
                    } elseif ($type === 'expense' || $type === 'gasto' || $type === 'out') {
                        $net -= $amt;
                    }
                }
            }

            // salaries / advances (Owners2)
            if (isset($o2Payload['employeeLedger']) && is_array($o2Payload['employeeLedger'])) {
                foreach ($o2Payload['employeeLedger'] as $r) {
                    $net -= (float)($r['amount'] ?? 0);
                }
            }

            return round($net, 2);
        };

        // Scope routing
        if ($scope === 'hk') {
            $hkBlock = $buildHkBlock();

            return $this->json([
                'ok' => true,
                'scope' => 'hk',
                'year' => $yearOut,
                'month' => $monthOut,
                'yearMonth' => $yearMonth,
                'data' => $hkBlock,
            ]);
        }

        if ($scope === 'owners2') {
            $o2 = $o2Svc->getMonthlySummary($yearOut, $monthOut, [
                'includeBookings' => $includeBookingsBool,
            ]);

            return $this->json([
                'ok' => true,
                'scope' => 'owners2',
                'year' => $yearOut,
                'month' => $monthOut,
                'yearMonth' => $yearMonth,
                'data' => $o2,
            ]);
        }

        // scope=all
        $o2 = $o2Svc->getMonthlySummary($yearOut, $monthOut, [
            'includeBookings' => $includeBookingsBool,
        ]);

        $hkBlock = $buildHkBlock();

        $o2Net = $extractOwners2Net(is_array($o2) ? $o2 : []);
        $hkNet = (float)($hkBlock['summary']['balance'] ?? 0);

        $allSummary = [
            'owners2_net' => $o2Net,
            'hk_balance' => round($hkNet, 2),
            'net' => round($o2Net + $hkNet, 2),
        ];

        return $this->json([
            'ok' => true,
            'scope' => 'all',
            'year' => $yearOut,
            'month' => $monthOut,
            'yearMonth' => $yearMonth,
            'data' => [
                'owners2' => $o2,
                'housekeepers' => $hkBlock,
                'summary' => $allSummary,
            ],
        ]);
    }
}
