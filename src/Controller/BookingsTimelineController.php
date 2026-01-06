<?php
namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Request;

class BookingsTimelineController extends AbstractController
{
    private Connection $conn;

    public function __construct(Connection $conn)
    {
        $this->conn = $conn;
    }

    #[Route('/api/bookings-timeline', name: 'api_bookings_timeline', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        // Optional filters for unit/time window/status (backward compatible)
        $unitId = (int) $request->query->get('unitId', 0);
        $start  = (string) $request->query->get('start', ''); // YYYY-MM-DD (optional)
        $end    = (string) $request->query->get('end', '');   // YYYY-MM-DD (optional)
        $status = (string) $request->query->get('status', '');

        $binds = [];
        $unitWhere = '';
        if ($unitId > 0) { $unitWhere = ' AND b.unit_id = :unitId '; $binds['unitId'] = $unitId; }

        $dateWhere = '';
        if ($start !== '' && $end !== '') {
            $dateWhere = ' AND b.check_in <= :end AND b.check_out >= :start ';
            $binds['start'] = $start;
            $binds['end']   = $end;
        }

        // Status filter semantics match calendar-unit:
        // - default (status empty): exclude Cancelled
        // - status=confirmed: treat as default (exclude Cancelled)
        // - status=all: no status filtering
        // - else: exact match (case-insensitive)
        $statusWhere = '';
        if ($status === '' || strtolower($status) === 'confirmed') {
            $statusWhere = " AND b.status <> 'Cancelled' ";
        } elseif (strtolower($status) === 'all') {
            $statusWhere = '';
        } else {
            $statusWhere = ' AND LOWER(b.status) = LOWER(:status) ';
            $binds['status'] = $status;
        }

        // Timeline needs: Airbnb/Private bookings (exclude Cancelled) + active Holds/Blocks.
        // We normalize "source" to one of: Airbnb | Private | Hold | Block for coloring on UI.
        // For Hold, we include only not-yet-expired (server NOW()) entries.
        $sql = "
            (
              SELECT 
                b.id,
                b.unit_id,
                u.type AS unit_type,
                b.unit_name,
                u.city AS city,
                b.guest_name,
                b.guests,
                b.check_in,
                b.check_out,
                b.status,
                b.confirmation_code,
                b.payout,
                b.cleaning_fee,
                b.notes,
                b.check_in_notes,
                b.check_out_notes,
                b.commission_base,
                b.commission_percent,
                b.payment_method,
                b.is_paid,
                b.guest_type,
                b.hold_expires_at,
                b.hold_policy,
                b.booking_date,
                b.source AS source,
                /* normalized source (for UI coloring / semantics) */
                CASE 
                  WHEN LOWER(b.guest_type) = 'hold'  THEN 'Hold'
                  WHEN LOWER(b.guest_type) = 'block' THEN 'Block'
                  ELSE b.source
                END AS source_normalized
              FROM all_bookings b
              LEFT JOIN unit u ON u.id = b.unit_id
              WHERE b.source IN ('Airbnb','Private','Owners2')
                AND b.status <> 'Cancelled'
                {$unitWhere}
                {$dateWhere}
                {$statusWhere}
            )
            UNION ALL
            (
              SELECT 
                b.id,
                b.unit_id,
                u.type AS unit_type,
                b.unit_name,
                u.city AS city,
                b.guest_name,
                b.guests,
                b.check_in,
                b.check_out,
                b.status,
                b.confirmation_code,
                b.payout,
                b.cleaning_fee,
                b.notes,
                b.check_in_notes,
                b.check_out_notes,
                b.commission_base,
                b.commission_percent,
                b.payment_method,
                b.is_paid,
                b.guest_type,
                b.hold_expires_at,
                b.hold_policy,
                b.booking_date,
                b.source AS source,
                CASE 
                  WHEN LOWER(b.guest_type) = 'hold'  THEN 'Hold'
                  WHEN LOWER(b.guest_type) = 'block' THEN 'Block'
                  ELSE b.source
                END AS source_normalized
              FROM all_bookings b
              LEFT JOIN unit u ON u.id = b.unit_id
              WHERE LOWER(b.guest_type) IN ('hold','block')
                AND (
                  LOWER(b.guest_type) = 'block'
                  OR (
                    LOWER(b.guest_type) = 'hold'
                    AND (b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())
                  )
                )
                {$unitWhere}
                {$dateWhere}
                {$statusWhere}
            )
            ORDER BY unit_name, check_in
        ";
        $rows = $this->conn->fetchAllAssociative($sql, $binds);

        return new JsonResponse($rows);
    }

    #[Route('/api/bookings/calendar-unit', name: 'api_bookings_calendar_unit', methods: ['GET'], priority: 100)]
    public function calendarByUnit(Request $request): JsonResponse
    {
        $unitId = (int) $request->query->get('unitId', 0);
        $start  = (string) $request->query->get('start', ''); // YYYY-MM-DD (optional)
        $end    = (string) $request->query->get('end', '');   // YYYY-MM-DD (optional)
        $status = (string) $request->query->get('status', '');

        if ($unitId <= 0) {
            return new JsonResponse(['error' => 'Missing required param: unitId'], 400);
        }

        // Default rolling window if not provided: from first day of (current month - 2) to last day of (current month + 6)
        if ($start === '' || $end === '') {
            $monthsBack  = (int) ($request->query->get('monthsBack', 2));
            $monthsAhead = (int) ($request->query->get('monthsAhead', 6));

            $now = new \DateTimeImmutable('now');
            $firstOfThisMonth = $now->modify('first day of this month')->setTime(0, 0, 0);
            $startDt = $firstOfThisMonth->modify(sprintf('-%d months', max(0, $monthsBack)));
            $endDt   = $firstOfThisMonth->modify(sprintf('+%d months', max(0, $monthsAhead)))->modify('last day of this month')->setTime(23, 59, 59);

            // Optional safety clamp: max 12 months window total
            $intervalMonths = ($monthsBack + $monthsAhead + 1);
            if ($intervalMonths > 12) {
                $monthsAhead = max(0, 11 - $monthsBack);
                $endDt   = $firstOfThisMonth->modify(sprintf('+%d months', $monthsAhead))->modify('last day of this month')->setTime(23,59,59);
            }

            $start = $startDt->format('Y-m-d');
            $end   = $endDt->format('Y-m-d');
        }

        $binds = [
            'unitId' => $unitId,
            'start'  => $start,
            'end'    => $end,
        ];

        // Status filter semantics:
        // - default (status empty): exclude Cancelled
        // - status=all: no status filtering
        // - status=<value>: exact match (case-insensitive)
        $statusWhere = '';
        if ($status === '' || strtolower($status) === 'confirmed') {
            // Mobile used to send status=confirmed; treat it as "exclude Cancelled"
            $statusWhere = " AND b.status <> 'Cancelled' ";
        } elseif (strtolower($status) === 'all') {
            // no filter
            $statusWhere = '';
        } else {
            $statusWhere = ' AND LOWER(b.status) = LOWER(:status) ';
            $binds['status'] = $status;
        }

        // Overlap filter: (check_in <= end) AND (check_out >= start)
        $sql = "
            SELECT 
              b.id,
              b.source,
              b.unit_name,
              u.city AS city,
              b.guest_name,
              b.check_in,
              b.check_out,
              b.booking_date,
              b.commission_base,
              b.status,
              b.confirmation_code,
              b.payout,
              b.cleaning_fee,
              b.notes,
              b.check_in_notes,
              b.check_out_notes,
              b.commission_percent,
              b.payment_method,
              b.is_paid,
              b.unit_id,
              b.guests,
              u.type AS unit_type
            FROM all_bookings b
            LEFT JOIN unit u ON u.id = b.unit_id
            WHERE b.unit_id = :unitId
              AND b.check_in <= :end
              AND b.check_out >= :start
              $statusWhere
            ORDER BY b.check_in
        ";

        $rows = $this->conn->fetchAllAssociative($sql, $binds);
        return new JsonResponse($rows);
    }
}