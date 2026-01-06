<?php

namespace App\Controller\Api;

use App\Entity\Unit;
use App\Service\UnitMediaUploadService;
use App\Entity\UnitMedia;
use App\Repository\UnitMediaRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Serializer\SerializerInterface;
use Psr\Log\LoggerInterface;

class UnitMediaController extends AbstractController
{
    #[Route('/api/units/{id}/media', name: 'api_units_upload_media', methods: ['POST'])]
    public function uploadMedia(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        UnitMediaUploadService $uploadService,
        SerializerInterface $serializer,
        LoggerInterface $logger
    ): Response {
        $unit = $em->getRepository(Unit::class)->find($id);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found'], Response::HTTP_NOT_FOUND);
        }

        // Diagnostics: log what Symfony sees in $request->files
        $filesBag = $request->files->all();
        $filesKeys = array_keys($filesBag);
        $logger->info('[UnitMediaController] Incoming upload', [
            'content_type' => $request->headers->get('content-type'),
            'files_keys'   => $filesKeys,
            'files_count'  => count($filesBag),
            'method'       => $request->getMethod(),
            'uri'          => $request->getRequestUri(),
        ]);

        // Bulk upload handling: accept any file field name (files[], files, file, etc.) and flatten
        $allFilesBag = $request->files->all();
        $files = [];
        $stack = [$allFilesBag];
        while ($stack) {
            $current = array_pop($stack);
            if ($current instanceof \Symfony\Component\HttpFoundation\File\UploadedFile) {
                $files[] = $current;
            } elseif (is_array($current)) {
                foreach ($current as $c) { $stack[] = $c; }
            }
        }

        if (count($files) > 0) {
            // Read optional shared fields (applied to all)
            $isPublished = filter_var($request->request->get('is_published', true), FILTER_VALIDATE_BOOLEAN);
            $isCover = false; // never auto-cover here; sorting endpoint will define cover
            $tags = $request->request->all('tags');

            // Determine starting sort order (max + 1)
            $maxSort = (int) $em->createQuery('SELECT COALESCE(MAX(m.sortOrder), -1) FROM App\\Entity\\UnitMedia m WHERE m.unit = :unit')
                ->setParameter('unit', $unit)
                ->getSingleScalarResult();

            $created = [];
            foreach ($files as $idx => $file) {
                if (!$file) { continue; }
                // Preflight diagnostics for each UploadedFile
                $name  = method_exists($file, 'getClientOriginalName') ? $file->getClientOriginalName() : null;
                $size  = method_exists($file, 'getSize') ? $file->getSize() : null;
                $err   = method_exists($file, 'getError') ? $file->getError() : null;
                $valid = method_exists($file, 'isValid') ? $file->isValid() : null;
                if (isset($logger)) {
                    $logger->info('[UnitMediaController] bulk file preflight', [
                        'idx' => $idx,
                        'name' => $name,
                        'size' => $size,
                        'error' => $err,
                        'valid' => $valid,
                        'class' => is_object($file) ? get_class($file) : gettype($file),
                    ]);
                }
                if ($valid === false || $size === 0) {
                    return new JsonResponse([
                        'error' => 'Invalid uploaded file',
                        'details' => [
                            'idx' => $idx,
                            'name' => $name,
                            'size' => $size,
                            'error' => $err,
                            'valid' => $valid,
                        ]
                    ], Response::HTTP_BAD_REQUEST);
                }
                $sortOrder = $maxSort + 1 + $idx;
                try {
                    $media = $uploadService->upload(
                        $unit,
                        $file,
                        null,           // caption (set later in edit UI)
                        null,           // seoDescription (set later in edit UI)
                        !empty($tags) ? $tags : ['gallery'],
                        $isPublished,
                        $isCover,
                        $sortOrder
                    );
                    $created[] = $serializer->normalize($media, null, ['groups' => ['unitMedia:read']]);
                } catch (\Throwable $e) {
                    return new JsonResponse([
                        'error' => 'One of the files failed to upload',
                        'message' => $e->getMessage(),
                    ], Response::HTTP_INTERNAL_SERVER_ERROR);
                }
            }

            return new JsonResponse($created, Response::HTTP_CREATED);
        }

        /** @var \Symfony\Component\HttpFoundation\File\UploadedFile|null $file */
        $file = $request->files->get('file');
        if (!$file) {
            $allFiles = $request->files->all();
            $flat = [];
            $stackDbg = [$allFiles];
            while ($stackDbg) {
                $c = array_pop($stackDbg);
                if ($c instanceof \Symfony\Component\HttpFoundation\File\UploadedFile) {
                    $flat[] = [
                        'clientOriginalName' => $c->getClientOriginalName(),
                        'clientMimeType' => $c->getClientMimeType(),
                        'size' => $c->getSize(),
                    ];
                } elseif (is_array($c)) {
                    foreach ($c as $cc) { $stackDbg[] = $cc; }
                }
            }

            $debug = [
                'content_type'    => $request->headers->get('content-type'),
                'content_length'  => $request->headers->get('content-length'),
                'files_keys'      => array_keys($allFiles),
                'files_count'     => count($allFiles),
                'files_flat'      => $flat,
                'FILES_super'     => array_keys($_FILES ?? []),
                'POST_super_keys' => array_keys($_POST ?? []),
                'method'          => $request->getMethod(),
                'uri'             => $request->getRequestUri(),
            ];

            return new JsonResponse(['error' => 'Missing file', 'debug' => $debug], Response::HTTP_BAD_REQUEST);
        }

        // Preflight diagnostics for single file
        $sName  = method_exists($file, 'getClientOriginalName') ? $file->getClientOriginalName() : null;
        $sSize  = method_exists($file, 'getSize') ? $file->getSize() : null;
        $sErr   = method_exists($file, 'getError') ? $file->getError() : null;
        $sValid = method_exists($file, 'isValid') ? $file->isValid() : null;
        if (isset($logger)) {
            $logger->info('[UnitMediaController] single file preflight', [
                'name' => $sName,
                'size' => $sSize,
                'error' => $sErr,
                'valid' => $sValid,
                'class' => is_object($file) ? get_class($file) : gettype($file),
            ]);
        }
        if ($sValid === false || $sSize === 0) {
            return new JsonResponse([
                'error' => 'Invalid uploaded file',
                'details' => [
                    'name' => $sName,
                    'size' => $sSize,
                    'error' => $sErr,
                    'valid' => $sValid,
                ]
            ], Response::HTTP_BAD_REQUEST);
        }

        $caption = $request->request->get('caption');
        $seoDescription = $request->request->get('seo_description');
        $tags = $request->request->all('tags');
        $isPublished = filter_var($request->request->get('is_published', false), FILTER_VALIDATE_BOOLEAN);
        $isCover = filter_var($request->request->get('is_cover', false), FILTER_VALIDATE_BOOLEAN);
        $sortOrder = (int)($request->request->get('sort_order', 0));

        try {
            $media = $uploadService->upload(
                $unit,
                $file,
                $caption,
                $seoDescription,
                $tags,
                $isPublished,
                $isCover,
                $sortOrder
            );

            $data = $serializer->normalize($media, null, ['groups' => ['unitMedia:read']]);
            return new JsonResponse($data, Response::HTTP_CREATED);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'error' => 'Upload failed',
                'message' => $e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    #[Route('/api/units/{id}/media', name: 'api_units_media_list', methods: ['GET'])]
    public function listMedia(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        UnitMediaRepository $repo,
        SerializerInterface $serializer
    ): Response {
        $unit = $em->getRepository(Unit::class)->find($id);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found'], Response::HTTP_NOT_FOUND);
        }

        // Optional filters: ?published=1, ?covers=1
        $published = filter_var($request->query->get('published', null), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        $covers    = filter_var($request->query->get('covers', null), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        if ($covers === true) {
            $items = $repo->findCoversOnly($unit);
        } elseif ($published === true) {
            $items = $repo->findPublishedByUnit($unit);
        } else {
            $items = $repo->findByUnitOrdered($unit);
        }

        $data = array_map(
            fn(UnitMedia $m) => $serializer->normalize($m, null, ['groups' => ['unitMedia:read']]),
            $items
        );

        return new JsonResponse($data, Response::HTTP_OK);
    }

    #[Route('/api/unit_media/{mediaId}', name: 'api_unit_media_patch', methods: ['PATCH'])]
    public function patchMedia(
        int $mediaId,
        Request $request,
        EntityManagerInterface $em,
        SerializerInterface $serializer
    ): Response {
        /** @var UnitMedia|null $media */
        $media = $em->getRepository(UnitMedia::class)->find($mediaId);
        if (!$media) {
            return new JsonResponse(['error' => 'Media not found'], Response::HTTP_NOT_FOUND);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return new JsonResponse(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }

        // Read both camelCase and snake_case for convenience
        $get = function(string $k, $default = null) use ($payload) {
            if (array_key_exists($k, $payload)) return $payload[$k];
            // snake_case fallback
            $snake = strtolower(preg_replace('/([a-z])([A-Z])/', '$1_$2', $k));
            return $payload[$snake] ?? $default;
        };

        if (array_key_exists('caption', $payload)) {
            $media->setCaption((string)($get('caption') ?? ''));
        }
        if (array_key_exists('seoDescription', $payload) || array_key_exists('seo_description', $payload)) {
            $val = $get('seoDescription');
            $media->setSeoDescription($val === null ? null : (string)$val);
        }
        if (array_key_exists('isPublished', $payload) || array_key_exists('is_published', $payload)) {
            $media->setIsPublished((bool)$get('isPublished', false));
        }
        if (array_key_exists('isCover', $payload) || array_key_exists('is_cover', $payload)) {
            $isCover = (bool)$get('isCover', false);
            $media->setIsCover($isCover);
            if ($isCover) {
                // Ensure uniqueness of cover per unit: unset others
                $em->createQuery('UPDATE App\\Entity\\UnitMedia m SET m.isCover = false WHERE m.unit = :u AND m.id != :id')
                    ->setParameter('u', $media->getUnit())
                    ->setParameter('id', $media->getId())
                    ->execute();
                $media->setIsCover(true);
            }
        }
        if (array_key_exists('tags', $payload) && is_array($payload['tags'])) {
            $media->setTags(array_values(array_map('strval', $payload['tags'])));
        }
        if (array_key_exists('sortOrder', $payload) || array_key_exists('sort_order', $payload)) {
            $so = $get('sortOrder');
            if ($so !== null && is_numeric($so)) {
                $media->setSortOrder((int)$so);
            }
        }

        $media->setUpdatedAt(new \DateTimeImmutable());
        $em->flush();

        $data = $serializer->normalize($media, null, ['groups' => ['unitMedia:read']]);
        return new JsonResponse($data, Response::HTTP_OK);
    }

    #[Route('/api/unit_media/{mediaId}', name: 'api_unit_media_delete', methods: ['DELETE'])]
    public function deleteMedia(
        int $mediaId,
        EntityManagerInterface $em,
        UnitMediaUploadService $uploadService
    ): Response {
        /** @var UnitMedia|null $media */
        $media = $em->getRepository(UnitMedia::class)->find($mediaId);
        if (!$media) {
            return new JsonResponse(['error' => 'Media not found'], Response::HTTP_NOT_FOUND);
        }

        try {
            // Delete the S3 object (exact key). Set second arg to true if you later want to remove variants by prefix.
            $uploadService->delete($media, false);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'error' => 'Failed to delete S3 object',
                'message' => $e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        // Remove DB row
        $em->remove($media);
        $em->flush();

        return new JsonResponse(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/api/units/{id}/media/order', name: 'api_units_media_order', methods: ['PATCH'])]
    public function reorderMedia(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        SerializerInterface $serializer
    ): Response {
        $unit = $em->getRepository(Unit::class)->find($id);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found'], Response::HTTP_NOT_FOUND);
        }

        $payload = json_decode($request->getContent(), true);
        if (!isset($payload['order']) || !is_array($payload['order'])) {
            return new JsonResponse(['error' => 'Invalid payload: expected { "order": [ids...] }'], Response::HTTP_BAD_REQUEST);
        }

        $order = $payload['order'];
        $medias = $em->getRepository(UnitMedia::class)->findBy(['unit' => $unit]);
        $mediaMap = [];
        foreach ($medias as $m) {
            $mediaMap[$m->getId()] = $m;
        }

        $position = 0;
        $updated = [];
        foreach ($order as $mediaId) {
            if (!isset($mediaMap[$mediaId])) continue;
            $media = $mediaMap[$mediaId];
            $media->setSortOrder($position);
            $media->setIsCover($position === 0);
            $position++;
            $updated[] = $media;
        }

        // Reset cover flag for any media not in the order list
        foreach ($medias as $m) {
            if (!in_array($m->getId(), $order, true)) {
                $m->setIsCover(false);
            }
        }

        $em->flush();

        $data = array_map(fn($m) => $serializer->normalize($m, null, ['groups' => ['unitMedia:read']]), $updated);
        return new JsonResponse($data, Response::HTTP_OK);
    }
}