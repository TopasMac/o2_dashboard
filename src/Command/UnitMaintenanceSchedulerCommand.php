<?php

namespace App\Command;

use App\Service\UnitMaintenanceSchedulerService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:unit-maintenance:run',
    description: 'Generate preventive maintenance Employee Tasks based on UnitMaintenanceSchedule.',
)]
class UnitMaintenanceSchedulerCommand extends Command
{
    public function __construct(
        private UnitMaintenanceSchedulerService $schedulerService,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $io->title('Unit Maintenance Scheduler');

        try {
            $created = $this->schedulerService->run();
        } catch (\Throwable $e) {
            $io->error(sprintf('Error running scheduler: %s', $e->getMessage()));

            return Command::FAILURE;
        }

        if ($created === 0) {
            $io->writeln('No new maintenance tasks were created.');
        } else {
            $io->success(sprintf('%d maintenance task(s) created.', $created));
        }

        return Command::SUCCESS;
    }
}
