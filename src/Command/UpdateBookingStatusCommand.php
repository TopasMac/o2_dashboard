<?php

namespace App\Command;

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

    public function __construct(EntityManagerInterface $entityManager)
    {
        parent::__construct();
        $this->entityManager = $entityManager;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $today = (new \DateTimeImmutable('now', new \DateTimeZone('America/Cancun')))->format('Y-m-d');
        $connection = $this->entityManager->getConnection();

        $past = $connection->executeStatement(
            "UPDATE all_bookings
             SET status = 'Past'
             WHERE source <> 'Owners2'
               AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
               AND check_out < :today
               AND status <> 'Past'",
            ['today' => $today]
        );

        $upcoming = $connection->executeStatement(
            "UPDATE all_bookings
             SET status = 'Upcoming'
             WHERE source <> 'Owners2'
               AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
               AND check_in > :today
               AND status <> 'Upcoming'",
            ['today' => $today]
        );

        $ongoing = $connection->executeStatement(
            "UPDATE all_bookings
             SET status = 'Ongoing'
             WHERE source <> 'Owners2'
               AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
               AND check_in <= :today
               AND check_out >= :today
               AND status <> 'Ongoing'",
            ['today' => $today]
        );

        $doneBlocks = $connection->executeStatement(
            "UPDATE all_bookings
             SET status = 'Done'
             WHERE source = 'Owners2'
               AND guest_type IN ('Cleaning', 'Maintenance', 'Late Check-Out')
               AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
               AND check_out < :today
               AND status <> 'Done'",
            ['today' => $today]
        );

        $output->writeln(sprintf(
            'Booking statuses updated successfully. Past: %d, Upcoming: %d, Ongoing: %d, Done blocks: %d.',
            $past,
            $upcoming,
            $ongoing,
            $doneBlocks
        ));

        return Command::SUCCESS;
    }
}