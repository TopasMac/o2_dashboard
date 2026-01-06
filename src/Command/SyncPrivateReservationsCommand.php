<?php

namespace App\Command;

use App\Entity\PrivateReservation;
use App\Service\BookingAggregatorService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:sync-private-reservations',
    description: 'Syncs PrivateReservation entries into AllBookings table',
)]
class SyncPrivateReservationsCommand extends Command
{
    private EntityManagerInterface $entityManager;
    private BookingAggregatorService $aggregator;

    public function __construct(EntityManagerInterface $entityManager, BookingAggregatorService $aggregator)
    {
        parent::__construct();
        $this->entityManager = $entityManager;
        $this->aggregator = $aggregator;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $repo = $this->entityManager->getRepository(PrivateReservation::class);
        $reservations = $repo->findAll();

        if (!$reservations) {
            $io->warning('No private reservations found.');
            return Command::SUCCESS;
        }

        $io->info('Processing ' . count($reservations) . ' private reservations');

        foreach ($reservations as $reservation) {
            $booking = $this->aggregator->createAllBookingFromPrivateReservation($reservation);
            if ($booking) {
                // Normalize commission_base and derived amounts before persisting
                $this->aggregator->recalculateAllBookingFields($booking);
                $this->entityManager->persist($booking);
                $io->success('Synced: ' . $reservation->getGuestName());
            } else {
                $io->warning('Skipped reservation for: ' . $reservation->getGuestName());
            }
        }

        $this->entityManager->flush();
        $io->success('All private reservations processed successfully.');

        return Command::SUCCESS;
    }
}