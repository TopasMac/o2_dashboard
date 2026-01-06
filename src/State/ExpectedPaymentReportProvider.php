<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProviderInterface;
use App\Dto\ExpectedPaymentsReport;
use App\Dto\ExpectedPaymentsRow;
use Doctrine\ORM\EntityManagerInterface;

class ExpectedPaymentReportProvider implements ProviderInterface
{
    public function __construct(private EntityManagerInterface $em) {}

    public function provide(Operation $operation, array $uriVariables = [], array $context = []): array
    {
        $service = $context['filters']['service'] ?? null;
        $month   = (int)($context['filters']['month'] ?? date('n'));
        $year    = (int)($context['filters']['year'] ?? date('Y'));

        $service = $service ? strtoupper((string)$service) : null;
        if ($month < 1 || $month > 12) {
            $month = (int)date('n');
        }
        if ($year < 1970 || $year > 2100) {
            $year = (int)date('Y');
        }

        $rows = [];

        if ($service === 'HOA') {
            // Example: join Units with Condos and pull HOA fields
            $qb = $this->em->createQueryBuilder()
                ->select('u.id AS unitId, u.unitName AS unitName, u.hoaAmount AS hoaAmount, c.hoaBank, c.hoaAccountName, c.hoaAccountNr, c.hoaEmail, c.hoaDueDay')
                ->from('App\\Entity\\Unit', 'u')
                ->join('u.condo', 'c')
                ->where('u.hoa = 1')
                ->orderBy('u.unitName', 'ASC');

            $results = $qb->getQuery()->getArrayResult();

            foreach ($results as $r) {
                $dueDay = (int)($r['hoaDueDay'] ?? 1);
                if ($dueDay < 1) { $dueDay = 1; }
                if ($dueDay > 28) { $dueDay = 28; }

                $date = \DateTime::createFromFormat('Y-n-j', sprintf('%04d-%02d-%02d', $year, $month, $dueDay)) ?: null;

                $rows[] = new ExpectedPaymentsRow(
                    unitId: (int)$r['unitId'],
                    unitName: (string)($r['unitName'] ?? ''),
                    servicio: 'HOA',
                    banco: $r['hoaBank'] ?? null,
                    nombre: $r['hoaAccountName'] ?? null,
                    cuenta: $r['hoaAccountNr'] ?? null,
                    hoaEmail: $r['hoaEmail'] ?? null,
                    hoaAmount: $r['hoaAmount'] ?? null,
                    monto: null, // TODO: compute if/when amount source is defined
                    fechaPagoIso: $date ? $date->format('Y-m-d') : null,
                    fechaPago: $date ? $date->format('d-m-y') : null,
                    sortTs: $date ? $date->getTimestamp() : null,
                );
            }
        }

        if ($service === 'INTERNET') {
            $qb = $this->em->createQueryBuilder()
                ->select('u.id AS unitId, u.unitName AS unitName, u.internetIsp, u.internetReference, u.internetCost, u.internetDeadline')
                ->from('App\\Entity\\Unit', 'u')
                ->where('u.internet = 1')
                ->orderBy('u.unitName', 'ASC');

            $results = $qb->getQuery()->getArrayResult();

            foreach ($results as $r) {
                $deadlineDay = (int)($r['internetDeadline'] ?? 1);
                if ($deadlineDay < 1) { $deadlineDay = 1; }
                if ($deadlineDay > 28) { $deadlineDay = 28; }

                $date = \DateTime::createFromFormat('Y-n-j', sprintf('%04d-%02d-%02d', $year, $month, $deadlineDay)) ?: null;

                $rows[] = new ExpectedPaymentsRow(
                    unitId: (int)$r['unitId'],
                    unitName: (string)($r['unitName'] ?? ''),
                    servicio: 'Internet',
                    banco: $r['internetIsp'] ?? null, // reuse banco field for ISP label
                    nombre: $r['internetReference'] ?? null, // reuse nombre field for reference
                    cuenta: null,
                    monto: $r['internetCost'] ?? null,
                    fechaPagoIso: $date ? $date->format('Y-m-d') : null,
                    fechaPago: $date ? $date->format('d-m-y') : null,
                    sortTs: $date ? $date->getTimestamp() : null,
                );
            }
        }

        if ($service === 'AGUAKAN') {
            $qb = $this->em->createQueryBuilder()
                ->select('u.id AS unitId, u.unitName AS unitName, u.waterReference, u.waterDeadline, c.hoaEmail AS hoaEmail')
                ->from('App\\Entity\\Unit', 'u')
                ->join('u.condo', 'c')
                ->where('u.water = 1')
                ->orderBy('u.unitName', 'ASC');

            $results = $qb->getQuery()->getArrayResult();

            foreach ($results as $r) {
                $deadlineDay = (int)($r['waterDeadline'] ?? 1);
                if ($deadlineDay < 1) { $deadlineDay = 1; }
                if ($deadlineDay > 28) { $deadlineDay = 28; }

                $date = \DateTime::createFromFormat('Y-n-j', sprintf('%04d-%02d-%02d', $year, $month, $deadlineDay)) ?: null;

                $rows[] = new ExpectedPaymentsRow(
                    unitId: (int)$r['unitId'],
                    unitName: (string)($r['unitName'] ?? ''),
                    servicio: 'Aguakan',
                    banco: 'Aguakan', // provider label
                    nombre: $r['waterReference'] ?? null, // reference
                    cuenta: null,
                    hoaEmail: $r['hoaEmail'] ?? null,
                    monto: null,
                    fechaPagoIso: $date ? $date->format('Y-m-d') : null,
                    fechaPago: $date ? $date->format('d-m-y') : null,
                    sortTs: $date ? $date->getTimestamp() : null,
                );
            }
        }

        if ($service === 'CFE') {
            $qb = $this->em->createQueryBuilder()
                ->select('u.id AS unitId, u.unitName AS unitName, u.cfeReference, u.cfeName, u.cfePeriod, u.cfePaymentDay, u.cfeStartingMonth')
                ->from('App\\Entity\\Unit', 'u')
                ->where('u.cfe = 1')
                ->orderBy('u.unitName', 'ASC');

            $results = $qb->getQuery()->getArrayResult();

            foreach ($results as $r) {
                // Normalize period (support english, spanish, and numeric flags)
                $rawPeriod = $r['cfePeriod'] ?? 'MONTHLY';
                $periodStr = strtoupper((string)$rawPeriod);
                $isBiMonthly = false;
                if (in_array($periodStr, ['BIMONTHLY','BI-MONTHLY','BIMONTH','BIMONTHS','BIM','BIMESTRAL','BIMESTRE','BIMESTRALIDAD'], true)) {
                    $isBiMonthly = true;
                } elseif (is_numeric($rawPeriod)) {
                    $isBiMonthly = ((int)$rawPeriod === 2);
                }

                $startMonth = (int)($r['cfeStartingMonth'] ?? 1);
                if ($startMonth < 1 || $startMonth > 12) { $startMonth = 1; }

                // Determine if selected month is a billing month for this unit
                $isBillingMonth = true;
                if ($isBiMonthly) {
                    // include only if (month - startMonth) is even (0,2,4,...)
                    $diff = ($month - $startMonth) % 12; if ($diff < 0) { $diff += 12; }
                    $isBillingMonth = ($diff % 2 === 0);
                }

                if (!$isBillingMonth) {
                    continue; // skip non-billing months
                }

                $day = (int)($r['cfePaymentDay'] ?? 1);
                if ($day < 1) { $day = 1; }
                if ($day > 28) { $day = 28; }

                $date = \DateTime::createFromFormat('Y-n-j', sprintf('%04d-%02d-%02d', $year, $month, $day)) ?: null;

                $rows[] = new ExpectedPaymentsRow(
                    unitId: (int)$r['unitId'],
                    unitName: (string)($r['unitName'] ?? ''),
                    servicio: 'CFE',
                    banco: 'CFE', // provider label
                    nombre: $r['cfeReference'] ?? null, // use as Referencia
                    cuenta: $r['cfeName'] ?? null, // keep the name for potential display/export
                    hoaEmail: null,
                    monto: null,
                    fechaPagoIso: $date ? $date->format('Y-m-d') : null,
                    fechaPago: $date ? $date->format('d-m-y') : null,
                    sortTs: $date ? $date->getTimestamp() : null,
                );
            }
        }

        return [new ExpectedPaymentsReport($service, $month, $year, $rows)];
    }
}