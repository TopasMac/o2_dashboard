<?php

namespace App\Controller\Api;

use App\Entity\Unit;
use App\Repository\UnitRepository;
use App\Repository\UnitTransactionsRepository;
use Symfony\Bundle\FrameworkBundle\Controller\Attribute\AsController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[AsController]
class ServicePaymentCheckController
{
    public function __construct(
        private readonly UnitRepository $unitRepo,
        private readonly UnitTransactionsRepository $txRepo
    ) {}

    #[Route('/api/service-payment-check', name: 'api_service_payment_check', methods: ['GET'])]
    public function __invoke(
        Request $request
    ): JsonResponse {
        $unitId = $request->query->get('unitId');
        $yearMonth = $request->query->get('yearMonth'); // YYYY-MM

        if (!$unitId || !$yearMonth || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new JsonResponse(['error' => 'Provide unitId and yearMonth=YYYY-MM'], 400);
        }

        /** @var Unit|null $unit */
        $unit = $this->unitRepo->find($unitId);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found'], 404);
        }

        // Month window
        try {
            $start = new \DateTimeImmutable($yearMonth . '-01 00:00:00');
            $end = $start->modify('first day of next month');
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Invalid yearMonth'], 400);
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
                    $lastCfePaidOn = $this->findLastPaidDate($this->txRepo, $unit, 'CFE');
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
            'HOA'      => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['HOA']),
            'Internet' => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Internet']),
            'Water'    => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Aguakan', 'Water']),
            'CFE'      => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['CFE']),
        ];

        // How much was paid this month? (sum of amounts for matching descriptions)
        $paidAmounts = [
            'HOA'      => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['HOA']),
            'Internet' => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['Internet']),
            'Water'    => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['Aguakan', 'Water']),
            'CFE'      => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['CFE']),
        ];

        $paidDetails = [
            'HOA'      => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['HOA']),
            'Internet' => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Internet']),
            'Water'    => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Aguakan']),
            'CFE'      => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['CFE']),
        ];

        // Last paid on (anytime, for context)
        $lastPaidOn = [
            'HOA'      => $this->findLastPaidDate($this->txRepo, $unit, 'HOA'),
            'Internet' => $this->findLastPaidDate($this->txRepo, $unit, 'Internet'),
            'Water'    => $this->findLastPaidDate($this->txRepo, $unit, 'Aguakan|Water', true),
            'CFE'      => $this->findLastPaidDate($this->txRepo, $unit, 'CFE'),
        ];

        // Determine missing
        $missing = [];

        // HOA / Internet / Water: monthly if enabled
        foreach (['HOA','Internet','Water'] as $svc) {
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

        // Internet / HOA expected amount comparison and warnings
        $internetEnabled = $expected['Internet'];
        $hoaEnabled      = $expected['HOA'];

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

        // Compare monthly totals to expected amounts with a 2-decimals tolerance
        $valueWarnings = [];
        $differs = function($expected, $actual) {
            if ($expected === null) return false; // nothing to compare
            // if nothing was paid, do not warn here (other logic already flags as missing)
            if ($actual === null || abs((float)$actual) < 0.005) return false;
            return abs(((float)$expected) - ((float)$actual)) >= 0.01;
        };

        if ($internetEnabled && $differs($internetExpectedAmount, $paidAmounts['Internet'])) {
            $valueWarnings['Internet'] = [
                'expectedValue' => round((float)$internetExpectedAmount, 2),
                'recordedValue' => round((float)$paidAmounts['Internet'], 2),
                'message' => 'expected value = ' . number_format((float)$internetExpectedAmount, 2)
            ];
        }
        if ($hoaEnabled && $differs($hoaExpectedAmount, $paidAmounts['HOA'])) {
            $valueWarnings['HOA'] = [
                'expectedValue' => round((float)$hoaExpectedAmount, 2),
                'recordedValue' => round((float)$paidAmounts['HOA'], 2),
                'message' => 'expected value = ' . number_format((float)$hoaExpectedAmount, 2)
            ];
        }

        // Build response
        $resp = [
            'unitId' => (int)$unitId,
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
            ],
            'paidThisMonth' => $paid,
            'paidTotalsThisMonth' => $paidAmounts,
            'paidDetailsThisMonth' => $paidDetails,
            'valueWarnings' => $valueWarnings,
            'missing' => $missing,
            'lastPaidOn' => array_map(fn($d) => $d ? $d->format('Y-m-d') : null, $lastPaidOn),
        ];

        return new JsonResponse($resp);
    }

    private function existsPaymentThisMonth(
        UnitTransactionsRepository $txRepo,
        Unit $unit,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        array $keywords
    ): bool {
        $qb = $txRepo->createQueryBuilder('t');
        $qb->leftJoin('t.category', 'c');
        $expr = $qb->expr();

        $orAny = $expr->orX();
        foreach ($keywords as $i => $kw) {
            $orAny->add($expr->like('t.description', ':d'.$i));
            $qb->setParameter('d'.$i, '%'.$kw.'%');
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
        UnitTransactionsRepository $txRepo,
        Unit $unit,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        array $keywords
    ): float {
        $qb = $txRepo->createQueryBuilder('t');
        $qb->leftJoin('t.category', 'c');
        $expr = $qb->expr();

        $orAny = $expr->orX();
        foreach ($keywords as $i => $kw) {
            $orAny->add($expr->like('t.description', ':d'.$i));
            $qb->setParameter('d'.$i, '%'.$kw.'%');
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
        UnitTransactionsRepository $txRepo,
        Unit $unit,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        array $keywords
    ): ?array {
        $qb = $txRepo->createQueryBuilder('t');
        $expr = $qb->expr();

        // description LIKE OR (case-insensitive optional depending on DB collation)
        $orAny = $expr->orX();
        foreach ($keywords as $i => $kw) {
            $orAny->add($expr->like('t.description', ':d'.$i));
            $qb->setParameter('d'.$i, '%'.$kw.'%');
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
        if (!$row) return null;

        // Fallback: if no document surfaced from the join, resolve via the attachment table (unit_document_attachment)
        if (empty($row['docS3Url'])) {
            $conn = $txRepo->getEntityManager()->getConnection();
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
        UnitTransactionsRepository $txRepo,
        Unit $unit,
        string $keywordOrRegex,
        bool $useRegex = false
    ): ?\DateTimeImmutable {
        $qb = $txRepo->createQueryBuilder('t');

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
               ->setParameter('kwd', '%'.$keywordOrRegex.'%');
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
    /**
     * Bulk service payment check.
     * Example: GET /api/service-payment-check/bulk?yearMonth=2025-09&unitId=1,8,9
     * If unitId is omitted, the endpoint returns an error (explicit IDs required to avoid large scans).
     */
    #[Route('/api/service-payment-check/bulk', name: 'api_service_payment_check_bulk', methods: ['GET'])]
    public function bulk(Request $request): JsonResponse
    {
        $yearMonth = $request->query->get('yearMonth'); // YYYY-MM
        $unitIdsCsv = $request->query->get('unitId');   // comma-separated list

        if (!$yearMonth || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new JsonResponse(['error' => 'Provide yearMonth=YYYY-MM'], 400);
        }
        if (!$unitIdsCsv) {
            return new JsonResponse(['error' => 'Provide unitId as comma-separated list'], 400);
        }
        $ids = array_values(array_filter(array_map(static function ($v) {
            $v = trim((string)$v);
            return ctype_digit($v) ? (int)$v : null;
        }, explode(',', $unitIdsCsv)), static fn($v) => $v !== null));

        if (count($ids) === 0) {
            return new JsonResponse(['error' => 'No valid unit ids'], 400);
        }

        // Month window
        try {
            $start = new \DateTimeImmutable($yearMonth . '-01 00:00:00');
            $end = $start->modify('first day of next month');
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Invalid yearMonth'], 400);
        }

        // Load units
        $units = $this->unitRepo->findBy(['id' => $ids]);
        // Map by id for deterministic ordering in response
        $unitsById = [];
        foreach ($units as $u) {
            if ($u instanceof Unit) {
                $unitsById[(int)$u->getId()] = $u;
            }
        }

        $out = [];
        foreach ($ids as $id) {
            /** @var Unit|null $unit */
            $unit = $unitsById[$id] ?? null;
            if (!$unit) {
                $out[(int)$id] = ['error' => 'Unit not found'];
                continue;
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
            if ($cfeStartingMonth !== null) $cfeStartingMonth = (int)$cfeStartingMonth;
            $cfeIsDueThisMonth = false;
            if ($expected['CFE']) {
                if ($cfePeriod === 'Monthly') {
                    $cfeIsDueThisMonth = true;
                } else {
                    if ($cfeStartingMonth && $cfeStartingMonth >= 1 && $cfeStartingMonth <= 12) {
                        $currentMonth = (int)$start->format('n');
                        $cfeIsDueThisMonth = ((($currentMonth + 12 - $cfeStartingMonth) % 2) === 0);
                    } else {
                        $lastCfePaidOn = $this->findLastPaidDate($this->txRepo, $unit, 'CFE');
                        if ($lastCfePaidOn) {
                            $monthsDiff = ($start->format('Y') - (int)$lastCfePaidOn->format('Y')) * 12
                                        + ((int)$start->format('m') - (int)$lastCfePaidOn->format('m'));
                            $cfeIsDueThisMonth = ($monthsDiff % 2) === 0;
                        } else {
                            $cfeIsDueThisMonth = null;
                        }
                    }
                }
            }

            // Paid this month?
            $paid = [
                'HOA'      => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['HOA']),
                'Internet' => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Internet']),
                'Water'    => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Aguakan', 'Water']),
                'CFE'      => $this->existsPaymentThisMonth($this->txRepo, $unit, $start, $end, ['CFE']),
            ];

            // Totals
            $paidAmounts = [
                'HOA'      => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['HOA']),
                'Internet' => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['Internet']),
                'Water'    => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['Aguakan', 'Water']),
                'CFE'      => $this->sumPaymentsThisMonth($this->txRepo, $unit, $start, $end, ['CFE']),
            ];

            $paidDetails = [
                'HOA'      => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['HOA']),
                'Internet' => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Internet']),
                'Water'    => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['Aguakan']),
                'CFE'      => $this->findPaymentThisMonth($this->txRepo, $unit, $start, $end, ['CFE']),
            ];

            $missing = [];
            foreach (['HOA','Internet','Water'] as $svc) {
                if ($expected[$svc] && !$paid[$svc]) $missing[] = $svc;
            }
            if ($expected['CFE']) {
                if ($cfeIsDueThisMonth === true && !$paid['CFE']) $missing[] = 'CFE';
            }

            // Expected numeric values
            $internetExpectedAmount = null;
            if ($expected['Internet']) {
                if (method_exists($unit, 'getInternetCost') && $unit->getInternetCost() !== null) {
                    $internetExpectedAmount = (float)$unit->getInternetCost();
                } elseif (method_exists($unit, 'getInternetAmount') && $unit->getInternetAmount() !== null) {
                    $internetExpectedAmount = (float)$unit->getInternetAmount();
                } elseif (method_exists($unit, 'getInternetFee') && $unit->getInternetFee() !== null) {
                    $internetExpectedAmount = (float)$unit->getInternetFee();
                }
            }
            $hoaExpectedAmount = null;
            if ($expected['HOA']) {
                if (method_exists($unit, 'getHoaAmount') && $unit->getHoaAmount() !== null) {
                    $hoaExpectedAmount = (float)$unit->getHoaAmount();
                } elseif (method_exists($unit, 'getHoaCost') && $unit->getHoaCost() !== null) {
                    $hoaExpectedAmount = (float)$unit->getHoaCost();
                } elseif (method_exists($unit, 'getHoaFee') && $unit->getHoaFee() !== null) {
                    $hoaExpectedAmount = (float)$unit->getHoaFee();
                }
            }

            $lastPaidOn = [
                'HOA'      => $this->findLastPaidDate($this->txRepo, $unit, 'HOA'),
                'Internet' => $this->findLastPaidDate($this->txRepo, $unit, 'Internet'),
                'Water'    => $this->findLastPaidDate($this->txRepo, $unit, 'Aguakan|Water', true),
                'CFE'      => $this->findLastPaidDate($this->txRepo, $unit, 'CFE'),
            ];

            $out[$id] = [
                'unitId' => (int)$id,
                'yearMonth' => $yearMonth,
                'expected' => [
                    'HOA'      => $expected['HOA'],
                    'Internet' => $expected['Internet'],
                    'Water'    => $expected['Water'],
                    'CFE'      => $expected['CFE'],
                    'cfePeriod' => $cfePeriod,
                    'cfeStartingMonth' => ($cfeStartingMonth !== null ? (int)$cfeStartingMonth : null),
                    'cfeDueThisMonth' => $expected['CFE'] ? $cfeIsDueThisMonth : false,
                    'internetExpectedAmount' => $internetExpectedAmount,
                    'hoaExpectedAmount' => $hoaExpectedAmount,
                ],
                'paidThisMonth' => $paid,
                'paidTotalsThisMonth' => $paidAmounts,
                'paidDetailsThisMonth' => $paidDetails,
                'valueWarnings' => new \stdClass(), // keep light; can be added if needed
                'missing' => $missing,
                'lastPaidOn' => array_map(fn($d) => $d ? $d->format('Y-m-d') : null, $lastPaidOn),
            ];
        }

        return new JsonResponse($out);
    }
}