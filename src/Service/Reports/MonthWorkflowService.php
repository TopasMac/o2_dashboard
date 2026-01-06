<?php

namespace App\Service\Reports;

use App\Repository\UnitRepository;
use App\Repository\OwnerReportCycleRepository;
use App\Repository\UnitBalanceLedgerRepository;

/**
 * Provides lightweight per-unit summaries for the Month Workflow drawer.
 */
class MonthWorkflowService
{
    public function __construct(
        private UnitRepository $units,
        private OwnerReportCycleRepository $ownerReportCycleRepo,
        private UnitBalanceLedgerRepository $unitBalanceLedgerRepo
    ) {}

    /**
     * Return a summary for all active units for the given yearMonth.
     *
     * @param string $yearMonth Format YYYY-MM
     * @return array<int,array<string,mixed>>
     */
    public function getMonthWorkflow(string $yearMonth): array
    {
        // Preload month-scoped data in two queries (O(1) instead of O(n))
        $cyclesByUnit   = $this->ownerReportCycleRepo->fetchMapByMonth($yearMonth);        // [unit_id => row]
        $balancesByUnit = $this->unitBalanceLedgerRepo->fetchClosingBalancesForMonth($yearMonth); // [unit_id => balance_after]

        // Load active units once
        $allUnits = $this->units->createQueryBuilder('u')
            ->andWhere('u.status = :active')->setParameter('active', 'Active')
            ->orderBy('u.unitName', 'ASC')
            ->getQuery()
            ->getResult();

        $items = [];
        foreach ($allUnits as $unit) {
            $unitId   = method_exists($unit, 'getId') ? (int) $unit->getId() : null;
            if (!$unitId) {
                continue;
            }
            $unitName = method_exists($unit, 'getUnitName') ? $unit->getUnitName() : null;
            $paymentType = method_exists($unit, 'getPaymentType') ? $unit->getPaymentType() : null;

            // Owner report / payment / email, all from owner_report_cycle (if row exists)
            $cycle = $cyclesByUnit[$unitId] ?? null;
            $reportIssued = $cycle ? !empty($cycle['report_issued_at']) : false;

            $paymentStatus = $cycle && isset($cycle['payment_status']) ? (string)$cycle['payment_status'] : 'PENDING';
            // Only treat PAID as "issued" per your rule
            $paymentIssued = (strtoupper($paymentStatus) === 'PAID');

            $emailSent = $cycle && isset($cycle['email_status'])
                ? (strtoupper((string)$cycle['email_status']) === 'SENT')
                : false;
            // Keep nullable for now; not required by the drawer
            $emailAt = $cycle['email_at'] ?? null;

            // Closing balance from unit_balance_ledger (entry_type = 'Month Report')
            $closingBalance = $balancesByUnit[$unitId] ?? null;

            // Client bank account (if available)
            $bankAccount = null;
            if (method_exists($unit, 'getClient') && $unit->getClient()) {
                $client = $unit->getClient();
                if (method_exists($client, 'getBankAccount')) {
                    $bankAccount = $client->getBankAccount();
                } elseif (property_exists($client, 'bankAccount')) {
                    $bankAccount = $client->bankAccount;
                }
            }

            $items[] = [
                'unitId'         => $unitId,
                'unitName'       => $unitName,
                'paymentType'    => $paymentType,
                'bankAccount'    => $bankAccount,
                'closingBalance' => $closingBalance,
                'report'         => [
                    'issued' => $reportIssued,
                ],
                'payment'        => [
                    'issued' => $paymentIssued,
                    'status' => $paymentStatus,
                ],
                'email'          => [
                    'sent' => $emailSent,
                    'at'   => $emailAt,
                ],
            ];
        }

        return $items;
    }
}