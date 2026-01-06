<?php

namespace App\EventSubscriber;

use App\Entity\UnitDocument;
use Doctrine\ORM\Events;
use Doctrine\Common\EventSubscriber;
use Doctrine\ORM\Event\LifecycleEventArgs;
use Aws\S3\S3Client;
use Aws\Exception\AwsException;
use Psr\Log\LoggerInterface;

class UnitDocumentCleanupSubscriber implements EventSubscriber
{
    private S3Client $s3;
    private string $bucket;
    private ?LoggerInterface $logger = null;

    public function __construct(?LoggerInterface $logger = null)
    {
        // Optional PSR-3 logger (autowired by Symfony if available)
        // If you prefer, inject these via DI parameters. For now, mirror existing usage.
        $this->s3 = new S3Client([
            'region'  => 'us-east-2',
            'version' => 'latest',
        ]);
        $this->bucket = 'owners2-unit-documents';
        $this->logger = $logger;
    }

    public function getSubscribedEvents(): array
    {
        return [
            Events::postRemove,
        ];
    }

    public function postRemove(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();

        if (!$entity instanceof UnitDocument) {
            return;
        }

        $s3Url = method_exists($entity, 'getS3Url') ? $entity->getS3Url() : null;
        if (!$s3Url) {
            return;
        }

        // Derive key from URL (same logic you used in the controller)
        $parsed = parse_url($s3Url);
        $key = isset($parsed['path']) ? ltrim($parsed['path'], '/') : null;

        if (!$key) {
            $this->log('warning', '[UnitDocumentCleanup] No S3 key could be parsed from URL', ['url' => $s3Url]);
            return;
        }

        try {
            $this->s3->deleteObject([
                'Bucket' => $this->bucket,
                'Key'    => $key,
            ]);
            $this->log('info', '[UnitDocumentCleanup] Deleted S3 object', ['key' => $key]);
        } catch (AwsException $e) {
            $this->log('error', '[UnitDocumentCleanup] Failed to delete S3 object', [
                'key' => $key,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function log(string $level, string $message, array $context = []): void
    {
        if ($this->logger) {
            $this->logger->log($level, $message, $context);
        } else {
            // Fallback minimal logging
            error_log($message.' '.json_encode($context));
        }
    }
}