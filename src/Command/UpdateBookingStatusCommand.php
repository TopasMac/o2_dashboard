<?php

namespace App\Command;

use Doctrine\ORM\EntityManagerInterface;
use App\Entity\AllBookings;
use App\Service\HKCleaningManager;
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
    private HKCleaningManager $hkCleaningManager;

    public function __construct(EntityManagerInterface $entityManager, HKCleaningManager $hkCleaningManager)
    {
        parent::__construct();
        $this->entityManager = $entityManager;
        $this->hkCleaningManager = $hkCleaningManager;
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

        // Apply the idempotent booking -> cleaning policy only from the cutoff onward.
        // Upcoming/Ongoing => Pending, Past => Done + reconciliation, Cancelled => remove cleaning.
        // This policy deliberately does not create hktransactions rows.
        $hkSynced = 0;
        $hkCreated = 0;
        $hkRemoved = 0;
        $hkErrors = 0;

        $bookingIds = $connection->fetchFirstColumn(
            "SELECT id
             FROM all_bookings
             WHERE check_out >= :cutoff
               AND LOWER(COALESCE(status, '')) IN ('upcoming', 'ongoing', 'past', 'cancelled', 'canceled')
             ORDER BY id ASC",
            ['cutoff' => HKCleaningManager::RECONCILIATION_POLICY_START],
        );

        foreach ($bookingIds as $bookingId) {
            try {
                $booking = $this->entityManager->getRepository(AllBookings::class)->find((int)$bookingId);
                if (!$booking instanceof AllBookings) {
                    continue;
                }

                $result = $this->hkCleaningManager->syncCheckoutCleaningForBooking($booking);
                $hkSynced++;
                $hkCreated += (int)($result['created'] ?? 0);
                $hkRemoved += (int)($result['removed'] ?? 0);
            } catch (\Throwable $e) {
                $hkErrors++;
            }
        }

        $output->writeln(sprintf(
            'Booking statuses updated successfully. Past: %d, Upcoming: %d, Ongoing: %d, Done blocks: %d, HK synced: %d, HK created: %d, HK removed: %d, HK errors: %d.',
            $past,
            $upcoming,
            $ongoing,
            $doneBlocks,
            $hkSynced,
            $hkCreated,
            $hkRemoved,
            $hkErrors
        ));

        return Command::SUCCESS;
    }
}