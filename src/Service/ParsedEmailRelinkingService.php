<?php

namespace App\Service;

use App\Entity\ParsedAirbnbEmail;
use App\Entity\Unit;
use App\Entity\AllBookings;
use App\Repository\ParsedAirbnbEmailRepository;
use App\Repository\AllBookingsRepository;
use Doctrine\ORM\EntityManagerInterface;

class ParsedEmailRelinkingService
{
    private EntityManagerInterface $entityManager;
    private BookingAggregatorService $aggregator;
    private AllBookingsRepository $bookingsRepo;

    public function __construct(
        EntityManagerInterface $entityManager,
        BookingAggregatorService $aggregator,
        AllBookingsRepository $bookingsRepo
    ) {
        $this->entityManager = $entityManager;
        $this->aggregator = $aggregator;
        $this->bookingsRepo = $bookingsRepo;
    }

    public function relinkByListingName(string $listingName, int $unitId): int
    {
        $repo = $this->entityManager->getRepository(ParsedAirbnbEmail::class);

        // Find all parsed emails with null unitId or 'not found', and matching listingName
        $emails = $repo->createQueryBuilder('p')
            ->where('p.unit_id IS NULL OR p.unit_id = :notFound')
            ->andWhere('p.listing_name = :listingName')
            ->setParameter('notFound', 'not found')
            ->setParameter('listingName', $listingName)
            ->getQuery()
            ->getResult();

        $count = 0;
        foreach ($emails as $parsed) {
            $unit = $this->entityManager->getRepository(Unit::class)->find($unitId);
            if (!$unit) {
                continue;
            }
            $parsed->setUnitId($unit->getUnitId()); // Ensures the string unit_id (e.g., Macondo_405) is used
            $this->entityManager->persist($parsed);

            // Create or update AllBookings
            $existing = $this->bookingsRepo->findOneBy(['confirmation_code' => $parsed->getConfirmationCode()]);
            if (!$existing) {
                $booking = $this->aggregator->createAllBookingFromParsedEmail($parsed);
                if ($booking) {
                    // Mark as updated via email import (new booking from parsed email)
                    if (method_exists($booking, 'setLastUpdatedAt')) {
                        $booking->setLastUpdatedAt(new \DateTimeImmutable());
                    }
                    if (method_exists($booking, 'setLastUpdatedVia')) {
                        $booking->setLastUpdatedVia('email');
                    }
                    // Normalize commission_base and derived amounts before persisting
                    $this->aggregator->recalculateAllBookingFields($booking);
                    $this->entityManager->persist($booking);
                }
            }
            else {
                $existing->setUnitId($parsed->getUnitId()); // same: use the string unit_id
                // If we are relinking/updating an existing booking based on parsed email,
                // stamp last updated via email.
                if (method_exists($existing, 'setLastUpdatedAt')) {
                    $existing->setLastUpdatedAt(new \DateTimeImmutable());
                }
                if (method_exists($existing, 'setLastUpdatedVia')) {
                    $existing->setLastUpdatedVia('email');
                }
                // Normalize commission_base and derived amounts before persisting update
                $this->aggregator->recalculateAllBookingFields($existing);
                $this->entityManager->persist($existing);
            }

            $count++;
        }

        $this->entityManager->flush();
        return $count;
    }
}