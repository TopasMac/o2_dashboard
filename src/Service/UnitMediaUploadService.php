<?php

namespace App\Service;

use App\Entity\Unit;
use App\Entity\UnitMedia;
use Aws\S3\S3Client;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\String\Slugger\AsciiSlugger;
use Symfony\Component\String\Slugger\SluggerInterface;

class UnitMediaUploadService
{
    private S3Client $s3;
    private string $bucket;
    private string $publicBaseUrl; // e.g. https://cdn.owners2.com
    private SluggerInterface $slugger;
    private EntityManagerInterface $em;

    public function __construct(
        EntityManagerInterface $em,
        ?string $cdnBucket = null,
        ?string $cdnPublicBaseUrl = null,
        ?SluggerInterface $slugger = null,
    ) {
        // Build S3 client from env (no DI required)
        $region = $_ENV['AWS_S3_REGION'] ?? getenv('AWS_S3_REGION') ?? 'us-east-2';
        $key    = $_ENV['AWS_ACCESS_KEY_ID'] ?? getenv('AWS_ACCESS_KEY_ID') ?? null;
        $secret = $_ENV['AWS_SECRET_ACCESS_KEY'] ?? getenv('AWS_SECRET_ACCESS_KEY') ?? null;

        $options = [
            'version' => 'latest',
            'region'  => $region,
        ];
        if ($key && $secret) {
            $options['credentials'] = ['key' => $key, 'secret' => $secret];
        }
        $this->s3 = new S3Client($options);

        $this->bucket = $cdnBucket
            ?? ($_ENV['CDN_BUCKET'] ?? getenv('CDN_BUCKET') ?? 'cdn.owners2.com');

        $this->publicBaseUrl = rtrim(
            $cdnPublicBaseUrl ?? ($_ENV['CDN_PUBLIC_BASE_URL'] ?? getenv('CDN_PUBLIC_BASE_URL') ?? 'https://cdn.owners2.com'),
            '/'
        );

        $this->slugger = $slugger ?? new AsciiSlugger();
        $this->em = $em;
    }

    /**
     * Upload a photo for a Unit and create a UnitMedia row.
     *
     * URL pattern: https://cdn.owners2.com/{unitId}/{tag}/{filename_slug}_{variant}.{ext}
     * - {tag}: first provided tag (or "gallery"). If $isCover=true, folder is forced to "cover".
     * - {variant}: we start with "lg" (you can add sm/md/xl later when adding image processing).
     */
    public function upload(
        Unit $unit,
        UploadedFile $file,
        ?string $caption = null,
        ?string $seoDescription = null,
        array $tags = [],
        bool $isPublished = false,
        bool $isCover = false,
        int $sortOrder = 0,
    ): UnitMedia {
        $unitId = $unit->getId();
        if (!$unitId) {
            throw new \InvalidArgumentException('Unit must be persisted before uploading media.');
        }

        // Decide folder tag
        $primaryTag = $isCover ? 'cover' : ($this->normalizeTag($tags[0] ?? 'gallery'));

        // Build slug from SEO > caption > original filename
        $baseName = $seoDescription ?: ($caption ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME));
        $slug = $this->shortSlug((string)$baseName);

        // Determine extension & content type
        $ext = strtolower($file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'jpg');
        if (!in_array($ext, ['jpg','jpeg','png','webp'], true)) {
            // keep it simple and safe
            $ext = 'jpg';
        }
        $contentType = $file->getMimeType() ?: $this->mimeFromExt($ext) ?: 'application/octet-stream';

        // We publish a single primary variant for now ("lg").
        $variant = 'lg';

        // Compose S3 object key (add a tiny unique suffix to avoid rare collisions)
        $baseKey = sprintf('%d/%s/%s_%s', $unitId, $primaryTag, $slug, $variant);
        $uniqueSuffix = substr(md5(uniqid((string) mt_rand(), true)), 0, 4);
        $key = sprintf('%s_%s.%s', $baseKey, $uniqueSuffix, $ext);

        // Validate UploadedFile state early
        if (!$file->isValid()) {
            $name = $file->getClientOriginalName();
            $code = method_exists($file, 'getError') ? $file->getError() : null;
            $msg  = method_exists($file, 'getErrorMessage') ? $file->getErrorMessage() : 'Upload error';
            throw new \RuntimeException(sprintf('Upload failed for "%s": %s%s', $name, $msg, $code !== null ? " (code $code)" : ''));
        }
        $size = $file->getSize();
        if ($size === 0) {
            $name = $file->getClientOriginalName();
            throw new \RuntimeException(sprintf('Received empty file for "%s" (size 0). If this is from a cloud drive, make it available offline and retry.', $name));
        }

        // Move the uploaded file to a stable temp path we fully control (then upload from there)
        $clientName = $file->getClientOriginalName() ?: 'upload';
        $tmpDir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'unitmedia';
        if (!is_dir($tmpDir)) {
            @mkdir($tmpDir, 0775, true);
        }
        $tmpName = uniqid('um_', true) . '.' . $ext;
        try {
            $moved = $file->move($tmpDir, $tmpName); // returns Symfony\Component\HttpFoundation\File\File
        } catch (\Throwable $e) {
            throw new \RuntimeException(sprintf('Failed to move uploaded file "%s" to temp dir (%s): %s', $clientName, $tmpDir, $e->getMessage()), 0, $e);
        }
        $stablePath = $moved->getPathname();

        // Verify the moved temp file exists and is readable (diagnostics for edge cases)
        $exists = @is_file($stablePath);
        $readable = @is_readable($stablePath);
        $sizeBytes = $exists ? @filesize($stablePath) : false;
        if (!$exists || !$readable || $sizeBytes === false || $sizeBytes === 0) {
            throw new \RuntimeException(sprintf(
                'Temp file invalid after move (name: "%s"). exists=%s, readable=%s, size=%s, path=%s',
                $clientName,
                $exists ? 'yes' : 'no',
                $readable ? 'yes' : 'no',
                ($sizeBytes === false ? 'false' : (string)$sizeBytes),
                $stablePath
            ));
        }

        $putParams = [
            'Bucket'       => $this->bucket,
            'Key'          => $key,
            'SourceFile'   => $stablePath,
            'ContentType'  => $contentType,
            'CacheControl' => 'public, max-age=31536000, immutable',
            'Metadata'     => [
                'unit-id' => (string)$unitId,
                'tags'    => implode(',', $tags),
                'alt'     => $seoDescription ?? ($caption ?? ''),
            ],
        ];

        try {
            $this->s3->putObject($putParams);
        } catch (\Throwable $e) {
            throw new \RuntimeException(sprintf('S3 putObject failed for "%s" (key: %s, path: %s): %s', $clientName, $key, $stablePath, $e->getMessage()), 0, $e);
        } finally {
            // Clean up the temp file
            if (is_file($stablePath)) {
                @unlink($stablePath);
            }
        }

        $publicUrl = $this->publicBaseUrl . '/' . $key;

        // Persist UnitMedia
        $media = new UnitMedia();
        $media->setUnit($unit)
            ->setS3Key($key)
            ->setUrl($publicUrl)
            ->setCaption($caption)
            ->setSeoDescription($seoDescription)
            ->setTags($tags)
            ->setIsPublished($isPublished)
            ->setIsCover($isCover)
            ->setSortOrder($sortOrder);

        $this->em->persist($media);

        // Enforce single cover per unit
        if ($isCover) {
            $this->unsetOtherCovers($unit, $media);
        }

        $this->em->flush();

        return $media;
    }

    private function unsetOtherCovers(Unit $unit, UnitMedia $keep): void
    {
        $qb = $this->em->createQueryBuilder();
        $qb->update(UnitMedia::class, 'm')
            ->set('m.isCover', ':false')
            ->where('m.unit = :unit')
            ->andWhere('m != :keep')
            ->andWhere('m.isCover = :true')
            ->setParameter('unit', $unit)
            ->setParameter('keep', $keep)
            ->setParameter('true', true)
            ->setParameter('false', false)
            ->getQuery()->execute();
    }

    private function normalizeTag(string $tag): string
    {
        $tag = strtolower(trim($tag));
        // allow only simple folder-safe tags
        $tag = preg_replace('~[^a-z0-9\-_/]~', '-', $tag) ?: 'gallery';
        return $tag;
    }

    private function shortSlug(string $text, int $max = 50): string
    {
        $slug = strtolower((string) $this->slugger->slug($text));
        if (strlen($slug) > $max) {
            $slug = substr($slug, 0, $max);
        }
        $slug = trim($slug, '-_');
        return $slug ?: 'image';
    }

    private function mimeFromExt(string $ext): string
    {
        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'application/octet-stream',
        };
    }

    /**
     * Delete a media object from S3. Optionally remove all file variants that share the same slug prefix.
     *
     * @param UnitMedia $media
     * @param bool $deleteAllVariants When true, delete all objects whose key starts with the base slug prefix.
     */
    public function delete(UnitMedia $media, bool $deleteAllVariants = false): void
    {
        $key = $media->getS3Key();
        if (!$key) {
            return; // nothing to delete
        }

        // Simple case: delete only the exact key
        if (!$deleteAllVariants) {
            try {
                $this->s3->deleteObject([
                    'Bucket' => $this->bucket,
                    'Key'    => $key,
                ]);
            } catch (\Aws\S3\Exception\S3Exception $e) {
                // Ignore if object already gone; rethrow others
                if ($e->getAwsErrorCode() !== 'NoSuchKey') {
                    throw $e;
                }
            }
            return;
        }

        // Advanced: delete by variant prefix within the same folder
        // Key pattern we generate is: {unitId}/{tag}/{slug}_{variant}_{uniq}.{ext}
        // We want a prefix up to the trailing underscore *after* the variant, e.g., ".../{slug}_{variant}_"
        $dir = trim(str_replace('\\', '/', dirname($key)), '/');
        $base = basename($key); // e.g., q1a2610_lg_c09b.jpg
        $dot = strrpos($base, '.');
        $nameNoExt = $dot !== false ? substr($base, 0, $dot) : $base; // q1a2610_lg_c09b
        $lastUnderscore = strrpos($nameNoExt, '_');
        $prefixName = $lastUnderscore !== false ? substr($nameNoExt, 0, $lastUnderscore + 1) : $nameNoExt; // q1a2610_lg_
        $prefix = ($dir !== '' ? ($dir . '/') : '') . $prefixName; // 14/gallery/q1a2610_lg_

        // List and delete all matching objects under that prefix
        $continuationToken = null;
        do {
            $params = [
                'Bucket' => $this->bucket,
                'Prefix' => $prefix,
            ];
            if ($continuationToken) {
                $params['ContinuationToken'] = $continuationToken;
            }
            $result = $this->s3->listObjectsV2($params);
            $contents = $result['Contents'] ?? [];
            if (!empty($contents)) {
                $objects = array_map(fn($o) => ['Key' => $o['Key']], $contents);
                // Batch delete up to 1000 keys per request
                $this->s3->deleteObjects([
                    'Bucket' => $this->bucket,
                    'Delete' => [ 'Objects' => $objects, 'Quiet' => true ],
                ]);
            }
            $isTruncated = $result['IsTruncated'] ?? false;
            $continuationToken = $isTruncated ? ($result['NextContinuationToken'] ?? null) : null;
        } while (!empty($continuationToken));
    }
}