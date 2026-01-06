<?php

namespace App\Controller;

use App\Entity\Client;
use App\Entity\Unit;
use App\Entity\UnitBalanceLedger;
use App\Entity\UnitDocument;
use App\Entity\UnitDocumentAttachment;
use App\Service\Document\DocumentUploadService;
use App\Service\Document\AttachOptions;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class DocumentUploadController extends AbstractController
{
    /**
     * Centralized generic upload endpoint.
     * Accepts multipart/form-data with fields:
     *   - file (required): the file to upload
     *   - category (required): one of the allowed categories
     *   - unitId (optional)
     *   - clientId (optional)
     *   - ledgerId (optional) — if present, the file will be linked to that ledger row
     *   - dateForName (optional, YYYY-MM-DD) — fallback: ledger.txn_date or now
     *
     * Returns JSON with stored document metadata.
     */
    #[Route('/api/documents', name: 'api_documents_upload', methods: ['POST'])]
    public function upload(
        Request $request,
        DocumentUploadService $uploader,
        EntityManagerInterface $em
    ): JsonResponse {
        // ---- Category handling
        // We used to strictly whitelist categories. Now we accept any non-empty category
        // to support business labels like "Pago de Servicios" while still normalizing common aliases.
        $allowedReference = [
            'monthly-report', 'owner-report', 'report', 'reporte-pago', 'client-report-payment',
            'o2-payment', 'hoa-payment', 'water-payment', 'internet-payment', 'cfe-payment',
            'mtto', 'menage',
        ];

        /** @var UploadedFile|null $file */
        $file = $request->files->get('file');
        $category = (string) ($request->request->get('category') ?? '');
        $categoryId   = $request->request->getInt('categoryId', $request->request->getInt('category_id', 0));
        $categoryName = (string) ($request->request->get('categoryName') ?? $request->request->get('category_name') ?? '');


        // If a human label is provided (e.g., "Pago de Servicios"), prefer that.
        if ($categoryName !== '') {
            $normalizedCategory = $categoryName;
        } else {
            $categoryMap = [
                'monthly-report'         => 'report',
                'owner-report'           => 'report',
                'report'                 => 'report',
                'client-report-payment'  => 'report payment',
                'o2-payment'             => 'report payment',
                'reporte-pago'           => 'report payment', // Spanish alias mapped to Report Payment
            ];
            $normalizedCategory = $categoryMap[strtolower($category)] ?? $category;
        }

        // Prefer explicit description; fallback to human category or normalized
        $descParam   = trim((string) ($request->request->get('description') ?? ''));
        $descForName = $descParam !== ''
            ? $descParam
            : ($categoryName !== '' ? $categoryName : $normalizedCategory);

        $unitId = $request->request->getInt('unitId', 0);
        $clientId = $request->request->getInt('clientId', 0);
        $ledgerId = $request->request->getInt('ledgerId', 0);
        $dateForNameStr = (string) ($request->request->get('dateForName') ?? '');

        // --- Attachment params (centralized upload)
        $targetType = (string) ($request->request->get('targetType') ?? '');
        $targetId   = $request->request->getInt('targetId', 0);
        $mode       = (string) ($request->request->get('mode') ?? 'allow-many'); // 'replace' | 'allow-many'
        $scope      = (string) ($request->request->get('scope') ?? 'per-category'); // only for 'replace'

        $targetType = strtolower($targetType);

        $allowedTargetTypes = UnitDocumentAttachment::allowedTargetTypes();

        $useAttachmentFlow = ($targetType !== '' && $targetId > 0);
        if ($useAttachmentFlow && !in_array($targetType, $allowedTargetTypes, true)) {
            return $this->json(['ok' => false, 'error' => 'Invalid targetType', 'allowed' => $allowedTargetTypes], 400);
        }

        if (!$file instanceof UploadedFile || !$file->isValid()) {
            return $this->json(['ok' => false, 'error' => 'Missing or invalid file'], 400);
        }
        if ($category === '') {
            return $this->json(['ok' => false, 'error' => 'Category is required'], 400);
        }

        $unit = null; $client = null; $ledger = null; $dateForName = null;

        if ($unitId > 0) {
            $unit = $em->getRepository(Unit::class)->find($unitId);
        }
        if ($clientId > 0) {
            $client = $em->getRepository(Client::class)->find($clientId);
        }
        if ($ledgerId > 0) {
            $ledger = $em->getRepository(UnitBalanceLedger::class)->find($ledgerId);
        }

        if ($dateForNameStr !== '') {
            try { $dateForName = new \DateTimeImmutable($dateForNameStr); } catch (\Throwable $e) { $dateForName = null; }
        }
        if (!$dateForName && $ledger instanceof UnitBalanceLedger) {
            // If not provided, use the ledger's txn_date to make filenames deterministic
            $txn = $ledger->getTxnDate();
            if ($txn) { $dateForName = \DateTimeImmutable::createFromMutable($txn); }
        }
        if (!$dateForName) { $dateForName = new \DateTimeImmutable(); }

        // Normalize basic metadata
        $originalName = $file->getClientOriginalName() ?: 'upload.bin';
        $mime = $file->getClientMimeType() ?: 'application/octet-stream';
        $bytes = file_get_contents($file->getPathname());

        // Route to appropriate uploader — prefer linking to a ledger row when provided
        try {
            if ($ledger instanceof UnitBalanceLedger) {
                $doc = $uploader->uploadForLedger(
                    ledgerId: $ledger->getId(),
                    unitId: $unit?->getId(),
                    category: $normalizedCategory,
                    description: $descForName,
                    dateForName: $dateForName,
                    mime: $mime,
                    originalName: $originalName,
                    bytes: $bytes,
                    categoryId: $categoryId,
                );
            } else {
                $doc = $uploader->uploadForUnit(
                    unitId: $unit?->getId(),
                    category: $normalizedCategory,
                    description: $descForName,
                    dateForName: $dateForName,
                    mime: $mime,
                    originalName: $originalName,
                    bytes: $bytes,
                    categoryId: $categoryId,
                );
            }

            $attachment = null;
            if ($useAttachmentFlow) {
                $opts = new AttachOptions(
                    targetType: $targetType,
                    targetId: $targetId,
                    category: $normalizedCategory,
                    mode: $mode,
                    scope: $scope
                );
                $attachment = $uploader->attach($doc, $opts);
            }
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }

        $resp = [
            'ok' => true,
            'attachment' => $attachment ? [
                'id' => method_exists($attachment, 'getId') ? $attachment->getId() : null,
                'targetType' => $targetType ?: null,
                'targetId' => $targetId ?: null,
                'category' => $normalizedCategory,
                'categoryId' => $categoryId ?: null,
            ] : null,
            'document' => [
                'id'          => method_exists($doc, 'getId') ? $doc->getId() : null,
                'unitId'      => $unit?->getId(),
                'ledgerId'    => $ledger?->getId(),
                'category'    => $normalizedCategory,
                'categoryId' => $categoryId ?: null,
                'label'       => method_exists($doc, 'getLabel') ? $doc->getLabel() : null,
                's3Url'       => method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null,
                'original'    => $originalName,
                'mime'        => $mime,
                'url'         => method_exists($doc, 'getPublicUrl') ? $doc->getPublicUrl() : null,
                'description' => method_exists($doc, 'getDescription') ? $doc->getDescription() : null,
                'createdAt'   => method_exists($doc, 'getCreatedAt') && $doc->getCreatedAt() ? $doc->getCreatedAt()->format('Y-m-d H:i:s') : null,
            ],
        ];

        return $this->json($resp);
    }

    #[Route('/api/documents/{id}', name: 'api_documents_get', methods: ['GET'])]
    public function getDocument(int $id, EntityManagerInterface $em): JsonResponse
    {
        $doc = $em->getRepository(UnitDocument::class)->find($id);
        if (!$doc) {
            return $this->json(['ok' => false, 'error' => 'Not found'], 404);
        }

        return $this->json([
            'ok' => true,
            'document' => [
                'id'          => $doc->getId(),
                'unitId'      => $doc->getUnit() ? $doc->getUnit()->getId() : null,
                'ledgerId'    => method_exists($doc, 'getLedger') && $doc->getLedger() ? $doc->getLedger()->getId() : null,
                'category'    => method_exists($doc, 'getCategory') ? $doc->getCategory() : null,
                'original'    => method_exists($doc, 'getOriginalName') ? $doc->getOriginalName() : null,
                'mime'        => method_exists($doc, 'getMime') ? $doc->getMime() : null,
                'url'         => method_exists($doc, 'getPublicUrl') ? $doc->getPublicUrl() : null,
                'description' => method_exists($doc, 'getDescription') ? $doc->getDescription() : null,
                'createdAt'   => method_exists($doc, 'getCreatedAt') && $doc->getCreatedAt() ? $doc->getCreatedAt()->format('Y-m-d H:i:s') : null,
            ],
        ]);
    }

    #[Route('/api/documents/{id}', name: 'api_documents_delete', methods: ['DELETE'])]
    public function deleteDocument(int $id, EntityManagerInterface $em, DocumentUploadService $uploader): JsonResponse
    {
        $doc = $em->getRepository(UnitDocument::class)->find($id);
        if (!$doc) {
            return $this->json(['ok' => false, 'error' => 'Not found'], 404);
        }

        try {
            $uploader->delete($doc);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }

        return $this->json(['ok' => true]);
    }
}