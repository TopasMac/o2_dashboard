<?php

namespace App\Controller\Api;

use App\Entity\UnitTransactions;
use App\Repository\UnitTransactionsRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use App\Service\DocumentUploadService;
use App\Service\UploadRequestDTO;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use App\Repository\UnitDocumentAttachmentRepository;

#[Route('/api/unit-transactions')]
class UnitTransactionsController extends AbstractController
{
    #[Route('', name: 'get_all_unit_transactions', methods: ['GET'])]
    public function getAll(Request $request, EntityManagerInterface $em, UnitTransactionsRepository $unitTransactionsRepository, UnitDocumentAttachmentRepository $attachmentRepo): JsonResponse
    {
        // Read optional filters
        $unitIdParam = $request->query->get('unitId');
        $yearMonth = $request->query->get('yearMonth');
        $type = $request->query->get('type');
        $costCenter = $request->query->get('costCenter');

        $hasAnyFilter = ($unitIdParam !== null) || ($yearMonth !== null) || ($type !== null) || ($costCenter !== null);

        $unitId = null;
        if ($unitIdParam !== null && $unitIdParam !== '') {
            $unitId = (int)$unitIdParam;
        }

        $from = null;
        $to = null;
        if ($yearMonth) {
            try {
                $from = new \DateTimeImmutable($yearMonth . '-01');
                $to = $from->modify('last day of this month');
            } catch (\Exception $e) {
                // If yearMonth is invalid, ignore date filtering
                $from = null;
                $to = null;
            }
        }

        // If any filter provided, use the filtered query; otherwise, keep original behavior
        if ($hasAnyFilter) {
            $transactions = $unitTransactionsRepository->findByFiltersWithCategory($unitId, $from, $to, $type, $costCenter);
        } else {
            $transactions = $unitTransactionsRepository->findAllWithCategory();
        }

        // Prefetch latest attachments for all transaction ids (avoid N+1)
        $ids = array_values(array_filter(array_map(static function ($t) {
            return isset($t['id']) ? (int) $t['id'] : 0;
        }, $transactions)));
        $attachmentsByTxId = $attachmentRepo->findLatestForTargets('unit_transactions', $ids);

        $data = [];
        foreach ($transactions as $transaction) {
            $unitDocuments = [];
            $firstDocUrl = null;

            if (isset($transaction['id'])) {
                // 1) Prefer the new attachment flow (batch pre-fetched)
                $att = $attachmentsByTxId[$transaction['id']] ?? null;
                if ($att && method_exists($att, 'getDocument') && ($doc = $att->getDocument())) {
                    $docUrl = method_exists($doc, 'getDocumentUrl') ? $doc->getDocumentUrl() : null;
                    $s3Url  = method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null;
                    $firstDocUrl = $s3Url ?: $docUrl;
                    $unitDocuments[] = [
                        'id' => $doc->getId(),
                        'filename' => method_exists($doc, 'getFilename') ? $doc->getFilename() : null,
                        'documentUrl' => $docUrl,
                        's3Url' => $s3Url,
                        's3_url' => $s3Url,
                    ];
                }

                // 2) Fallback to legacy relation if no attachment doc was found
                if ($firstDocUrl === null) {
                    $transactionEntity = $unitTransactionsRepository->find($transaction['id']);
                    if ($transactionEntity) {
                        $docRepo = $em->getRepository(\App\Entity\UnitDocument::class);
                        $docs = $docRepo->findBy(['transaction' => $transactionEntity], ['id' => 'ASC']);
                        foreach ($docs as $doc) {
                            $docUrl = method_exists($doc, 'getDocumentUrl') ? $doc->getDocumentUrl() : null;
                            $s3Url  = method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null;
                            if ($firstDocUrl === null) {
                                $firstDocUrl = $s3Url ?: $docUrl;
                            }
                            $unitDocuments[] = [
                                'id' => $doc->getId(),
                                'filename' => method_exists($doc, 'getFilename') ? $doc->getFilename() : null,
                                'documentUrl' => $docUrl,
                                's3Url' => $s3Url,
                                's3_url' => $s3Url,
                            ];
                        }
                    }
                }
            }

            $firstDoc = !empty($unitDocuments) ? $unitDocuments[0] : null;

            $data[] = [
                'id' => $transaction['id'] ?? null,
                'transactionCode' => $transaction['transactionCode'] ?? null,
                'unitId' => $transaction['unitId'] ?? null,
                'unitName' => $transaction['unitName'] ?? null,
                'date' => isset($transaction['date']) && $transaction['date'] instanceof \DateTimeInterface
                    ? $transaction['date']->format('Y-m-d')
                    : (is_string($transaction['date'] ?? null) ? $transaction['date'] : null),
                'description' => $transaction['description'] ?? null,
                'amount' => $transaction['amount'] ?? null,
                'comments' => $transaction['comments'] ?? null,
                'type' => $transaction['type'] ?? null,
                'costCenter' => $transaction['costCenter'] ?? null,
                'category' => $transaction['categoryName'] ?? ($transaction['category'] ?? null),
                'categoryId' => $transaction['categoryId'] ?? null,
                's3_url' => $firstDocUrl,
                'documentUrl' => $firstDocUrl ?? ($transaction['documentUrl'] ?? null),
                'unitDocument' => $firstDoc ? array_merge($firstDoc, ['s3_url' => $firstDoc['s3Url'] ?? null]) : null,
            ];
        }

        return $this->json($data);
    }

    #[Route('', name: 'create_unit_transaction', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $transaction = new UnitTransactions();
        // Normalize to immutable date-only (Y-m-d)
        $d = \DateTimeImmutable::createFromFormat('Y-m-d', (string) ($data['date'] ?? ''))
            ?: new \DateTimeImmutable((string) ($data['date'] ?? 'today'));
        $transaction->setDate(\DateTimeImmutable::createFromFormat('Y-m-d', $d->format('Y-m-d')));
        $transaction->setDescription($data['description'] ?? null);
        $transaction->setAmount($data['amount']);
        $transaction->setComments($data['comments'] ?? null);
        $transaction->setType($data['type'] ?? null);
        $transaction->setCostCenter($data['cost_center'] ?? null);

        // You may need to fetch the Unit entity based on ID
        if (isset($data['unit_id'])) {
            $unit = $entityManager->getRepository(\App\Entity\Unit::class)->find($data['unit_id']);
            if ($unit) {
                $transaction->setUnit($unit);
            }
        }
        // Handle category_id if provided
        if (isset($data['category_id'])) {
            $category = $entityManager->getRepository(\App\Entity\TransactionCategory::class)->find($data['category_id']);
            if ($category) {
                $transaction->setCategory($category);
            }
        }

        // Generate unique transaction code
        $repo = $entityManager->getRepository(UnitTransactions::class);
        $transactionCode = $repo->generateUniqueTransactionCode();
        $transaction->setTransactionCode($transactionCode);

        // Link documents to transaction if document_ids is provided
        if (isset($data['document_ids']) && is_array($data['document_ids'])) {
            foreach ($data['document_ids'] as $docId) {
                $document = $entityManager->getRepository(\App\Entity\UnitDocument::class)->find($docId);
                if ($document) {
                    $transaction->addUnitDocument($document);
                    $document->setTransaction($transaction);
                    $entityManager->persist($document);
                }
            }
        }

        $entityManager->persist($transaction);
        $entityManager->flush();

        return $this->json(['message' => 'Transaction created successfully'], 201);
    }

    #[Route('/{id}', name: 'update_unit_transaction', methods: ['PUT', 'PATCH'])]
    public function update($id, Request $request, EntityManagerInterface $entityManager, UnitTransactionsRepository $repository): JsonResponse
    {
        $transaction = $repository->find($id);
        if (!$transaction) {
            return $this->json(['message' => 'Transaction not found'], 404);
        }

        $data = json_decode($request->getContent(), true);
        if (isset($data['date'])) {
            // Normalize to immutable date-only (Y-m-d)
            $d = \DateTimeImmutable::createFromFormat('Y-m-d', (string) $data['date'])
                ?: new \DateTimeImmutable((string) $data['date']);
            $transaction->setDate(\DateTimeImmutable::createFromFormat('Y-m-d', $d->format('Y-m-d')));
        }
        if (isset($data['description'])) {
            $transaction->setDescription($data['description']);
        }
        if (isset($data['amount'])) {
            $transaction->setAmount($data['amount']);
        }
        if (isset($data['comments'])) {
            $transaction->setComments($data['comments']);
        }
        if (isset($data['type'])) {
            $transaction->setType($data['type']);
        }
        if (isset($data['cost_center'])) {
            $transaction->setCostCenter($data['cost_center']);
        }

        if (isset($data['unit_id'])) {
            $unit = $entityManager->getRepository(\App\Entity\Unit::class)->find($data['unit_id']);
            if ($unit) {
                $transaction->setUnit($unit);
            }
        }
        // Handle category_id if provided
        if (isset($data['category_id'])) {
            $category = $entityManager->getRepository(\App\Entity\TransactionCategory::class)->find($data['category_id']);
            if ($category) {
                $transaction->setCategory($category);
            }
        }

        // Handle adding new documents
        if (isset($data['document_ids']) && is_array($data['document_ids'])) {
            foreach ($data['document_ids'] as $docId) {
                $document = $entityManager->getRepository(\App\Entity\UnitDocument::class)->find($docId);
                if ($document && !$transaction->getUnitDocuments()->contains($document)) {
                    $transaction->addUnitDocument($document);
                    $document->setTransaction($transaction);
                    $entityManager->persist($document);
                }
            }
        }

        // Handle removing documents (delete from DB)
        if (isset($data['remove_document_ids']) && is_array($data['remove_document_ids'])) {
            foreach ($data['remove_document_ids'] as $docId) {
                $document = $entityManager->getRepository(\App\Entity\UnitDocument::class)->find($docId);
                if ($document && $transaction->getUnitDocuments()->contains($document)) {
                    $transaction->removeUnitDocument($document);
                    $entityManager->remove($document);
                }
            }
        }

        $entityManager->flush();

        return $this->json(['message' => 'Transaction updated successfully']);
    }
    #[Route('/{id}', name: 'delete_unit_transaction', methods: ['DELETE'])]
    public function delete($id, EntityManagerInterface $entityManager, UnitTransactionsRepository $repository): JsonResponse
    {
        $transaction = $repository->find($id);
        if (!$transaction) {
            return $this->json(['message' => 'Transaction not found'], 404);
        }

        // Unlink documents instead of deleting them, to avoid breaking shared usage
        if (method_exists($transaction, 'getUnitDocuments') && method_exists($transaction, 'removeUnitDocument')) {
            foreach ($transaction->getUnitDocuments() as $doc) {
                $transaction->removeUnitDocument($doc);
                if (method_exists($doc, 'setTransaction')) {
                    $doc->setTransaction(null);
                }
                $entityManager->persist($doc);
            }
        }

        $entityManager->remove($transaction);
        $entityManager->flush();

        return $this->json(['message' => 'Transaction deleted and documents unlinked successfully']);
    }
    #[Route('/document/{id}', name: 'delete_document', methods: ['DELETE'])]
    public function deleteDocument($id, EntityManagerInterface $entityManager, DocumentUploadService $uploader): JsonResponse
    {
        $document = $entityManager->getRepository(\App\Entity\UnitDocument::class)->find($id);
        if (!$document) {
            return $this->json(['message' => 'Document not found'], 404);
        }

        // Instead of deleting the underlying file/entity (which may be shared),
        // just unlink it from the unit transaction.
        if (method_exists($document, 'getTransaction') && $document->getTransaction()) {
            $tx = $document->getTransaction();
            if (method_exists($tx, 'removeUnitDocument')) {
                $tx->removeUnitDocument($document);
                $entityManager->persist($tx);
            }
            if (method_exists($document, 'setTransaction')) {
                $document->setTransaction(null);
            }
        }

        $entityManager->persist($document);
        $entityManager->flush();

        return $this->json(['message' => 'Document unlinked from transaction successfully']);
    }

    #[Route('/{id}/documents/upload', name: 'upload_unit_transaction_document', methods: ['POST'])]
    public function uploadDocument(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        UnitTransactionsRepository $repo,
        DocumentUploadService $uploader
    ): JsonResponse {
        $tx = $repo->find($id);
        if (!$tx) {
            return $this->json(['message' => 'Transaction not found'], 404);
        }

        /** @var UploadedFile|null $file */
        $file = $request->files->get('file');
        if (!$file) {
            throw new BadRequestHttpException('Missing file');
        }

        // Optional fields
        $categoryId = $request->request->getInt('category_id', 0) ?: null;
        $category   = $request->request->get('category');
        $txType     = $request->request->get('tx_type'); // 'Ingreso' | 'Gasto'
        $dateForNameStr = $request->request->get('date');
        $dateForName = null;
        if ($dateForNameStr) {
            try { $dateForName = new \DateTimeImmutable($dateForNameStr); } catch (\Exception $e) { $dateForName = null; }
        }

        // Decide transactionType for the upload service
        $unit = $tx->getUnit();
        $costCentre = $tx->getCostCenter();
        $isO2 = ($unit === null) || (is_string($costCentre) && str_starts_with($costCentre, 'Owners2_'));
        $transactionType = $isO2 ? 'o2' : 'unit';

        // Build DTO for the upload
        $dto = new UploadRequestDTO(
            unitId: $unit ? $unit->getId() : null,
            transactionId: $tx->getId(),
            transactionType: $transactionType,
            category: $category,
            description: $request->request->get('description'),
            customToken: null,
            dateForName: $dateForName ?: $tx->getDate(),
            bytes: null,
            mime: null,
            originalName: $file->getClientOriginalName(),
            file: $file,
            costCentre: $costCentre,
            categoryId: $categoryId,
            txType: $txType ?: $tx->getType()
        );

        $doc = $uploader->upload($dto);

        // Link the newly created document back to the transaction (inverse side)
        if (method_exists($tx, 'addUnitDocument')) {
            $tx->addUnitDocument($doc);
        }
        if (method_exists($doc, 'setTransaction')) {
            $doc->setTransaction($tx);
        }
        // Ensure both sides are tracked
        $em->persist($tx);
        $em->persist($doc);
        $em->flush();

        return $this->json([
            'id' => $doc->getId(),
            'filename' => method_exists($doc, 'getFilename') ? $doc->getFilename() : null,
            'documentUrl' => method_exists($doc, 'getDocumentUrl') ? $doc->getDocumentUrl() : null,
            's3Url' => method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null,
            's3_url' => method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null,
            'category' => method_exists($doc, 'getCategory') ? $doc->getCategory() : null,
            'label' => method_exists($doc, 'getLabel') ? $doc->getLabel() : null,
            'transactionType' => $transactionType,
            'costCentre' => $costCentre,
        ], 201);
    }
}