<?php

namespace App\Command;

use App\Entity\AllBookings;
use App\Entity\ReviewAction;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:airbnb-review-timeouts',
    description: 'Mark overdue Airbnb reservations as timeout in review_action table',
)]
class AirbnbReviewTimeoutCommand extends Command
{
    protected static $defaultName = 'app:airbnb-review-timeouts';

    private EntityManagerInterface $em;

    public function __construct(EntityManagerInterface $em)
    {
        parent::__construct();
        $this->em = $em;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $io->title('Airbnb review timeouts');

        // Reference timezone should match the rest of the dashboard (America/Cancun).
        $tz = new \DateTimeZone('America/Cancun');
        $today = new \DateTimeImmutable('today', $tz);

        // Cutoff: reservations whose checkout is more than 12 days before today.
        // Example: if today is 2025-12-15, then cutoff is 2025-12-03 (<= today - 12 days).
        $cutoffDate = $today->modify('-12 days')->format('Y-m-d');

        $io->text(sprintf('Today: %s (TZ: %s)', $today->format('Y-m-d'), $tz->getName()));
        $io->text(sprintf('Marking timeouts for checkouts on or before: %s', $cutoffDate));

        $bookingRepo = $this->em->getRepository(AllBookings::class);
        $reviewRepo  = $this->em->getRepository(ReviewAction::class);

        // 1) Fetch all Airbnb bookings with:
        //    - source = Airbnb
        //    - status = Past
        //    - checkOut <= cutoffDate
        /** @var AllBookings[] $bookings */
        $bookings = $bookingRepo->createQueryBuilder('b')
            ->where('b.source = :src')
            ->andWhere('b.status = :pastStatus')
            ->andWhere('b.checkOut <= :cutoff')
            ->andWhere('b.checkOut > :minDate')
            ->setParameter('src', 'Airbnb')
            ->setParameter('pastStatus', 'Past')
            ->setParameter('cutoff', $cutoffDate)
            ->setParameter('minDate', '2025-12-01')
            ->orderBy('b.checkOut', 'ASC')
            ->getQuery()
            ->getResult();

        if (!$bookings) {
            $io->success('No eligible Airbnb bookings found for timeout.');
            return Command::SUCCESS;
        }

        $io->text(sprintf('Found %d Airbnb bookings (Past, checkout <= %s)', count($bookings), $cutoffDate));

        // 2) Build a map of existing ReviewAction rows keyed by reservationId
        $reservationIds = array_map(static fn (AllBookings $b) => $b->getId(), $bookings);

        if (empty($reservationIds)) {
            $io->success('No reservation IDs to process.');
            return Command::SUCCESS;
        }

        /** @var ReviewAction[] $existingActions */
        $existingActions = $reviewRepo->createQueryBuilder('r')
            ->where('r.reservationId IN (:ids)')
            ->setParameter('ids', $reservationIds)
            ->getQuery()
            ->getResult();

        $byReservation = [];
        foreach ($existingActions as $action) {
            $byReservation[$action->getReservationId()] = $action;
        }

        $createdCount = 0;
        $skippedCount = 0;

        // 3) For each booking, create a timeout ReviewAction if none exists.
        foreach ($bookings as $booking) {
            $reservationId = $booking->getId();

            if (isset($byReservation[$reservationId])) {
                // Already has an action (made/skipped/timeout) → skip
                $skippedCount++;
                continue;
            }

            $reviewAction = new ReviewAction();
            $reviewAction->setReservationId($reservationId);
            $reviewAction->setStatus('timeout');
            $reviewAction->setSource('Airbnb');
            $reviewAction->setUnitId($booking->getUnitId());
            $reviewAction->setUnitName($booking->getUnitName());
            $reviewAction->setCheckoutDate(new \DateTimeImmutable($booking->getCheckOut()->format('Y-m-d')));

            $this->em->persist($reviewAction);
            $createdCount++;
        }

        if ($createdCount > 0) {
            $this->em->flush();
        }

        $io->success(sprintf(
            'Timeout job complete. Created %d timeout actions, skipped %d bookings that already had actions.',
            $createdCount,
            $skippedCount
        ));

        return Command::SUCCESS;
    }
}
