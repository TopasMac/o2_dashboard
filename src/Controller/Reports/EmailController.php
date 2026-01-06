<?php

namespace App\Controller\Reports;

use App\Service\ReportEmailDispatcher;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Aws\S3\S3Client;
use Aws\Exception\AwsException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse as HttpJsonResponse;
use App\Service\EmailEventLogger;
use Doctrine\ORM\EntityManagerInterface;
use App\Entity\Unit;
use App\Entity\Client;

class EmailController extends AbstractController
{
    private ReportEmailDispatcher $dispatcher;
    private ?S3Client $s3 = null;
    private LoggerInterface $logger;
    private EmailEventLogger $emailLogger;
    private EntityManagerInterface $em;

    public function __construct(ReportEmailDispatcher $dispatcher, LoggerInterface $logger, EmailEventLogger $emailLogger, EntityManagerInterface $em, ?S3Client $s3 = null)
    {
        $this->dispatcher = $dispatcher;
        $this->logger = $logger;
        $this->emailLogger = $emailLogger;
        $this->em = $em;
        $this->s3 = $s3; // may be null; we'll lazy‑init when needed
    }

    /** Ensure we have an S3 client; attempt lazy init if missing. */
    private function ensureS3(): ?S3Client
    {
        if ($this->s3 instanceof S3Client) {
            return $this->s3;
        }
        try {
            $region = $_ENV['AWS_S3_REGION'] ?? $_ENV['AWS_DEFAULT_REGION'] ?? getenv('AWS_DEFAULT_REGION') ?: 'us-east-2';
            $this->s3 = new S3Client([
                'version' => 'latest',
                'region'  => $region,
                // Credentials resolved automatically from env/instance role
            ]);
            return $this->s3;
        } catch (\Throwable $e) {
            // Leave null; callers decide whether to degrade gracefully
            $this->logger->error('[EmailController] Failed to init S3 client', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /** Resolve Unit and Client entities (nullable) */
    private function resolveUnitClient(?int $unitId, ?int $clientId): array
    {
        $unit = null; $client = null;
        try {
            if ($unitId) { $unit = $this->em->getRepository(Unit::class)->find($unitId); }
        } catch (\Throwable $e) { /* ignore */ }
        try {
            if ($clientId) { $client = $this->em->getRepository(Client::class)->find($clientId); }
        } catch (\Throwable $e) { /* ignore */ }
        return [$unit, $client];
    }

    /** Core sender used by both generic and report endpoints */
    private function performSend(array $body, string $defaultCategory = 'MISC'): JsonResponse
    {
        $to       = (string)($body['to'] ?? '');
        $subject  = (string)($body['subject'] ?? '');
        $htmlBody = (string)($body['htmlBody'] ?? '');
        $attachments = is_array($body['attachments'] ?? null) ? $body['attachments'] : [];
        $attached = false; // track if we actually attached the PDF bytes

        // Normalize any incoming attachments (support url/name or contentBase64)
        if (!isset($extra['attachments']) || !is_array($extra['attachments'])) {
            $extra['attachments'] = [];
        }
        foreach ($attachments as $att) {
            if (!is_array($att)) { continue; }
            $name = (string)($att['name'] ?? ($att['filename'] ?? 'attachment.pdf'));
            $url  = (string)($att['url'] ?? ($att['s3Url'] ?? ($att['s3_url'] ?? '')));
            $b64  = (string)($att['contentBase64'] ?? '');

            if ($b64 !== '') {
                // Already packaged as base64
                $extra['attachments'][] = [
                    'filename'      => $name,
                    'contentBase64' => $b64,
                    'contentType'   => $att['contentType'] ?? 'application/pdf',
                ];
                continue;
            }

            if ($url !== '') {
                // Try to fetch bytes (best effort). If it fails, pass URL through so dispatcher can fetch.
                $bytes = null;
                try {
                    $ctx = stream_context_create([
                        'http' => ['timeout' => 6],
                        'https' => ['timeout' => 6],
                    ]);
                    $raw = @file_get_contents($url, false, $ctx);
                    if (is_string($raw) && $raw !== '') {
                        $bytes = $raw;
                    }
                } catch (\Throwable $e) {
                    // ignore; will fall back to URL-based attach
                }

                if (is_string($bytes) && $bytes !== '') {
                    $extra['attachments'][] = [
                        'filename'      => $name,
                        'contentBase64' => base64_encode($bytes),
                        'contentType'   => $att['contentType'] ?? 'application/pdf',
                    ];
                } else {
                    // Fallback: let dispatcher fetch by URL
                    $extra['attachments'][] = [
                        'filename' => $name,
                        'url'      => $url,
                    ];
                }
            }
        }

        if ($to === '' || $subject === '') {
            return $this->json(['ok' => false, 'error' => 'Missing required fields (to, subject)'], 400);
        }

        $category  = (string)($body['category'] ?? $defaultCategory);
        // Normalize category to canonical constants used in DB
        if (strtoupper($category) === 'REPORT' || strtoupper($category) === 'MONTH_REPORT') {
            $category = 'MONTH_REPORT';
        }
        $unitId    = isset($body['unitId']) ? (int)$body['unitId'] : null;
        $clientId  = isset($body['clientId']) ? (int)$body['clientId'] : null;
        $yearMonth = isset($body['yearMonth']) ? (string)$body['yearMonth'] : null; // YYYY-MM

        // Start with all incoming fields so ids/s3Key/attach/template are preserved.
        $extra = $body;
        if ($attachments) { $extra['attachments'] = $attachments; }

        // Optional S3 link/attachment support (same logic as before)
        $presignedUrl = null;
        $bucket = $_ENV['AWS_S3_BUCKET'] ?? '';
        $ttl = (int)($_ENV['REPORTS_PRESIGN_TTL'] ?? 900);
        $s3Key = $body['s3Key'] ?? null;
        // Accept direct S3/public URL as fallback (when we only store s3_url)
        $s3Url = $body['s3Url'] ?? ($body['s3_url'] ?? null);
        if ($s3Url) {
            // Make it available to the dispatcher (which can attach via URL)
            $extra['s3Url'] = $s3Url;
        }
        if (!$s3Key && $unitId && $yearMonth) {
            $s3Key = sprintf('reports/%s/%s.pdf', $unitId, $yearMonth);
        }
        if ($bucket && $s3Key) {
            $s3 = $this->ensureS3();
            if ($s3) {
                try {
                    // Prepare a presigned URL (we might still include it if we cannot attach)
                    $cmd = $s3->getCommand('GetObject', ['Bucket' => $bucket, 'Key' => $s3Key]);
                    $request = $s3->createPresignedRequest($cmd, sprintf('+%d seconds', $ttl));
                    $presignedUrl = (string) $request->getUri();

                    $downloadName = basename($s3Key) ?: 'report.pdf';

                    // Avoid duplicating if an identical filename already queued
                    $alreadyQueued = false;
                    if (isset($extra['attachments']) && is_array($extra['attachments'])) {
                        foreach ($extra['attachments'] as $ea) {
                            if (($ea['filename'] ?? null) === $downloadName) { $alreadyQueued = true; break; }
                        }
                    }

                    // Attempt to ATTACH first (when requested)
                    if (!empty($body['attach']) && !$alreadyQueued) {
                        $obj = $s3->getObject(['Bucket' => $bucket, 'Key' => $s3Key]);
                        $bytes = (string) $obj['Body'];
                        $mime = $obj['ContentType'] ?? 'application/pdf';
                        if (!isset($extra['attachments']) || !is_array($extra['attachments'])) { $extra['attachments'] = []; }
                        $extra['attachments'][] = [
                            'filename'      => $downloadName,
                            'contentBase64' => base64_encode($bytes),
                            'contentType'   => $mime,
                        ];
                        $attached = true;
                    }

                    // Only if we did NOT attach, append a presigned link
                    if (!$attached && !$alreadyQueued) {
                        $linkHtml = sprintf('<p>Download file: <a href="%s">%s</a> (expires in %d minutes)</p>',
                            htmlspecialchars($presignedUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                            htmlspecialchars($downloadName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                            (int)ceil($ttl / 60)
                        );
                        $htmlBody .= "\n" . $linkHtml;
                    }
                } catch (AwsException $e) {
                    $extra['s3Error'] = $e->getAwsErrorMessage() ?: $e->getMessage();
                } catch (\Throwable $e) {
                    $extra['s3Error'] = $e->getMessage();
                }
            } else {
                $extra['s3Error'] = 'S3 client not configured';
            }
        }
        // If we didn’t presign (no s3Key), but we do have an s3Url, append it as a direct link so the recipient can download
        $skipDirectLink = false;
        if (isset($extra['attachments']) && is_array($extra['attachments'])) {
            foreach ($extra['attachments'] as $ea) {
                if (isset($ea['url']) && isset($extra['s3Url']) && $ea['url'] === $extra['s3Url']) { $skipDirectLink = true; break; }
            }
        }
        if (!$attached && !$presignedUrl && !$skipDirectLink && isset($extra['s3Url']) && is_string($extra['s3Url']) && $extra['s3Url'] !== '') {
            $downloadName = 'report.pdf';
            $linkHtml = sprintf('<p>Download file: <a href="%s">%s</a></p>',
                htmlspecialchars($extra['s3Url'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                htmlspecialchars($downloadName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            );
            $htmlBody .= "\n" . $linkHtml;
        }

        // ---- Ensure signature is included for SEND (replace preview placeholder, or append if missing) ----
        try {
            $hasSigImg = stripos($htmlBody, 'owners2-signature.png') !== false;
            $hasSigText = stripos($htmlBody, 'Owners2 • Rental Management Services') !== false;
            $hasSignature = $hasSigImg || $hasSigText;

            if (!$hasSignature) {
                $signatureHtml = $this->renderSignature();

                // Replace placeholder if present (with or without <em>)
                $patterns = [
                    '~<em>\\(signature will be added when sent\\)</em>~i',
                    '~\\(signature will be added when sent\\)~i',
                ];
                $replaced = false;
                foreach ($patterns as $rx) {
                    $new = preg_replace($rx, $signatureHtml, $htmlBody, 1, $count);
                    if (is_string($new) && $count > 0) {
                        $htmlBody = $new;
                        $replaced = true;
                        break;
                    }
                }

                // If no placeholder found, append signature
                if (!$replaced) {
                    $htmlBody .= $signatureHtml;
                }
            }
        } catch (\Throwable $e) {
            // do not block email on signature injection failures
            $this->logger->warning('[EmailController] signature injection skipped', ['error' => $e->getMessage()]);
        }

        // Resolve relations early so we can derive CC before dispatch and for logging
        [$unit, $client] = $this->resolveUnitClient($unitId, $clientId);

        // Derive CC if not explicitly provided
        if (empty($body['cc']) && empty($body['ccEmail']) && empty($extra['cc'])) {
            $derivedCc = [];
            if ($unit && method_exists($unit, 'getCcEmail')) {
                $uCc = trim((string)$unit->getCcEmail());
                if ($uCc !== '') { $derivedCc[] = $uCc; }
            }
            if ($client && method_exists($client, 'getCcEmail')) {
                $cCc = trim((string)$client->getCcEmail());
                if ($cCc !== '') { $derivedCc[] = $cCc; }
            }
            if (!empty($derivedCc)) {
                $extra['cc'] = implode(',', array_values(array_unique($derivedCc)));
            }
        } else {
            // Respect explicit cc from caller (body wins)
            $explicitCc = $body['cc'] ?? ($body['ccEmail'] ?? ($extra['cc'] ?? null));
            if (is_string($explicitCc) && trim($explicitCc) !== '') {
                $extra['cc'] = trim($explicitCc);
            }
        }

        // Send email via dispatcher
        $result = $this->dispatcher->sendEmail($to, $subject, $htmlBody, $extra);

        // Log email event and persist status to owner_report_cycle if relevant
        try {
            $logData = [
                'category'         => $category,               // e.g., MONTH_REPORT
                'unit'             => $unit,
                'client'           => $client,
                'yearMonth'        => $yearMonth,
                'toEmail'          => $to,
                'ccEmail' => $extra['cc'] ?? ($body['cc'] ?? ($body['ccEmail'] ?? null)),
                'subject'          => $subject,
                'attachmentCount'  => isset($extra['attachments']) && is_array($extra['attachments']) ? count($extra['attachments']) : 0,
                'attachmentsJson'  => isset($extra['attachments']) && is_array($extra['attachments']) ? array_map(fn($a) => $a['filename'] ?? 'attachment', $extra['attachments']) : null,
                'createdBy'        => $this->getUser() ? $this->getUser()->getUserIdentifier() : null,
            ];

            $eventId = null; // will try to capture for FK
            if ($result['status'] >= 200 && $result['status'] < 300) {
                $messageId = $result['data']['messageId'] ?? null;

                // Derive normalized fields for email_event
                $toEmail = $to;
                $ccEmail = $extra['cc'] ?? ($body['cc'] ?? ($body['ccEmail'] ?? null));
                $attachmentCount = (isset($extra['attachments']) && is_array($extra['attachments'])) ? count($extra['attachments']) : 0;
                $attachmentsJson = (isset($extra['attachments']) && is_array($extra['attachments']))
                    ? json_encode(array_map(fn($a) => $a['filename'] ?? 'attachment', $extra['attachments']))
                    : null;
                $createdBy = $this->getUser() ? $this->getUser()->getUserIdentifier() : null;

                try {
                    $conn = $this->em->getConnection();
                    $conn->executeStatement(
                        'INSERT INTO `email_event`
                            (`unit_id`,`client_id`,`category`,`year_month`,`to_email`,`cc_email`,
                             `subject`,`status`,`message_id`,`error`,`sent_at`,`created_by`,
                             `attachment_count`,`attachments_json`)
                         VALUES
                            (:uid, :cid, :cat, :ym, :toEmail, :ccEmail,
                             :subject, :status, :msgId, NULL, NOW(), :createdBy,
                             :attCount, :attJson)',
                        [
                            'uid'       => $unitId,
                            'cid'       => $clientId,
                            'cat'       => $category,
                            'ym'        => $yearMonth,
                            'toEmail'   => $toEmail,
                            'ccEmail'   => $ccEmail,
                            'subject'   => $subject,
                            'status'    => 'SENT',
                            'msgId'     => $messageId,
                            'createdBy' => $createdBy,
                            'attCount'  => $attachmentCount,
                            'attJson'   => $attachmentsJson,
                        ]
                    );
                    // capture inserted id
                    $eventId = (int)$conn->lastInsertId();
                } catch (\Throwable $e) {
                    $this->logger->warning('[EmailController] direct email_event insert failed', ['error' => $e->getMessage()]);
                    $eventId = null;
                }
            } else {
                $logData['error'] = $result['data']['error'] ?? ('HTTP '.$result['status']);
                $logData['status'] = 'FAILED';
                $event = $this->emailLogger->log($logData);
                $eventId = method_exists($event, 'getId') ? $event->getId() : null;
            }

            // Fallback lookup if logger did not return id
            if ($eventId === null) {
                try {
                    $conn = $this->em->getConnection();
                    $eventRow = $conn->fetchAssociative(
                        'SELECT id FROM email_event 
                          WHERE unit_id = :uid AND (`year_month` = :ym OR :ym IS NULL) 
                            AND to_email = :toEmail AND subject = :subject 
                          ORDER BY id DESC LIMIT 1',
                        [
                            'uid' => $unitId,
                            'ym'  => $yearMonth,
                            'toEmail' => $to,
                            'subject' => $subject,
                        ]
                    );
                    if (is_array($eventRow) && isset($eventRow['id'])) {
                        $eventId = (int)$eventRow['id'];
                    }
                } catch (\Throwable $e) { /* ignore */ }
            }

            // Mirror status to owner_report_cycle for Unit Monthly reports
            if ($category === 'MONTH_REPORT' && $unitId && $yearMonth) {
                try {
                    $now = new \DateTimeImmutable();
                    $conn = $this->em->getConnection();

                    if ($result['status'] >= 200 && $result['status'] < 300) {
                        // Ensure a row exists (insert-if-missing) with initial SENT + count=1
                        $conn->executeStatement(
                            'INSERT INTO `owner_report_cycle` (`unit_id`,`report_month`,`email_status`,`email_at`,`email_count`,`created_at`,`updated_at`)
                             SELECT :uid, :ym, :status, NOW(), 1, NOW(), NOW()
                             WHERE NOT EXISTS (
                               SELECT 1 FROM `owner_report_cycle` WHERE `unit_id` = :uid AND `report_month` = :ym
                             )',
                            [
                                'uid'    => $unitId,
                                'ym'     => $yearMonth,
                                'status' => 'SENT',
                            ]
                        );

                        // Update to reflect LAST send time + increment count + store last_email_event_id (FK) and optional provider message id
                        $conn->executeStatement(
                            'UPDATE `owner_report_cycle`
                                SET `email_status` = :status,
                                    `email_at`     = NOW(),
                                    `email_count`  = COALESCE(`email_count`, 0) + 1,
                                    `last_email_event_id` = :eventId,
                                    `email_message_id` = :msgId,
                                    `updated_at`   = NOW()
                              WHERE `unit_id` = :uid AND `report_month` = :ym',
                            [
                                'status'  => 'SENT',
                                'eventId' => $eventId,
                                'msgId'   => $result['data']['messageId'] ?? null,
                                'uid'     => $unitId,
                                'ym'      => $yearMonth,
                            ]
                        );
                    } else {
                        // FAILED (do not increment count; just mark failed and bump updated_at)
                        $conn->executeStatement(
                            'UPDATE `owner_report_cycle`
                                SET `email_status` = :status,
                                    `updated_at`   = :upd
                              WHERE `unit_id` = :uid AND `report_month` = :ym',
                            [
                                'status'  => 'FAILED',
                                'upd'     => $now,
                                'uid'     => $unitId,
                                'ym'      => $yearMonth,
                            ]
                        );
                    }
                } catch (\Throwable $e) {
                    $this->logger->warning('[EmailController] Failed to update owner_report_cycle', ['error' => $e->getMessage()]);
                }
            }
        } catch (\Throwable $e) {
            // Never break email flow due to logging
            $this->logger->warning('[EmailController] email log failed', ['error' => $e->getMessage()]);
        }

        if ($result['status'] >= 200 && $result['status'] < 300) {
            return $this->json(['ok' => true, 'flow' => $result['data'], 'category' => $category]);
        }
        return $this->json(['ok' => false, 'status' => $result['status'], 'flow' => $result['data'], 'category' => $category], 500);
    }

    #[Route('/api/service-payment/email', name: 'api_service_payment_email', methods: ['POST'])]
    public function sendServicePaymentEmail(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $unitId        = isset($payload['unitId']) ? (int)$payload['unitId'] : null;
        $clientId      = isset($payload['clientId']) ? (int)$payload['clientId'] : null;
        $transactionId = isset($payload['transactionId']) ? (int)$payload['transactionId'] : null;
        $yearMonth     = isset($payload['yearMonth']) ? (string)$payload['yearMonth'] : null; // YYYY-MM
        $serviceName   = trim((string)($payload['serviceName'] ?? ($payload['serviceKey'] ?? '')));

        if (!$unitId || !$transactionId || !$yearMonth) {
            return $this->json(['ok' => false, 'error' => 'unitId, transactionId and yearMonth are required'], 400);
        }
        if ($serviceName === '') {
            $serviceName = 'Servicio'; // fallback label
        }

        // Resolve Unit + Client (for unit name, recipient fallback and first-name greeting)
        [$unit, $client] = $this->resolveUnitClient($unitId, $clientId);
        if (!$client && $unit && method_exists($unit, 'getClient')) {
            try { $client = $unit->getClient(); } catch (\Throwable $e) { /* ignore */ }
        }

        // To (condo email usually provided by caller)
        $to = trim((string)($payload['to'] ?? ''));
        if ($to === '') {
            return $this->json(['ok' => false, 'error' => 'Recipient email (to) is required'], 400);
        }

        // CC derivation: explicit -> unit.cc_email -> client.cc_email
        $ccList = [];
        $explicitCc = $payload['cc'] ?? ($payload['cc_email'] ?? ($payload['ccEmail'] ?? null));
        if (is_string($explicitCc) && trim($explicitCc) !== '') {
            $ccList = array_merge($ccList, array_map('trim', explode(',', $explicitCc)));
        }
        if ($unit && method_exists($unit, 'getCcEmail')) {
            $uCc = trim((string)$unit->getCcEmail());
            if ($uCc !== '') { $ccList[] = $uCc; }
        }
        if ($client && method_exists($client, 'getCcEmail')) {
            $cCc = trim((string)$client->getCcEmail());
            if ($cCc !== '') { $ccList[] = $cCc; }
        }
        $ccList = array_values(array_filter(array_unique($ccList), fn($v) => $v !== ''));

        $unitName = method_exists($unit, 'getUnitName') ? (string)$unit->getUnitName() : ('Unit #' . $unitId);

        // Greeting first name
        $clientFirstName = '';
        if ($client && method_exists($client, 'getName')) {
            try {
                $fullName = trim((string)$client->getName());
                if ($fullName !== '') {
                    $parts = preg_split('/\s+/', $fullName);
                    $first = $parts[0] ?? '';
                    if ($first !== '') {
                        $clientFirstName = $first;
                    }
                }
            } catch (\Throwable $e) { /* ignore */ }
        }
        $clientFirstNameHtml = htmlspecialchars($clientFirstName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        // Language (default es; you can extend to en later if needed)
        $lang = strtolower(trim((string)($payload['language'] ?? '')));
        if ($lang === '' && $client && method_exists($client, 'getLanguage')) {
            try { $lang = strtolower((string)$client->getLanguage() ?: ''); } catch (\Throwable $e) { $lang = ''; }
        }
        if ($lang === '') { $lang = 'es'; }
        // Force Spanish for Service Payments
        $lang = 'es';

        // Spanish-only templates for Service Payments (policy: emails always in Spanish)
        $ym = $yearMonth;
        $m = preg_match('/^\d{4}-(\d{1,2})$/', $ym, $mm) ? (int)$mm[1] : null;
        $yy = (int)substr($ym, 0, 4);
        $monthNamesEs = [null,'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        $monthName = ($m && $m >=1 && $m <=12) ? $monthNamesEs[$m] : $ym;
        $subject = $payload['subject'] ?? sprintf('Comprobante de pago — %s — %s — %s %d', $serviceName, $unitName, $monthName, $yy);
        $htmlBody = sprintf(
            'Estimados Administradores,<br/><br/>' .
            'Adjuntamos el comprobante de pago de <b>%s</b> correspondiente a <b>%s %d</b> para <b>%s</b>.<br/><br/>' .
            'Cualquier duda nos mantenemos a la disposición.<br/><br/>' .
            'Un saludo.',
            $serviceName,
            $monthName,
            $yy,
            $unitName
        );
        $htmlBody .= $this->renderSignature();

        // Attachment: accept provided s3Url or try to auto-resolve from unit_document_attachment → unit_document
$s3Url = $payload['s3Url'] ?? ($payload['s3_url'] ?? null);

if (!$s3Url && $transactionId) {
    try {
        $conn = $this->em->getConnection();
        // Primary: find a document explicitly attached to this transaction
        $row = $conn->fetchAssociative(
            'SELECT d.s3_url
               FROM unit_document_attachment a
               JOIN unit_document d ON d.id = a.document_id
              WHERE a.target_type = :tt
                AND a.target_id   = :tid
                AND COALESCE(d.s3_url, """") <> """"
              ORDER BY a.id DESC
              LIMIT 1',
            [
                'tt'  => 'unit_transactions',
                'tid' => $transactionId,
            ]
        );
        if (is_array($row) && !empty($row['s3_url'])) {
            $s3Url = $row['s3_url'];
        }
    } catch (\Throwable $e) {
        $this->logger->warning('[EmailController] Auto-fetch s3_url by transaction attachment failed', ['error' => $e->getMessage()]);
    }
}

if (!$s3Url && $unitId) {
    try {
        $conn = $this->em->getConnection();
        // Fallback: pick the most recent "Pago de Servicios" or "Unit Transactions" doc for the unit
        $row2 = $conn->fetchAssociative(
            'SELECT d.s3_url
               FROM unit_document d
              WHERE d.unit_id = :uid
                AND COALESCE(d.s3_url, """") <> """"
                AND (d.category = :cat OR d.label = :lbl)
              ORDER BY d.id DESC
              LIMIT 1',
            [
                'uid' => $unitId,
                'cat' => 'Pago de Servicios',
                'lbl' => 'Unit Transactions',
            ]
        );
        if (is_array($row2) && !empty($row2['s3_url'])) {
            $s3Url = $row2['s3_url'];
        }
    } catch (\Throwable $e) {
        $this->logger->warning('[EmailController] Auto-fetch s3_url by unit/category fallback failed', ['error' => $e->getMessage()]);
    }
}

        if (!$s3Url) {
        return $this->json(['ok' => false, 'error' => 'Attachment URL not found for this transaction/unit'], 409);
}

        // Build extras for dispatcher
        $extra = [
            'attach'   => true,
            's3Url'    => $s3Url,
            'unitId'   => $unitId,
            'clientId' => $clientId,
            'yearMonth'=> $yearMonth,
            'category' => 'SERVICE_PAYMENT',
            'cc'       => empty($ccList) ? null : implode(',', $ccList),
        ];

        // Send email via dispatcher
        $result = $this->dispatcher->sendEmail($to, $subject, $htmlBody, $extra);

        // If sent OK, insert into email_event and wire transaction FK
        $eventId = null;
        if ($result['status'] >= 200 && $result['status'] < 300) {
            try {
                $conn = $this->em->getConnection();
                $messageId = $result['data']['messageId'] ?? null;
                $createdBy = $this->getUser() ? $this->getUser()->getUserIdentifier() : null;

                $conn->executeStatement(
                    'INSERT INTO `email_event`
                        (`unit_id`,`client_id`,`category`,`year_month`,`to_email`,`cc_email`,
                         `subject`,`status`,`message_id`,`error`,`sent_at`,`created_by`,
                         `attachment_count`,`attachments_json`)
                     VALUES
                        (:uid, :cid, :cat, :ym, :toEmail, :ccEmail,
                         :subject, :status, :msgId, NULL, NOW(), :createdBy,
                         :attCount, :attJson)',
                    [
                        'uid'       => $unitId,
                        'cid'       => $clientId,
                        'cat'       => 'SERVICE_PAYMENT',
                        'ym'        => $yearMonth,
                        'toEmail'   => $to,
                        'ccEmail'   => empty($ccList) ? null : implode(',', $ccList),
                        'subject'   => $subject,
                        'status'    => 'SENT',
                        'msgId'     => $messageId,
                        'createdBy' => $createdBy,
                        'attCount'  => 1,
                        'attJson'   => json_encode(['receipt'])
                    ]
                );
                $eventId = (int)$conn->lastInsertId();

                if ($transactionId) {
                    $conn->executeStatement(
                        'UPDATE `unit_transactions`
                           SET `email_event_id` = :eid
                         WHERE `id` = :tid',
                        ['eid' => $eventId, 'tid' => $transactionId]
                    );
                }
            } catch (\Throwable $e) {
                $this->logger->warning('[EmailController] service-payment event insert or FK update failed', ['error' => $e->getMessage()]);
            }
        }

        if ($result['status'] >= 200 && $result['status'] < 300) {
            return $this->json(['ok' => true, 'flow' => $result['data'], 'category' => 'SERVICE_PAYMENT', 'eventId' => $eventId]);
        }
        return $this->json(['ok' => false, 'status' => $result['status'], 'flow' => $result['data'], 'category' => 'SERVICE_PAYMENT'], 500);
    }

    #[Route('/api/email-preview/report', name: 'api_email_preview_report', methods: ['POST'])]
    public function previewUnitMonthlyEmail(Request $request): JsonResponse
    {
        $payload  = json_decode($request->getContent(), true) ?? [];
        $unitId   = isset($payload['unitId']) ? (int)$payload['unitId'] : null;
        $yearMonth= isset($payload['yearMonth']) ? (string)$payload['yearMonth'] : null; // YYYY-MM

        if (!$unitId || !$yearMonth) {
            return $this->json(['ok' => false, 'error' => 'unitId and yearMonth are required'], 400);
        }

        // Resolve Unit + Client (for defaults and greeting)
        [$unit, $client] = $this->resolveUnitClient($unitId, $payload['clientId'] ?? null);
        if (!$client && $unit && method_exists($unit, 'getClient')) {
            try { $client = $unit->getClient(); } catch (\Throwable $e) { /* ignore */ }
        }

        // Derive a suggested "to" (not enforced)
        $toCandidates = [];
        if (!empty($payload['to'])) { $toCandidates[] = (string)$payload['to']; }
        if ($client && method_exists($client, 'getEmail')) { $toCandidates[] = (string)$client->getEmail(); }
        if ($unit && method_exists($unit, 'getClientEmail')) { $toCandidates[] = (string)$unit->getClientEmail(); }
        if ($unit && method_exists($unit, 'getClient_email')) { $toCandidates[] = (string)$unit->getClient_email(); }
        $suggestedTo = '';
        foreach ($toCandidates as $cand) {
            $cand = trim((string)$cand);
            if ($cand !== '') { $suggestedTo = $cand; break; }
        }

        // CC suggestions: explicit payload -> unit.cc_email -> client.cc_email
        $ccList = [];
        $explicitCc = $payload['cc'] ?? ($payload['cc_email'] ?? ($payload['ccEmail'] ?? null));
        if (is_string($explicitCc) && trim($explicitCc) !== '') {
            $ccList = array_merge($ccList, array_map('trim', explode(',', $explicitCc)));
        }
        if ($unit && method_exists($unit, 'getCcEmail')) {
            $uCc = trim((string)$unit->getCcEmail());
            if ($uCc !== '') { $ccList[] = $uCc; }
        }
        if ($client && method_exists($client, 'getCcEmail')) {
            $cCc = trim((string)$client->getCcEmail());
            if ($cCc !== '') { $ccList[] = $cCc; }
        }
        $ccList = array_values(array_filter(array_unique($ccList), fn($v) => $v !== ''));

        $unitName = method_exists($unit, 'getUnitName') ? (string)$unit->getUnitName() : ('Unit #' . $unitId);

        // Greeting first name
        $clientFirstName = '';
        if ($client && method_exists($client, 'getName')) {
            try {
                $fullName = trim((string)$client->getName());
                if ($fullName !== '') {
                    $parts = preg_split('/\s+/', $fullName);
                    $first = $parts[0] ?? '';
                    if ($first !== '') {
                        $clientFirstName = $first;
                    }
                }
            } catch (\Throwable $e) { /* ignore */ }
        }
        $clientFirstNameHtml = htmlspecialchars($clientFirstName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        // Language: explicit -> client.language -> query -> default 'es'
        $lang = strtolower(trim((string)($payload['language'] ?? '')));
        if ($lang === '' && $client && method_exists($client, 'getLanguage')) {
            try { $lang = strtolower((string)$client->getLanguage() ?: ''); } catch (\Throwable $e) { $lang = ''; }
        }
        if ($lang === '') {
            $lang = strtolower((string)$request->query->get('language', 'es'));
        }
        if (!in_array($lang, ['es','en'], true)) { $lang = 'es'; }

        // Subject/body (same defaults as sendUnitMonthlyEmail)
        $ym = $yearMonth;
        $m = preg_match('/^\d{4}-(\d{1,2})$/', $ym, $mm) ? (int)$mm[1] : null;
        $yy = (int)substr($ym, 0, 4);

        if ($lang === 'en') {
            $monthNamesEn = [null,'January','February','March','April','May','June','July','August','September','October','November','December'];
            $monthName = ($m && $m >=1 && $m <=12) ? $monthNamesEn[$m] : $ym;
            $subject = $payload['subject'] ?? sprintf('Monthly Report %s %s %d', $unitName, $monthName, $yy);
            $htmlBody = $payload['htmlBody'] ?? sprintf('Hello %s,<br/><br/>We have attached the monthly report for <b>%s</b> for <b>%s %d</b>.<br/><br/>If you have any questions, please don’t hesitate to contact us.<br/><br/>Kind regards.', $clientFirstNameHtml, $unitName, $monthName, $yy);
            $htmlBody .= '<br/><br/><em>(signature will be added when sent)</em>';
        } else {
            $monthNamesEs = [null,'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
            $monthName = ($m && $m >=1 && $m <=12) ? $monthNamesEs[$m] : $ym;
            $subject = $payload['subject'] ?? sprintf('Reporte Mensual %s %s %d', $unitName, $monthName, $yy);
            $htmlBody = $payload['htmlBody'] ?? sprintf('Hola %s,<br/><br/>Adjuntamos el reporte mensual de <b>%s</b> para <b>%s %d</b>.<br/><br/>Cualquier duda nos mantenemos a la disposición.<br/><br/>Saludos cordiales.', $clientFirstNameHtml, $unitName, $monthName, $yy);
            $htmlBody .= '<br/><br/><em>(signature will be added when sent)</em>';
        }

        // Build preview payload (no S3 lookups, no send)
        return $this->json([
            'ok'         => true,
            'preview'    => [
                'to'        => $suggestedTo,
                'cc'        => empty($ccList) ? null : implode(',', $ccList),
                'subject'   => $subject,
                'htmlBody'  => $htmlBody,
                'language'  => $lang,
                'unitName'  => $unitName,
                'yearMonth' => $yearMonth,
            ]
        ]);
    }

    #[Route('/api/email-preview/service-payment', name: 'api_email_preview_service_payment', methods: ['POST'])]
    public function previewServicePaymentEmail(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $unitId        = isset($payload['unitId']) ? (int)$payload['unitId'] : null;
        $clientId      = isset($payload['clientId']) ? (int)$payload['clientId'] : null;
        $transactionId = isset($payload['transactionId']) ? (int)$payload['transactionId'] : null;
        $yearMonth     = isset($payload['yearMonth']) ? (string)$payload['yearMonth'] : null; // YYYY-MM
        $serviceName   = trim((string)($payload['serviceName'] ?? ($payload['serviceKey'] ?? '')));

        if (!$unitId || !$transactionId || !$yearMonth) {
            return $this->json(['ok' => false, 'error' => 'unitId, transactionId and yearMonth are required'], 400);
        }
        if ($serviceName === '') {
            $serviceName = 'Servicio';
        }

        [$unit, $client] = $this->resolveUnitClient($unitId, $clientId);
        if (!$client && $unit && method_exists($unit, 'getClient')) {
            try { $client = $unit->getClient(); } catch (\Throwable $e) { /* ignore */ }
        }

        $unitName = method_exists($unit, 'getUnitName') ? (string)$unit->getUnitName() : ('Unit #' . $unitId);

        $clientFirstName = '';
        if ($client && method_exists($client, 'getName')) {
            try {
                $fullName = trim((string)$client->getName());
                if ($fullName !== '') {
                    $parts = preg_split('/\s+/', $fullName);
                    $first = $parts[0] ?? '';
                    if ($first !== '') {
                        $clientFirstName = $first;
                    }
                }
            } catch (\Throwable $e) { /* ignore */ }
        }
        $clientFirstNameHtml = htmlspecialchars($clientFirstName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $ym = $yearMonth;
        $m = preg_match('/^\d{4}-(\d{1,2})$/', $ym, $mm) ? (int)$mm[1] : null;
        $yy = (int)substr($ym, 0, 4);
        $monthNamesEs = [null,'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        $monthName = ($m && $m >=1 && $m <=12) ? $monthNamesEs[$m] : $ym;

        $subject = sprintf('Comprobante de pago — %s — %s — %s %d', $serviceName, $unitName, $monthName, $yy);
        $htmlBody = sprintf(
            'Estimados Administradores,<br/><br/>' .
            'Adjuntamos el comprobante de pago de <b>%s</b> correspondiente a <b>%s %d</b> para <b>%s</b>.<br/><br/>' .
            'Cualquier duda nos mantenemos a la disposición.<br/><br/>' .
            'Un saludo.',
            $serviceName,
            $monthName,
            $yy,
            $unitName
        );
        $htmlBody .= '<br/><br/><em>(signature will be added when sent)</em>';

        return $this->json([
            'ok' => true,
            'preview' => [
                'subject' => $subject,
                'htmlBody' => $htmlBody,
                'language' => 'es',
                'unitName' => $unitName,
                'yearMonth' => $yearMonth,
                'serviceName' => $serviceName,
            ]
        ]);
    }

    #[Route('/api/unit-monthly/email', name: 'api_unit_monthly_email', methods: ['POST'])]
    public function sendUnitMonthlyEmail(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];
        $unitId = isset($payload['unitId']) ? (int)$payload['unitId'] : null;
        $yearMonth = isset($payload['yearMonth']) ? (string)$payload['yearMonth'] : null; // YYYY-MM

        if (!$unitId || !$yearMonth) {
            return $this->json(['ok' => false, 'error' => 'unitId and yearMonth are required'], 400);
        }

        // Resolve Unit + Client to get default recipient and unit name
        [$unit, $client] = $this->resolveUnitClient($unitId, $payload['clientId'] ?? null);
        if (!$client && $unit && method_exists($unit, 'getClient')) {
            try { $client = $unit->getClient(); } catch (\Throwable $e) { /* ignore */ }
        }

        // Try multiple sources for the recipient email
        $toCandidates = [];
        if (!empty($payload['to'])) { $toCandidates[] = (string)$payload['to']; }
        if ($client && method_exists($client, 'getEmail')) { $toCandidates[] = (string)$client->getEmail(); }
        if ($unit && method_exists($unit, 'getClientEmail')) { $toCandidates[] = (string)$unit->getClientEmail(); }
        if ($unit && method_exists($unit, 'getClient_email')) { $toCandidates[] = (string)$unit->getClient_email(); }

        $to = '';
        foreach ($toCandidates as $cand) {
            $cand = trim((string)$cand);
            if ($cand !== '') { $to = $cand; break; }
        }

        if ($to === '') {
            return $this->json(['ok' => false, 'error' => 'Recipient email not found for this unit/client'], 409);
        }

        // Aggregate CC emails: explicit payload -> unit.cc_email -> client.cc_email
        $ccList = [];
        // 0) explicit from request (accept comma-separated)
        $explicitCc = $payload['cc'] ?? ($payload['cc_email'] ?? ($payload['ccEmail'] ?? null));
        if (is_string($explicitCc) && trim($explicitCc) !== '') {
            $ccList = array_merge($ccList, array_map('trim', explode(',', $explicitCc)));
        }
        // 1) unit-level cc_email
        if ($unit && method_exists($unit, 'getCcEmail')) {
            $uCc = trim((string)$unit->getCcEmail());
            if ($uCc !== '') { $ccList[] = $uCc; }
        }
        // 2) client-level cc_email (applies to all units of the client)
        if ($client && method_exists($client, 'getCcEmail')) {
            $cCc = trim((string)$client->getCcEmail());
            if ($cCc !== '') { $ccList[] = $cCc; }
        }
        // unique + filter empties
        $ccList = array_values(array_filter(array_unique($ccList), fn($v) => $v !== ''));

        $unitName = method_exists($unit, 'getUnitName') ? (string)$unit->getUnitName() : ('Unit #' . $unitId);

        // Derive client first name for greeting (fallback to empty string)
        $clientFirstName = '';
        if ($client && method_exists($client, 'getName')) {
            try {
                $fullName = trim((string)$client->getName());
                if ($fullName !== '') {
                    $parts = preg_split('/\s+/', $fullName);
                    $first = $parts[0] ?? '';
                    if ($first !== '') {
                        $clientFirstName = $first;
                    }
                }
            } catch (\Throwable $e) { /* ignore */ }
        }
        // Escape for HTML context
        $clientFirstNameHtml = htmlspecialchars($clientFirstName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        // Language: explicit payload -> client.language -> query ?language= -> default 'es'
        $lang = strtolower(trim((string)($payload['language'] ?? '')));
        if ($lang === '' && $client && method_exists($client, 'getLanguage')) {
            try { $lang = strtolower((string)$client->getLanguage() ?: ''); } catch (\Throwable $e) { $lang = ''; }
        }
        if ($lang === '') {
            $lang = strtolower((string)$request->query->get('language', 'es'));
        }
        if (!in_array($lang, ['es', 'en'], true)) {
            $lang = 'es';
        }

        // Subject/body defaults with language switch
        $ym = $yearMonth;
        $m = preg_match('/^\d{4}-(\d{1,2})$/', $ym, $mm) ? (int)$mm[1] : null;
        $yy = (int)substr($ym, 0, 4);

        if ($lang === 'en') {
            $monthNamesEn = [null,'January','February','March','April','May','June','July','August','September','October','November','December'];
            $monthName = ($m && $m >=1 && $m <=12) ? $monthNamesEn[$m] : $ym;
            // Default English subject/body
            $subject = $payload['subject'] ?? sprintf('Monthly Report %s %s %d', $unitName, $monthName, $yy);
            $htmlBody = $payload['htmlBody'] ?? sprintf('Hello %s,<br/><br/>We have attached the monthly report for <b>%s</b> for <b>%s %d</b>.<br/><br/>If you have any questions, please don’t hesitate to contact us.<br/><br/>Kind regards.', $clientFirstNameHtml, $unitName, $monthName, $yy);
            $htmlBody .= $this->renderSignature();
        } else {
            // Spanish (default)
            $monthNamesEs = [null,'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
            $monthName = ($m && $m >=1 && $m <=12) ? $monthNamesEs[$m] : $ym;
            $subject = $payload['subject'] ?? sprintf('Reporte Mensual %s %s %d', $unitName, $monthName, $yy);
            $htmlBody = $payload['htmlBody'] ?? sprintf('Hola %s,<br/><br/>Adjuntamos el reporte mensual de <b>%s</b> para <b>%s %d</b>.<br/><br/>Cualquier duda nos mantenemos a la disposición.<br/><br/>Saludos cordiales.', $clientFirstNameHtml, $unitName, $monthName, $yy);
            $htmlBody .= $this->renderSignature();
        }

        // Try to locate the report file in S3 and presign it so the dispatcher can fetch & attach
        $bucket = $_ENV['AWS_S3_BUCKET'] ?? '';
        $ttl    = (int)($_ENV['REPORTS_PRESIGN_TTL'] ?? 900);
        $s3     = $this->ensureS3();
        $s3Url  = null; $downloadName = sprintf('Owners2_%d_%s.pdf', $unitId, $yearMonth);

        if ($bucket !== '' && $s3) {
            // Build the same candidates we use elsewhere
            $mm = preg_match('/^\d{4}-(\d{1,2})$/', $yearMonth, $m1) ? str_pad($m1[1], 2, '0', STR_PAD_LEFT) : null;
            $yy2 = substr($yearMonth, 2, 2);
            $candidates = [ sprintf('reports/%s/%s.pdf', $unitId, $yearMonth) ];
            if ($mm !== null) {
                $candidates[] = sprintf('reports/%s/sunset_reporte-mensual-%s-%s_%s%s.pdf', $unitId, $mm, $yy2, $yy2, $mm);
                $candidates[] = sprintf('reports/%s/sunset_reporte-mensual-%s-%s_%s%s.pdf', $unitId, $mm, $yy2, $unitId, $yy2);
            }

            $foundKey = null;
            foreach ($candidates as $tryKey) {
                try {
                    $s3->headObject(['Bucket' => $bucket, 'Key' => $tryKey]);
                    $foundKey = $tryKey; break;
                } catch (\Throwable $e) { /* continue */ }
            }

            if ($foundKey) {
                $cmd = $s3->getCommand('GetObject', [
                    'Bucket' => $bucket,
                    'Key'    => $foundKey,
                ]);
                $req = $s3->createPresignedRequest($cmd, sprintf('+%d seconds', $ttl));
                $s3Url = (string)$req->getUri();
            }
        }

        if (!$s3Url) {
            // As a strict v1, require the PDF to exist; otherwise 409
            return $this->json(['ok' => false, 'error' => 'Report PDF not found for this unit/month'], 409);
        }

        // Compose body for performSend (category MONTH_REPORT + attach=true + presigned URL)
        $body = [
            'to'        => $to,
            'subject'   => $subject,
            'htmlBody'  => $htmlBody,
            'category'  => 'MONTH_REPORT',
            'unitId'    => $unitId,
            'yearMonth' => $yearMonth,
            'attach'    => true,
            's3Url'     => $s3Url,
            'filename'  => $downloadName,
            'cc'        => empty($ccList) ? null : implode(',', $ccList),
        ];

        return $this->performSend($body, 'REPORT');
    }

    #[Route('/api/emails/send-report', name: 'api_email_send_report', methods: ['POST'])]
    public function sendEmail(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];
        $body = $payload['data'] ?? $payload;
        $cat = strtoupper((string)($body['category'] ?? 'REPORT'));
        $body['category'] = ($cat === 'REPORT' || $cat === 'MONTH_REPORT') ? 'MONTH_REPORT' : $cat;
        return $this->performSend($body, 'REPORT');
    }

    #[Route('/api/emails/send', name: 'api_email_send', methods: ['POST'])]
    public function sendGeneric(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];
        $body = $payload['data'] ?? $payload;
        return $this->performSend($body, 'MISC');
    }

    #[Route('/api/reports/file', name: 'api_reports_file', methods: ['GET'])]
    public function downloadFile(Request $request): Response
    {
        $unitId = $request->query->get('unitId');
        $yearMonth = $request->query->get('yearMonth'); // e.g. 2025-08

        if (!$unitId || !$yearMonth) {
            throw $this->createNotFoundException('Missing unitId or yearMonth');
        }

        // Optional lightweight protection for Flow: require X-Flow-Token header to match env
        $expected = $_ENV['FLOW_REPORT_EMAIL_TOKEN'] ?? '';
        $provided = $request->headers->get('X-Flow-Token', '');
        if ($expected !== '' && $provided !== $expected) {
            throw $this->createAccessDeniedException('Invalid token');
        }

        $s3 = $this->ensureS3();
        if (!$s3) {
            throw $this->createNotFoundException('S3 client not configured.');
        }

        $bucket = $_ENV['AWS_S3_BUCKET'] ?? '';
        $ttl    = (int)($_ENV['REPORTS_PRESIGN_TTL'] ?? 900);

        $attempts = [
            'bucket' => $bucket,
            'region_env' => $_ENV['AWS_S3_REGION'] ?? null,
            'unitId' => $unitId,
            'yearMonth' => $yearMonth,
            'candidates' => [],
            'list_prefix_checked' => null,
            'list_token' => null,
            'errors' => [],
        ];

        if ($bucket === '') {
            throw $this->createNotFoundException('S3 bucket not configured.');
        }

        // 1) Build candidate keys we can HEAD (no ListBucket permission required)
        $mm = preg_match('/^\d{4}-(\d{1,2})$/', $yearMonth, $m1) ? str_pad($m1[1], 2, '0', STR_PAD_LEFT) : null;
        $yy = preg_match('/^(\d{2})\d{2}-\d{2}$/', substr($yearMonth, 2) . '-' . ($mm ?? ''), $m2) ? substr($yearMonth, 2, 2) : (substr($yearMonth, 2, 2));

        $candidates = [];

        // Conventional canonical name
        $candidates[] = sprintf('reports/%s/%s.pdf', $unitId, $yearMonth);

        // Observed naming schemes:
        //  a) sunset_reporte-mensual-{MM}-{YY}_{YY}{MM}.pdf   (e.g., ..._2508.pdf)
        //  b) sunset_reporte-mensual-{MM}-{YY}_{unitId}{YY}.pdf  (older attempt)
        if ($mm !== null) {
            // a) YYMM suffix
            $candidates[] = sprintf('reports/%s/sunset_reporte-mensual-%s-%s_%s%s.pdf', $unitId, $mm, $yy, $yy, $mm);

            // b) unitId + YY suffix (keep as fallback)
            $candidates[] = sprintf('reports/%s/sunset_reporte-mensual-%s-%s_%s%s.pdf', $unitId, $mm, $yy, $unitId, $yy);
        }

        $found = false;
        $key   = null;

        foreach ($candidates as $tryKey) {
            try {
                $s3->headObject([
                    'Bucket' => $bucket,
                    'Key'    => $tryKey,
                ]);
                $attempts['candidates'][] = ['key' => $tryKey, 'status' => 'exists'];
                $key = $tryKey;
                $found = true;
                break;
            } catch (AwsException $e) {
                $attempts['candidates'][] = [
                    'key' => $tryKey,
                    'status' => 'error',
                    'code' => $e->getAwsErrorCode(),
                    'message' => $e->getAwsErrorMessage() ?: $e->getMessage(),
                ];
                // continue
            } catch (\Throwable $e) {
                $attempts['candidates'][] = [
                    'key' => $tryKey,
                    'status' => 'error',
                    'code' => get_class($e),
                    'message' => $e->getMessage(),
                ];
            }
        }

        // 2) As a last resort, attempt a ListObjectsV2 prefix search by MM-YY token (requires s3:ListBucket)
        if (!$found) {
            $prefix = sprintf('reports/%s/', $unitId);
            $token  = $this->ymToToken($yearMonth); // e.g. 08-25

            $attempts['list_prefix_checked'] = $prefix;
            $attempts['list_token'] = $token;

            try {
                $result = $s3->listObjectsV2([
                    'Bucket'  => $bucket,
                    'Prefix'  => $prefix,
                    'MaxKeys' => 1000,
                ]);

                $candidates = [];
                if (!empty($result['Contents'])) {
                    foreach ($result['Contents'] as $obj) {
                        $k = $obj['Key'] ?? '';
                        if ($k !== '' && str_ends_with(strtolower($k), '.pdf') && str_contains($k, $token)) {
                            $candidates[] = $k;
                        }
                    }
                }

                if (!empty($candidates)) {
                    usort($candidates, fn($a, $b) => strlen($a) <=> strlen($b));
                    $key = $candidates[0];
                    $found = true;
                }
            } catch (AwsException $e) {
                $attempts['errors'][] = [
                    'code' => $e->getAwsErrorCode(),
                    'message' => $e->getAwsErrorMessage() ?: $e->getMessage(),
                ];
                // ignore; will 404 below if still not found
            }
        }

        if (!$found) {
            if ($request->query->get('debug') === '1') {
                // Log and return structured diagnostics to caller
                $this->logger->warning('Report file lookup failed', $attempts);
                return new HttpJsonResponse(['ok' => false, 'debug' => $attempts], 404);
            }
            throw $this->createNotFoundException('Report PDF not found.');
        }

        // 3) Presign S3 GetObject and redirect the client to S3
        $downloadName = sprintf('Owners2_%s_%s.pdf', $unitId, $yearMonth);

        // Add response overrides so the browser downloads with a nice filename
        $cmd = $s3->getCommand('GetObject', [
            'Bucket' => $bucket,
            'Key'    => $key,
            'ResponseContentType'        => 'application/pdf',
            'ResponseContentDisposition' => 'attachment; filename="'.$downloadName.'"',
        ]);

        $presigned = $s3->createPresignedRequest($cmd, sprintf('+%d seconds', $ttl));
        $url = (string) $presigned->getUri();

        return new RedirectResponse($url, 302);
    }

    /**
     * Convert "YYYY-MM" into "MM-YY" token (e.g., 2025-08 → 08-25)
     */
    private function ymToToken(string $yearMonth): string
    {
        // Accepts formats like "2025-8" or "2025-08"
        if (!preg_match('/^(\d{4})-(\d{1,2})$/', $yearMonth, $m)) {
            return $yearMonth;
        }
        $yy = substr($m[1], -2);
        $mm = str_pad($m[2], 2, '0', STR_PAD_LEFT);
        return $mm . '-' . $yy;
    }
    /**
     * Render Owners2 email signature (image + text fallback).
     */
    private function renderSignature(): string
    {
        $imageUrl = 'https://dashboard.owners2.com/assets/email/owners2-signature.png';

        return
            '<br/><br/>' .
            '<div style="margin-top:6px; padding-top:8px;">' .
              '<div style="line-height:1.35;">' .
                '<img src="' . htmlspecialchars($imageUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '" ' .
                'alt="Owners2 • Rental Management Services" ' .
                'style="display:block; max-width:180px; height:auto; margin:2px 0 4px 0;" />' .
                '<div style="color:#4b5563; font-size:13px;">' .
                  'Owners2 • Rental Management Services' .
                '</div>' .
              '</div>' .
            '</div>';
    }
}