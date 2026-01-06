<?php

namespace App\Service;

use App\Entity\Unit;
use App\Repository\UnitTransactionsRepository;

class ServicesPaymentStatusService
{
    public function __construct(
        private readonly UnitTransactionsRepository $txRepo,
    ) {
    }

    /**
     * Compute the service payment status for a given Unit and year-month (YYYY-MM).
     *
     * This is a pure-domain version of the logic in ServicePaymentCheckController::__invoke,
     * returning an array that can be used both by API controllers and by the dashboard
     * alerts service.
     */
    public function getStatusForUnitYearMonth(Unit $unit, string $yearMonth): array
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            throw new \InvalidArgumentException('yearMonth must be in YYYY-MM format');
        }

        // Month window
        try {
            $start = new \DateTimeImmutable($yearMonth . '-01 00:00:00');
            $end = $start->modify('first day of next month');
        } catch (\Throwable $e) {
            throw new \InvalidArgumentException('Invalid yearMonth');
        }

        // Expected matrix from Unit flags
        $expected = [
            'HOA'      => (int)($unit->getHoa() ?? 0) === 1,
            'Internet' => (int)($unit->getInternet() ?? 0) === 1,
            'Water'    => (int)($unit->getWater() ?? 0) === 1,
            'CFE'      => (int)($unit->getCfe() ?? 0) === 1,
        ];

        // CFE cadence logic
        $cfePeriod = method_exists($unit, 'getCfePeriod') ? ($unit->getCfePeriod() ?? 'Monthly') : 'Monthly';
        $cfeStartingMonth = method_exists($unit, 'getCfeStartingMonth') ? $unit->getCfeStartingMonth() : null;
        if ($cfeStartingMonth !== null) {
            $cfeStartingMonth = (int)$cfeStartingMonth;
        }
        $cfeIsDueThisMonth = false;
        if ($expected['CFE']) {
            if ($cfePeriod === 'Monthly') {
                $cfeIsDueThisMonth = true;
            } else { // BiMonthly
                // Prefer explicit anchor month when available; otherwise infer from last paid
                if ($cfeStartingMonth && $cfeStartingMonth >= 1 && $cfeStartingMonth <= 12) {
                    $currentMonth = (int)$start->format('n'); // 1-12
                    // Due on months where (current - starting) is even (2-month cadence)
                    $cfeIsDueThisMonth = ((($currentMonth + 12 - $cfeStartingMonth) % 2) === 0);
                } else {
                    // Infer the cadence from the most recent CFE payment:
                    // if last paid exists, due every 2 months from that date; if absent, mark as "unknown".
                    $lastCfePaidOn = $this->findLastPaidDate($unit, 'CFE');
                    if ($lastCfePaidOn) {
                        $monthsDiff = ($start->format('Y') - (int)$lastCfePaidOn->format('Y')) * 12
                                    + ((int)$start->format('m') - (int)$lastCfePaidOn->format('m'));
                        $cfeIsDueThisMonth = ($monthsDiff % 2) === 0; // every 2 months from last paid month
                    } else {
                        // Unknown schedule; we’ll flag as unknown rather than error
                        $cfeIsDueThisMonth = null; // null means unknown
                    }
                }
            }
        }

        // What was paid this month? (Category = Pago de Servicios)
        $paid = [
            'HOA'      => $this->existsPaymentThisMonth($unit, $start, $end, ['HOA']),
            'Internet' => $this->existsPaymentThisMonth($unit, $start, $end, ['Internet']),
            'Water'    => $this->existsPaymentThisMonth($unit, $start, $end, ['Aguakan', 'Water']),
            'CFE'      => $this->existsPaymentThisMonth($unit, $start, $end, ['CFE']),
        ];

        // How much was paid this month? (sum of amounts for matching descriptions)
        $paidAmounts = [
            'HOA'      => $this->sumPaymentsThisMonth($unit, $start, $end, ['HOA']),
            'Internet' => $this->sumPaymentsThisMonth($unit, $start, $end, ['Internet']),
            'Water'    => $this->sumPaymentsThisMonth($unit, $start, $end, ['Aguakan', 'Water']),
            'CFE'      => $this->sumPaymentsThisMonth($unit, $start, $end, ['CFE']),
        ];

        $paidIds = [
            'HOA'      => $this->findPaymentIdsThisMonth($unit, $start, $end, ['HOA']),
            'Internet' => $this->findPaymentIdsThisMonth($unit, $start, $end, ['Internet']),
            'Water'    => $this->findPaymentIdsThisMonth($unit, $start, $end, ['Aguakan', 'Water']),
            'CFE'      => $this->findPaymentIdsThisMonth($unit, $start, $end, ['CFE']),
        ];

        $paidDetails = [
            'HOA'      => $this->findPaymentThisMonth($unit, $start, $end, ['HOA']),
            'Internet' => $this->findPaymentThisMonth($unit, $start, $end, ['Internet']),
            'Water'    => $this->findPaymentThisMonth($unit, $start, $end, ['Aguakan']),
            'CFE'      => $this->findPaymentThisMonth($unit, $start, $end, ['CFE']),
        ];

        // Last paid on (anytime, for context)
        $lastPaidOn = [
            'HOA'      => $this->findLastPaidDate($unit, 'HOA'),
            'Internet' => $this->findLastPaidDate($unit, 'Internet'),
            'Water'    => $this->findLastPaidDate($unit, 'Aguakan|Water', true),
            'CFE'      => $this->findLastPaidDate($unit, 'CFE'),
        ];

        // Determine missing
        $missing = [];

        // HOA / Internet / Water: monthly if enabled
        foreach (['HOA', 'Internet', 'Water'] as $svc) {
            if ($expected[$svc] && !$paid[$svc]) {
                $missing[] = $svc;
            }
        }

        // CFE: conditional
        if ($expected['CFE']) {
            if ($cfeIsDueThisMonth === true && !$paid['CFE']) {
                $missing[] = 'CFE';
            }
        }

        // Internet / HOA / Water / CFE expected amount comparison and warnings
        $internetEnabled = $expected['Internet'];
        $hoaEnabled      = $expected['HOA'];

        // Internet deadline & overdue flags (from unit.internet_deadline)
        $internetDueDay = null;
        $internetOverdueThisMonth = false;

        // HOA due-day & overdue flags (from condo.hoa_due_day)
        $hoaDueDay = null;
        $hoaOverdueThisMonth = false;

        // Water deadline & overdue flags (from unit.water_deadline)
        $waterDueDay = null;
        $waterOverdueThisMonth = false;

        // CFE due-day & overdue flags (from unit.cfe_payment_day)
        $cfeDueDay = null;
        $cfeOverdueThisMonth = false;

        // Read expected amounts from Unit (supporting multiple possible getter names)
        $internetExpectedAmount = null;
        if ($internetEnabled) {
            if (method_exists($unit, 'getInternetCost') && $unit->getInternetCost() !== null) {
                $internetExpectedAmount = (float)$unit->getInternetCost();
            } elseif (method_exists($unit, 'getInternetAmount') && $unit->getInternetAmount() !== null) {
                $internetExpectedAmount = (float)$unit->getInternetAmount();
            } elseif (method_exists($unit, 'getInternetFee') && $unit->getInternetFee() !== null) {
                $internetExpectedAmount = (float)$unit->getInternetFee();
            }
        }

        $hoaExpectedAmount = null;
        if ($hoaEnabled) {
            if (method_exists($unit, 'getHoaAmount') && $unit->getHoaAmount() !== null) {
                $hoaExpectedAmount = (float)$unit->getHoaAmount();
            } elseif (method_exists($unit, 'getHoaCost') && $unit->getHoaCost() !== null) {
                $hoaExpectedAmount = (float)$unit->getHoaCost();
            } elseif (method_exists($unit, 'getHoaFee') && $unit->getHoaFee() !== null) {
                $hoaExpectedAmount = (float)$unit->getHoaFee();
            }
        }

        // HOA due-day & overdue computation (uses condo.hoa_due_day when available)
        if ($hoaEnabled) {
            $condo = method_exists($unit, 'getCondo') ? $unit->getCondo() : null;
            if ($condo && method_exists($condo, 'getHoaDueDay')) {
                $hoaDueDay = $condo->getHoaDueDay();
                if ($hoaDueDay !== null) {
                    $hoaDueDay = (int)$hoaDueDay;
                }
            }

            // Only consider overdue if HOA is missing for this period
            if (in_array('HOA', $missing, true) && $hoaDueDay !== null) {
                $today = new \DateTimeImmutable('today');
                $todayYear = (int)$today->format('Y');
                $todayMonth = (int)$today->format('m');
                $todayDay = (int)$today->format('j');

                $periodYear = (int)$start->format('Y');
                $periodMonth = (int)$start->format('m');

                // If the period is in a past month relative to today → always overdue
                if ($periodYear < $todayYear || ($periodYear === $todayYear && $periodMonth < $todayMonth)) {
                    $hoaOverdueThisMonth = true;
                } elseif ($periodYear === $todayYear && $periodMonth === $todayMonth) {
                    // Same month: overdue only after the due day
                    $hoaOverdueThisMonth = $todayDay > $hoaDueDay;
                } else {
                    // Future month: not overdue yet
                    $hoaOverdueThisMonth = false;
                }
            }
        }

        // Internet deadline & overdue computation (uses unit.internet_deadline when available)
        if ($internetEnabled) {
            if (method_exists($unit, 'getInternetDeadline')) {
                $internetDueDay = $unit->getInternetDeadline();
                if ($internetDueDay !== null) {
                    $internetDueDay = (int)$internetDueDay;
                }
            }

            // Only consider overdue if Internet is missing for this period
            if (in_array('Internet', $missing, true) && $internetDueDay !== null) {
                $today = new \DateTimeImmutable('today');
                $todayYear = (int)$today->format('Y');
                $todayMonth = (int)$today->format('m');
                $todayDay = (int)$today->format('j');

                $periodYear = (int)$start->format('Y');
                $periodMonth = (int)$start->format('m');

                // If the period is in a past month relative to today → always overdue
                if ($periodYear < $todayYear || ($periodYear === $todayYear && $periodMonth < $todayMonth)) {
                    $internetOverdueThisMonth = true;
                } elseif ($periodYear === $todayYear && $periodMonth === $todayMonth) {
                    // Same month: overdue only after the deadline day
                    $internetOverdueThisMonth = $todayDay > $internetDueDay;
                } else {
                    // Future month: not overdue yet
                    $internetOverdueThisMonth = false;
                }
            }
        }

        // Water deadline & overdue computation (uses condo.water_deadline when available)
        if ($expected['Water']) {
            $condo = method_exists($unit, 'getCondo') ? $unit->getCondo() : null;
            if ($condo && method_exists($condo, 'getWaterDeadline')) {
                $waterDueDay = $condo->getWaterDeadline();
                if ($waterDueDay !== null) {
                    $waterDueDay = (int)$waterDueDay;
                }
            }

            // Only consider overdue if Water is missing for this period
            if (in_array('Water', $missing, true) && $waterDueDay !== null) {
                $today = new \DateTimeImmutable('today');
                $todayYear = (int)$today->format('Y');
                $todayMonth = (int)$today->format('m');
                $todayDay = (int)$today->format('j');

                $periodYear = (int)$start->format('Y');
                $periodMonth = (int)$start->format('m');

                // If the period is in a past month relative to today → always overdue
                if ($periodYear < $todayYear || ($periodYear === $todayYear && $periodMonth < $todayMonth)) {
                    $waterOverdueThisMonth = true;
                } elseif ($periodYear === $todayYear && $periodMonth === $todayMonth) {
                    // Same month: overdue only after the deadline day
                    $waterOverdueThisMonth = $todayDay > $waterDueDay;
                } else {
                    // Future month: not overdue yet
                    $waterOverdueThisMonth = false;
                }
            }
        }

        // CFE due-day & overdue computation (uses unit.cfe_payment_day when available)
        if ($expected['CFE']) {
            if (method_exists($unit, 'getCfePaymentDay')) {
                $cfeDueDay = $unit->getCfePaymentDay();
                if ($cfeDueDay !== null) {
                    $cfeDueDay = (int)$cfeDueDay;
                }
            }

            // Only consider overdue if CFE is due this month and missing
            if ($cfeIsDueThisMonth === true && in_array('CFE', $missing, true) && $cfeDueDay !== null) {
                $today = new \DateTimeImmutable('today');
                $todayYear = (int)$today->format('Y');
                $todayMonth = (int)$today->format('m');
                $todayDay = (int)$today->format('j');

                $periodYear = (int)$start->format('Y');
                $periodMonth = (int)$start->format('m');

                // If the period is in a past month relative to today → always overdue
                if ($periodYear < $todayYear || ($periodYear === $todayYear && $periodMonth < $todayMonth)) {
                    $cfeOverdueThisMonth = true;
                } elseif ($periodYear === $todayYear && $periodMonth === $todayMonth) {
                    // Same month: overdue only after the due day
                    $cfeOverdueThisMonth = $todayDay > $cfeDueDay;
                } else {
                    // Future month: not overdue yet
                    $cfeOverdueThisMonth = false;
                }
            }
        }

        // Compare monthly totals to expected amounts with a 2-decimals tolerance
        $valueWarnings = [];
        $differs = function ($expectedValue, $actualValue) {
            if ($expectedValue === null) {
                return false; // nothing to compare
            }
            // if nothing was paid, do not warn here (other logic already flags as missing)
            if ($actualValue === null || abs((float)$actualValue) < 0.005) {
                return false;
            }
            return abs(((float)$expectedValue) - ((float)$actualValue)) >= 0.01;
        };

        if ($internetEnabled && $differs($internetExpectedAmount, $paidAmounts['Internet'])) {
            $valueWarnings['Internet'] = [
                'expectedValue' => round((float)$internetExpectedAmount, 2),
                'recordedValue' => round((float)$paidAmounts['Internet'], 2),
                'message' => 'expected value = ' . number_format((float)$internetExpectedAmount, 2),
            ];
        }
        if ($hoaEnabled && $differs($hoaExpectedAmount, $paidAmounts['HOA'])) {
            $valueWarnings['HOA'] = [
                'expectedValue' => round((float)$hoaExpectedAmount, 2),
                'recordedValue' => round((float)$paidAmounts['HOA'], 2),
                'message' => 'expected value = ' . number_format((float)$hoaExpectedAmount, 2),
            ];
        }

        return [
            'unitId' => (int)$unit->getId(),
            'yearMonth' => $yearMonth,
            'expected' => [
                'HOA'      => $expected['HOA'],
                'Internet' => $expected['Internet'],
                'Water'    => $expected['Water'],
                'CFE'      => $expected['CFE'],
                'cfePeriod' => $cfePeriod,
                'cfeStartingMonth' => ($cfeStartingMonth !== null ? (int)$cfeStartingMonth : null),
                'cfeDueThisMonth' => $expected['CFE'] ? $cfeIsDueThisMonth : false, // true/false/null
                'internetExpectedAmount' => $internetExpectedAmount,
                'hoaExpectedAmount' => $hoaExpectedAmount,
                'internetDeadline' => $internetDueDay,
                'internetOverdueThisMonth' => $internetOverdueThisMonth,
                'hoaDueDay' => $hoaDueDay,
                'hoaOverdueThisMonth' => $hoaOverdueThisMonth,
                'waterDeadline' => $waterDueDay,
                'waterOverdueThisMonth' => $waterOverdueThisMonth,
                'cfePaymentDay' => $cfeDueDay,
                'cfeOverdueThisMonth' => $cfeOverdueThisMonth,
            ],
            'paidThisMonth' => $paid,
            'paidTotalsThisMonth' => $paidAmounts,
            'paidDetailsThisMonth' => $paidDetails,
            'paidTransactionIdsThisMonth' => $paidIds,
            'valueWarnings' => $valueWarnings,
            'missing' => $missing,
            'lastPaidOn' => array_map(static fn($d) => $d ? $d->format('Y-m-d') : null, $lastPaidOn),
        ];
    }

    private function existsPaymentThisMonth(
        Unit $unit,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        array $keywords
    ): bool {
        $qb = $this->txRepo->createQueryBuilder('t');
        $qb->leftJoin('t.category', 'c');
        $expr = $qb->expr();

        $orAny = $expr->orX();
        foreach ($keywords as $i => $kw) {
            $orAny->add($expr->like('t.description', ':d' . $i));
            $qb->setParameter('d' . $i, '%' . $kw . '%');
        }
        $qb->select('COUNT(t.id)')
            ->where('t.unit = :unit')
            ->andWhere('t.date >= :start AND t.date < :end')
            ->andWhere($orAny)
            ->andWhere('t.type = :type')
            ->andWhere('c.id = :catId')
            ->andWhere('t.costCenter = :cc')
            ->setParameter('unit', $unit)
            ->setParameter('start', $start)
            ->setParameter('end', $end)
            ->setParameter('type', 'Gasto')
            ->setParameter('catId', 1)
            ->setParameter('cc', 'Client');

        return (int)$qb->getQuery()->getSingleScalarResult() > 0;
    }

    private function sumPaymentsThisMonth(
        Unit $unit,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        array $keywords
    ): float {
        $qb = $this->txRepo->createQueryBuilder('t');
        $qb->leftJoin('t.category', 'c');
        $expr = $qb->expr();

        $orAny = $expr->orX();
        foreach ($keywords as $i => $kw) {
            $orAny->add($expr->like('t.description', ':d' . $i));
            $qb->setParameter('d' . $i, '%' . $kw . '%');
        }

        $qb->select('COALESCE(SUM(t.amount), 0) as total')
            ->where('t.unit = :unit')
            ->andWhere('t.date >= :start AND t.date < :end')
            ->andWhere($orAny)
            ->andWhere('t.type = :type')
            ->andWhere('c.id = :catId')
            ->andWhere('t.costCenter = :cc')
            ->setParameter('unit', $unit)
            ->setParameter('start', $start)
            ->setParameter('end', $end)
            ->setParameter('type', 'Gasto')
            ->setParameter('catId', 1)
            ->setParameter('cc', 'Client');

        $row = $qb->getQuery()->getOneOrNullResult();
        if (!$row || !isset($row['total'])) {
            return 0.0;
        }
        return (float)$row['total'];
    }

    private function findPaymentThisMonth(
        Unit $unit,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        array $keywords
    ): ?array {
        $qb = $this->txRepo->createQueryBuilder('t');
        $expr = $qb->expr();

        // description LIKE OR (case-insensitive optional depending on DB collation)
        $orAny = $expr->orX();
        foreach ($keywords as $i => $kw) {
            $orAny->add($expr->like('t.description', ':d' . $i));
            $qb->setParameter('d' . $i, '%' . $kw . '%');
        }

        $qb->select('t.id, t.date, t.amount, t.description, d.s3Url AS docS3Url, IDENTITY(t.emailEvent) AS emailEventId')
            ->leftJoin('t.category', 'c')
            ->leftJoin('t.unitDocuments', 'd')
            ->where('t.unit = :unit')
            ->andWhere('t.date >= :start AND t.date < :end')
            ->andWhere($orAny)
            ->andWhere('t.type = :type')
            ->andWhere('c.id = :catId')
            ->andWhere('t.costCenter = :cc')
            ->setParameter('unit', $unit)
            ->setParameter('start', $start)
            ->setParameter('end', $end)
            ->setParameter('type', 'Gasto')
            ->setParameter('catId', 1) // transaction_category.id = 1 ("Pago de Servicios")
            ->setParameter('cc', 'Client')
            ->orderBy('t.date', 'DESC')
            ->addOrderBy('d.uploadedAt', 'DESC')
            ->setMaxResults(1);

        $row = $qb->getQuery()->getOneOrNullResult(\Doctrine\ORM\Query::HYDRATE_ARRAY);
        if (!$row) {
            return null;
        }

        // Fallback: if no document surfaced from the join, resolve via the attachment table (unit_document_attachment)
        if (empty($row['docS3Url'])) {
            $conn = $this->txRepo->getEntityManager()->getConnection();
            $sql = <<<SQL
                SELECT d.s3_url AS s3_url
                FROM unit_document_attachment a
                INNER JOIN unit_document d ON d.id = a.document_id
                WHERE a.target_id = :tid
                ORDER BY d.uploaded_at DESC, d.id DESC
                LIMIT 1
            SQL;
            $docRow = $conn->fetchAssociative($sql, ['tid' => $row['id']]);
            if ($docRow && !empty($docRow['s3_url'])) {
                $row['docS3Url'] = (string)$docRow['s3_url'];
            }
        }

        return [
            'id' => (int)$row['id'],
            'date' => ($row['date'] instanceof \DateTimeInterface) ? $row['date']->format('Y-m-d') : (string)$row['date'],
            'amount' => (float)$row['amount'],
            'description' => (string)$row['description'],
            's3_url' => (isset($row['docS3Url']) && $row['docS3Url']) ? (string)$row['docS3Url'] : null,
            'email_event_id' => (isset($row['emailEventId']) && $row['emailEventId'] !== null) ? (int)$row['emailEventId'] : null,
        ];
    }

    private function findLastPaidDate(
        Unit $unit,
        string $keywordOrRegex,
        bool $useRegex = false
    ): ?\DateTimeImmutable {
        $qb = $this->txRepo->createQueryBuilder('t');

        $qb->select('MAX(t.date) as lastDate')
            ->where('t.unit = :unit')
            ->setParameter('unit', $unit);

        if ($useRegex) {
            // DQL doesn’t support regex; do a broader OR and rely on the two words
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('t.description', ':kwA'),
                $qb->expr()->like('t.description', ':kwB')
            ))
            ->setParameter('kwA', '%Aguakan%')
            ->setParameter('kwB', '%Water%');
        } else {
            $qb->andWhere($qb->expr()->like('t.description', ':kwd'))
               ->setParameter('kwd', '%' . $keywordOrRegex . '%');
        }

        $row = $qb->getQuery()->getOneOrNullResult();
        if (!$row || empty($row['lastDate'])) {
            return null;
        }
        $dt = $row['lastDate'];
        if ($dt instanceof \DateTimeImmutable) {
            return $dt;
        }
        if ($dt instanceof \DateTime) {
            return \DateTimeImmutable::createFromMutable($dt);
        }
        return new \DateTimeImmutable($dt);
    }

    private function findPaymentIdsThisMonth(
        Unit $unit,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        array $keywords
    ): array {
        $qb = $this->txRepo->createQueryBuilder('t');
        $qb->leftJoin('t.category', 'c');
        $expr = $qb->expr();

        $orAny = $expr->orX();
        foreach ($keywords as $i => $kw) {
            $orAny->add($expr->like('t.description', ':d' . $i));
            $qb->setParameter('d' . $i, '%' . $kw . '%');
        }

        $qb->select('t.id')
            ->where('t.unit = :unit')
            ->andWhere('t.date >= :start AND t.date < :end')
            ->andWhere($orAny)
            ->andWhere('t.type = :type')
            ->andWhere('c.id = :catId')
            ->andWhere('t.costCenter = :cc')
            ->setParameter('unit', $unit)
            ->setParameter('start', $start)
            ->setParameter('end', $end)
            ->setParameter('type', 'Gasto')
            ->setParameter('catId', 1)
            ->setParameter('cc', 'Client')
            ->orderBy('t.date', 'ASC')
            ->addOrderBy('t.id', 'ASC');

        $rows = $qb->getQuery()->getScalarResult();
        $ids = [];
        foreach ($rows as $row) {
            // Doctrine scalar result will have 'id' or 't_id' depending on driver; handle both.
            if (isset($row['id'])) {
                $ids[] = (int)$row['id'];
            } elseif (isset($row['t_id'])) {
                $ids[] = (int)$row['t_id'];
            }
        }

        return $ids;
    }
}