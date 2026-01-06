<?php

namespace App\EventListener;

use App\Entity\AirbnbEmailImport;
use App\Service\BookingProcessingService;
use Doctrine\ORM\Event\PostPersistEventArgs;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsEntityListener;

#[AsEntityListener(event: 'postPersist', entity: AirbnbEmailImport::class)]
class AirbnbEmailImportListener
{
    private BookingProcessingService $bookingService;

    public function __construct(BookingProcessingService $bookingService)
    {
        $this->bookingService = $bookingService;
    }

    public function postPersist(AirbnbEmailImport $email, PostPersistEventArgs $args): void
    {
        @error_log('[AirbnbEmailImportListener] postPersist fired for import id=' . (method_exists($email, 'getId') ? (string)$email->getId() : 'n/a'));
        $this->bookingService->processAirbnbEmails();
    }
}