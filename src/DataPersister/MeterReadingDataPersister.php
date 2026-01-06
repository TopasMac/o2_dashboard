<?php

namespace App\DataPersister;

use ApiPlatform\Core\DataPersister\ContextAwareDataPersisterInterface;
use App\Entity\MeterReading;
use Doctrine\ORM\EntityManagerInterface;
use App\Service\MeterReadingService;

class MeterReadingDataPersister implements ContextAwareDataPersisterInterface
{
    private EntityManagerInterface $entityManager;
    private MeterReadingService $meterReadingService;

    public function __construct(EntityManagerInterface $entityManager, MeterReadingService $meterReadingService)
    {
        $this->entityManager = $entityManager;
        $this->meterReadingService = $meterReadingService;
    }

    public function supports($data, array $context = []): bool
    {
        return $data instanceof MeterReading;
    }

    public function persist($data, array $context = [])
    {
        if ($data instanceof MeterReading) {
            // Normalize the readingDate to strip time before persisting
            if ($data->getReadingDate() instanceof \DateTimeInterface) {
                $data->setReadingDate(
                    \DateTime::createFromFormat('Y-m-d', $data->getReadingDate()->format('Y-m-d'))
                );
            }

            $booking = $data->getBooking();
            $readings = $booking->getMeterReadings();

            if ($readings->first() && $readings->first()->getId() === $data->getId()) {
                foreach ($readings as $reading) {
                    $reading->setAllowedPerDay($data->getAllowedPerDay());
                    $reading->setPricePerExtra($data->getPricePerExtra());
                    $this->entityManager->persist($reading);
                }
            } else {
                // Ensure the current reading is persisted
                $this->entityManager->persist($data);
            }

            $this->entityManager->flush();

            // Always recalculate after updates
            $this->meterReadingService->recalculateSegments($booking);
        }
        return $data;
    }

    public function remove($data, array $context = [])
    {
        if ($data instanceof MeterReading) {
            $this->entityManager->remove($data);
            $this->entityManager->flush();

            // Recalculate segments after deletion
            $this->meterReadingService->recalculateSegments($data->getBooking());
        }
    }
}