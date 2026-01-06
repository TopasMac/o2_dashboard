<?php

namespace App\Service;

use App\Entity\EmailEvent;
use App\Entity\Unit;
use App\Entity\Client;
use Doctrine\ORM\EntityManagerInterface;

class EmailEventLogger
{
    public function __construct(private EntityManagerInterface $em) {}

    /**
     * Log an email event in the database.
     *
     * @param array $data Example:
     *  [
     *    'category' => 'REPORT',
     *    'unit' => $unitEntity,
     *    'client' => $clientEntity,
     *    'yearMonth' => '2025-08',
     *    'toEmail' => 'owner@example.com', // or 'to' key
     *    'ccEmail' => null,                // or 'cc' key
     *    'subject' => 'Report August 2025',
     *    'template' => 'owner_report',
     *    'payloadJson' => [...],
     *    'status' => 'SENT',
     *    'messageId' => 'abc123',
     *    'createdBy' => 'pedro@owners2.com',
     *    'attachmentCount' => 1,
     *    'attachmentsJson' => ['report_august.pdf']
     *  ]
     *  Note: 'to'/'cc' keys are also accepted as alternatives to 'toEmail'/'ccEmail'.
     */
    public function log(array $data): EmailEvent
    {
        // Normalize incoming keys from various controllers/payloads
        if (!isset($data['toEmail']) && isset($data['to'])) {
            $data['toEmail'] = $data['to'];
        }
        if (!isset($data['ccEmail']) && isset($data['cc'])) {
            $data['ccEmail'] = $data['cc'];
        }
        if (!isset($data['category'])) {
            $data['category'] = 'MISC';
        }
        if (!isset($data['status'])) {
            $data['status'] = 'SENT';
        }
        if (!isset($data['yearMonth']) && isset($data['year_month'])) {
            $data['yearMonth'] = $data['year_month'];
        }
        if (!isset($data['year_month']) && isset($data['yearMonth'])) {
            $data['year_month'] = $data['yearMonth'];
        }
        if (!isset($data['unit']) && isset($data['unitId']) && $data['unitId']) {
            $data['unit'] = $this->em->getReference(Unit::class, (int)$data['unitId']);
        }
        if (!isset($data['client']) && isset($data['clientId']) && $data['clientId']) {
            $data['client'] = $this->em->getReference(Client::class, (int)$data['clientId']);
        }
        if (!isset($data['toEmail']) && isset($data['to'])) {
            $data['toEmail'] = $data['to'];
        }
        $event = new EmailEvent();
        $event->setCategory($data['category'] ?? 'MISC');
        $event->setUnit($data['unit'] ?? null);
        $event->setClient($data['client'] ?? null);
        $event->setYearMonth($data['yearMonth'] ?? $data['year_month'] ?? null);
        $event->setToEmail($data['toEmail']);
        $event->setCcEmail($data['ccEmail'] ?? null);
        $event->setSubject($data['subject'] ?? null);
        $event->setTemplate($data['template'] ?? null);
        $event->setPayloadJson($data['payloadJson'] ?? null);
        $event->setStatus($data['status'] ?? 'SENT');
        $event->setMessageId($data['messageId'] ?? null);
        $event->setError($data['error'] ?? null);
        $event->setCreatedBy($data['createdBy'] ?? null);
        $event->setAttachmentCount($data['attachmentCount'] ?? 0);
        $event->setAttachmentsJson($data['attachmentsJson'] ?? null);

        $this->em->persist($event);
        $this->em->flush();

        return $event;
    }

    public function logSent(array $data): EmailEvent
    {
        $data['status'] = 'SENT';
        return $this->log($data);
    }

    public function logFailed(array $data, string $error): EmailEvent
    {
        $data['status'] = 'FAILED';
        $data['error'] = $error;
        return $this->log($data);
    }

    /**
     * Try to log but swallow any errors so email sending flow continues.
     */
    public function safeLog(array $data): void
    {
        try {
            $this->log($data);
        } catch (\Throwable $e) {
            // Optionally: log to Monolog or Sentry
        }
    }
}