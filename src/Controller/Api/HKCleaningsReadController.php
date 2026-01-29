<?php

namespace App\Controller\Api;

use App\Service\HKCleaningReadService;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class HKCleaningsReadController extends AbstractController
{
    public function __construct(private HKCleaningReadService $read)
    {
    }

    #[Route('/api/hk-cleanings', name: 'api_hk_cleanings_list', methods: ['GET'])]
    public function list(Request $req, ManagerRegistry $doctrine): JsonResponse
    {
        $opts = [
            'start'    => $req->query->get('start'),
            'end'      => $req->query->get('end'),
            'city'     => $req->query->get('city'),
            'unitId'   => $req->query->get('unitId'),
            'status'   => $req->query->get('status', 'any'),
            'search'   => $req->query->get('search'),
            'page'     => (int) $req->query->get('page', 1),
            'pageSize' => (int) $req->query->get('pageSize', 25),
            'sort'     => $req->query->get('sort', 'checkout_date'),
            'dir'      => $req->query->get('dir', 'asc'),
        ];

        try {
            $result = $this->read->list($opts);

            $conn = $doctrine->getConnection();
            $unitsSql = "SELECT u.id, u.unit_name, u.city, u.status, u.cleaning_fee AS unit_cleaning_fee FROM unit u WHERE u.status = 'Active' ORDER BY u.unit_name ASC";
            $units = $conn->fetchAllAssociative($unitsSql);

            return new JsonResponse([
                'ok' => true,
                'data' => $result['rows'] ?? [],
                'total' => $result['total'] ?? 0,
                'page' => $result['page'] ?? 1,
                'pageSize' => $result['pageSize'] ?? 50,
                'units' => $units,
            ]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    #[Route('/api/hk-cleanings/units', name: 'api_hk_cleanings_units', methods: ['GET'])]
    public function units(Request $req, ManagerRegistry $doctrine): JsonResponse
    {
        try {
            $status = $req->query->get('status');
            $city   = $req->query->get('city');

            $where = [];
            $params = [];
            if ($status !== null && $status !== '') {
                $where[] = 'LOWER(u.status) = LOWER(:status)';
                $params['status'] = $status;
            }
            if ($city !== null && $city !== '') {
                $where[] = 'u.city = :city';
                $params['city'] = $city;
            }
            $sql = 'SELECT u.id, u.unit_name, u.city, u.status, u.cleaning_fee AS unit_cleaning_fee FROM unit u';
            if (!empty($where)) {
                $sql .= ' WHERE ' . implode(' AND ', $where);
            }
            $sql .= ' ORDER BY u.unit_name ASC';

            $conn = $doctrine->getConnection();
            $rows = $conn->fetchAllAssociative($sql, $params);

            return new JsonResponse([
                'ok' => true,
                'data' => $rows,
            ]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }
    #[Route('/api/hk-cleanings/active-units', name: 'api_hk_cleanings_active_units', methods: ['GET'])]
    public function activeUnits(Request $req, ManagerRegistry $doctrine): JsonResponse
    {
        try {
            // Optional filters
            $city  = $req->query->get('city');
            $month = $req->query->get('month'); // YYYY-MM

            // If month is provided, we pick the rate row effective on the first day of that month.
            // Otherwise, we pick the most recent row effective today.
            $asOf = null;
            if ($month !== null && $month !== '') {
                // Basic validation: YYYY-MM
                if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
                    return new JsonResponse([
                        'ok' => false,
                        'error' => 'Invalid month. Expected YYYY-MM',
                    ], 400);
                }
                $asOf = $month . '-01';
            } else {
                $asOf = (new \DateTimeImmutable('today'))->format('Y-m-d');
            }

            $where = ["LOWER(u.status) = 'active'"];
            $params = ['asOf' => $asOf];

            if ($city !== null && $city !== '') {
                $where[] = 'u.city = :city';
                $params['city'] = $city;
            }

            // Pick the single best (most recent) rate row for each unit as-of $asOf
            $sql = "
                SELECT
                    u.id,
                    u.unit_name,
                    u.city,
                    u.status,
                    u.cleaning_fee AS unit_cleaning_fee,
                    r.amount AS cleaning_cost,
                    r.effective_from,
                    r.effective_to
                FROM unit u
                LEFT JOIN hk_unit_cleaning_rate r
                  ON r.id = (
                    SELECT r2.id
                    FROM hk_unit_cleaning_rate r2
                    WHERE r2.unit_id = u.id
                      AND r2.effective_from <= :asOf
                      AND (r2.effective_to IS NULL OR r2.effective_to >= :asOf)
                    ORDER BY r2.effective_from DESC, r2.id DESC
                    LIMIT 1
                  )
                WHERE " . implode(' AND ', $where) . "
                ORDER BY u.city ASC, u.unit_name ASC
            ";

            $conn = $doctrine->getConnection();
            $rows = $conn->fetchAllAssociative($sql, $params);

            return new JsonResponse([
                'ok' => true,
                'asOf' => $asOf,
                'data' => $rows,
            ]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }
    #[Route('/api/hk-cleanings/months', name: 'api_hk_cleanings_months', methods: ['GET'])]
    public function months(Request $req, ManagerRegistry $doctrine): JsonResponse
    {
        try {
            $city   = $req->query->get('city');
            $status = $req->query->get('status');
            $limit  = (int) $req->query->get('limit', 36); // last N months, default 36

            // Build SQL to fetch distinct YYYY-MM from hk_cleaning, optionally filtered by unit city/status
            $where = [];
            $params = [];
            if ($city !== null && $city !== '') {
                $where[] = 'u.city = :city';
                $params['city'] = $city;
            }
            if ($status !== null && $status !== '' && strtolower($status) !== 'any') {
                $where[] = 'LOWER(u.status) = LOWER(:status)';
                $params['status'] = $status;
            }

            // Core query: distinct months (YYYY-MM) from checkout_date
            // NOTE: assumes hk_cleaning has unit_id and checkout_date columns
            $sql  = "SELECT DISTINCT DATE_FORMAT(hc.checkout_date, '%Y-%m') AS ym
                     FROM hk_cleanings hc
                     LEFT JOIN unit u ON u.id = hc.unit_id";
            if (!empty($where)) {
                $sql .= ' WHERE ' . implode(' AND ', $where);
            }
            $sql .= ' ORDER BY ym DESC';
            if ($limit > 0) {
                $sql .= ' LIMIT ' . (int) $limit;
            }

            $conn = $doctrine->getConnection();
            $rows = $conn->fetchAllAssociative($sql, $params);

            // Map to UI-friendly options like "11.Nov 25"
            $out = [];
            foreach ($rows as $r) {
                $ym = $r['ym'];
                if (!$ym) continue;
                [$y, $m] = explode('-', $ym);
                $yy = substr($y, -2);
                $mon = (int) $m;
                $abbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][$mon - 1] ?? $m;
                $label = $mon . '.' . $abbr . ' ' . $yy;
                $out[] = ['value' => $ym, 'label' => $label];
            }

            return new JsonResponse([
                'ok' => true,
                'data' => $out,
            ]);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'Server error',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }
}