<?php

namespace App\Command;

use App\Entity\AllBookings;
use App\Entity\Unit;
use App\Entity\BookingConfig;
use App\Service\BookingCalculatorService;
use App\Service\BookingAggregatorService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:update-booking-calculations',
    description: 'Update tax, commission, client income, and status fields for all bookings',
)]
class UpdateBookingCalculationsCommand extends Command
{
    private EntityManagerInterface $em;
    private BookingCalculatorService $calculator;
    private BookingAggregatorService $aggregator;

    public function __construct(EntityManagerInterface $em, BookingCalculatorService $calculator, BookingAggregatorService $aggregator)
    {
        parent::__construct();
        $this->em = $em;
        $this->calculator = $calculator;
        $this->aggregator = $aggregator;
    }

    protected function configure(): void
    {
        $this->addOption(
            'ids',
            null,
            InputOption::VALUE_REQUIRED,
            'Comma-separated list of booking IDs to update'
        );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $repo = $this->em->getRepository(AllBookings::class);

        $idsOption = $input->getOption('ids');
        if ($idsOption) {
            $ids = array_map('intval', explode(',', $idsOption));
            $bookings = $repo->createQueryBuilder('b')
                ->where('b.id IN (:ids)')
                ->setParameter('ids', $ids)
                ->getQuery()
                ->getResult();
        } else {
            $bookings = $repo->findAll();
        }

        $errorCount = 0;

        foreach ($bookings as $booking) {
            try {
                // Fetch the related unit
                $unit = null;
                if ($booking->getUnitId()) {
                    $unit = $this->em->getRepository(Unit::class)->find($booking->getUnitId());
                }

                // Determine the correct booking config code based on booking source and payment type
                $configCode = null;
                if ($booking->getSource() === 'Private') {
                    if ($booking->getPaymentMethod() === 'cash') {
                        $configCode = 'privcash_0825';
                    } elseif ($booking->getPaymentMethod() === 'card') {
                        $configCode = 'privcard_0825';
                    } elseif ($booking->getPaymentMethod() === 'no_pay') {
                        // Handle no_pay as same as privcash
                        $configCode = 'privcash_0825';
                    }
                } elseif ($booking->getSource() === 'Airbnb' && $unit) {
                    if ($unit->getPaymentType() === 'OWNERS2') {
                        $configCode = 'o2_0825';
                    } else {
                        $configCode = 'client_0825';
                    }
                }

                // Load the config entity
                $config = null;
                if ($configCode) {
                    $config = $this->em->getRepository(BookingConfig::class)->findOneBy(['configCode' => $configCode]);
                }

                if (!$config) {
                    throw new \RuntimeException('BookingConfig not found for booking ID ' . $booking->getId());
                }

                // Call calculator with all parameters
                $this->calculator->calculate($booking, $unit, $config);
                // Normalize commission_base and derived fields deterministically
                $this->aggregator->recalculateAllBookingFields($booking);
                // OWNER override: when the owner books their own unit, force zero commission/tax and O2 total equals cleaning fee
                if (strtoupper((string) $booking->getGuestType()) === 'OWNER') {
                    if (method_exists($booking, 'setCommissionBase')) {
                        $booking->setCommissionBase(0.0);
                    }
                    $booking->setO2Total((float) ($booking->getCleaningFee() ?? 0));
                    $booking->setTaxPercent(0);
                    $booking->setCommissionPercent(0);
                }
                $this->em->persist($booking);
            } catch (\Throwable $e) {
                $errorCount++;
                $output->writeln(sprintf(
                    'Error processing booking ID %d: %s',
                    $booking->getId(),
                    $e->getMessage()
                ));
            }
        }

        $this->em->flush();

        if ($errorCount > 0) {
            $output->writeln(sprintf('Finished with %d error(s).', $errorCount));
        }

        return Command::SUCCESS;
    }
}