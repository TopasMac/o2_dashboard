<?php

namespace App\EventListener;

use App\Entity\UnitMedia;
use Aws\S3\S3Client;
use Doctrine\Common\EventSubscriber;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\PostRemoveEventArgs;
use Psr\Log\LoggerInterface;

/**
 * Deletes the S3 object when a UnitMedia entity is removed from the database.
 *
 * Best practice: keep storage consistent with DB state, fail-soft on AWS issues.
 */
class UnitMediaDeleteListener implements EventSubscriber
{
    private S3Client $s3;
    private string $bucket;
    private ?LoggerInterface $logger;

    public function __construct(S3Client $s3, string $bucketName, ?LoggerInterface $logger = null)
    {
        $this->s3 = $s3;
        $this->bucket = $bucketName; // e.g. env CDN_BUCKET
        $this->logger = $logger;
    }

    public function getSubscribedEvents(): array
    {
        return [Events::postRemove];
    }

    public function postRemove(PostRemoveEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof UnitMedia) {
            return;
        }

        if ($this->logger) {
            $this->logger->info('UnitMediaDeleteListener: postRemove triggered', [
                'entity' => get_class($entity),
                'id' => $entity->getId(),
            ]);
        }

        $key = $entity->getS3Key();
        if (!$key) {
            return; // nothing to delete
        }

        if ($this->logger) {
            $this->logger->info('UnitMediaDeleteListener: deleting S3 object', [
                'bucket' => $this->bucket,
                'key' => $key,
            ]);
        }

        try {
            $this->s3->deleteObject([
                'Bucket' => $this->bucket,
                'Key'    => $key,
            ]);
            if ($this->logger) {
                $this->logger->info('UnitMediaDeleteListener: delete succeeded', [
                    'key' => $key,
                ]);
            }
        } catch (\Throwable $e) {
            if ($this->logger) {
                $this->logger->error('UnitMedia S3 delete failed', [
                    'id'    => $entity->getId(),
                    'key'   => $key,
                    'error' => $e->getMessage(),
                ]);
            }
            // Fail-soft: do not block entity removal if S3 delete fails
        }
    }
}