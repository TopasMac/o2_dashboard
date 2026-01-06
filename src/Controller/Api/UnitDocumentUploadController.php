<?php

namespace App\Controller\Api;

use App\Entity\Unit;
use App\Entity\UnitDocument;
use App\Entity\UnitBalanceLedger;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Aws\S3\S3Client;
use Aws\Exception\AwsException;
use App\Service\Document\DocumentUploadService;
use App\Service\Document\UploadRequestDTO;
use App\Service\AttachOptions;

#[AsController]
class UnitDocumentUploadController extends AbstractController
{
    #[Route('/api/unit-documents/upload', name: 'upload_unit_document', methods: ['POST'])]
    public function upload(Request $request, DocumentUploadService $uploader, ManagerRegistry $doctrine): JsonResponse
    {
        $em = $doctrine->getManager();
        // Normalize dateForName to immutable date-only (Y-m-d)
        $rawDateForName = $request->request->get('dateForName') ?: 'today';
        $baseDate = \DateTimeImmutable::createFromFormat('Y-m-d', (string) $rawDateForName)
            ?: new \DateTimeImmutable((string) $rawDateForName);
        $dateForName = \DateTimeImmutable::createFromFormat('Y-m-d', $baseDate->format('Y-m-d'));

        $ledgerIdFromReq = (int) $request->request->get('ledger');

        if ($ledgerIdFromReq > 0) {
            /** @var UnitBalanceLedger|null $ledger */
            $ledger = $em->getRepository(UnitBalanceLedger::class)->find($ledgerIdFromReq);
            if (!$ledger) {
                return $this->json(['error' => 'Ledger not found'], 404);
            }
            $file = $request->files->get('document');
            if (!$file) {
                return $this->json(['error' => 'No document provided'], 400);
            }
            // Use unit from request if provided, else derive from ledger
            $unitId = (int) ($request->request->get('unit') ?: ($ledger->getUnit()?->getId() ?? 0));
            // Forward category/description as sent (service will normalize & detect "Report Payment")
            $category = (string) $request->request->get('category');
            $description = (string) $request->request->get('description');

            // Delegate to service's ledger-aware upload to ensure reports/<YYMM>/... path and proper attachment
            $document = $uploader->uploadForLedger(
                ledgerId: (int) $ledger->getId(),
                unitId: $unitId,
                file: $file,
                category: $category,
                description: $description,
                dateForName: $dateForName
            );

            return $this->json([
                'success' => true,
                'id' => $document->getId(),
                'filename' => $document->getFilename(),
                'url' => method_exists($document, 'getS3Url') ? $document->getS3Url() : null
            ], 201);
        }

        $dto = new UploadRequestDTO(
            unitId: (int) $request->request->get('unit'),
            transactionId: (int) $request->request->get('transaction'),
            transactionType: $request->request->get('transactionType', 'unit'), // 'unit' or 'hk'
            category: $request->request->get('category'),
            description: $request->request->get('description'),
            customToken: $request->request->get('token'),
            dateForName: $dateForName,
            file: $request->files->get('document')
        );

        $document = $uploader->upload($dto);

        // Try to find existing by ledger first (same category)
        // Removed ledgerIdFromReq dedupe block as early return handles ledger uploads

        // If not found by ledger, fall back to transaction-based matching below
        $existing = null;
        $tx = null;
        if (method_exists($document, 'getTransaction') && $document->getTransaction()) {
            $tx = $document->getTransaction();
        } elseif (method_exists($document, 'getHkTransaction') && $document->getHkTransaction()) {
            $tx = $document->getHkTransaction();
        }

        if ($tx) {
            // Load all docs for same transaction + category
            $repo = $em->getRepository(UnitDocument::class);
            if (!method_exists($repo, 'createQueryBuilder')) {
                // Fallback: simple findBy and filter in PHP
                $all = $repo->findBy(['category' => $document->getCategory()]);
                foreach ($all as $d) {
                    if ($d->getId() !== $document->getId()) {
                        if (method_exists($d, 'getTransaction') && $d->getTransaction() === $tx) { $existing = $d; break; }
                        if (method_exists($d, 'getHkTransaction') && $d->getHkTransaction() === $tx) { $existing = $d; break; }
                    }
                }
            } else {
                $qb = $repo->createQueryBuilder('d');
                // Match by same transaction ref and category; exclude the newly created row
                $qb->andWhere('d.category = :cat')
                   ->setParameter('cat', $document->getCategory())
                   ->andWhere('d != :newDoc')
                   ->setParameter('newDoc', $document)
                   ->setMaxResults(1);
                // Try to bind by transaction field name
                if (method_exists($document, 'getTransaction') && $document->getTransaction()) {
                    $qb->andWhere('d.transaction = :tx')->setParameter('tx', $tx);
                } elseif (method_exists($document, 'getHkTransaction') && $document->getHkTransaction()) {
                    $qb->andWhere('d.hkTransaction = :tx')->setParameter('tx', $tx);
                }
                $existing = $qb->getQuery()->getOneOrNullResult();
            }
        }

        if ($existing) {
            // Keep the existing ID, copy fields from the new doc, and delete the new row.
            $oldUrl = method_exists($existing, 'getS3Url') ? $existing->getS3Url() : null;

            // Copy over filename/url/label/mime/dates when available
            if (method_exists($document, 'getFilename') && method_exists($existing, 'setFilename')) {
                $existing->setFilename($document->getFilename());
            }
            if (method_exists($document, 'getS3Url') && method_exists($existing, 'setS3Url')) {
                $existing->setS3Url($document->getS3Url());
            }
            if (method_exists($document, 'getDocumentUrl') && method_exists($existing, 'setDocumentUrl')) {
                $existing->setDocumentUrl($document->getDocumentUrl());
            }
            if (method_exists($document, 'getLabel') && method_exists($existing, 'setLabel')) {
                $existing->setLabel($document->getLabel());
            }
            if (method_exists($document, 'getMimeType') && method_exists($existing, 'setMimeType')) {
                $existing->setMimeType($document->getMimeType());
            }
            if (method_exists($document, 'getUploadedAt') && method_exists($existing, 'setUploadedAt')) {
                $existing->setUploadedAt($document->getUploadedAt());
            }
            if (method_exists($document, 'getUploadedBy') && method_exists($existing, 'setUploadedBy')) {
                $existing->setUploadedBy($document->getUploadedBy());
            }

            // Persist changes and remove the temporary new row
            $em->persist($existing);
            $em->remove($document);
            $em->flush();

            // Best effort: delete old S3 object if URL changed
            if ($oldUrl && $oldUrl !== ($existing->getS3Url() ?? '')) {
                try {
                    $key = null;
                    if (is_string($oldUrl) && str_contains($oldUrl, '://')) {
                        $parsedUrl = parse_url($oldUrl);
                        $key = ltrim($parsedUrl['path'] ?? '', '/');
                    } else {
                        // oldUrl is already a canonical S3 key path (e.g., reports/YYMM/...)
                        $key = ltrim((string)$oldUrl, '/');
                    }
                    if ($key) {
                        $s3 = new \Aws\S3\S3Client(['region' => 'us-east-2', 'version' => 'latest']);
                        $s3->deleteObject(['Bucket' => 'owners2-unit-documents', 'Key' => $key]);
                    }
                } catch (\Throwable $e) {
                    @error_log('UnitDocument replace-in-place: failed to delete old S3 object: ' . $e->getMessage());
                }
            }

            // Return the existing document (kept id) with its updated data
            return $this->json([
                'success' => true,
                'id' => $existing->getId(),
                'filename' => method_exists($existing, 'getFilename') ? $existing->getFilename() : null,
                'url' => method_exists($existing, 'getS3Url') ? $existing->getS3Url() : null,
            ], 200);
        }

        return $this->json([
            'success' => true,
            'id' => $document->getId(),
            'filename' => $document->getFilename(),
            'url' => method_exists($document, 'getS3Url') ? $document->getS3Url() : null
        ], 201);
    }

    #[Route('/api/unit-documents/{id}', name: 'delete_unit_document', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $document = $em->getRepository(UnitDocument::class)->find($id);

        if (!$document) {
            return new JsonResponse(['error' => 'Document not found'], 404);
        }

        // Try to resolve owning transaction (Unit or HK)
        $transaction = null;
        if (method_exists($document, 'getTransaction')) {
            $transaction = $document->getTransaction();
        }
        if (!$transaction && method_exists($document, 'getHkTransaction')) {
            $transaction = $document->getHkTransaction();
        }

        if ($transaction) {
            if (method_exists($transaction, 'removeUnitDocument')) {
                $transaction->removeUnitDocument($document);
            }
            $em->persist($transaction);
            $em->flush();
        }

        $bucket = 'owners2-unit-documents';
        $s3Url = $document->getS3Url();

        if ($s3Url) {
            if (is_string($s3Url) && str_contains($s3Url, '://')) {
                $parsedUrl = parse_url($s3Url);
                $key = ltrim($parsedUrl['path'] ?? '', '/');
            } else {
                $key = ltrim((string)$s3Url, '/');
            }

            $s3Client = new S3Client([
                'region' => 'us-east-2',
                'version' => 'latest',
            ]);

            try {
                $s3Client->deleteObject([
                    'Bucket' => $bucket,
                    'Key' => $key,
                ]);
            } catch (AwsException $e) {
                error_log("Failed to delete S3 object: " . $e->getMessage());
            }
        }

        $em->remove($document);
        $em->flush();

        return new JsonResponse(['success' => true], 200);
    }

    #[Route('/api/test-s3', methods: ['GET'])]
    public function testS3(): JsonResponse
    {
        $bucket = 'owners2-unit-documents';
        $s3Client = new S3Client(['region' => 'us-east-2', 'version' => 'latest']);
        try {
            $s3Client->listObjects(['Bucket' => $bucket]);
            return new JsonResponse(['success' => true]);
        } catch (AwsException $e) {
            return new JsonResponse(['error' => $e->getMessage()], 500);
        }
    }
}