<?php

namespace App\Command;

use Doctrine\ORM\EntityManagerInterface;
use App\Entity\HKCleanings;
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

        // Keep existing booking status SQL logic intact, then sync eligible HK cleanings.
        // For Playa/Tulum reservations that are already past and not cancelled, pending checkout cleanings
        // should be considered performed and moved to DONE. markDoneAndCreateTransaction() also creates
        // the HK transaction and, for Tulum, the reconciliation snapshot row.
        $hkDone = 0;
        $hkErrors = 0;

        $pendingCleaningIds = $connection->fetchFirstColumn(
            "SELECT hc.id
             FROM hk_cleanings hc
             INNER JOIN all_bookings b ON b.id = hc.booking_id
             LEFT JOIN unit u ON u.id = hc.unit_id
             WHERE b.source <> 'Owners2'
               AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled')
               AND b.check_out < :today
               AND LOWER(COALESCE(hc.status, '')) = 'pending'
               AND LOWER(COALESCE(hc.cleaning_type, '')) = 'checkout'
               AND LOWER(TRIM(COALESCE(hc.city, u.city, ''))) IN ('tulum', 'playa del carmen')",
            ['today' => $today]
        );

        foreach ($pendingCleaningIds as $hkId) {
            try {
                $hk = $this->entityManager->getRepository(HKCleanings::class)->find((int)$hkId);
                if (!$hk instanceof HKCleanings) {
                    continue;
                }

                $this->hkCleaningManager->markDoneAndCreateTransaction($hk);
                $hkDone++;
            } catch (\Throwable $e) {
                $hkErrors++;
            }
        }

        $output->writeln(sprintf(
            'Booking statuses updated successfully. Past: %d, Upcoming: %d, Ongoing: %d, Done blocks: %d, HK done: %d, HK errors: %d.',
            $past,
            $upcoming,
            $ongoing,
            $doneBlocks,
            $hkDone,
            $hkErrors
        ));

        return Command::SUCCESS;
    }
}