<?php

namespace App\EventListener;

use App\Entity\UnitMedia;
use Aws\S3\S3Client;
use Doctrine\Common\EventSubscriber;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\PreUpdateEventArgs;
use Psr\Log\LoggerInterface;

class UnitMediaUpdateListener implements EventSubscriber
{
    private S3Client $s3;
    private string $bucket;
    private string $cdnBase;
    private ?LoggerInterface $logger;
    private string $originPrefix = '';

    public function __construct(
        S3Client $s3,
        string $bucketName,
        ?string $cdnBase = null,
        ?string $originPrefix = '',
        ?LoggerInterface $logger = null
    ) {
        $this->s3 = $s3;
        $this->bucket = $bucketName;
        $this->cdnBase = rtrim($cdnBase ?: (getenv('CDN_BASE') ?: 'https://cdn.owners2.com'), '/');
        $this->originPrefix = trim($originPrefix ?? '', '/');
        $this->logger = $logger;
    }

    public function getSubscribedEvents(): array
    {
        return [Events::preUpdate];
    }

    public function preUpdate(PreUpdateEventArgs $args): void
    {
        $entity = $args->getObject();
        if (!$entity instanceof UnitMedia) {
            return;
        }
        if ($this->logger) {
            $this->logger->info('UnitMediaUpdateListener: preUpdate triggered', [
                'id' => $entity->getId(),
            ]);
        }

        $tags = $entity->getTags();
        if (!is_array($tags) || count($tags) === 0) {
            return; // nothing to derive
        }

        $primaryTag = strtolower(trim((string)$tags[0]));
        if ($primaryTag === '') {
            return;
        }

        $unit = $entity->getUnit();
        $unitId = $unit?->getId();
        if (!$unitId) {
            return; // cannot compute folder without unit id
        }

        $oldKey = $entity->getS3Key();
        $oldUrl = $entity->getUrl();
        if (!$oldKey) {
            return;
        }

        // Build new key: {unitId}/gallery/{tagSlug}_{id}.{ext}
        $tagSlug = $this->slugify($primaryTag);
        $base = pathinfo($oldKey, PATHINFO_BASENAME);
        $ext = pathinfo($base, PATHINFO_EXTENSION);
        $id  = $entity->getId();
        $canonicalBase = $tagSlug . '_' . $id . ($ext ? ('.' . $ext) : '');

        if ($this->logger) {
            $this->logger->info('UnitMediaUpdateListener: rename decision inputs', [
                'oldKey'       => $oldKey,
                'base'         => $base,
                'ext'          => $ext,
                'id'           => $id,
                'tagSlug'      => $tagSlug,
                'tagsChanged'  => $args->hasChangedField('tags'),
                'canonicalBase'=> $canonicalBase,
            ]);
        }

        // Decide if we should rename: when tags changed OR when current base doesn't already match canonical
        $shouldRename = $args->hasChangedField('tags') || ($base !== $canonicalBase);
        if (!$shouldRename) {
            return; // already canonical, no rename needed
        }

        $newBase = $canonicalBase;
        $newKey = sprintf('%d/gallery/%s', $unitId, $newBase);

        if ($newKey === $oldKey) {
            return; // no change
        }

        // Build S3-operation keys with optional origin prefix (entity/public keys stay unprefixed)
        $srcKey = $oldKey;
        $dstKey = $newKey;
        if ($this->originPrefix !== '') {
            $srcKey = $this->originPrefix . '/' . ltrim($oldKey, '/');
            $dstKey = $this->originPrefix . '/' . ltrim($newKey, '/');
        }

        try {
            // Preflight: ensure the source object exists to avoid NoSuchKey
            try {
                $this->s3->headObject([
                    'Bucket' => $this->bucket,
                    'Key'    => $srcKey,
                ]);
            } catch (\Throwable $e) {
                // Source missing. If destination already exists, adopt it without copying.
                try {
                    $this->s3->headObject([
                        'Bucket' => $this->bucket,
                        'Key'    => $dstKey,
                    ]);

                    // Destination exists: update entity to point to new key and persist
                    if ($this->logger) {
                        $this->logger->warning('UnitMedia S3 rename preflight: source missing but destination exists — adopting destination', [
                            'id' => $entity->getId(),
                            'srcKey' => $srcKey,
                            'dstKey' => $dstKey,
                        ]);
                    }

                    $entity->setS3Key($newKey);
                    $entity->setUrl($this->cdnBase . '/' . $newKey);

                    $em  = $args->getObjectManager();
                    $uow = $em->getUnitOfWork();
                    $uow->propertyChanged($entity, 's3Key', $oldKey, $newKey);
                    $uow->propertyChanged($entity, 'url', $oldUrl, $this->cdnBase . '/' . $newKey);
                    $uow->scheduleExtraUpdate($entity, [
                        's3Key' => [$oldKey, $newKey],
                        'url'   => [$oldUrl, $this->cdnBase . '/' . $newKey],
                    ]);
                    if ($this->logger) {
                        $this->logger->info('UnitMediaUpdateListener: scheduled DB update for s3Key/url', [
                            'oldKey' => $oldKey,
                            'newKey' => $newKey,
                            'oldUrl' => $oldUrl,
                            'newUrl' => $this->cdnBase . '/' . $newKey,
                        ]);
                    }

                    return; // done
                } catch (\Throwable $e2) {
                    // Fallback: try to find any existing object for this entity id (pattern *_{id}.<ext>) under {unit}/gallery/
                    try {
                        $prefix = sprintf('%d/gallery/', $unitId);
                        $list = $this->s3->listObjectsV2([
                            'Bucket' => $this->bucket,
                            'Prefix' => ($this->originPrefix !== '' ? $this->originPrefix.'/' : '').$prefix,
                            'MaxKeys' => 100,
                        ]);
                        $foundSrcKey = null;
                        if (!empty($list['Contents'])) {
                            $suffix = '_' . $id . ($ext ? ('.' . $ext) : '');
                            foreach ($list['Contents'] as $obj) {
                                $k = $obj['Key'] ?? '';
                                // Strip originPrefix for pattern check
                                $checkKey = $this->originPrefix !== '' && str_starts_with($k, $this->originPrefix.'/') ? substr($k, strlen($this->originPrefix)+1) : $k;
                                if (str_starts_with($checkKey, $prefix) && str_ends_with($checkKey, $suffix)) {
                                    $foundSrcKey = $k; // keep full (possibly prefixed) key for S3 ops
                                    break;
                                }
                            }
                        }

                        if ($foundSrcKey) {
                            // Copy from found source to desired destination
                            $encodedFound = implode('/', array_map('rawurlencode', explode('/', $foundSrcKey)));
                            $copySourceFound = $this->bucket . '/' . $encodedFound;

                            if ($this->logger) {
                                $this->logger->info('UnitMediaUpdateListener: fallback copy from discovered source', [
                                    'foundSrcKey' => $foundSrcKey,
                                    'to' => $dstKey,
                                ]);
                            }

                            $this->s3->copyObject([
                                'Bucket'     => $this->bucket,
                                'CopySource' => $copySourceFound,
                                'Key'        => $dstKey,
                            ]);

                            // Optionally delete the found source (acts like rename between canonical tags)
                            $this->s3->deleteObject([
                                'Bucket' => $this->bucket,
                                'Key'    => $foundSrcKey,
                            ]);

                            // Update entity to point to canonical (unprefixed) key
                            $entity->setS3Key($newKey);
                            $entity->setUrl($this->cdnBase . '/' . $newKey);

                            $em  = $args->getObjectManager();
                            $uow = $em->getUnitOfWork();
                            $uow->propertyChanged($entity, 's3Key', $oldKey, $newKey);
                            $uow->propertyChanged($entity, 'url', $oldUrl, $this->cdnBase . '/' . $newKey);
                            $uow->scheduleExtraUpdate($entity, [
                                's3Key' => [$oldKey, $newKey],
                                'url'   => [$oldUrl, $this->cdnBase . '/' . $newKey],
                            ]);
                            if ($this->logger) {
                                $this->logger->info('UnitMediaUpdateListener: scheduled DB update after fallback', [
                                    'oldKey' => $oldKey,
                                    'newKey' => $newKey,
                                ]);
                            }

                            return; // done via fallback
                        }

                        // Nothing found — log and exit
                        if ($this->logger) {
                            $this->logger->error('UnitMedia S3 rename preflight failed (no matching *_{id}.ext source found)', [
                                'id' => $entity->getId(),
                                'prefix' => $prefix,
                                'suffix' => '_' . $id . ($ext ? ('.' . $ext) : ''),
                            ]);
                        }
                        return;
                    } catch (\Throwable $e3) {
                        if ($this->logger) {
                            $this->logger->error('UnitMedia S3 rename fallback listing failed', [
                                'id' => $entity->getId(),
                                'bucket' => $this->bucket,
                                'error' => $e3->getMessage(),
                            ]);
                        }
                        return; // give up
                    }
                }
            }

            // Build a properly URL-encoded CopySource (encode each path segment, keep slashes)
            $encodedOldKey = implode('/', array_map('rawurlencode', explode('/', $srcKey)));
            $copySource = $this->bucket . '/' . $encodedOldKey;

            // Copy to the new key (acts like rename), then delete the old key
            if ($this->logger) {
                $this->logger->info('UnitMediaUpdateListener: renaming in S3', [
                    'bucket' => $this->bucket,
                    'from' => $srcKey,
                    'to' => $dstKey,
                ]);
            }
            $this->s3->copyObject([
                'Bucket'     => $this->bucket,
                'CopySource' => $copySource,
                'Key'        => $dstKey,
            ]);

            $this->s3->deleteObject([
                'Bucket' => $this->bucket,
                'Key'    => $srcKey,
            ]);

            if ($this->logger) {
                $this->logger->info('UnitMediaUpdateListener: computed new values', [
                    's3Key' => $newKey,
                    'url' => $this->cdnBase . '/' . $newKey,
                ]);
            }
        } catch (\Throwable $e) {
            // Fail-soft: log and keep original key so save still succeeds
            if ($this->logger) {
                $this->logger->error('UnitMedia S3 rename failed', [
                    'id'     => $entity->getId(),
                    'oldKey' => $oldKey,
                    'newKey' => $newKey,
                    'error'  => $e->getMessage(),
                ]);
            }
            return;
        }

        // Update entity fields
        $entity->setS3Key($newKey);
        $entity->setUrl($this->cdnBase . '/' . $newKey);

        // Explicitly schedule DB updates for preUpdate context
        $em  = $args->getObjectManager();
        $uow = $em->getUnitOfWork();
        $uow->propertyChanged($entity, 's3Key', $oldKey, $newKey);
        $uow->propertyChanged($entity, 'url', $oldUrl, $this->cdnBase . '/' . $newKey);
        $uow->scheduleExtraUpdate($entity, [
            's3Key' => [$oldKey, $newKey],
            'url'   => [$oldUrl, $this->cdnBase . '/' . $newKey],
        ]);
        if ($this->logger) {
            $this->logger->info('UnitMediaUpdateListener: scheduled DB update for s3Key/url', [
                'oldKey' => $oldKey,
                'newKey' => $newKey,
                'oldUrl' => $oldUrl,
                'newUrl' => $this->cdnBase . '/' . $newKey,
            ]);
        }
    }

    private function slugify(string $text): string
    {
        $text = iconv('UTF-8', 'ASCII//TRANSLIT', $text);
        $text = strtolower($text);
        $text = preg_replace('/[^a-z0-9]+/i', '-', $text);
        $text = trim($text, '-');
        $text = str_replace('-', '_', $text); // use underscore in filenames
        return $text ?: 'tag';
    }
}