<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\UnitBalanceLedger;
use DateTimeImmutable;
use DateTimeInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Processor for UnitBalanceLedger write operations.
 *
 * Responsibilities:
 *  - Normalize `date` to Y-m-d (DateTimeImmutable on the entity if applicable)
 *  - Compute `yearMonth` from `date` (YYYY-MM)
 *  - Enforce simple business rules for `entryType`/`paymentMethod`
 *  - Stamp `createdBy` from the authenticated user (if supported by the entity)
 */
final class UnitBalanceLedgerProcessor implements ProcessorInterface
{
    public const TYPE_REPORT_POSTING   = 'REPORT_POSTING';
    public const TYPE_TO_CLIENT        = 'PAYMENT_TO_CLIENT';
    public const TYPE_FROM_CLIENT      = 'PAYMENT_FROM_CLIENT';

    public function __construct(
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')]
        private readonly ProcessorInterface $persistProcessor,
        private readonly Security $security,
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * @param UnitBalanceLedger|mixed $data
     * @return UnitBalanceLedger|mixed
     */
    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        // Only handle our entity; otherwise, delegate.
        if (!$data instanceof UnitBalanceLedger) {
            return $this->persistProcessor->process($data, $operation, $uriVariables, $context);
        }

        // 1) Normalize date → DateTimeImmutable and compute yearMonth
        $date = $data->getDate();
        if (\is_string($date)) {
            if ($date === '') {
                throw new BadRequestHttpException('date must not be empty (expected YYYY-MM-DD).');
            }
            try {
                $dateObj = new DateTimeImmutable($date);
                if (method_exists($data, 'setDate')) {
                    $data->setDate($dateObj);
                }
                $date = $dateObj;
            } catch (\Throwable) {
                throw new BadRequestHttpException('Invalid date format (expected YYYY-MM-DD).');
            }
        }
        if ($date instanceof DateTimeInterface) {
            $ym = $date->format('Y-m');
            if (method_exists($data, 'setYearMonth')) {
                $data->setYearMonth($ym);
            }
        }

        // 2) Enforce type ↔ paymentMethod rule (resilient getter for type)
        $entryType = '';
        if (method_exists($data, 'getType')) {
            $entryType = (string) ($data->getType() ?? '');
        } elseif (method_exists($data, 'getEntryType')) {
            $entryType = (string) ($data->getEntryType() ?? '');
        }
        $paymentMethod = (string) ($data->getPaymentMethod() ?? '');
        if (\in_array($entryType, [self::TYPE_TO_CLIENT, self::TYPE_FROM_CLIENT], true)) {
            if ($paymentMethod === '') {
                throw new BadRequestHttpException('paymentMethod is required when type is PAYMENT_TO_CLIENT or PAYMENT_FROM_CLIENT.');
            }
        }

        // 3) Stamp createdBy (default to 'system' if missing)
        $user = $this->security->getUser();
        if (method_exists($data, 'setCreatedBy') && method_exists($data, 'getCreatedBy')) {
            $current = $data->getCreatedBy();
            if ($current === null || $current === '') {
                $by = 'system';
                if ($user && method_exists($user, 'getUserIdentifier')) {
                    try {
                        $uid = (string) $user->getUserIdentifier();
                        if ($uid !== '') {
                            $by = $uid;
                        }
                    } catch (\Throwable) {
                        // keep 'system'
                    }
                }
                $data->setCreatedBy($by);
            }
        }

        // 4) Compute running balance (previous balance + current amount)
        if (method_exists($data, 'getUnit') && $data->getUnit() && $date instanceof DateTimeInterface) {
            $qb = $this->em->createQueryBuilder();
            $qb->select('l')
                ->from(UnitBalanceLedger::class, 'l')
                ->where('l.unit = :unit')
                ->andWhere('l.date <= :d')
                ->orderBy('l.date', 'DESC')
                ->addOrderBy('l.id', 'DESC')
                ->setMaxResults(1)
                ->setParameter('unit', $data->getUnit())
                ->setParameter('d', $date);

            // Try previous by date first
            $prev = $qb->getQuery()->getOneOrNullResult();

            // Fallback: latest ledger regardless of date if none found up to this date
            if (!$prev) {
                $qb2 = $this->em->createQueryBuilder();
                $qb2->select('l')
                    ->from(UnitBalanceLedger::class, 'l')
                    ->where('l.unit = :unit')
                    ->orderBy('l.date', 'DESC')
                    ->addOrderBy('l.id', 'DESC')
                    ->setMaxResults(1)
                    ->setParameter('unit', $data->getUnit());
                $prev = $qb2->getQuery()->getOneOrNullResult();
            }

            $prevBalance = 0.0;
            if ($prev && method_exists($prev, 'getBalanceAfter')) {
                $prevBalance = (float) $prev->getBalanceAfter();
            }

            // Raw amount from payload (string/decimal -> float)
            $rawAmount = 0.0;
            if (method_exists($data, 'getAmount')) {
                $rawAmount = (float) ($data->getAmount() ?? 0);
            }

            // Apply sign rules by entry type
            $et = strtoupper((string) $entryType);
            if ($et === self::TYPE_TO_CLIENT) {
                $signedAmount = -abs($rawAmount);
            } elseif ($et === self::TYPE_FROM_CLIENT) {
                $signedAmount = abs($rawAmount);
            } else {
                $signedAmount = $rawAmount;
            }

            $newBalance = $prevBalance + $signedAmount;
            if (method_exists($data, 'setBalanceAfter')) {
                $data->setBalanceAfter(number_format($newBalance, 2, '.', ''));
            }
        }

        // Delegate the actual write first
        $result = $this->persistProcessor->process($data, $operation, $uriVariables, $context);

        // After create/update, recompute the running balance for the whole unit ledger
        if ($data instanceof UnitBalanceLedger && method_exists($data, 'getUnit') && $data->getUnit()) {
            $unit = $data->getUnit();

            // Fetch all ledger entries for the unit ordered by date then id (stable ordering for same-day)
            $qbAll = $this->em->createQueryBuilder();
            $qbAll->select('l')
                ->from(UnitBalanceLedger::class, 'l')
                ->where('l.unit = :unit')
                ->orderBy('l.date', 'ASC')
                ->addOrderBy('l.id', 'ASC')
                ->setParameter('unit', $unit);
            $entries = $qbAll->getQuery()->getResult();

            $running = 0.0;
            foreach ($entries as $row) {
                // Get raw amount and normalize to float
                $rawAmount = 0.0;
                if (method_exists($row, 'getAmount')) {
                    $rawAmount = (float) ($row->getAmount() ?? 0);
                }

                // Determine entry type in a resilient way
                $etype = '';
                if (method_exists($row, 'getType')) {
                    $etype = (string) ($row->getType() ?? '');
                } elseif (method_exists($row, 'getEntryType')) {
                    $etype = (string) ($row->getEntryType() ?? '');
                }

                // Apply sign rules consistently
                $et = strtoupper($etype);
                if ($et === self::TYPE_TO_CLIENT) {
                    $signed = -abs($rawAmount);
                } elseif ($et === self::TYPE_FROM_CLIENT) {
                    $signed = abs($rawAmount);
                } else {
                    $signed = $rawAmount; // neutral/no sign enforcement
                }

                $running += $signed;
                if (method_exists($row, 'setBalanceAfter')) {
                    $row->setBalanceAfter(number_format($running, 2, '.', ''));
                }
            }

            // Persist updated balances in the same request
            $this->em->flush();
        }

        return $result;
    }
}