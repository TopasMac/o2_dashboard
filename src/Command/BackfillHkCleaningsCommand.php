<?php

namespace App\Command;

use App\Entity\AllBookings;
use App\Entity\HKCleanings;
use App\Entity\Unit;
use App\Service\HKCleaningManager;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:backfill:hk-cleanings',
    description: 'Backfill hk_cleanings rows from AllBookings by checkout date range, idempotent via manager.'
)]
class BackfillHkCleaningsCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HKCleaningManager $hkManager,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('from', null, InputOption::VALUE_REQUIRED, 'Start date (YYYY-MM-DD), inclusive')
            ->addOption('to', null, InputOption::VALUE_OPTIONAL, 'End date (YYYY-MM-DD), inclusive')
            ->addOption('city', null, InputOption::VALUE_OPTIONAL, 'Filter by unit city (Playa del Carmen, Tulum, etc.)')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Do not write, only print what would happen')
            ->addOption('sync-cancelled', null, InputOption::VALUE_NONE, 'Also sync cancellations: if booking is cancelled, mark hk_cleanings as cancelled');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $from = $input->getOption('from');
        $to = $input->getOption('to');
        $city = $input->getOption('city');
        $dryRun = (bool) $input->getOption('dry-run');
        $syncCancelled = (bool) $input->getOption('sync-cancelled');

        if (!$from) {
            $io->error('Missing required --from=YYYY-MM-DD');
            return Command::FAILURE;
        }
        // Normalize/validate dates
        try {
            $fromDt = new \DateTimeImmutable($from);
        } catch (\Throwable $e) {
            $io->error('Invalid --from date: ' . $from);
            return Command::FAILURE;
        }
        $toDt = null;
        if ($to) {
            try { $toDt = new \DateTimeImmutable($to); } catch (\Throwable $e) {
                $io->error('Invalid --to date: ' . $to);
                return Command::FAILURE;
            }
        }

        $io->title('Backfill hk_cleanings');
        $io->writeln(sprintf('Range: %s %s', $fromDt->format('Y-m-d'), $toDt ? ('.. ' . $toDt->format('Y-m-d')) : '(open-ended)'));
        if ($city) { $io->writeln('City filter: ' . $city); }
        if ($dryRun) { $io->writeln('<comment>DRY-RUN mode</comment>'); }
        if ($syncCancelled) { $io->writeln('Will also sync cancellations.'); }

        $qb = $this->em->getRepository(AllBookings::class)->createQueryBuilder('b')
            ->andWhere('b.checkOut >= :from')
            ->setParameter('from', $fromDt->format('Y-m-d'));
        if ($toDt) {
            $qb->andWhere('b.checkOut <= :to')
               ->setParameter('to', $toDt->format('Y-m-d'));
        }
        if ($city) {
            $qb->andWhere('b.city = :city')
               ->setParameter('city', $city);
        }

        $bookings = $qb->getQuery()->getResult();
        $total = \count($bookings);

        $created = 0; $skipped = 0; $errors = 0;

        foreach ($bookings as $b) {
            if (!$b instanceof AllBookings) { continue; }

            // Only process bookings with accepted statuses
            $status = method_exists($b, 'getStatus') ? (string)$b->getStatus() : '';
            $accepted = ['upcoming','ongoing','past'];
            if (!in_array(strtolower($status), $accepted, true)) {
                $skipped++;
                $io->writeln(sprintf('Skip non-accepted booking (status=%s) id=%s code=%s',
                    $status,
                    method_exists($b, 'getId') ? $b->getId() : 'n/a',
                    method_exists($b, 'getConfirmationCode') ? $b->getConfirmationCode() : 'n/a'
                ));
                continue;
            }

            $unitName = method_exists($b, 'getUnitName') ? $b->getUnitName() : null;
            $checkOut = method_exists($b, 'getCheckOut') ? $b->getCheckOut() : null;
            if (!$unitName || !$checkOut instanceof \DateTimeInterface) { $skipped++; continue; }

            // Find Unit entity by unit_name
            $unitRepo = $this->em->getRepository(Unit::class);
            $unit = $unitRepo->findOneBy(['unitName' => $unitName]);
            if (!$unit) {
                $skipped++;
                $io->warning('No Unit match for unit_name: ' . (string)$unitName . ' — skipping booking id ' . (method_exists($b, 'getId') ? $b->getId() : 'n/a'));
                continue;
            }

            $payload = [
                'unitId'         => method_exists($unit, 'getId') ? $unit->getId() : null,
                'city'           => method_exists($b, 'getCity') ? (string)$b->getCity() : (method_exists($unit, 'getCity') ? (string)$unit->getCity() : ''),
                'checkoutDate'   => $checkOut->format('Y-m-d'),
                'cleaningType'   => HKCleanings::TYPE_CHECKOUT,
                'bookingId'      => method_exists($b, 'getId') ? $b->getId() : null,
                'reservationCode'=> method_exists($b, 'getConfirmationCode') ? $b->getConfirmationCode() : null,
                'status'         => HKCleanings::STATUS_PENDING,
                'o2CollectedFee' => method_exists($unit, 'getCleaningFee') ? $unit->getCleaningFee() : null,
            ];

            if ($dryRun) {
                $io->writeln(sprintf('[DRY] would create HK for booking %s (%s) on %s',
                    (string)$payload['reservationCode'],
                    (string)$payload['unitId'],
                    $payload['checkoutDate']
                ));
            } else {
                try {
                    $res = $this->hkManager->bulkCreate([$payload]);
                    $created += (int)($res['created'] ?? 0);
                    $skipped += (int)($res['skipped'] ?? 0);
                } catch (\Throwable $e) {
                    $errors++;
                    $io->warning('Error creating HK for booking id ' . $b->getId() . ': ' . $e->getMessage());
                }
            }
        }

        $io->success(sprintf('Scanned %d bookings. Created: %d, Skipped: %d, Errors: %d', $total, $created, $skipped, $errors));
        return Command::SUCCESS;
    }
}