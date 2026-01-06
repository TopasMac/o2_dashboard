<?php

namespace App\Command;

use App\Entity\PrivateReservation;
use App\Service\BookingAggregatorService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:sync-private-bookings',
    description: 'Sync all private reservations into all_bookings',
)]
class CommandSyncPrivateBookingsCommand extends Command
{
    private EntityManagerInterface $entityManager;
    private BookingAggregatorService $bookingAggregatorService;

    public function __construct(EntityManagerInterface $entityManager, BookingAggregatorService $bookingAggregatorService)
    {
        parent::__construct();
        $this->entityManager = $entityManager;
        $this->bookingAggregatorService = $bookingAggregatorService;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $reservations = $this->entityManager->getRepository(PrivateReservation::class)->findAll();

        if (empty($reservations)) {
            $output->writeln('<info>No private reservations found.</info>');
            return Command::SUCCESS;
        }

        foreach ($reservations as $reservation) {
            $booking = $this->bookingAggregatorService->createAllBookingFromPrivateReservation($reservation);
            if ($booking) {
                // Normalize commission_base and derived amounts before persisting
                $this->bookingAggregatorService->recalculateAllBookingFields($booking);
                $this->entityManager->persist($booking);
                $output->writeln('<info>Synced reservation: ' . $booking->getConfirmationCode() . '</info>');
            }
        }

        $output->writeln('<comment>All private reservations have been synced.</comment>');
        return Command::SUCCESS;
    }
}