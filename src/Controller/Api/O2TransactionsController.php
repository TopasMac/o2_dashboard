<?php

namespace App\Controller\Api;

use App\Entity\O2Transactions;
use App\Entity\TransactionCategory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Serializer\SerializerInterface;
use App\Service\DocumentUploadService;
use App\Service\UploadRequestDTO;

class O2TransactionsController extends AbstractController
{
    #[Route('/api/o2transactions', name: 'api_o2transactions_list', methods: ['GET'])]
    public function list(EntityManagerInterface $em): Response
    {
        $qb = $em->createQueryBuilder()
            ->select('t', 'c')
            ->from(O2Transactions::class, 't')
            ->leftJoin('t.category', 'c')
            ->orderBy('t.date', 'DESC')
            ->addOrderBy('t.id', 'DESC');

        $results = $qb->getQuery()->getResult();

        $docRepo = $em->getRepository(\App\Entity\UnitDocument::class);

        $member = [];
        foreach ($results as $row) {
            if ($row instanceof O2Transactions) {
                $t = $row;
                $c = $t->getCategory();
            } else {
                // When Doctrine returns array with [0 => t, 'c' => c]
                $t = $row[0] ?? null;
                $c = $row['c'] ?? null;
            }
            if (!$t instanceof O2Transactions) {
                continue;
            }

            // Derive latest document linked via o2_transaction_id
            $latestDoc = $docRepo->findOneBy(
                ['o2Transaction' => $t],
                ['uploadedAt' => 'DESC', 'id' => 'DESC']
            );
            $documentUrl = null;
            if ($latestDoc) {
                if (method_exists($latestDoc, 'getS3Url') && $latestDoc->getS3Url()) {
                    $documentUrl = $latestDoc->getS3Url();
                } elseif (method_exists($latestDoc, 'getDocumentUrl') && $latestDoc->getDocumentUrl()) {
                    $documentUrl = $latestDoc->getDocumentUrl();
                } elseif (method_exists($latestDoc, 'getFilepath') && $latestDoc->getFilepath()) {
                    $documentUrl = $latestDoc->getFilepath();
                }
            }
            $hasDoc = $documentUrl !== null && $documentUrl !== '';

            $member[] = [
                'id'               => $t->getId(),
                'transactionCode'  => $t->getTransactionCode(),
                'date'             => $t->getDate() ? $t->getDate()->format('Y-m-d') : null,
                'costCentre'       => $t->getCostCentre(),
                'city'             => $t->getCity(),
                'categoryId'       => ($c && method_exists($c, 'getId')) ? $c->getId() : null,
                'categoryName'     => ($c && method_exists($c, 'getName')) ? $c->getName() : null,
                'type'             => $t->getType(),
                'description'      => $t->getDescription(),
                'amount'           => $t->getAmount(),
                'comments'         => $t->getComments(),
                'documentUrl'      => $documentUrl,
                'hasDocument'      => $hasDoc,
                'private'          => method_exists($t, 'isPrivate') ? (bool) $t->isPrivate() : (method_exists($t, 'getPrivate') ? (bool) $t->getPrivate() : false),
                'createdBy'        => $t->getCreatedBy(),
                'updatedBy'        => $t->getUpdatedBy(),
                'updatedAt'        => $t->getUpdatedAt() ? $t->getUpdatedAt()->format('Y-m-d') : null,
            ];
        }

        return new JsonResponse(['member' => $member], Response::HTTP_OK);
    }

    #[Route('/api/o2transactions/{id}', name: 'api_o2transactions_show', methods: ['GET'])]
    public function show(int $id, EntityManagerInterface $em): Response
    {
        /** @var O2Transactions|null $tx */
        $tx = $em->getRepository(O2Transactions::class)->find($id);
        if (!$tx) {
            return new JsonResponse(['error' => 'Transaction not found'], Response::HTTP_NOT_FOUND);
        }

        $cat = $tx->getCategory();

        // Provide both the canonical fields and convenience fields for the form (paid/charged)
        $isGasto = $tx->getType() === 'Gasto';
        $isIngreso = $tx->getType() === 'Ingreso';
        $paid = $isGasto ? $tx->getAmount() : null;
        $charged = $isIngreso ? $tx->getAmount() : null;

        $docRepo = $em->getRepository(\App\Entity\UnitDocument::class);
        $latestDoc = $docRepo->findOneBy(
            ['o2Transaction' => $tx],
            ['uploadedAt' => 'DESC', 'id' => 'DESC']
        );
        $docUrl = null;
        if ($latestDoc) {
            if (method_exists($latestDoc, 'getS3Url') && $latestDoc->getS3Url()) {
                $docUrl = $latestDoc->getS3Url();
            } elseif (method_exists($latestDoc, 'getDocumentUrl') && $latestDoc->getDocumentUrl()) {
                $docUrl = $latestDoc->getDocumentUrl();
            } elseif (method_exists($latestDoc, 'getFilepath') && $latestDoc->getFilepath()) {
                $docUrl = $latestDoc->getFilepath();
            }
        }
        $hasDoc = $docUrl !== null && $docUrl !== '';

        return new JsonResponse([
            'id'               => $tx->getId(),
            'transactionCode'  => $tx->getTransactionCode(),
            'date'             => $tx->getDate() ? $tx->getDate()->format('Y-m-d') : null,
            'costCentre'       => $tx->getCostCentre(),
            'city'             => $tx->getCity(),
            'category'         => $cat ? ['id' => $cat->getId(), 'name' => method_exists($cat, 'getName') ? $cat->getName() : null] : null,
            'type'             => $tx->getType(),
            'amount'           => $tx->getAmount(),
            'description'      => $tx->getDescription(),
            'comments'         => $tx->getComments(),
            'documentUrl'      => $docUrl,
            'hasDocument'      => $hasDoc,
            'private'          => method_exists($tx, 'isPrivate') ? (bool) $tx->isPrivate() : (method_exists($tx, 'getPrivate') ? (bool) $tx->getPrivate() : false),
            'createdBy'        => $tx->getCreatedBy(),
            'updatedBy'        => $tx->getUpdatedBy(),
            'updatedAt'        => $tx->getUpdatedAt() ? $tx->getUpdatedAt()->format('Y-m-d') : null,

            // Convenience for the new form payload
            'paid'             => $paid,
            'charged'          => $charged,
        ], Response::HTTP_OK);
    }

    /**
     * Create a new O2 transaction
     * NOTE: We use a non-conflicting path to avoid overlapping ApiPlatform default POST route.
     */
    #[Route('/api/o2transactions', name: 'api_o2transactions_post', methods: ['POST'])]
    #[Route('/api/o2transactions/create', name: 'api_o2transactions_create', methods: ['POST'])]
    public function create(
        Request $request,
        EntityManagerInterface $em,
        SerializerInterface $serializer
    ): Response {
        $data = json_decode($request->getContent(), true) ?? [];

        // Optional: allocation/source metadata (used when creating from EmployeeCash allocation flow)
        $sourceType        = $data['sourceType']        ?? $data['source_type']        ?? null;
        $sourceId          = $data['sourceId']          ?? $data['source_id']          ?? null;
        $sourceAttachments = $data['sourceAttachments'] ?? $data['source_attachments'] ?? [];

        // --- Extract & validate required fields ---
        $costCentre  = $data['costCentre']  ?? $data['cost_centre']  ?? null;
        $dateStr     = $data['date']        ?? null; // YYYY-MM-DD
        $categoryRef = $data['category']    ?? $data['category_id'] ?? null; // IRI or id
        $type        = $data['type']        ?? null; // 'Ingreso' | 'Gasto'
        $amount      = $data['amount']      ?? null; // positive number (string/number)
        $city        = $data['city']        ?? null;

        // Require either costCentre OR city (we can infer costCentre from city)
        if ( (!$costCentre && !$city) || !$dateStr || !$categoryRef || !$type || $amount === null ) {
            return $this->bad("Missing required fields: (costCentre or city), date, category, type, amount");
        }

        // If client provided city but not costCentre, infer costCentre from city
        if (!$costCentre && $city) {
            $cityIn = (string) $city;
            if (preg_match('/tulum/i', $cityIn)) {
                $costCentre = 'Owners2_Tulum';
            } elseif (preg_match('/playa\\s*del\\s*carmen/i', $cityIn)) {
                $costCentre = 'Owners2_Playa';
            } else {
                $costCentre = 'Owners2';
            }
        }

        // Amount must be positive
        if (!is_numeric($amount) || (float)$amount <= 0) {
            return $this->bad("Amount must be a positive number");
        }

        // Pre-normalize common user formats to YYYY-MM-DD
        if (is_string($dateStr)) {
            $dateStr = trim($dateStr);
            // Convert DD-MM-YYYY or DD/MM/YYYY -> YYYY-MM-DD
            if (preg_match('/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/', $dateStr, $m)) {
                $dateStr = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
            } elseif (preg_match('/^(\d{4})[\/](\d{2})[\/](\d{2})$/', $dateStr, $m)) {
                // Convert YYYY/MM/DD -> YYYY-MM-DD
                $dateStr = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
            }
        }
        // Normalize date strictly to immutable date-only (Y-m-d), avoid TZ shifts
        try {
            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', (string) $dateStr, new \DateTimeZone('UTC'));
            if (!$date) {
                $tmp = new \DateTimeImmutable((string) $dateStr);
                $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $tmp->format('Y-m-d'), new \DateTimeZone('UTC'));
            }
        } catch (\Throwable $e) {
            return $this->bad("Invalid date format. Expected YYYY-MM-DD");
        }

        // Resolve category (accept IRI like /api/transaction_categories/5 or a plain id)
        $categoryId = null;
        if (is_string($categoryRef) && str_contains($categoryRef, '/')) {
            $categoryId = (int) substr(strrchr($categoryRef, '/'), 1);
        } else {
            $categoryId = (int) $categoryRef;
        }
        if ($categoryId <= 0) {
            return $this->bad("Invalid category reference");
        }

        /** @var TransactionCategory|null $category */
        $category = $em->getRepository(TransactionCategory::class)->find($categoryId);
        if (!$category) {
            return $this->bad("Category not found (id: $categoryId)");
        }

        // Enforce O2 applicability
        if (method_exists($category, 'isAllowO2') && !$category->isAllowO2()) {
            return $this->bad('Category not allowed for Owners2 transactions.');
        }

        // Validate direction against category.type ('Ingreso' | 'Gasto' | 'Both')
        $catType = method_exists($category, 'getType') ? $category->getType() : null;
        $allowed = match ($catType) {
            'Ingreso' => ['Ingreso'],
            'Gasto'   => ['Gasto'],
            'Both', null => ['Ingreso','Gasto'],
            default   => ['Ingreso','Gasto'],
        };
        if (!in_array($type, $allowed, true)) {
            return $this->bad("This category only allows: " . implode(' or ', $allowed));
        }

        // Build entity
        $tx = new O2Transactions();
        $tx->setCostCentre($costCentre);
        $tx->setDate($date);
        $tx->setCategory($category);
        $tx->setType($type);
        $tx->setDescription($data['description'] ?? null);
        $tx->setAmount((string) number_format((float)$amount, 2, '.', ''));
        $tx->setComments($data['comments'] ?? null);
        $tx->setCreatedBy($data['createdBy'] ?? ($data['created_by'] ?? null));
        $tx->setUpdatedBy($data['updatedBy'] ?? ($data['updated_by'] ?? null));

        // Optional: private flag (accepts boolean, 0/1, 'true'/'false', '1'/'0')
        $privRaw = $data['private'] ?? ($data['isPrivate'] ?? ($data['privateFlag'] ?? null));
        if ($privRaw !== null) {
            $priv = false;
            if (is_bool($privRaw)) {
                $priv = $privRaw;
            } elseif (is_numeric($privRaw)) {
                $priv = ((int)$privRaw) === 1;
            } elseif (is_string($privRaw)) {
                $v = strtolower(trim($privRaw));
                $priv = in_array($v, ['1','true','on','yes'], true);
            }
            if (method_exists($tx, 'setPrivate')) {
                $tx->setPrivate($priv);
            }
        }

        // Generate unique transaction code like O2ABC123
        $tx->setTransactionCode($this->generateUniqueCode($em));

        // Re-assert the chosen business date right before persist to prevent accidental overrides
        $tx->setDate($date);

        $em->persist($tx);
        $em->flush();

        // If called from an allocation flow, try to CLONE existing documents (by documentId) to this O2 transaction
        // so that deleting the O2 transaction does not affect the original attachment (e.g., EmployeeCash source).
        if (is_array($sourceAttachments) && !empty($sourceAttachments)) {
            $docRepo = $em->getRepository(\App\Entity\UnitDocument::class);
            foreach ($sourceAttachments as $att) {
                if (!is_array($att)) {
                    continue;
                }
                $docId = isset($att['documentId']) ? (int) $att['documentId'] : 0;
                if ($docId <= 0) {
                    continue;
                }
                /** @var \App\Entity\UnitDocument|null $srcDoc */
                $srcDoc = $docRepo->find($docId);
                if (!$srcDoc) {
                    continue;
                }

                // Create a new UnitDocument row that reuses the same underlying file/URL,
                // but is independently related to this O2 transaction.
                $clone = new \App\Entity\UnitDocument();

                // Copy file/location fields where supported
                if (method_exists($srcDoc, 'getS3Url') && $srcDoc->getS3Url()) {
                    if (method_exists($clone, 'setS3Url')) {
                        $clone->setS3Url($srcDoc->getS3Url());
                    }
                } elseif (method_exists($srcDoc, 'getDocumentUrl') && $srcDoc->getDocumentUrl()) {
                    // Some implementations may store a generic document URL instead
                    if (method_exists($clone, 'setS3Url')) {
                        $clone->setS3Url($srcDoc->getDocumentUrl());
                    } elseif (method_exists($clone, 'setDocumentUrl')) {
                        $clone->setDocumentUrl($srcDoc->getDocumentUrl());
                    }
                } elseif (method_exists($srcDoc, 'getFilepath') && $srcDoc->getFilepath()) {
                    if (method_exists($clone, 'setFilepath')) {
                        $clone->setFilepath($srcDoc->getFilepath());
                    }
                }

                // Copy filename if available
                if (method_exists($srcDoc, 'getFilename') && $srcDoc->getFilename() && method_exists($clone, 'setFilename')) {
                    $clone->setFilename($srcDoc->getFilename());
                }

                // Copy optional metadata if the entity supports it
                if (method_exists($srcDoc, 'getCategory') && method_exists($clone, 'setCategory')) {
                    $clone->setCategory($srcDoc->getCategory());
                }
                if (method_exists($srcDoc, 'getDate') && method_exists($clone, 'setDate')) {
                    $clone->setDate($srcDoc->getDate());
                }
                if (method_exists($srcDoc, 'getTxType') && method_exists($clone, 'setTxType')) {
                    $clone->setTxType($srcDoc->getTxType());
                }

                // Relate the cloned document to this O2 transaction
                if (method_exists($clone, 'setO2Transaction')) {
                    $clone->setO2Transaction($tx);
                } elseif (method_exists($clone, 'setTransactionO2')) {
                    $clone->setTransactionO2($tx);
                } elseif (method_exists($clone, 'setRelatedTransaction') && (new \ReflectionMethod($clone, 'setRelatedTransaction'))->getNumberOfParameters() === 1) {
                    $clone->setRelatedTransaction($tx);
                }

                $em->persist($clone);
            }
            $em->flush();
        }

        // Reload from DB to confirm what actually got persisted
        $em->refresh($tx);
        $persistedDate = $tx->getDate() ? $tx->getDate()->format('Y-m-d') : null;

        // Determine actual documentUrl only if a real UnitDocument exists linked to this O2 transaction
        $docRepo = $em->getRepository(\App\Entity\UnitDocument::class);
        $latestDoc = $docRepo->findOneBy(
            ['o2Transaction' => $tx],
            ['uploadedAt' => 'DESC', 'id' => 'DESC']
        );
        $docUrl = null;
        if ($latestDoc) {
            if (method_exists($latestDoc, 'getS3Url') && $latestDoc->getS3Url()) {
                $docUrl = $latestDoc->getS3Url();
            } elseif (method_exists($latestDoc, 'getDocumentUrl') && $latestDoc->getDocumentUrl()) {
                $docUrl = $latestDoc->getDocumentUrl();
            } elseif (method_exists($latestDoc, 'getFilepath') && $latestDoc->getFilepath()) {
                $docUrl = $latestDoc->getFilepath();
            }
        }

        // Build response explicitly (avoid computed getters that may infer URLs without real files)
        $cat = $tx->getCategory();
        $response = [
            'id'              => $tx->getId(),
            'costCentre'      => $tx->getCostCentre(),
            'city'            => $tx->getCity(),
            'transactionCode' => $tx->getTransactionCode(),
            'date'            => $persistedDate,
            'category'        => $cat ? [
                'id'        => $cat->getId(),
                'name'      => method_exists($cat, 'getName') ? $cat->getName() : null,
                'type'      => method_exists($cat, 'getType') ? $cat->getType() : null,
                'allowUnit' => method_exists($cat, 'isAllowUnit') ? $cat->isAllowUnit() : false,
                'allowHk'   => method_exists($cat, 'isAllowHk') ? $cat->isAllowHk() : false,
                'allowO2'   => method_exists($cat, 'isAllowO2') ? $cat->isAllowO2() : false,
            ] : null,
            'type'           => $tx->getType(),
            'description'    => $tx->getDescription(),
            'amount'         => $tx->getAmount(),
            'comments'       => $tx->getComments(),
            'private'        => method_exists($tx, 'isPrivate') ? (bool) $tx->isPrivate() : (method_exists($tx, 'getPrivate') ? (bool) $tx->getPrivate() : false),
            'createdBy'      => $tx->getCreatedBy(),
            'updatedBy'      => $tx->getUpdatedBy(),
            'createdAt'      => $tx->getCreatedAt() ? $tx->getCreatedAt()->format('Y-m-d') : null,
            'updatedAt'      => $tx->getUpdatedAt() ? $tx->getUpdatedAt()->format('Y-m-d') : null,
            'documentUrl'    => $docUrl,
        ];

        return new JsonResponse($response, Response::HTTP_CREATED);
    }

    #[Route('/api/o2transactions/{id}', name: 'api_o2transactions_put', methods: ['PUT','PATCH'])]
    public function update(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        SerializerInterface $serializer
    ): Response {
        /** @var O2Transactions|null $tx */
        $tx = $em->getRepository(O2Transactions::class)->find($id);
        if (!$tx) {
            return new JsonResponse(['error' => 'Transaction not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        // Optional: date
        if (isset($data['date']) && $data['date'] !== null && $data['date'] !== '') {
            try {
                $dateStr = (string) $data['date'];
                $dateStr = trim($dateStr);
                // Convert DD-MM-YYYY or DD/MM/YYYY -> YYYY-MM-DD
                if (preg_match('/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/', $dateStr, $m)) {
                    $dateStr = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
                } elseif (preg_match('/^(\d{4})[\/](\d{2})[\/](\d{2})$/', $dateStr, $m)) {
                    // Convert YYYY/MM/DD -> YYYY-MM-DD
                    $dateStr = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
                }
                $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $dateStr, new \DateTimeZone('UTC'));
                if (!$date) {
                    $tmp = new \DateTimeImmutable($dateStr);
                    $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $tmp->format('Y-m-d'), new \DateTimeZone('UTC'));
                }
                $tx->setDate($date);
            } catch (\Throwable $e) {
                return $this->bad('Invalid date format. Expected YYYY-MM-DD');
            }
        }

        // Optional: costCentre
        if (array_key_exists('costCentre', $data) || array_key_exists('cost_centre', $data)) {
            $tx->setCostCentre($data['costCentre'] ?? $data['cost_centre'] ?? null);
        }

        // If costCentre not provided but city is, infer costCentre (entity will derive city)
        if (
            !array_key_exists('costCentre', $data) && !array_key_exists('cost_centre', $data)
            && array_key_exists('city', $data) && $data['city'] !== null && $data['city'] !== ''
        ) {
            $cityIn = (string) $data['city'];
            $infer = null;
            if (preg_match('/tulum/i', $cityIn)) {
                $infer = 'Owners2_Tulum';
            } elseif (preg_match('/playa\\s*del\\s*carmen/i', $cityIn)) {
                $infer = 'Owners2_Playa';
            } else {
                $infer = 'Owners2';
            }
            if ($infer && $tx->getCostCentre() !== $infer) {
                $tx->setCostCentre($infer);
            }
        }

        // Optional: category (accept IRI or id)
        if (isset($data['category']) || isset($data['category_id']) || isset($data['categoryId'])) {
            $categoryRef = $data['category'] ?? ($data['category_id'] ?? ($data['categoryId'] ?? null));
            if ($categoryRef !== null && $categoryRef !== '') {
                if (is_string($categoryRef) && str_contains($categoryRef, '/')) {
                    $categoryId = (int) substr(strrchr($categoryRef, '/'), 1);
                } else {
                    $categoryId = (int) $categoryRef;
                }
                if ($categoryId > 0) {
                    /** @var TransactionCategory|null $category */
                    $category = $em->getRepository(TransactionCategory::class)->find($categoryId);
                    if (!$category) {
                        return $this->bad("Category not found (id: $categoryId)");
                    }
                    // Enforce O2 applicability
                    if (method_exists($category, 'isAllowO2') && !$category->isAllowO2()) {
                        return $this->bad('Category not allowed for Owners2 transactions.');
                    }
                    $tx->setCategory($category);
                }
            }
        }

        // Optional: description
        if (array_key_exists('description', $data)) {
            $tx->setDescription($data['description']);
        }

        // Optional: comments
        if (array_key_exists('comments', $data)) {
            $tx->setComments($data['comments']);
        }

        // Optional: updatedBy
        if (isset($data['updatedBy']) || isset($data['updated_by'])) {
            $tx->setUpdatedBy($data['updatedBy'] ?? $data['updated_by']);
        }


        // Amount / Type handling — support either (paid/charged) or (amount + type)
        $paid    = isset($data['paid'])    && $data['paid']    !== '' ? (float)$data['paid']    : null;
        $charged = isset($data['charged']) && $data['charged'] !== '' ? (float)$data['charged'] : null;

        if ($paid !== null && $paid > 0 && $charged !== null && $charged > 0) {
            return $this->bad('Provide either "paid" (Gasto) or "charged" (Ingreso), not both.');
        }

        if ($paid !== null && $paid > 0) {
            $tx->setType('Gasto');
            $tx->setAmount(number_format($paid, 2, '.', ''));
        } elseif ($charged !== null && $charged > 0) {
            $tx->setType('Ingreso');
            $tx->setAmount(number_format($charged, 2, '.', ''));
        } else {
            // Fallback to canonical `amount` + `type`
            if (isset($data['amount'])) {
                if (!is_numeric($data['amount']) || (float)$data['amount'] <= 0) {
                    return $this->bad('Amount must be a positive number');
                }
                $tx->setAmount(number_format((float)$data['amount'], 2, '.', ''));
            }
            if (isset($data['type'])) {
                $type = (string)$data['type'];
                if (!in_array($type, ['Ingreso','Gasto'], true)) {
                    return $this->bad('Type must be either "Ingreso" or "Gasto".');
                }
                $tx->setType($type);
            }
        }

        // Optional: private flag update
        if (array_key_exists('private', $data) || array_key_exists('isPrivate', $data) || array_key_exists('privateFlag', $data)) {
            $privRaw = $data['private'] ?? ($data['isPrivate'] ?? ($data['privateFlag'] ?? null));
            $priv = false;
            if (is_bool($privRaw)) {
                $priv = $privRaw;
            } elseif (is_numeric($privRaw)) {
                $priv = ((int)$privRaw) === 1;
            } elseif (is_string($privRaw)) {
                $v = strtolower(trim($privRaw));
                $priv = in_array($v, ['1','true','on','yes'], true);
            }
            if (method_exists($tx, 'setPrivate')) {
                $tx->setPrivate($priv);
            }
        }

        $em->flush();

        // Return the normalized entity
        $json = $serializer->serialize($tx, 'json', ['groups' => ['o2tx:read']]);
        return new JsonResponse($json, Response::HTTP_OK, [], true);
    }

    #[Route('/api/o2transactions/{id}', name: 'api_o2transactions_delete', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): Response
    {
        /** @var O2Transactions|null $tx */
        $tx = $em->getRepository(O2Transactions::class)->find($id);
        if (!$tx) {
            return new JsonResponse(['error' => 'Transaction not found'], Response::HTTP_NOT_FOUND);
        }

        try {
            $em->remove($tx);
            $em->flush();
        } catch (\Throwable $e) {
            // If there are FK constraints preventing deletion, surface a clear message.
            return new JsonResponse(
                ['error' => 'Unable to delete this transaction. It may have related records (e.g., documents).', 'details' => $e->getMessage()],
                Response::HTTP_CONFLICT
            );
        }

        return new JsonResponse(null, Response::HTTP_NO_CONTENT);
    }

    private function generateUniqueCode(EntityManagerInterface $em, int $len = 6): string
    {
        $repo = $em->getRepository(O2Transactions::class);
        do {
            $code = 'O2' . $this->randomAlnum($len);
            $exists = $repo->findOneBy(['transactionCode' => $code]) !== null;
        } while ($exists);
        return $code;
    }

    private function randomAlnum(int $len): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
        $out = '';
        for ($i = 0; $i < $len; $i++) {
            $out .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $out;
    }

    private function bad(string $message, int $code = Response::HTTP_BAD_REQUEST): JsonResponse
    {
        return new JsonResponse(['error' => $message], $code);
    }
    #[Route('/api/o2transactions/{id}/documents/upload', name: 'api_o2transactions_document_upload', methods: ['POST'])]
    public function uploadDocument(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        DocumentUploadService $uploader
    ): Response {
        // 1) Locate the O2 transaction
        /** @var O2Transactions|null $tx */
        $tx = $em->getRepository(O2Transactions::class)->find($id);
        if (!$tx) {
            return new JsonResponse(['error' => 'Transaction not found'], Response::HTTP_NOT_FOUND);
        }

        // 2) Validate file
        $file = $request->files->get('file');
        if (!$file) {
            return new JsonResponse(['error' => 'Missing file'], Response::HTTP_BAD_REQUEST);
        }

        // Optional extra metadata (string-based; no entity lookup)
        $categoryStr = $request->request->get('category'); // e.g., 'Invoice', 'Receipt'
        $txType      = $request->request->get('tx_type');  // passthrough if needed
        $dateStr     = $request->request->get('date');
        $docDate     = null;
        if ($dateStr) {
            try {
                $base = \DateTimeImmutable::createFromFormat('Y-m-d', (string) $dateStr) ?: new \DateTimeImmutable((string) $dateStr);
                $docDate = \DateTimeImmutable::createFromFormat('Y-m-d', $base->format('Y-m-d'));
            } catch (\Throwable $e) {
                // Ignore invalid date, proceed without setting date
            }
        }

        // Required by upload service: unitId (treat 0/NULL as N/A for O2)
        $unitIdRaw = $request->request->get('unitId', $request->request->get('unit_id'));
        $unitId = 0;
        if ($unitIdRaw !== null && $unitIdRaw !== '') {
            $unitId = (int) $unitIdRaw;
        }

        // 3) Build UploadRequestDTO expected by the service
        $uploaded = null;
        try {
            $req = new UploadRequestDTO();
            // Mark as O2 upload so the service does not require unitId
            if (method_exists($req, 'setTransactionType')) {
                $req->setTransactionType('o2');
            } elseif (property_exists($req, 'transactionType')) {
                $req->transactionType = 'o2';
            }
            // Provide the O2 transaction id
            if (method_exists($tx, 'getId')) {
                $o2Id = $tx->getId();
                if (method_exists($req, 'setTransactionId')) {
                    $req->setTransactionId($o2Id);
                } elseif (property_exists($req, 'transactionId')) {
                    $req->transactionId = $o2Id;
                }
                // Also pass as related id (some implementations use this)
                if (method_exists($req, 'setRelatedO2Id')) {
                    $req->setRelatedO2Id($o2Id);
                } elseif (property_exists($req, 'relatedO2Id')) {
                    $req->relatedO2Id = $o2Id;
                }
            }
            // Pass cost centre for pathing/naming if the service uses it
            if (method_exists($tx, 'getCostCentre')) {
                $centre = $tx->getCostCentre();
                if (method_exists($req, 'setCostCentre')) {
                    $req->setCostCentre($centre);
                } elseif (property_exists($req, 'costCentre')) {
                    $req->costCentre = $centre;
                }
            }
            // Optional: pass category id (if the service organizes by category)
            if (method_exists($tx, 'getCategory') && $tx->getCategory() && method_exists($tx->getCategory(), 'getId')) {
                $catId = $tx->getCategory()->getId();
                if (method_exists($req, 'setCategoryId')) {
                    $req->setCategoryId($catId);
                } elseif (property_exists($req, 'categoryId')) {
                    $req->categoryId = $catId;
                }
            }
            // Provide date for filename/path formatting if service supports it
            if (isset($docDate) && $docDate) {
                if (method_exists($req, 'setDateForName')) {
                    $req->setDateForName($docDate);
                } elseif (property_exists($req, 'dateForName')) {
                    $req->dateForName = $docDate;
                }
            }
            // Unit id (service requires it)
            if (method_exists($req, 'setUnitId')) {
                $req->setUnitId($unitId);
            } elseif (property_exists($req, 'unitId')) {
                $req->unitId = $unitId;
            } elseif (property_exists($req, 'unit_id')) {
                $req->unit_id = $unitId;
            }
            // File
            if (method_exists($req, 'setFile')) {
                $req->setFile($file);
            } elseif (property_exists($req, 'file')) {
                $req->file = $file;
            }
            // Storage hints
            if (method_exists($req, 'setContext')) { $req->setContext('o2transactions'); }
            elseif (property_exists($req, 'context')) { $req->context = 'o2transactions'; }
            if (method_exists($req, 'setPrefix')) { $req->setPrefix('o2transactions'); }
            elseif (property_exists($req, 'prefix')) { $req->prefix = 'o2transactions'; }
            if (method_exists($req, 'setEntity')) { $req->setEntity('o2'); }
            elseif (property_exists($req, 'entity')) { $req->entity = 'o2'; }
            if (method_exists($req, 'setOriginalName') && method_exists($file, 'getClientOriginalName')) {
                $req->setOriginalName($file->getClientOriginalName());
            } elseif (property_exists($req, 'originalName') && method_exists($file, 'getClientOriginalName')) {
                $req->originalName = $file->getClientOriginalName();
            }
            // Optional metadata
            if ($categoryStr) {
                if (method_exists($req, 'setCategory')) { $req->setCategory($categoryStr); }
                elseif (property_exists($req, 'category')) { $req->category = $categoryStr; }
            }
            if ($docDate) {
                if (method_exists($req, 'setDate')) { $req->setDate($docDate); }
                elseif (property_exists($req, 'date')) { $req->date = $docDate; }
            }
            if ($txType) {
                if (method_exists($req, 'setTxType')) { $req->setTxType($txType); }
                elseif (property_exists($req, 'txType')) { $req->txType = $txType; }
            }
            // Relationship hint (so the service can tag/folder by O2 id if supported)
            if (method_exists($req, 'setRelatedO2Id')) { $req->setRelatedO2Id($tx->getId()); }
            elseif (property_exists($req, 'relatedO2Id')) { $req->relatedO2Id = $tx->getId(); }

            // Perform upload via service (returns UnitDocument or URL)
            $uploaded = $uploader->upload($req);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Upload failed', 'details' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        /** @var \App\Entity\UnitDocument|null $doc */
        $doc = null;
        if ($uploaded instanceof \App\Entity\UnitDocument) {
            $doc = $uploaded;
        } else {
            // Service returned a URL (string). Create a UnitDocument row manually.
            $s3Url = is_string($uploaded) ? $uploaded : (method_exists($uploaded, '__toString') ? (string) $uploaded : null);
            if (!$s3Url) {
                return new JsonResponse(['error' => 'Unexpected upload response'], Response::HTTP_BAD_REQUEST);
            }
            $doc = new \App\Entity\UnitDocument();
            if (method_exists($doc, 'setS3Url')) {
                $doc->setS3Url($s3Url);
            }
            if (method_exists($doc, 'setFilename') && method_exists($file, 'getClientOriginalName')) {
                $doc->setFilename($file->getClientOriginalName());
            }
            $em->persist($doc);
        }

        // 4) Attach metadata and RELATE to O2 transaction when supported by the entity
        if ($categoryStr && method_exists($doc, 'setCategory')) {
            $doc->setCategory($categoryStr);
        }
        if ($docDate && method_exists($doc, 'setDate')) {
            $doc->setDate($docDate);
        }
        if ($txType && method_exists($doc, 'setTxType')) {
            $doc->setTxType($txType);
        }
        // Attempt to set a direct relation if the UnitDocument entity supports it
        if (method_exists($doc, 'setO2Transaction')) {
            $doc->setO2Transaction($tx);
        } elseif (method_exists($doc, 'setTransactionO2')) {
            $doc->setTransactionO2($tx);
        } elseif (method_exists($doc, 'setRelatedTransaction') && (new \ReflectionMethod($doc, 'setRelatedTransaction'))->getNumberOfParameters() === 1) {
            // Generic relation setter, best-effort
            $doc->setRelatedTransaction($tx);
        }

        $em->flush();

        // 5) Expose a document URL for the table (if the entity supports it) or pull from s3Url
        $docUrl = null;
        if (method_exists($doc, 'getPublicUrl')) {
            $docUrl = $doc->getPublicUrl();
        } elseif (method_exists($doc, 'getS3Url')) {
            $docUrl = $doc->getS3Url();
        }


        return new JsonResponse([
            'ok'         => true,
            'documentId' => method_exists($doc, 'getId') ? $doc->getId() : null,
            'documentUrl'=> $docUrl,
        ], Response::HTTP_CREATED);
    }

    #[Route('/api/o2transactions/document/{id}', name: 'api_o2transactions_document_delete', methods: ['DELETE'])]
    public function deleteDocument(int $id, EntityManagerInterface $em, DocumentUploadService $uploader): Response
    {
        $doc = $em->getRepository(\App\Entity\UnitDocument::class)->find($id);
        if (!$doc) {
            return new JsonResponse(['error' => 'Document not found'], Response::HTTP_NOT_FOUND);
        }

        // Use unified service method: deletes S3 (best-effort) + DB row
        $uploader->delete($doc);

        return new JsonResponse(['message' => 'Document deleted successfully'], Response::HTTP_OK);
    }
}