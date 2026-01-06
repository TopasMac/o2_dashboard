<?php

namespace App\Command;

use App\Entity\AllBookings;
use App\Entity\Unit;
use App\Repository\BookingConfigRepository;
use App\Service\BookingCalculatorService;
use App\Service\BookingAggregatorService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:recalculate-bookings',
    description: 'Recalculate all derived booking values (tax, commissions, room fee, etc.) for all bookings.'
)]
class RecalculateBookingsCommand extends Command
{
    private EntityManagerInterface $entityManager;
    private BookingConfigRepository $bookingConfigRepository;
    private BookingCalculatorService $bookingCalculatorService;
    private BookingAggregatorService $bookingAggregatorService;

    public function __construct(
        EntityManagerInterface $entityManager,
        BookingConfigRepository $bookingConfigRepository,
        BookingCalculatorService $bookingCalculatorService,
        BookingAggregatorService $bookingAggregatorService
    ) {
        parent::__construct();
        $this->entityManager = $entityManager;
        $this->bookingConfigRepository = $bookingConfigRepository;
        $this->bookingCalculatorService = $bookingCalculatorService;
        $this->bookingAggregatorService = $bookingAggregatorService;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('<info>Starting recalculation of all bookings...</info>');

        $config = $this->bookingConfigRepository->findLatest();

        $bookingRepo = $this->entityManager->getRepository(AllBookings::class);
        $unitRepo    = $this->entityManager->getRepository(Unit::class);

        $allBookings = $bookingRepo->findAll();
        $total       = count($allBookings);
        $index       = 1;

        // For large datasets, avoid keeping thousands of managed entities in memory.
        if ($total > 500) {
            // Iterate by ID so that after clear() we always work with managed entities fetched per-iteration.
            $bookingIds = array_map(static function (AllBookings $b): int { return (int) $b->getId(); }, $allBookings);
            unset($allBookings); // free memory

            $batchSize = 200;

            foreach ($bookingIds as $id) {
                /** @var AllBookings|null $booking */
                $booking = $bookingRepo->find($id);
                if (!$booking) {
                    $output->writeln("<comment>Skipped missing booking ID: {$id}</comment>");
                    continue;
                }

                $unit = null;
                if (method_exists($booking, 'getUnitId') && $booking->getUnitId()) {
                    $unit = $unitRepo->find($booking->getUnitId());
                }

                $this->bookingCalculatorService->recalculate($booking, $unit, $config);
                // Normalize commission_base and derived fields deterministically
                $this->bookingAggregatorService->recalculateAllBookingFields($booking);
                $output->writeln("Recalculated booking {$index}/{$total} (ID: {$booking->getId()})");

                // Flush & clear every N rows to keep memory low
                if (($index % $batchSize) === 0) {
                    $this->entityManager->flush();
                    $this->entityManager->clear();

                    // Re-acquire repositories after clear()
                    $bookingRepo = $this->entityManager->getRepository(AllBookings::class);
                    $unitRepo    = $this->entityManager->getRepository(Unit::class);
                }

                $index++;
            }

            // Final flush for the trailing batch (< batchSize)
            $this->entityManager->flush();
        } else {
            // Small dataset: simple pass without periodic clear()
            foreach ($allBookings as $booking) {
                $unit = null;

                if (method_exists($booking, 'getUnitId') && $booking->getUnitId()) {
                    $unit = $unitRepo->find($booking->getUnitId());
                }

                $this->bookingCalculatorService->recalculate($booking, $unit, $config);
                // Normalize commission_base and derived fields deterministically
                $this->bookingAggregatorService->recalculateAllBookingFields($booking);
                $output->writeln("Recalculated booking {$index}/{$total} (ID: {$booking->getId()})");
                $index++;
            }

            $this->entityManager->flush();
        }

        $output->writeln('<info>Recalculation completed successfully.</info>');

        return Command::SUCCESS;
    }
}
