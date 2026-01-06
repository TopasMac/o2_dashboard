<?php

namespace App\Command\ICalSync;

use App\Service\ICal\BookingIcalReconcileService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'app:reconcile-bookings', description: 'Reconcile Owners2 bookings with iCal events (non-destructive)')]
class ReconcileBookingsCommand extends Command
{
    public function __construct(
        private BookingIcalReconcileService $service,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('unit', null, InputOption::VALUE_REQUIRED, 'Limit to a specific unit ID')
            ->addOption('from', null, InputOption::VALUE_REQUIRED, 'Reconcile bookings with checkout on/after this date (YYYY-MM-DD)')
            ->addOption('to', null, InputOption::VALUE_REQUIRED, 'Reconcile bookings with checkin on/before this date (YYYY-MM-DD)')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Do not persist any changes');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $unit = $input->getOption('unit');
        $from = $this->parseDateOpt($input->getOption('from'));
        $to   = $this->parseDateOpt($input->getOption('to'));
        $dry  = (bool)$input->getOption('dry-run');

        $output->writeln('<info>Reconciling bookings with iCal events...</info>');
        if ($unit) $output->writeln(" - Unit: <comment>{$unit}</comment>");
        if ($from) $output->writeln(' - From: <comment>'.$from->format('Y-m-d').'</comment>');
        if ($to)   $output->writeln(' - To:   <comment>'.$to->format('Y-m-d').'</comment>');
        if ($dry)  $output->writeln(' - Mode: <comment>DRY RUN</comment>');

        $res = $this->service->reconcile(
            $unit ? (int)$unit : null,
            $from,
            $to,
            flush: !$dry,
        );

        $output->writeln('');
        $output->writeln(sprintf(
            'Processed: %d, Matched: %d, Conflicts: %d, Linked: %d',
            $res['processed'] ?? 0,
            $res['matched'] ?? 0,
            $res['conflicts'] ?? 0,
            $res['linked'] ?? 0,
        ));

        // Print a short table of conflicts for quick visibility
        $conflicts = array_values(array_filter($res['items'] ?? [], fn($i) => ($i['status'] ?? null) === 'conflict'));
        if ($conflicts) {
            $output->writeln("\n<comment>Conflicts:</comment>");
            foreach ($conflicts as $row) {
                $output->writeln(sprintf(
                    ' - Booking #%s (unit %s): %s → %s vs iCal %s → %s [event %s] RC:%s',
                    $row['bookingId'] ?? '-',
                    $row['unitId'] ?? '-',
                    $row['checkIn'] ?? '-',
                    $row['checkOut'] ?? '-',
                    $row['eventDtStart'] ?? '-',
                    $row['eventDtEnd'] ?? '-',
                    $row['linkedEventId'] ?? '-',
                    $row['reservationCode'] ?? '-',
                ));
            }
        }

        $output->writeln("\n<info>Done.</info>");
        return Command::SUCCESS;
    }

    private function parseDateOpt(?string $val): ?\DateTimeImmutable
    {
        if (!$val) return null;
        try {
            return new \DateTimeImmutable($val.' 00:00:00');
        } catch (\Throwable) {
            return null;
        }
    }
}
