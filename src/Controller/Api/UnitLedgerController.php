<?php

namespace App\Controller\Api;

use App\Entity\UnitBalanceLedger;
use App\Entity\Unit;
use App\Service\Document\DocumentUploadService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api')]
class UnitLedgerController extends AbstractController
{
    #[Route('/unit_balance_ledgers/create', name: 'api_ubl_create', methods: ['POST'])]
    public function create(
        Request $request,
        EntityManagerInterface $em,
        DocumentUploadService $uploader
    ): JsonResponse {
        // Helper to read from either JSON or form-data
        $data = [];
        if (\in_array($request->getContentTypeFormat(), ['json', 'application/json'], true)) {
            $json = json_decode($request->getContent(), true);
            if (\is_array($json)) { $data = $json; }
        }
        // merge form-data (request->request) over JSON to allow multipart
        foreach ($request->request->all() as $k => $v) { $data[$k] = $v; }

        // also merge query params (lower precedence than form-data)
        foreach ($request->query->all() as $k => $v) {
            if (!array_key_exists($k, $data)) {
                $data[$k] = $v;
            }
        }

        $unitId     = isset($data['unitId']) ? (int) $data['unitId'] : 0;
        $entryTypeIn = isset($data['entryType']) ? (string) $data['entryType'] : '';
        $amountIn   = isset($data['amount']) ? (float) $data['amount'] : null;

        // yearMonth: accept yearMonth or ym from any source; default to today (Y-m) if missing/invalid
        $yearMonthRaw = null;
        if (isset($data['yearMonth']) && is_string($data['yearMonth'])) {
            $yearMonthRaw = $data['yearMonth'];
        } elseif (isset($data['ym']) && is_string($data['ym'])) {
            $yearMonthRaw = $data['ym'];
        }
        if (!is_string($yearMonthRaw) || !preg_match('/^\d{4}-\d{2}$/', $yearMonthRaw)) {
            $yearMonthRaw = (new \DateTimeImmutable('today'))->format('Y-m');
        }
        $yearMonth = (string) $yearMonthRaw;

        if ($unitId <= 0) {
            return $this->json(['error' => 'unitId is required'], 400);
        }
        if ($amountIn === null || !is_numeric($amountIn)) {
            return $this->json(['error' => 'amount is required'], 400);
        }

        // Load Unit
        /** @var Unit|null $unit */
        $unit = $em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return $this->json(['error' => 'Unit not found'], 404);
        }

        // Normalize entryType (accept labels or enum-like values) — keep legacy aliases for a few weeks
        $map = [
            // Month result posting
            'MONTH_REPORT'               => 'MONTH_REPORT',
            'Month Report'               => 'MONTH_REPORT',

            // Legacy aliases (treat as FULL report payments)
            'O2_PAYMENT'                 => 'O2_REPORT_PAYMENT',
            'O2 Payment'                 => 'O2_REPORT_PAYMENT',
            'CLIENT_PAYMENT'             => 'CLIENT_REPORT_PAYMENT',
            'Client Payment'             => 'CLIENT_REPORT_PAYMENT',

            // Explicit FULL report payments
            'O2_REPORT_PAYMENT'          => 'O2_REPORT_PAYMENT',
            'O2 Report Payment'          => 'O2_REPORT_PAYMENT',
            'CLIENT_REPORT_PAYMENT'      => 'CLIENT_REPORT_PAYMENT',
            'Client Report Payment'      => 'CLIENT_REPORT_PAYMENT',

            // Explicit PARTIAL payments
            'O2_PARTIAL_PAYMENT'         => 'O2_PARTIAL_PAYMENT',
            'O2 Partial Payment'         => 'O2_PARTIAL_PAYMENT',
            'CLIENT_PARTIAL_PAYMENT'     => 'CLIENT_PARTIAL_PAYMENT',
            'Client Partial Payment'     => 'CLIENT_PARTIAL_PAYMENT',
        ];
        $entryType = $map[$entryTypeIn] ?? $entryTypeIn;
        if (!in_array($entryType, [
            'MONTH_REPORT',
            'O2_REPORT_PAYMENT', 'CLIENT_REPORT_PAYMENT',
            'O2_PARTIAL_PAYMENT', 'CLIENT_PARTIAL_PAYMENT',
        ], true)) {
            return $this->json(['error' => 'Invalid entryType'], 400);
        }

        // Persist human-readable entry_type to DB while keeping code for API semantics
        $entryTypeLabelMap = [
            'MONTH_REPORT'          => 'Month Report',
            'O2_REPORT_PAYMENT'     => 'O2 Report Payment',
            'CLIENT_REPORT_PAYMENT' => 'Client Report Payment',
            'O2_PARTIAL_PAYMENT'    => 'O2 Partial Payment',
            'CLIENT_PARTIAL_PAYMENT'=> 'Client Partial Payment',
        ];
        $entryTypeLabel = $entryTypeLabelMap[$entryType] ?? $entryType;

        // Sign normalization: O2 negative, Client positive
        $amount = round((float)$amountIn, 2);
        if (in_array($entryType, ['O2_REPORT_PAYMENT', 'O2_PARTIAL_PAYMENT'], true)) {
            $amount = -abs($amount);
        } elseif (in_array($entryType, ['CLIENT_REPORT_PAYMENT', 'CLIENT_PARTIAL_PAYMENT'], true)) {
            $amount = abs($amount);
        }

        // Compute balance_after = latest balanceAfter for this unit + amount
        $latest = $em->getRepository(UnitBalanceLedger::class)->createQueryBuilder('l')
            ->andWhere('l.unit = :unit')
            ->setParameter('unit', $unit)
            ->orderBy('l.id', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
        $prevBalance = ($latest && method_exists($latest, 'getBalanceAfter')) ? (float) $latest->getBalanceAfter() : 0.0;
        $balanceAfter = round($prevBalance + $amount, 2);

        // payment_method (null if Month Report)
        $pm = isset($data['paymentMethod']) ? (string) $data['paymentMethod'] : null;
        if ($entryType === 'MONTH_REPORT') {
            $pm = null;
        } else {
            if ($pm !== null && $pm !== '') {
                // normalize capitalization (e.g., Cash, Transfer)
                $pm = ucfirst(strtolower($pm));
            } else {
                $pm = null; // optional
            }
        }

        $reference = isset($data['reference']) ? (string) $data['reference'] : null;
        $note      = isset($data['note']) ? (string) $data['note'] : null;

        // Auto-fill reference for Month Report and Full Report Payments when not provided
        $yyMM = null;
        if (is_string($yearMonth) && preg_match('/^(\d{4})-(\d{2})$/', $yearMonth, $m)) {
            // Build YYMM from YYYY-MM
            $yy = substr($m[1], -2);
            $mm = $m[2];
            $yyMM = $yy . $mm; // e.g., 2025-07 => 2507
        }
        if (($reference === null || $reference === '') && $yyMM !== null) {
            if ($entryType === 'MONTH_REPORT') {
                $reference = 'Client Report ' . $yyMM; // keep prior convention
            } elseif (in_array($entryType, ['O2_REPORT_PAYMENT', 'CLIENT_REPORT_PAYMENT'], true)) {
                $reference = 'Pago Reporte ' . $yyMM; // keep prior convention
            }
            // For partial payments we intentionally do not auto-fill unless user provides it
        }

        // optional explicit date from payload (YYYY-MM-DD) — accept multiple aliases from various forms
        $explicitDate = null;
        $dateKeys = ['date', 'txnDate', 'txt_date', 'txtDate'];
        foreach ($dateKeys as $dk) {
            if (isset($data[$dk]) && is_string($data[$dk]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $data[$dk])) {
                try {
                    $explicitDate = new \DateTimeImmutable($data[$dk]);
                    break;
                } catch (\Throwable $e) {
                    $explicitDate = null;
                }
            }
        }

        // If client provided a specific date, align yearMonth to that date's YYYY-MM so filenames/refs match the txn period
        if ($explicitDate instanceof \DateTimeImmutable) {
            $yearMonth = $explicitDate->format('Y-m');
        }

        // created_at & txn_date
        $now = new \DateTimeImmutable('now');
        $createdAt = $now;
        if ($entryType === 'MONTH_REPORT') {
            // If caller sent a specific date, use the first day of that month; else first day of yearMonth
            if ($explicitDate instanceof \DateTimeImmutable) {
                $ymStr = $explicitDate->format('Y-m') . '-01';
                $txnDate = \DateTimeImmutable::createFromFormat('Y-m-d', $ymStr) ?: $now;
            } else {
                $txnDate = \DateTimeImmutable::createFromFormat('Y-m-d', $yearMonth . '-01') ?: $now;
            }
        } else {
            // For payments, use explicit date if provided, otherwise now
            $txnDate = $explicitDate instanceof \DateTimeImmutable ? $explicitDate : $now;
        }

        // Build entity
        $ledger = new UnitBalanceLedger();
        if (method_exists($ledger, 'setUnit')) $ledger->setUnit($unit);
        if (method_exists($ledger, 'setYearMonth')) $ledger->setYearMonth($yearMonth);
        if (method_exists($ledger, 'setEntryType')) $ledger->setEntryType($entryTypeLabel);
        if (method_exists($ledger, 'setAmount')) $ledger->setAmount($amount);
        if (method_exists($ledger, 'setBalanceAfter')) $ledger->setBalanceAfter($balanceAfter);
        if (method_exists($ledger, 'setPaymentMethod')) $ledger->setPaymentMethod($pm);
        if (method_exists($ledger, 'setReference')) $ledger->setReference($reference);
        if (method_exists($ledger, 'setNote')) $ledger->setNote($note);
        if (method_exists($ledger, 'setCreatedAt')) $ledger->setCreatedAt($createdAt);
        if (method_exists($ledger, 'setCreatedBy')) $ledger->setCreatedBy('system');
        if (method_exists($ledger, 'setTxnDate')) $ledger->setTxnDate($txnDate);
        if (method_exists($ledger, 'setDate')) $ledger->setDate($txnDate);

        $em->persist($ledger);
        $em->flush();

        // Recalculate running balances from oldest to newest so back-dated entries update subsequent balances
        try {
            $all = $em->getRepository(UnitBalanceLedger::class)->createQueryBuilder('l2')
                ->andWhere('l2.unit = :unit2')
                ->setParameter('unit2', $unit)
                ->orderBy('l2.txnDate', 'ASC')
                ->addOrderBy('l2.id', 'ASC')
                ->getQuery()
                ->getResult();

            $running = 0.0;
            foreach ($all as $row) {
                if (method_exists($row, 'getAmount') && method_exists($row, 'setBalanceAfter')) {
                    $amt = (float) $row->getAmount();
                    $running = round($running + $amt, 2);
                    $row->setBalanceAfter($running);
                }
            }
            $em->flush();

            // Reload current ledger to get its recalculated balanceAfter
            $ledger = $em->getRepository(UnitBalanceLedger::class)->find($ledger->getId());
            $balanceAfter = method_exists($ledger, 'getBalanceAfter') ? (float)$ledger->getBalanceAfter() : $balanceAfter;
        } catch (\Throwable $e) {
            // Non-fatal: keep original balanceAfter if recalculation fails
        }

        // --- Update owner_report_cycle for payments ---
        if (in_array($entryType, ['O2_REPORT_PAYMENT', 'CLIENT_REPORT_PAYMENT', 'O2_PARTIAL_PAYMENT', 'CLIENT_PARTIAL_PAYMENT'], true)) {
            try {
                $conn = $em->getConnection();
                $status = in_array($entryType, ['O2_REPORT_PAYMENT', 'CLIENT_REPORT_PAYMENT'], true) ? 'PAID' : 'PARTIAL';
                $conn->update(
                    'owner_report_cycle',
                    [
                        'payment_status' => $status,
                        'payment_at'     => $now->format('Y-m-d H:i:s'),
                    ],
                    [
                        'unit_id'    => $unitId,
                        'year_month' => $yearMonth,
                    ]
                );
            } catch (\Throwable $e) {
                // non-fatal; keep request successful even if cycle update fails
            }
        }

        $docOut = null;
        $uploadError = null;
        try {
            if ($entryType === 'MONTH_REPORT') {
                // Use REPORT category and let the service apply its own naming/description defaults
                $category    = isset($data['category']) ? (string)$data['category'] : 'REPORT';
                $description = isset($data['description']) && $data['description'] !== ''
                    ? (string)$data['description']
                    : null; // null => service decides (keeps current REPORT behavior)
            } else {
                // Payments (full or partial): set category/description to include trigger phrases for DocumentUploadService
                // Defaults based on payer and partial/full type
                $isO2      = in_array($entryType, ['O2_REPORT_PAYMENT', 'O2_PARTIAL_PAYMENT'], true);
                $isPartial = in_array($entryType, ['O2_PARTIAL_PAYMENT', 'CLIENT_PARTIAL_PAYMENT'], true);

                // Category defaults (human-readable, also used by upload service detection)
                if ($isPartial) {
                    $categoryDefault = $isO2 ? 'O2 Partial Payment' : 'Client Partial Payment';
                } else {
                    $categoryDefault = $isO2 ? 'O2 Report Payment' : 'Client Report Payment';
                }

                // Description defaults — include English trigger phrases so the upload service can classify reliably
                if ($isPartial) {
                    // bilingual hint: includes "Partial Payment" / "Pago parcial"
                    $descriptionDefault = 'Comprobante de pago parcial — Partial Payment';
                } else {
                    // bilingual hint: includes "Report Payment"
                    $descriptionDefault = 'Comprobante de pago — Report Payment';
                }

                $category    = isset($data['category']) && $data['category'] !== '' ? (string)$data['category'] : $categoryDefault;
                $description = isset($data['description']) && $data['description'] !== '' ? (string)$data['description'] : $descriptionDefault;
            }
            $dateForName = isset($data['dateForName']) ? (string)$data['dateForName'] : ($yearMonth . '-01');

            $date = null;
            if ($dateForName) {
                try {
                    $date = new \DateTimeImmutable($dateForName);
                } catch (\Throwable $e) {
                    // ignore invalid date
                }
            }

            $ledgerId = $ledger->getId();
            $unitIdVal = $unitId;

            $file = $request->files->get('file');
            if ($file instanceof UploadedFile) {
                $docOut = $uploader->uploadForLedger(
                    $ledgerId,
                    $unitIdVal,
                    $file,
                    $category,
                    $description,
                    $date,
                    $file->getMimeType(),
                    $file->getClientOriginalName(),
                    null
                );
            } else {
                if (isset($data['fileBase64']) && is_string($data['fileBase64']) && $data['fileBase64'] !== '') {
                    $fileBase64 = $data['fileBase64'];
                    $mime = 'application/octet-stream';
                    $base64Payload = $fileBase64;

                    if (preg_match('/^data:(.*?);base64,(.*)$/', $fileBase64, $matches)) {
                        $mime = $matches[1];
                        $base64Payload = $matches[2];
                    }

                    $bytes = @base64_decode($base64Payload, true);
                    if ($bytes !== false) {
                        $originalName = isset($data['fileName']) && is_string($data['fileName']) && $data['fileName'] !== '' ? $data['fileName'] : 'upload.bin';
                        $docOut = $uploader->uploadForLedger(
                            $ledgerId,
                            $unitIdVal,
                            null,
                            $category,
                            $description,
                            $date,
                            $mime,
                            $originalName,
                            $bytes
                        );
                    }
                }
            }
        } catch (\Throwable $e) {
            $uploadError = $e->getMessage();
        }

        $response = [
            'ok' => true,
            'ledgerId'     => $ledger->getId(),
            'unitId'       => $unitId,
            'yearMonth'    => $yearMonth,
            'entryType'     => $entryType,       // API returns code
            'entryTypeLabel'=> $entryTypeLabel,  // Human-readable label stored in DB
            'amount'       => $amount,
            'balanceAfter' => $balanceAfter,
            'paymentMethod'=> $pm,
            'reference'    => $reference,
            'note'         => $note,
            'txnDate'      => $txnDate->format('Y-m-d'),
            'createdAt'    => $createdAt->format('c'),
            'createdBy'    => 'system',
        ];

        if ($docOut !== null) {
            $response['document'] = [
                'id' => method_exists($docOut, 'getId') ? $docOut->getId() : null,
                'filename' => method_exists($docOut, 'getFilename') ? $docOut->getFilename() : null,
                'publicUrl' => method_exists($docOut, 'getPublicUrl') ? $docOut->getPublicUrl() : null,
                's3Url' => method_exists($docOut, 'getS3Url') ? $docOut->getS3Url() : null,
                'category' => $category,
                'description' => $description,
            ];
        }
        if ($uploadError !== null) {
            $response['uploadError'] = $uploadError;
        }

        return $this->json($response, 201);
    }

    #[Route('/unit_balance_ledgers/{id}/upload-proof', name: 'api_ubl_upload_proof', methods: ['POST'])]
    public function uploadProof(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        DocumentUploadService $uploader
    ): JsonResponse {
        /** @var UnitBalanceLedger|null $ledger */
        $ledger = $em->getRepository(UnitBalanceLedger::class)->find($id);
        if (!$ledger) {
            return $this->json(['error' => 'Ledger not found'], 404);
        }

        /** @var UploadedFile|null $file */
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $this->json(['error' => 'Missing file'], 400);
        }

        // Optional metadata — derive smart defaults from the parent ledger entry_type and yearMonth
        $rawCategory    = $request->request->get('category');
        $rawDescription = $request->request->get('description');
        $dateForName    = $request->request->get('dateForName'); // YYYY-MM-DD or null

        $entryTypeLabel = method_exists($ledger, 'getEntryType') ? (string) $ledger->getEntryType() : '';
        $yearMonthStr   = method_exists($ledger, 'getYearMonth') ? (string) $ledger->getYearMonth() : null;

        $isPartial       = stripos($entryTypeLabel, 'Partial Payment') !== false;
        $isReportPayment = stripos($entryTypeLabel, 'Report Payment') !== false;
        $isMonthReport   = stripos($entryTypeLabel, 'Month Report') !== false;
        $isO2            = stripos($entryTypeLabel, 'O2') !== false;
        $isClient        = stripos($entryTypeLabel, 'Client') !== false;

        // Category defaulting
        if ($rawCategory !== null && $rawCategory !== '') {
            $category = (string) $rawCategory;
        } else {
            if ($isPartial) {
                $category = $isO2 ? 'O2 Partial Payment' : 'Client Partial Payment';
            } elseif ($isReportPayment) {
                $category = $isO2 ? 'O2 Report Payment' : 'Client Report Payment';
            } elseif ($isMonthReport) {
                $category = 'Report';
            } else {
                $category = 'PAYMENT_PROOF';
            }
        }

        // Description defaulting (include English trigger phrases for the upload service)
        if ($rawDescription !== null && $rawDescription !== '') {
            $description = (string) $rawDescription;
        } else {
            if ($isPartial) {
                $description = 'Comprobante de pago parcial — Partial Payment';
            } elseif ($isReportPayment) {
                $description = 'Comprobante de pago — Report Payment';
            } elseif ($isMonthReport) {
                $description = 'Reporte mensual';
            } else {
                $description = 'Comprobante de pago';
            }
        }

        // If no dateForName provided, derive from the ledger's yearMonth (first day of that period)
        if ((!$dateForName || $dateForName === '') && is_string($yearMonthStr) && preg_match('/^\d{4}-\d{2}$/', $yearMonthStr)) {
            $dateForName = $yearMonthStr . '-01';
        }

        $date = null;
        if ($dateForName) {
            try {
                $date = new \DateTimeImmutable($dateForName);
            } catch (\Throwable $e) {
                // keep null if invalid
            }
        }

        // Build args for the wrapper (see DocumentUploadService::uploadForLedger signature)
        $ledgerId     = (int) $ledger->getId();
        $unitId       = (method_exists($ledger, 'getUnit') && $ledger->getUnit()) ? $ledger->getUnit()->getId() : null;
        $mime         = $file->getMimeType();
        $originalName = $file->getClientOriginalName();
        $bytes        = null; // using multipart file upload path

        $doc = $uploader->uploadForLedger(
            $ledgerId,
            $unitId,
            $file,
            $category,
            $description,
            $date,
            $mime,
            $originalName,
            $bytes
        );

        // Respond with minimal info the frontend needs to display/link the doc
        return $this->json([
            'documentId' => method_exists($doc, 'getId') ? $doc->getId() : null,
            'publicUrl'  => method_exists($doc, 'getPublicUrl') ? $doc->getPublicUrl() : null,
            's3Url'      => method_exists($doc, 'getS3Url') ? $doc->getS3Url() : null,
            'filename'   => method_exists($doc, 'getFilename') ? $doc->getFilename() : null,
            'category'   => $category,
        ], 201);
    }
}