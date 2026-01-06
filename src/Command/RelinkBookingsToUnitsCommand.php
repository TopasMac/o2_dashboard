<?php

namespace App\Command;

use App\Entity\AllBookings;
use App\Entity\Unit;
use App\Service\ParsedEmailRelinkingService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:relink-bookings',
    description: 'Relinks all_bookings records with missing unit or city based on listing_name match.',
)]
class RelinkBookingsToUnitsCommand extends Command
{
    private EntityManagerInterface $entityManager;
    private ParsedEmailRelinkingService $relinkingService;

    public function __construct(EntityManagerInterface $entityManager, ParsedEmailRelinkingService $relinkingService)
    {
        parent::__construct();
        $this->entityManager = $entityManager;
        $this->relinkingService = $relinkingService;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $unitRepo = $this->entityManager->getRepository(Unit::class);
        $bookingRepo = $this->entityManager->getRepository(\App\Entity\AllBookings::class);
        $units = $unitRepo->findAll();

        $totalRelinked = 0;

        foreach ($units as $unit) {
            $listingName = $unit->getAirbnbName();
            $unitId = $unit->getUnitId();
            $city = $unit->getCity();

            if (!$listingName || !$unitId) {
                continue;
            }

            $qb = $this->entityManager->createQueryBuilder();
            $qb->update(\App\Entity\AllBookings::class, 'b')
                ->set('b.unitId', ':unitId')
                ->set('b.city', ':city')
                ->where('b.unitId IS NULL OR b.unitId = :notFound')
                ->andWhere('LOWER(b.airbnbName) = LOWER(:listingName)')
                ->setParameter('unitId', $unitId)
                ->setParameter('city', $city)
                ->setParameter('notFound', 'no match')
                ->setParameter('listingName', $listingName);

            $query = $qb->getQuery();
            $relinkedCount = $query->execute();

            if ($relinkedCount > 0) {
                $output->writeln("<info>Relinked $relinkedCount bookings for unit '$unitId' (listing: '$listingName')</info>");
            }

            $totalRelinked += $relinkedCount;
        }

        $output->writeln("<comment>Total relinked bookings: $totalRelinked</comment>");
        return Command::SUCCESS;
    }
}
