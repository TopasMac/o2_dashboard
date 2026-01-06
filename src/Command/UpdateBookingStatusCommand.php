<?php

namespace App\Command;

use App\Entity\AllBookings;
use App\Service\BookingStatusUpdaterService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:update-booking-status',
    description: 'Updates booking status based on check-in and check-out dates'
)]
class UpdateBookingStatusCommand extends Command
{
    private EntityManagerInterface $entityManager;
    private BookingStatusUpdaterService $statusUpdater;

    public function __construct(EntityManagerInterface $entityManager, BookingStatusUpdaterService $statusUpdater)
    {
        parent::__construct();
        $this->entityManager = $entityManager;
        $this->statusUpdater = $statusUpdater;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $bookings = $this->entityManager->getRepository(AllBookings::class)->findAll();
        $this->statusUpdater->updateStatuses($bookings, true);

        $output->writeln('Booking statuses updated successfully.');

        return Command::SUCCESS;
    }
}