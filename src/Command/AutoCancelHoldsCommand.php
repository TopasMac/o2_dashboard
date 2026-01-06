<?php

namespace App\Command;

use App\Entity\AllBookings;
use App\Service\MonthSliceRefresher;
use App\Service\BookingStatusUpdaterService;
use DateTimeImmutable;
use DateTimeZone;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:holds:auto-cancel',
    description: 'Auto-cancel expired Hold reservations and free their calendar dates'
)]
class AutoCancelHoldsCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MonthSliceRefresher $refresher,
        private readonly BookingStatusUpdaterService $statusUpdater,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Simulate without saving')
            ->addOption('limit', null, InputOption::VALUE_REQUIRED, 'Max rows to process', '200');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io       = new SymfonyStyle($input, $output);
        $dryRun   = (bool) $input->getOption('dry-run');
        $limit    = max(1, (int) $input->getOption('limit'));
        $tzCancun = new DateTimeZone('America/Cancun');
        $now      = new DateTimeImmutable('now', $tzCancun);

        $qb = $this->em->getRepository(AllBookings::class)->createQueryBuilder('b');
        $qb
            ->where($qb->expr()->orX(
                'LOWER(b.guestType) = :hold',
                'LOWER(b.status) = :hold'
            ))
            ->andWhere('b.holdExpiresAt IS NOT NULL')
            ->andWhere('b.holdExpiresAt <= :now')
            ->andWhere('LOWER(b.status) NOT IN (:skip)')
            ->setParameter('hold', 'hold')
            ->setParameter('skip', ['cancelled', 'expired'])
            ->setParameter('now', $now)
            ->setMaxResults($limit);

        $expired = $qb->getQuery()->getResult();

        if (!$expired) {
            $io->success('No expired holds found.');
            return Command::SUCCESS;
        }

        $io->section(sprintf('Found %d expired hold(s)', count($expired)));

        $processed = [];
        foreach ($expired as $b) {
            if (!$b instanceof AllBookings) {
                continue;
            }

            $ci = $b->getCheckIn();
            $co = $b->getCheckOut();

            $io->writeln(sprintf(
                ' - #%d %s [%s → %s] unit %s',
                $b->getId(),
                (string) $b->getConfirmationCode(),
                $ci?->format('Y-m-d'),
                $co?->format('Y-m-d'),
                (string) $b->getUnitId()
            ));

            if (!$dryRun) {
                // mark as expired (keep policy & expiresAt for audit)
                $b->setStatus('Expired');
                if (method_exists($b, 'setLastUpdatedVia')) { $b->setLastUpdatedVia('sweeper'); }
                if (method_exists($b, 'setLastUpdatedAt'))  { $b->setLastUpdatedAt(new DateTimeImmutable('now', $tzCancun)); }

                $this->em->persist($b);
                $processed[] = $b;
            }
        }

        if (!$dryRun) {
            $this->em->flush();

            // Free calendar slices and update statuses
            foreach ($processed as $b) {
                $ci = $b->getCheckIn();
                $co = $b->getCheckOut();
                if ($ci instanceof \DateTimeInterface && $co instanceof \DateTimeInterface) {
                    $this->refresher->refreshForBooking($b->getId(), $ci, $co);
                }
            }
            try {
                $this->statusUpdater->updateStatuses($processed, true);
            } catch (\Throwable $e) {
                $io->warning('Status updater error: ' . $e->getMessage());
            }
        }

        $io->success(sprintf('%s %d expired hold(s).', $dryRun ? 'Would cancel' : 'Cancelled', count($expired)));
        return Command::SUCCESS;
    }
}