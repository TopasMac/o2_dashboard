<?php

namespace App\State;

use App\Dto\ClientMonthlySummary;
use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProviderInterface;
use Doctrine\DBAL\Connection;

final class ClientMonthlySummaryProvider implements ProviderInterface
{
    public function __construct(private readonly Connection $conn) {}

    public function provide(Operation $operation, array $uriVariables = [], array $context = []): array
    {
        $req = $context['request'] ?? null;
        $ym  = $req?->query->get('yearMonth');
        $clientId = $req?->query->get('clientId');
        $unitId   = $req?->query->get('unitId');
        $city     = $req?->query->get('city');

        if (!\is_string($ym) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) {
            throw new \InvalidArgumentException("Query param 'yearMonth' (YYYY-MM) is required.");
        }

        // Build query safely with QueryBuilder
        $qb = $this->conn->createQueryBuilder();
        $qb->select(
                'COUNT(DISTINCT b.`booking_id`) AS bookings',
                "COALESCE(SUM(CASE WHEN b.`guest_type` <> 'owner' THEN b.`nights_in_month` ELSE 0 END), 0) AS nights",
                "COALESCE(
                    SUM(CASE WHEN b.`guest_type` <> 'owner' THEN b.`room_fee_in_month` ELSE 0 END)
                    / NULLIF(COUNT(DISTINCT IF(b.`guest_type` <> 'owner', b.`booking_id`, NULL)), 0),
                    0
                ) AS avgRoomFeePerNight",
                'COALESCE(SUM(b.`tax_in_month`), 0) AS taxTotal',
                'COALESCE(SUM(b.`cleaning_fee_in_month`), 0) AS cleaningTotal',
                'COALESCE(SUM(b.`commission_base_in_month`), 0) AS commissionBaseTotal',
                'COALESCE(SUM(b.`o2_commission_in_month`), 0) AS o2CommissionTotal',
                'COALESCE(SUM(b.`owner_payout_in_month`), 0) AS ownerPayoutTotal',
                "COALESCE(SUM(CASE WHEN u.`payment_type` = 'OWNERS2' THEN b.`owner_payout_in_month` ELSE b.`payout_in_month` END), 0) AS payoutReservasTotal",
                "COALESCE(SUM(CASE WHEN u.`payment_type` = 'CLIENT' AND b.`source` = 'Airbnb' THEN (b.`cleaning_fee_in_month` + b.`o2_commission_in_month`) ELSE 0 END), 0) AS airbnbClientDebits",
                "COALESCE(SUM(CASE WHEN u.`payment_type` = 'CLIENT' AND b.`source` = 'Private' THEN b.`owner_payout_in_month` ELSE 0 END), 0) AS privateClientCredits",
                "(COALESCE(SUM(CASE WHEN b.`guest_type` <> 'owner' THEN b.`nights_in_month` ELSE 0 END), 0) / DAY(LAST_DAY(CONCAT(:ym, '-01')))) * 100 AS occupationPct"
            )
            ->from('`booking_month_slice`', 'b')
            ->innerJoin('b', '`unit`', 'u', 'u.`id` = b.`unit_id`')
            ->where('b.`year_month` = :ym')
            ->setParameter('ym', $ym);

        if ($clientId !== null && $clientId !== '') {
            $qb->andWhere('b.`client_id` = :clientId')
               ->setParameter('clientId', (int) $clientId);
        }
        if ($unitId !== null && $unitId !== '') {
            $qb->andWhere('b.`unit_id` = :unitId')
               ->setParameter('unitId', (int) $unitId);
        }
        if ($city !== null && $city !== '') {
            $qb->andWhere('b.`city` LIKE :city')
               ->setParameter('city', '%' . $city . '%');
        }

        $row = $qb->executeQuery()->fetchAssociative() ?: [
            'bookings' => 0,
            'nights' => 0,
            'avgRoomFeePerNight' => 0,
            'taxTotal' => 0,
            'cleaningTotal' => 0,
            'commissionBaseTotal' => 0,
            'o2CommissionTotal' => 0,
            'ownerPayoutTotal' => 0,
            'payoutReservasTotal' => 0,
            'airbnbClientDebits' => 0,
            'privateClientCredits' => 0,
            'occupationPct' => 0,
        ];

        // ---- Compute Gastos Total (Client) from unit_transactions for this unit & month ----
        $gastosFloat = 0.0;
        $gastosTotalClient = '0.00';
        if ($unitId !== null && $unitId !== '') {
            $startDt = new \DateTimeImmutable($ym . '-01');
            $endDt   = $startDt->modify('last day of this month');

            $qb2 = $this->conn->createQueryBuilder();
            $qb2->select('COALESCE(SUM(ut.`amount`), 0) AS total')
                ->from('`unit_transactions`', 'ut')
                ->where('ut.`unit_id` = :unitId')
                ->andWhere("ut.`type` = 'Gasto'")
                ->andWhere("ut.`cost_center` = 'Client'")
                ->andWhere('ut.`date` BETWEEN :start AND :end')
                ->setParameter('unitId', (int) $unitId)
                ->setParameter('start', $startDt->format('Y-m-d'))
                ->setParameter('end',   $endDt->format('Y-m-d'));

            $row2 = $qb2->executeQuery()->fetchAssociative();

            $utTotal = (float)($row2['total'] ?? 0);

            // Include HK transactions charged to Client in the same month
            $qb3 = $this->conn->createQueryBuilder();
            $qb3->select('COALESCE(SUM(hk.`charged`), 0) AS total')
                ->from('`hktransactions`', 'hk')
                ->where('hk.`unit_id` = :unitId')
                ->andWhere("hk.`cost_centre` = 'Client'")
                ->andWhere('hk.`date` BETWEEN :start AND :end')
                ->setParameter('unitId', (int) $unitId)
                ->setParameter('start', $startDt->format('Y-m-d'))
                ->setParameter('end',   $endDt->format('Y-m-d'));

            $row3 = $qb3->executeQuery()->fetchAssociative();
            $hkTotal = (float)($row3['total'] ?? 0);
            $gastosFloat = $utTotal + $hkTotal;
            $gastosTotalClient = number_format($utTotal + $hkTotal, 2, '.', '');
        }

        // ---- Compute Abonos Total (Client) from unit_transactions for this unit & month ----
        $abonosTotalClient = '0.00';
        $abonosFloat = 0.0;
        if ($unitId !== null && $unitId !== '') {
            $startDt = new \DateTimeImmutable($ym . '-01');
            $endDt   = $startDt->modify('last day of this month');

            $qb4 = $this->conn->createQueryBuilder();
            $qb4->select('COALESCE(SUM(ut.`amount`), 0) AS total')
                ->from('`unit_transactions`', 'ut')
                ->where('ut.`unit_id` = :unitId')
                ->andWhere("ut.`type` = 'Abono'")
                ->andWhere("ut.`cost_center` = 'Client'")
                ->andWhere('ut.`date` BETWEEN :start AND :end')
                ->setParameter('unitId', (int) $unitId)
                ->setParameter('start', $startDt->format('Y-m-d'))
                ->setParameter('end',   $endDt->format('Y-m-d'));

            $row4 = $qb4->executeQuery()->fetchAssociative();
            $abonosFloat = (float)($row4['total'] ?? 0);
            $abonosTotalClient = number_format($abonosFloat, 2, '.', '');
        }

        // ---- Compute Monthly Earnings and Closing Balance ----

        // Determine payment_type for this unit when unitId is provided
        $paymentType = null;
        if ($unitId !== null && $unitId !== '') {
            $qbPt = $this->conn->createQueryBuilder();
            $qbPt->select('u.`payment_type` AS pt')
                ->from('`unit`', 'u')
                ->where('u.`id` = :uid')
                ->setParameter('uid', (int) $unitId);
            $ptRow = $qbPt->executeQuery()->fetchAssociative();
            if ($ptRow && isset($ptRow['pt'])) {
                $paymentType = (string) $ptRow['pt'];
            }
        }

        // CLIENT-mode components aggregated from booking_month_slice
        $airbnbClientDebitsFloat   = (float)($row['airbnbClientDebits'] ?? 0);
        $privateClientCreditsFloat = (float)($row['privateClientCredits'] ?? 0);

        $payoutReservasFloat = (float)($row['payoutReservasTotal'] ?? 0);

        if ($paymentType === 'CLIENT') {
            // For CLIENT units:
            // Monthly Earnings = (- AirBnB debits) + (Private credits) + Abonos - Gastos
            $monthlyEarningsFloat = (-1 * $airbnbClientDebitsFloat) + $privateClientCreditsFloat + $abonosFloat - $gastosFloat;
        } else {
            // Default / OWNERS2 logic remains:
            // Monthly Earnings = Payout Reservas + Abonos - Gastos
            $monthlyEarningsFloat = $payoutReservasFloat + $abonosFloat - $gastosFloat;
        }

        // Carry-over = balance at end of previous month (start balance of this month)
        $carryOverFloat = 0.0;
        if ($unitId !== null && $unitId !== '') {
            $startDt = new \DateTimeImmutable($ym . '-01');
            $prevEnd = $startDt->modify('last day of previous month');

            $qbPrev = $this->conn->createQueryBuilder();
            $qbPrev->select('ubl.`balance_after` AS bal')
                ->from('`unit_balance_ledger`', 'ubl')
                ->where('ubl.`unit_id` = :unitId')
                ->andWhere('ubl.`txn_date` <= :prevEnd')
                ->orderBy('ubl.`txn_date`', 'DESC')
                ->addOrderBy('ubl.`id`', 'DESC')
                ->setMaxResults(1)
                ->setParameter('unitId', (int) $unitId)
                ->setParameter('prevEnd', $prevEnd->format('Y-m-d'));

            $prevRow = $qbPrev->executeQuery()->fetchAssociative();
            if ($prevRow && isset($prevRow['bal'])) {
                $carryOverFloat = (float) $prevRow['bal'];
            }
        }

        $closingBalanceFloat = $carryOverFloat + $monthlyEarningsFloat;

        $dto = new ClientMonthlySummary();
        $dto->yearMonth = $ym;
        $dto->clientId = $clientId !== null && $clientId !== '' ? (int) $clientId : null;
        $dto->unitId   = $unitId   !== null && $unitId   !== '' ? (int) $unitId   : null;
        $dto->city     = $city     !== null && $city     !== '' ? (string) $city  : null;
        $dto->paymentType = $paymentType;

        $dto->bookings = (int) $row['bookings'];
        $dto->nights   = (int) $row['nights'];

        // Cast to strings with 2 decimals to match your DECIMAL(12,2)
        $dto->avgRoomFeePerNight  = number_format((float)$row['avgRoomFeePerNight'], 2, '.', '');
        $dto->taxTotal            = number_format((float)$row['taxTotal'], 2, '.', '');
        $dto->cleaningTotal       = number_format((float)$row['cleaningTotal'], 2, '.', '');
        $dto->commissionBaseTotal = number_format((float)$row['commissionBaseTotal'], 2, '.', '');
        $dto->o2CommissionTotal   = number_format((float)$row['o2CommissionTotal'], 2, '.', '');
        $dto->ownerPayoutTotal    = number_format((float)$row['ownerPayoutTotal'], 2, '.', '');
        $dto->payoutReservasTotal = number_format((float)$row['payoutReservasTotal'], 2, '.', '');
        $dto->occupationPct       = number_format((float)$row['occupationPct'], 0, '.', '');
        $dto->airbnbClientDebits   = number_format($airbnbClientDebitsFloat, 2, '.', '');
        $dto->privateClientCredits = number_format($privateClientCreditsFloat, 2, '.', '');

        $dto->gastosTotalClient = $gastosTotalClient;

        $dto->abonosTotalClient = $abonosTotalClient;

        // clientNetResult = ownerPayoutTotal − gastosTotalClient + abonosTotalClient
        $ownerPayoutFloat = (float)($row['ownerPayoutTotal'] ?? 0);
        $clientNetResultFloat = $ownerPayoutFloat - $gastosFloat + $abonosFloat;
        $dto->clientNetResult = number_format($clientNetResultFloat, 2, '.', '');

        // Monthly Earnings = Payout Reservas + Abonos - Gastos
        $dto->monthlyEarnings = number_format($monthlyEarningsFloat, 2, '.', '');
        // Closing Balance = Carry-over (prev month end) + Monthly Earnings
        $dto->closingBalance = number_format($closingBalanceFloat, 2, '.', '');

        return [$dto];
    }
}