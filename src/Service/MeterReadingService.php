<?php

namespace App\Service;

use App\Entity\Booking;
use App\Entity\MeterReading;
use Doctrine\ORM\EntityManagerInterface;

class MeterReadingService
{
    private EntityManagerInterface $entityManager;

    public function __construct(EntityManagerInterface $entityManager)
    {
        $this->entityManager = $entityManager;
    }

    public function recalculateSegments($booking): void
    {
        // Ensure we have a booking entity
        if (!$booking) {
            return;
        }

        $readings = $booking->getMeterReadings()->toArray();

        // Sort by readingDate to ensure chronological order
        usort($readings, function (MeterReading $a, MeterReading $b) {
            return $a->getReadingDate() <=> $b->getReadingDate();
        });

        $previous = null;
        foreach ($readings as $reading) {
            if ($previous) {
                $days = max(1, $reading->getReadingDate()->diff($previous->getReadingDate())->days);
                $allowed = $days * $reading->getAllowedPerDay();
                $consumption = $reading->getValue() - $previous->getValue();
                $difference = $consumption - $allowed;
                $toCharge = $difference > 0 ? $difference * $reading->getPricePerExtra() : 0;

                // Update the previous reading's summary values
                $previous->setAllowedPeriod($allowed);
                $previous->setConsumption($consumption);
                $previous->setDifference($difference);
                $previous->setToCharge($toCharge);
            }

            $previous = $reading;
        }

        // Persist changes
        $this->entityManager->flush();
    }
}