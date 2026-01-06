<?php

namespace App\Command;

use App\Service\BookingProcessingService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:process-airbnb-imports',
    description: 'Process pending Airbnb email imports into all_bookings (and downstream logic)'
)]
class ProcessAirbnbImportsCommand extends Command
{
    public function __construct(private BookingProcessingService $bookingProcessor)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('<info>[ProcessAirbnbImports] Starting…</info>');
        try {
            $this->bookingProcessor->processAirbnbEmails();
            $output->writeln('<info>[ProcessAirbnbImports] Done.</info>');
            return Command::SUCCESS;
        } catch (\Throwable $e) {
            $output->writeln('<error>[ProcessAirbnbImports] Failed: ' . $e->getMessage() . '</error>');
            return Command::FAILURE;
        }
    }
}