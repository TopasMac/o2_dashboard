<?php

namespace App\Controller\Api;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProviderInterface;
use Doctrine\DBAL\Connection;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Custom provider for /api/booking_month_slices that JOINs all_bookings
 * to expose guestName, checkIn, and checkOut (and optional unitName).
 */
class BookingMonthSliceProvider implements ProviderInterface
{
    public function __construct(
        private readonly Connection $conn,
        private readonly RequestStack $requestStack,
    ) {}

    /**
     * @param Operation $operation
     * @param array<string,mixed> $uriVariables
     * @param array<string,mixed> $context
     * @return array<int,array<string,mixed>>|array<string,mixed>|null
     */
    public function provide(Operation $operation, array $uriVariables = [], array $context = []): object|array|null
    {
        // Read filters/order from the current request
        $req = $this->requestStack->getCurrentRequest();
        $yearMonth = $req?->query->get('yearMonth');
        $city      = $req?->query->get('city');
        $clientId  = $req?->query->getInt('clientId') ?: null;
        $unitId    = $req?->query->getInt('unitId') ?: null;

        // Ordering (support a few keys, default by checkIn asc)
        $order     = $req?->query->all('order') ?? [];
        $orderBy   = 'ab.check_in';
        $orderDir  = 'ASC';
        if (is_array($order)) {
            // example: ?order[checkIn]=desc
            if (isset($order['checkIn'])) {
                $orderBy  = 'ab.check_in';
                $orderDir = strtoupper($order['checkIn']) === 'DESC' ? 'DESC' : 'ASC';
            } elseif (isset($order['unitId'])) {
                $orderBy  = 'b.unit_id';
                $orderDir = strtoupper($order['unitId']) === 'DESC' ? 'DESC' : 'ASC';
            } elseif (isset($order['yearMonth'])) {
                $orderBy  = 'b.year_month';
                $orderDir = strtoupper($order['yearMonth']) === 'DESC' ? 'DESC' : 'ASC';
            }
        }

        $sql = [];
        $sql[] = 'SELECT';
        $sql[] = '  b.id                                    AS id,';
        $sql[] = '  b.booking_id                            AS bookingId,';
        $sql[] = '  b.unit_id                               AS unitId,';
        $sql[] = '  b.city                                   AS city,';
        $sql[] = '  b.source                                 AS source,';
        $sql[] = '  b.payment_method                         AS paymentMethod,';
        $sql[] = '  b.guest_type                             AS guestType,';
        $sql[] = '  b.year_month                             AS yearMonth,';
        $sql[] = '  b.month_start_date                       AS monthStartDate,';
        $sql[] = '  b.month_end_date                         AS monthEndDate,';
        $sql[] = '  b.nights_total                           AS nightsTotal,';
        $sql[] = '  b.nights_in_month                        AS nightsInMonth,';
        $sql[] = '  b.room_fee_in_month                      AS roomFeeInMonth,';
        $sql[] = '  b.payout_in_month                        AS payoutInMonth,';
        $sql[] = '  b.tax_in_month                           AS taxInMonth,';
        $sql[] = '  b.commission_base_in_month                AS commissionBaseInMonth,';
        $sql[] = '  b.net_payout_in_month                    AS netPayoutInMonth,';
        $sql[] = '  b.cleaning_fee_in_month                  AS cleaningFeeInMonth,';
        $sql[] = '  b.o2_commission_in_month                 AS o2CommissionInMonth,';
        $sql[] = '  b.owner_payout_in_month                  AS ownerPayoutInMonth,';
        // Enriched fields from all_bookings
        $sql[] = '  ab.guest_name                            AS guestName,';
        $sql[] = '  ab.check_in                              AS checkIn,';
        $sql[] = '  ab.check_out                             AS checkOut,';
        $sql[] = '  ab.unit_name                             AS unitName';
        $sql[] = 'FROM booking_month_slice b';
        $sql[] = 'LEFT JOIN all_bookings ab ON ab.id = b.booking_id';
        $sql[] = 'WHERE 1=1';

        $params = [];
        $types  = [];

        if ($yearMonth) {
            $sql[]            = 'AND b.year_month = :ym';
            $params[':ym']    = $yearMonth;
        }
        if ($city) {
            $sql[]            = 'AND b.city = :city';
            $params[':city']  = $city;
        }
        if ($clientId) {
            $sql[]               = 'AND b.client_id = :clientId';
            $params[':clientId'] = $clientId;
        }
        if ($unitId) {
            $sql[]             = 'AND b.unit_id = :unitId';
            $params[':unitId'] = $unitId;
        }

        $sql[] = sprintf('ORDER BY %s %s', $orderBy, $orderDir);

        $stmt = $this->conn->prepare(implode("\n", $sql));
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $rs = $stmt->executeQuery();
        $rows = $rs->fetchAllAssociative();

        // Ensure numeric strings for money fields (API consistency with existing frontend expectations)
        foreach ($rows as &$r) {
            foreach ([
                'roomFeeInMonth','payoutInMonth','taxInMonth','commissionBaseInMonth','netPayoutInMonth',
                'cleaningFeeInMonth','o2CommissionInMonth','ownerPayoutInMonth'
            ] as $k) {
                if (!array_key_exists($k, $r) || $r[$k] === null || $r[$k] === '') {
                    $r[$k] = '0.00';
                } else {
                    $r[$k] = number_format((float)$r[$k], 2, '.', '');
                }
            }
        }
        unset($r);

        // --- Enrich with Housekeepers cleaning info (hk_cleanings) ---
        // Build unit id set and date range from returned rows (using checkOut)
        $unitIds = [];
        $minCheckout = null; // 'Y-m-d'
        $maxCheckout = null; // 'Y-m-d'
        foreach ($rows as $rr) {
            if (!empty($rr['unitId'])) {
                $unitIds[(int)$rr['unitId']] = true;
            }
            if (!empty($rr['checkOut'])) {
                // normalize to 'Y-m-d'
                $d = substr((string)$rr['checkOut'], 0, 10);
                if ($d) {
                    if ($minCheckout === null || $d < $minCheckout) { $minCheckout = $d; }
                    if ($maxCheckout === null || $d > $maxCheckout) { $maxCheckout = $d; }
                }
            }
        }

        $hkIndex = [];
        if (!empty($unitIds) && $minCheckout !== null && $maxCheckout !== null) {
            $hkSql = [];
            $hkSql[] = 'SELECT id, unit_id AS unitId, checkout_date AS checkoutDate, status, o2_collected_fee AS expectedFee';
            $hkSql[] = 'FROM hk_cleanings';
            $hkSql[] = "WHERE cleaning_type = 'checkout'";
            $hkSql[] = '  AND checkout_date BETWEEN :d1 AND :d2';
            $hkSql[] = '  AND unit_id IN (' . implode(',', array_map('intval', array_keys($unitIds))) . ')';

            $hkStmt = $this->conn->prepare(implode("\n", $hkSql));
            $hkStmt->bindValue(':d1', $minCheckout);
            $hkStmt->bindValue(':d2', $maxCheckout);
            $hkRows = $hkStmt->executeQuery()->fetchAllAssociative();

            foreach ($hkRows as $h) {
                $u = (int)$h['unitId'];
                $d = (string)$h['checkoutDate']; // already Y-m-d
                $hkIndex[$u][$d] = [
                    'id' => (int)$h['id'],
                    'status' => (string)$h['status'],
                    'expectedFee' => isset($h['expectedFee']) && $h['expectedFee'] !== null && $h['expectedFee'] !== ''
                        ? number_format((float)$h['expectedFee'], 2, '.', '')
                        : null,
                ];
            }
        }

        // Attach `hk` object per row
        foreach ($rows as &$row) {
            $u = isset($row['unitId']) ? (int)$row['unitId'] : null;
            $d = !empty($row['checkOut']) ? substr((string)$row['checkOut'], 0, 10) : null;
            if ($u && $d && isset($hkIndex[$u][$d])) {
                $h = $hkIndex[$u][$d];
                $row['hk'] = [
                    'exists' => true,
                    'id' => $h['id'],
                    'status' => $h['status'],
                    'expectedFee' => $h['expectedFee'],
                ];
            } else {
                $row['hk'] = [
                    'exists' => false,
                    'id' => null,
                    'status' => null,
                    'expectedFee' => null,
                ];
            }
        }
        unset($row);

        return $rows;
    }
}