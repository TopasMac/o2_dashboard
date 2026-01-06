<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Repository\UnitDocumentRepository;
use App\Repository\UnitDocumentAttachmentRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Batch utilities for UnitDocument.
 */
#[AsController]
final class UnitDocumentController extends AbstractController
{
    public function __construct(
        private readonly UnitDocumentRepository $docs,
        private readonly UnitDocumentAttachmentRepository $attachments,
    ) {
    }

    /**
     * Batch-lookup UnitDocuments by ledger IDs.
     *
     * FRONTEND: POST /api/unit-documents/lookup
     * Body: { "ledgerIds": [198, 200, 205] }
     *
     * Response (map keyed by ledgerId):
     * {
     *   "ok": true,
     *   "count": 2,
     *   "data": {
     *     "198": { "id":211, "ledgerId":198, "s3Url":"...", "label":"Payment Proof", "category":"REPORTE-PAGO", "uploadedAt":"2025-09-29T00:00:00+00:00", "uploadedBy":"system", "publicUrl":"..." },
     *     "205": null
     *   }
     * }
     */
    #[Route('/api/unit-documents/lookup', name: 'api_unit_documents_lookup', methods: ['POST'])]
    public function lookupByLedgerIds(Request $request): JsonResponse
    {
        $payload = json_decode((string) $request->getContent(), true);
        if (!is_array($payload)) {
            return new JsonResponse(['ok' => false, 'error' => 'Invalid JSON'], 400);
        }

        // --- New mode: single row lookup by attachment target (e.g., unit_transactions)
        $targetType = isset($payload['targetType']) ? (string)$payload['targetType'] : (isset($payload['target_type']) ? (string)$payload['target_type'] : '');
        $targetId   = isset($payload['targetId']) ? (int)$payload['targetId'] : (isset($payload['target_id']) ? (int)$payload['target_id'] : 0);
        $latestOnly = isset($payload['latest']) ? (bool)$payload['latest'] : true;

        if ($targetType !== '' && $targetId > 0) {
            // Fetch latest attachment for this row
            $att = $this->attachments->findLatestFor($targetType, $targetId);
            $doc = null;
            if ($att && method_exists($att, 'getDocument') && ($d = $att->getDocument())) {
                $doc = [
                    'id'         => method_exists($d, 'getId') ? $d->getId() : null,
                    'filename'   => method_exists($d, 'getFilename') ? $d->getFilename() : null,
                    's3Url'      => method_exists($d, 'getS3Url') ? $d->getS3Url() : null,
                    's3_url'     => method_exists($d, 'getS3Url') ? $d->getS3Url() : null,
                    'category'   => method_exists($d, 'getCategory') ? $d->getCategory() : null,
                    'uploadedAt' => (method_exists($d, 'getUploadedAt') && $d->getUploadedAt()) ? $d->getUploadedAt()->format(\DateTimeInterface::ATOM) : null,
                    'label'      => method_exists($d, 'getLabel') ? $d->getLabel() : null,
                ];
            }

            return new JsonResponse([
                'ok'       => true,
                'document' => $doc,
            ]);
        }

        $ids = $payload['ledgerIds'] ?? $payload['ledger_ids'] ?? null;
        if (!is_array($ids) || empty($ids)) {
            return new JsonResponse(['ok' => false, 'error' => 'Missing ledgerIds array'], 400);
        }

        // Normalize and dedupe IDs
        $ledgerIds = array_values(array_unique(array_map('intval', $ids)));
        if (empty($ledgerIds)) {
            return new JsonResponse(['ok' => true, 'count' => 0, 'data' => new \stdClass()]);
        }

        // Build map keyed by ledgerId, default nulls
        $map = [];
        foreach ($ledgerIds as $lid) {
            $map[(string) $lid] = null;
        }

        // --- 1) New model: fetch attachments targeting these ledgers (prefer these)
        $atts = $this->attachments->createQueryBuilder('a')
            ->innerJoin('a.document', 'd')
            ->addSelect('d')
            ->where('a.targetType = :tt')
            ->andWhere('a.targetId IN (:ids)')
            ->setParameter('tt', 'unit_balance_ledger')
            ->setParameter('ids', $ledgerIds)
            ->orderBy('a.id', 'DESC')
            ->getQuery()
            ->getResult();

        foreach ($atts as $att) {
            /** @var \App\Entity\UnitDocumentAttachment $att */
            $ledgerId = method_exists($att, 'getTargetId') ? (int)$att->getTargetId() : null;
            if (!$ledgerId) {
                continue;
            }
            $key = (string)$ledgerId;

            // Keep the first (latest due to DESC) attachment per ledger
            if ($map[$key] !== null) {
                continue;
            }

            $doc = method_exists($att, 'getDocument') ? $att->getDocument() : null;
            if (!$doc) {
                continue;
            }

            $map[$key] = [
                'id'         => method_exists($doc, 'getId') ? $doc->getId() : null,
                'ledgerId'   => $ledgerId,
                's3Url'      => method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null,
                'label'      => method_exists($doc, 'getLabel') ? $doc->getLabel() : null,
                'category'   => method_exists($doc, 'getCategory') ? $doc->getCategory() : null,
                'uploadedAt' => (method_exists($doc, 'getUploadedAt') && $doc->getUploadedAt()) ? $doc->getUploadedAt()->format(\DateTimeInterface::ATOM) : null,
                'uploadedBy' => method_exists($doc, 'getUploadedBy') ? $doc->getUploadedBy() : null,
                'publicUrl'  => method_exists($doc, 'getPublicUrl') ? $doc->getPublicUrl() : (method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null),
            ];
        }

        // --- 2) Legacy model: join UnitDocument->ledger for any remaining ledgers
        $legacyDocs = $this->docs->createQueryBuilder('d')
            ->leftJoin('d.ledger', 'l')
            ->addSelect('l')
            ->where('l.id IN (:ids)')
            ->setParameter('ids', $ledgerIds)
            ->orderBy('d.id', 'DESC')
            ->getQuery()
            ->getResult();

        foreach ($legacyDocs as $doc) {
            /** @var \App\Entity\UnitDocument $doc */
            $ledger = method_exists($doc, 'getLedger') ? $doc->getLedger() : null;
            $lid    = $ledger ? (int)$ledger->getId() : null;
            if (!$lid) {
                continue;
            }
            $key = (string)$lid;

            // Only fill if no attachment-based doc was found
            if ($map[$key] !== null) {
                continue;
            }

            $map[$key] = [
                'id'         => method_exists($doc, 'getId') ? $doc->getId() : null,
                'ledgerId'   => $lid,
                's3Url'      => method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null,
                'label'      => method_exists($doc, 'getLabel') ? $doc->getLabel() : null,
                'category'   => method_exists($doc, 'getCategory') ? $doc->getCategory() : null,
                'uploadedAt' => (method_exists($doc, 'getUploadedAt') && $doc->getUploadedAt()) ? $doc->getUploadedAt()->format(\DateTimeInterface::ATOM) : null,
                'uploadedBy' => method_exists($doc, 'getUploadedBy') ? $doc->getUploadedBy() : null,
                'publicUrl'  => method_exists($doc, 'getPublicUrl') ? $doc->getPublicUrl() : (method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null),
            ];
        }

        // Count non-null docs
        $count = 0;
        foreach ($map as $v) {
            if ($v !== null) {
                $count++;
            }
        }

        return new JsonResponse([
            'ok'    => true,
            'count' => $count,
            'data'  => $map,
        ]);
    }
}