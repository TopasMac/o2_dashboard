<?php

namespace App\Service\Document;

use App\Entity\Unit;
use App\Entity\UnitDocumentAttachment;
use App\Repository\UnitDocumentAttachmentRepository;
use App\Service\Document\AttachOptions;
use App\Entity\UnitDocument;
use App\Entity\UnitTransactions;
use App\Entity\HKTransactions;
use App\Entity\UnitBalanceLedger;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\String\Slugger\SluggerInterface;
use Aws\S3\S3Client;
use Aws\Exception\AwsException;
use Imagick;

/**
 * Centralized, reusable file-upload logic for both Unit and HK transactions.
 * Controllers should gather request data, build an UploadRequestDTO, and call ->upload().
 *
 * Design goals:
 *  - Single place for validation, filename generation and entity linking
 *  - Explicit transactionType ('unit'|'hk'|'ledger') instead of runtime guessing
 *  - Backwards-compatible with existing UnitDocument relations using method_exists()
 */
class DocumentUploadService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SluggerInterface $slugger,
        private readonly UnitDocumentAttachmentRepository $attachmentRepo
    ) {
    }

    /**
     * Handle the upload and persistence.
     *
     * @throws BadRequestHttpException on validation or linkage errors.
     */
    public function upload(UploadRequestDTO $req): UnitDocument
    {
        // --- 1) Validate required fields ---
        if (!$req->file instanceof UploadedFile && ($req->bytes === null || $req->bytes === '')) {
            throw new BadRequestHttpException('No file provided: expected multipart file or raw bytes.');
        }
        if (!in_array($req->transactionType, ['unit', 'hk', 'ledger', 'o2', 'task'], true)) {
            throw new BadRequestHttpException("Invalid transactionType '{$req->transactionType}'. Expected 'unit', 'hk', 'ledger', 'o2' or 'task'.");
        }
        $isHousekeepersPseudoUnit = ($req->transactionType === 'hk' && !$req->unitId);
        $canDeferUnitFromLedger  = ($req->transactionType === 'ledger' && $req->transactionId && !$req->unitId);
        $isO2 = ($req->transactionType === 'o2');
        $isTask = ($req->transactionType === 'task');
        $needsO2CostCentre = $isO2 && (!$req->costCentre || trim((string)$req->costCentre) === '');
        if ($needsO2CostCentre) {
            throw new BadRequestHttpException('costCentre is required for o2 transactionType.');
        }
        if (
            !$req->unitId
            && !$isHousekeepersPseudoUnit
            && !$canDeferUnitFromLedger
            && !$isO2
            && !$isTask
        ) {
            throw new BadRequestHttpException('unitId is required.');
        }
        if (!$req->transactionId) {
            // Allow unit-level uploads, O2-level uploads, and task uploads (no specific transaction row)
            if (!in_array($req->transactionType, ['unit', 'o2', 'task'], true)) {
                throw new BadRequestHttpException('transactionId is required.');
            }
            // For 'unit', 'o2' and 'task' uploads we accept missing transactionId
        }

        // --- 2) Resolve Unit ---
        /** @var Unit|null $unit */
        $unit = null;
        if ($isHousekeepersPseudoUnit) {
            // Try to resolve a placeholder Unit named 'Housekeepers' to satisfy DB FK/NOT NULL
            $unitRepo = $this->em->getRepository(Unit::class);
            $unit = $unitRepo->findOneBy(['unitName' => 'Housekeepers']);
            if (!$unit && method_exists($unitRepo, 'findOneByName')) {
                $unit = $unitRepo->findOneByName('Housekeepers');
            }
            if (!$unit) {
                throw new BadRequestHttpException("Pseudo-unit 'Housekeepers' not found. Please create a Unit named 'Housekeepers' to attach HK documents, or make unit_id nullable in UnitDocument.");
            }
        } else {
            if ($canDeferUnitFromLedger) {
                // Will resolve from the ledger transaction after we load it
                $unit = null;
            } else {
                if ($isO2) {
                    // For O2 uploads we do not require a Unit; unit_id is nullable
                    $unit = null;
                } elseif ($isTask) {
                    // For Task uploads, unit is optional: if provided, attach; otherwise leave null
                    if ($req->unitId) {
                        $unit = $this->em->getRepository(Unit::class)->find($req->unitId);
                        if (!$unit) {
                            throw new BadRequestHttpException("Unit not found: {$req->unitId}");
                        }
                    } else {
                        $unit = null;
                    }
                } else {
                    $unit = $this->em->getRepository(Unit::class)->find($req->unitId);
                    if (!$unit) {
                        throw new BadRequestHttpException("Unit not found: {$req->unitId}");
                    }
                }
            }
        }

        // --- 3) Resolve Transaction by type (optional for unit uploads) ---
        $transaction = null;
        $transactionKind = $req->transactionType; // 'unit' | 'hk' | 'ledger'
        // Default label for ledger uploads
        $defaultLabel = ($transactionKind === 'ledger') ? 'Reports' : null;

        if ($req->transactionId) {
            if ($transactionKind === 'unit') {
                $transaction = $this->em->getRepository(UnitTransactions::class)->find($req->transactionId);
            } elseif ($transactionKind === 'hk') {
                if (class_exists(HKTransactions::class)) {
                    $transaction = $this->em->getRepository(HKTransactions::class)->find($req->transactionId);
                }
            } elseif ($transactionKind === 'ledger') {
                if (class_exists(UnitBalanceLedger::class)) {
                    $transaction = $this->em->getRepository(UnitBalanceLedger::class)->find($req->transactionId);
                }
            } elseif ($transactionKind === 'o2') {
                // For O2 uploads, controller will link UnitDocument to O2 transaction; skip lookup
                $transaction = null;
            }
            if (!$transaction && !in_array($transactionKind, ['o2', 'task'], true)) {
                throw new BadRequestHttpException("Transaction not found: {$req->transactionId} (type={$req->transactionType})");
            }
        }

        // If this is a ledger upload and we deferred unit lookup, resolve Unit from the ledger entity now
        if ($transactionKind === 'ledger' && !$unit && $transaction) {
            if (is_object($transaction) && method_exists($transaction, 'getUnit')) {
                $ledgerUnit = $transaction->getUnit();
                if ($ledgerUnit instanceof Unit) {
                    $unit = $ledgerUnit;
                }
            }
            if (!$unit) {
                throw new BadRequestHttpException('Unable to resolve Unit from ledger transaction.');
            }
        }

        // --- 3c) If ledger: check for an existing 'reports' attachment to REUSE its UnitDocument ---
        $existingLedgerAttachment = null;
        $existingLedgerDocument   = null;
        if ($transactionKind === 'ledger' && $transaction && method_exists($transaction, 'getId')) {
            $existingLedgerAttachment = $this->attachmentRepo->findOneBy(
                ['targetType' => 'unit_balance_ledger', 'targetId' => (int)$transaction->getId(), 'category' => 'reports'],
                ['id' => 'DESC']
            );
            if ($existingLedgerAttachment && method_exists($existingLedgerAttachment, 'getDocument')) {
                $existingLedgerDocument = $existingLedgerAttachment->getDocument();
            }
        }

        // --- 3b) Normalize required fields to satisfy DB NOT NULL constraints ---
        // Priority:
        //  1) Explicit request category
        //  2) Category derived from the transaction object (getCategory(), then getAllocation(), etc.)
        //  3) Fall back to description
        //  4) Finally, 'Uncategorized'
        $effectiveCategory = null;

        // 1) Use $req->category if present and non-empty
        if (isset($req->category) && trim((string)$req->category) !== '') {
            $effectiveCategory = (string) $req->category;
        }

        // 2) Else try to read it from the transaction object
        if ($effectiveCategory === null && is_object($transaction)) {
            // Try getCategory()
            if (method_exists($transaction, 'getCategory')) {
                $val = $transaction->getCategory();
                $cat = $this->toStringOrNull($val);
                if ($cat !== null) {
                    $effectiveCategory = $cat;
                }
            }
            // Then getAllocation()
            if ($effectiveCategory === null && method_exists($transaction, 'getAllocation')) {
                $val = $transaction->getAllocation();
                $cat = $this->toStringOrNull($val);
                if ($cat !== null) {
                    $effectiveCategory = $cat;
                }
            }
        }

        // 3) Else fall back to $req->description
        if ($effectiveCategory === null && isset($req->description) && trim((string)$req->description) !== '') {
            $effectiveCategory = (string) $req->description;
        }

        // 4) Default
        if ($effectiveCategory === null) {
            $effectiveCategory = 'Uncategorized';
        }
        if ($isO2 && $effectiveCategory === 'Uncategorized' && isset($req->category) && trim((string)$req->category) !== '') {
            // keep explicit request category if provided
        } elseif ($isO2 && $effectiveCategory === 'Uncategorized' && $req->categoryId) {
            $effectiveCategory = 'cat-' . (string) $req->categoryId;
        }
        // For ledger uploads, force a meaningful default category if still Uncategorized
        if ($transactionKind === 'ledger' && ($effectiveCategory === null || $effectiveCategory === 'Uncategorized')) {
            $effectiveCategory = 'Client Report';
        }

        // --- Detect a ledger payment proof upload (distinct from the monthly report) ---
        // We consider either the effective category or the description to contain "report payment"
        $descNorm = strtolower(trim((string)($req->description ?? '')));
        $catNorm  = strtolower(trim((string)($effectiveCategory ?? '')));
        $isLedgerPayment = ($transactionKind === 'ledger') && (
            str_contains($descNorm, 'report payment') || str_contains($catNorm, 'report payment')
            || str_contains($descNorm, 'client report payment') || str_contains($catNorm, 'client report payment')
            || str_contains($descNorm, 'o2 report payment') || str_contains($catNorm, 'o2 report payment')
        );
        // Detect explicit Partial Payment (English/Spanish)
        $isLedgerPartialPayment = false;
        if ($isLedgerPayment) {
            // consider phrases like "partial payment", "pago parcial"
            if (str_contains($descNorm, 'partial payment') || str_contains($catNorm, 'partial payment')) {
                $isLedgerPartialPayment = true;
            } elseif (str_contains($descNorm, 'pago parcial') || str_contains($catNorm, 'pago parcial')) {
                $isLedgerPartialPayment = true;
            } else {
                // loose heuristic: both words present somewhere
                if ((str_contains($descNorm, 'partial') && str_contains($descNorm, 'payment'))
                    || (str_contains($catNorm, 'partial') && str_contains($catNorm, 'payment')))
                {
                    $isLedgerPartialPayment = true;
                }
            }
        }
        // If this is a payment proof, never reuse the existing 'reports' attachment/document (it belongs to the report PDF)
        if ($isLedgerPayment) {
            $existingLedgerAttachment = null;
            $existingLedgerDocument   = null;
        }

        // --- 4) Build final filename ---
        $ext = null;
        if ($req->file instanceof UploadedFile) {
            $ext = $this->safeExtension($req->file);
        } else {
            $ext = $this->safeExtensionFromNameOrMime($req->originalName ?? null, $req->mime ?? null);
        }
        if ($req->transactionType === 'o2') {
            $type = $req->txType ?: ($req->type ?? 'Doc');
            $type = $this->slug((string) $type); // e.g., ingreso/gasto
            $when = ($req->dateForName ?: new \DateTimeImmutable())->format('Ymd');
            $txSuffix = $req->transactionId ? ('_tx' . (string) $req->transactionId) : '';
            $baseName = strtoupper($type) . '_' . $when . $txSuffix; // e.g., GASTO_20250919_tx123
        } else {
            $baseName = $this->buildBaseName($unit, $effectiveCategory, $req->description, $req->dateForName, $req->transactionType);
        }

        // Decide if we should convert image uploads to PDF for better inline preview/print controls
        $incomingMime = $req->file instanceof UploadedFile
            ? ($req->file->getMimeType() ?: null)
            : ($req->mime ?: null);

        // Robust image detection (by mime, extension, or original name)
        $origNameHint = $req->file instanceof UploadedFile
            ? ($req->file->getClientOriginalName() ?: null)
            : ($req->originalName ?? null);
        $extLower = strtolower((string)($ext ?? ''));
        $isImageByMime = $incomingMime ? str_starts_with($incomingMime, 'image/') : false;
        $isImageByExt  = in_array($extLower, ['jpg','jpeg','png','webp'], true);
        $isImageByName = $origNameHint ? (bool) preg_match('/\.(jpe?g|png|webp)$/i', $origNameHint) : false;
        $isIncomingImage = $isImageByMime || $isImageByExt || $isImageByName;

        $imagickAvailable = class_exists(\Imagick::class);
        $shouldConvertToPdf = $isIncomingImage && $imagickAvailable && !in_array($req->transactionType, ['o2', 'task'], true); // do not convert O2 or Task uploads to PDF
        $targetExt = $shouldConvertToPdf ? 'pdf' : ($ext ?: 'bin');

        // --- 5) Upload directly to S3 (no local storage) ---
        $bucket = $_ENV['AWS_S3_BUCKET'] ?? getenv('AWS_S3_BUCKET') ?: 'owners2-unit-documents';
        $region = $_ENV['AWS_S3_REGION'] ?? getenv('AWS_S3_REGION') ?: 'us-east-2';

        $baseConfig = [
            'version' => 'latest',
            'region'  => $region,
            'use_path_style_endpoint' => false,
        ];

        $awsKey    = $_ENV['AWS_ACCESS_KEY_ID'] ?? getenv('AWS_ACCESS_KEY_ID') ?: null;
        $awsSecret = $_ENV['AWS_SECRET_ACCESS_KEY'] ?? getenv('AWS_SECRET_ACCESS_KEY') ?: null;

        if ($awsKey && $awsSecret) {
            $baseConfig['credentials'] = [
                'key'    => $awsKey,
                'secret' => $awsSecret,
            ];
        }

        $s3Client = new S3Client($baseConfig);

        // Ensure unique key in S3 and compute finalName (allows multiple uploads in same transaction)
        $unitFolder = $unit ? (string) $unit->getId() : 'housekeepers';

        // NEW: Flattened structure for 'hk' and 'unit': <unitId>/<categoryId|0>/<yymm>/<descSlug>__...
        if (in_array($req->transactionType, ['hk', 'unit'], true)) {
            // Build a stable prefix and base name for HK and Unit transaction uploads
            // Folder: <unitId|housekeepers>/<categoryId|0>/<yymm>
            // Basename: slug(description or effectiveCategory or "doc")
            $catSegment = $req->categoryId !== null ? (string) $req->categoryId : '0';

            $periodDate = $req->dateForName ?: new \DateTimeImmutable();
            $yymm = $periodDate->format('ym');

            // Prefer explicit description, then derived effectiveCategory, then generic "doc"
            $descSource = $req->description ?: ($effectiveCategory ?: 'doc');
            $descSlug   = $this->slug($descSource);

            $prefix = $unitFolder . '/' . $catSegment . '/' . $yymm;
            $baseNameForS3 = $descSlug;
        } elseif ($req->transactionType === 'ledger') {
            // reports/<yymm>/<unitId>_monthlyreport<yymm>.pdf (deterministic name)
            $periodDate = $this->resolveLedgerPeriodDate($req->dateForName, $req->description ?? null);
            $yymm = $periodDate->format('ym');
            $unitIdForName = ($unit && method_exists($unit, 'getId')) ? (int) $unit->getId() : 0;

            // Prefix WITHOUT unit subfolder – unit id goes into the filename
            $prefix = 'reports/' . $yymm; // e.g. reports/2509
            if ($isLedgerPayment) {
                if ($isLedgerPartialPayment) {
                    // Partial payment proof → deterministic: <unitId>_partialpayment<yymm>.pdf
                    $baseNameForS3 = $unitIdForName . '_partialpayment' . $yymm;                 // e.g. 11_partialpayment2509
                    $displayBase   = 'reports_' . $yymm . '_' . $unitIdForName . '_partialpayment' . $yymm; // reports_2509_11_partialpayment2509
                } else {
                    // Full payment proof → deterministic: <unitId>_reportpayment<yymm>.pdf
                    $baseNameForS3 = $unitIdForName . '_reportpayment' . $yymm;                 // e.g. 11_reportpayment2509
                    $displayBase   = 'reports_' . $yymm . '_' . $unitIdForName . '_reportpayment' . $yymm; // reports_2509_11_reportpayment2509
                }
            } else {
                // Monthly report → deterministic: <unitId>_monthlyreport<yymm>.pdf
                $baseNameForS3 = $unitIdForName . '_monthlyreport' . $yymm;                 // e.g. 11_monthlyreport2509
                $displayBase   = 'reports_' . $yymm . '_' . $unitIdForName . '_monthlyreport' . $yymm; // reports_2509_11_monthlyreport2509
            }
            // Force fixed name (no random suffix)
            $useFixedName  = true;
        } elseif ($req->transactionType === 'o2') {
            // New path for Owners2-level transactions (not tied to a unit)
            $centreSlug = $this->slug((string) $req->costCentre);
            $catSegment = $req->categoryId !== null ? (string) $req->categoryId : 'uncategorized';
            $prefix = 'o2transactions/' . $centreSlug . '/' . $catSegment;
            // Use the previously computed $baseName (e.g. GASTO_20250919_tx123) as S3 basename
            $baseNameForS3 = $baseName !== null && $baseName !== '' ? $baseName : 'document';
            $displayBase   = $baseNameForS3;
        } elseif ($req->transactionType === 'task') {
            // Path for Task attachments (not tied to a financial transaction or specific unit)
            $prefix = 'tasks';

            // Always start filenames with "task"
            if ($baseName !== null && $baseName !== '') {
                // e.g. if buildBaseName() returns "2511__20251130_060305_e61a82e1"
                // final baseNameForS3 = "task__2511__20251130_060305_e61a82e1"
                $baseNameForS3 = 'task__' . ltrim($baseName, '_');
            } else {
                $baseNameForS3 = 'task';
            }

            $displayBase   = $baseNameForS3;
        } else { // default (back-compat)
            $prefix = $unitFolder . '/docs/' . ($req->transactionId ?: 'misc');
            if (!isset($baseNameForS3) || $baseNameForS3 === null || $baseNameForS3 === '') {
                $baseNameForS3 = $baseName !== null && $baseName !== '' ? $baseName : 'document';
            }
        }
        if (isset($useFixedName) && $useFixedName === true) {
            $finalName = $baseNameForS3 . ($targetExt ? ".{$targetExt}" : '');
            $key = rtrim($prefix, '/') . '/' . $finalName; // e.g., 12/1/internet_2509.pdf
        } else {
            [$key, $finalName] = $this->ensureUniqueS3Key($s3Client, $bucket, $prefix, $baseNameForS3, $targetExt);
        }

        // If re-issuing a ledger report and we found an existing UnitDocument, overwrite the SAME S3 object key
        if ($transactionKind === 'ledger' && $existingLedgerDocument && method_exists($existingLedgerDocument, 'getS3Url')) {
            $prevUrl = (string) $existingLedgerDocument->getS3Url();
            if ($prevUrl !== '') {
                $parts = parse_url($prevUrl);
                if (!empty($parts['path'])) {
                    $existingKey = ltrim(rawurldecode($parts['path']), '/');
                    if ($existingKey !== '') {
                        $key = $existingKey;            // keep identical path
                        $finalName = basename($existingKey); // keep filename consistent
                    }
                }
            }
        }

        try {
            if ($req->file instanceof UploadedFile) {
                $contentType = $req->file->getMimeType() ?: ($req->mime ?: 'application/octet-stream');

                // Double-check: if detected as image, force conversion
                $origNameUF = $req->file->getClientOriginalName() ?: ($req->originalName ?? 'upload');
                $isImageByMimeUF = (strpos($contentType, 'image/') === 0);
                $isImageByExtUF  = (bool) preg_match('/\.(jpe?g|png|webp)$/i', strtolower($origNameUF));
                if ($isImageByMimeUF || $isImageByExtUF) {
                    $shouldConvertToPdf = $imagickAvailable && !in_array($req->transactionType, ['o2', 'task'], true); // skip image→PDF conversion for O2 and Task uploads
                }

                // If we will convert to PDF, ensure the S3 key/filename uses .pdf
                if ($shouldConvertToPdf && $targetExt !== 'pdf') {
                    $targetExt = 'pdf';
                    if (isset($useFixedName) && $useFixedName === true) {
                        $finalName = $baseNameForS3 . '.pdf';
                        $key = rtrim($prefix, '/') . '/' . $finalName;
                    } else {
                        [$key, $finalName] = $this->ensureUniqueS3Key($s3Client, $bucket, $prefix, $baseNameForS3, $targetExt);
                    }
                }

                if ($shouldConvertToPdf) {
                    // Convert image to single-page PDF via Imagick
                    $img = new \Imagick();
                    $img->setResolution(144, 144); // crisp but reasonable size
                    $img->readImage($req->file->getPathname());
                    $img->setImageFormat('pdf');
                    // Ensure white background for transparent PNG/WebP
                    if ($img->getImageAlphaChannel()) {
                        $img->setImageBackgroundColor('white');
                        $img = $img->mergeImageLayers(\Imagick::LAYERMETHOD_FLATTEN);
                        $img->setImageFormat('pdf');
                    }
                    $pdfBytes = $img->getImagesBlob();
                    $img->clear();
                    $img->destroy();

                    @error_log('[DocumentUploadService] putObject bucket=' . $bucket . ' key=' . $key . ' contentType=application/pdf');
                    $result = $s3Client->putObject([
                        'Bucket'             => $bucket,
                        'Key'                => $key,
                        'Body'               => $pdfBytes,
                        'ContentType'        => 'application/pdf',
                        'ContentDisposition' => 'inline',
                        'CacheControl'       => 'no-cache, no-store, max-age=0, must-revalidate',
                        'Expires'            => '0',
                    ]);
                } else {
                    // Upload original file as-is
                    @error_log('[DocumentUploadService] putObject bucket=' . $bucket . ' key=' . $key . ' contentType=' . $contentType);
                    $result = $s3Client->putObject([
                        'Bucket'             => $bucket,
                        'Key'                => $key,
                        'SourceFile'         => $req->file->getPathname(),
                        'ContentType'        => $contentType,
                        'ContentDisposition' => 'inline',
                        'CacheControl'       => 'no-cache, no-store, max-age=0, must-revalidate',
                        'Expires'            => '0',
                    ]);
                }
            } else {
                // Upload from in-memory bytes
                $body = is_string($req->bytes) ? $req->bytes : '';
                $mime = $req->mime ?: 'application/pdf';
                // Normalize images to PDF if applicable
                [$body, $mime, $req->originalName] = $this->ensurePdfForImages($body, $mime, $req->originalName ?? 'upload');

                // If we converted to PDF, ensure targetExt and finalName use .pdf
                if ($mime === 'application/pdf' && $targetExt !== 'pdf') {
                    $targetExt = 'pdf';
                    if (isset($useFixedName) && $useFixedName === true) {
                        $finalName = $baseNameForS3 . '.pdf';
                        $key = rtrim($prefix, '/') . '/' . $finalName;
                    } else {
                        [$key, $finalName] = $this->ensureUniqueS3Key($s3Client, $bucket, $prefix, $baseNameForS3, $targetExt);
                    }
                }

                @error_log('[DocumentUploadService] putObject bucket=' . $bucket . ' key=' . $key . ' contentType=' . $mime);
                $result = $s3Client->putObject([
                    'Bucket'             => $bucket,
                    'Key'                => $key,
                    'Body'               => $body,
                    'ContentType'        => $mime,
                    'ContentDisposition' => 'inline',
                    'CacheControl'       => 'no-cache, no-store, max-age=0, must-revalidate',
                    'Expires'            => '0',
                ]);
            }
            $publicUrl = sprintf('https://%s.s3.%s.amazonaws.com/%s', $bucket, $region, str_replace('%2F','/', rawurlencode($key)));
        } catch (AwsException $e) {
            $awsMsg = $e->getAwsErrorMessage();
            $fallback = $e->getMessage();
            throw new BadRequestHttpException('S3 upload failed: ' . ($awsMsg ?: $fallback));
        } catch (\Throwable $e) {
            // Catch any non-AWS errors (e.g., Imagick not installed) to surface a meaningful message
            throw new BadRequestHttpException('Upload failed: ' . $e->getMessage());
        }

        // --- 6) Create & link UnitDocument entity ---
        // Reuse existing UnitDocument for ledger/report replace; otherwise create a new one
        $document = ($transactionKind === 'ledger' && $existingLedgerDocument instanceof UnitDocument)
            ? $existingLedgerDocument
            : new UnitDocument();
        if (!($transactionKind === 'ledger' && $existingLedgerDocument)) {
            if (method_exists($document, 'setUnit')) {
                // For O2 uploads unit may be null (unit_id is nullable)
                $document->setUnit($unit);
            } elseif (method_exists($document, 'setUnitId') && $unit) {
                $document->setUnitId($unit->getId());
            }
        }

        if (method_exists($document, 'setDescription') && $req->description !== null) {
            $document->setDescription($req->description);
        }
        if (method_exists($document, 'setCategory')) {
            // Force explicit category for ledger uploads as per new spec
            if ($transactionKind === 'ledger') {
                if ($isLedgerPayment) {
                    $document->setCategory($isLedgerPartialPayment ? 'Partial Payment' : 'Report Payment');
                } else {
                    $document->setCategory('Report');
                }
            } else {
                $document->setCategory($effectiveCategory);
            }
        }
        if (method_exists($document, 'setLabel')) {
            if ($transactionKind === 'ledger') {
                // Payment proofs live under 'Payments', reports under 'Reports'
                if ($isLedgerPayment) {
                    $document->setLabel('Payments');
                } else {
                    $document->setLabel('Reports');
                }
            } elseif ($isO2) {
                $document->setLabel('O2 Documents');
            } elseif ($isTask) {
                $document->setLabel('Tasks');
            } else {
                $labelToSet = $defaultLabel ?: ($req->description ? 'Documents' : null);
                if ($labelToSet) {
                    $document->setLabel($labelToSet);
                }
            }
        }
        // Store canonical S3 URL only (deprecate documentUrl/filepath writes; keep reads for compatibility)
        // Display/DB filename should use displayBase for unit uploads
        $displayFinal = $finalName;
        if ($transactionKind === 'ledger' && isset($displayBase)) {
            // Force reports_YYMM_unitId_monthlyreportYYMM.pdf or ..._reportpaymentYYMM.pdf
            $displayFinal = $displayBase . '.pdf';
        } elseif (isset($useFixedName) && $useFixedName === true && isset($displayBase)) {
            $displayFinal = $displayBase . ($targetExt ? ".{$targetExt}" : '');
        }
        if (method_exists($document, 'setFilename')) {
            $document->setFilename($displayFinal);
        }
        if (method_exists($document, 'setS3Url')) {
            // Store full HTTPS S3 URL for all uploads (ledger included)
            $document->setS3Url($publicUrl);
        }
        // NOTE: do not write documentUrl or filepath anymore; legacy readers still supported in delete()

        if (method_exists($document, 'setUploadedAt')) {
            // Always touch uploadedAt on successful upload, even when reusing the same UnitDocument for ledger
            $document->setUploadedAt(new \DateTimeImmutable());
        }

        // Ensure auditing fields are not null (DB constraints); do not reset createdAt on reuse
        if (method_exists($document, 'getCreatedAt') && method_exists($document, 'setCreatedAt')) {
            if ($document->getCreatedAt() === null) {
                $document->setCreatedAt(new \DateTimeImmutable());
            }
        }
        // Do NOT auto-set createdBy/uploaded_by; keep null to deprecate that field
        if (method_exists($document, 'setUpdatedAt')) {
            // touch updatedAt on creation for schemas that require it
            $document->setUpdatedAt(new \DateTimeImmutable());
        }

        // Link to the proper transaction side
        if ($transactionKind === 'unit') {
            if ($transaction) {
                if (method_exists($transaction, 'addUnitDocument')) {
                    $transaction->addUnitDocument($document);
                }
                if (method_exists($document, 'setTransaction')) {
                    $document->setTransaction($transaction);
                }
            }
            // unit-only uploads still just set the unit (already done above)
        } elseif ($transactionKind === 'hk') {
            if ($transaction) {
                if (method_exists($transaction, 'addUnitDocument')) {
                    $transaction->addUnitDocument($document);
                }
                if (method_exists($document, 'setHkTransaction')) {
                    $document->setHkTransaction($transaction);
                } elseif (method_exists($document, 'setTransaction')) {
                    $document->setTransaction($transaction);
                }
            }
        } elseif ($transactionKind === 'ledger') {
            // Do not set direct ledger relation; we'll create a UnitDocumentAttachment after persisting
        } elseif ($transactionKind === 'o2') {
            // Controller (O2TransactionsController) will set $document->setO2Transaction($o2Tx) and persist.
        }

        // Persist the document first to obtain its ID
        $this->em->persist($document);
        if ($transaction && $transactionKind !== 'ledger') {
            $this->em->persist($transaction);
        }
        $this->em->flush();

        // For ledger uploads: attach only if there wasn't one; else we reused existing attachment+document
        if ($transactionKind === 'ledger' && $transaction && method_exists($transaction, 'getId')) {
            if (!$existingLedgerAttachment) {
                // Use different attachment categories per type to keep one-per-ledger-per-category
                if ($isLedgerPayment) {
                    $attachCategory = $isLedgerPartialPayment ? 'partial payment' : 'report payment';
                } else {
                    $attachCategory = 'reports';
                }
                $opts = new AttachOptions(
                    targetType: 'unit_balance_ledger',
                    targetId: (int) $transaction->getId(),
                    category: $attachCategory,
                    mode: 'replace',
                    scope: 'per-parent' // ensure only one attachment per ledger per category
                );
                $this->attach($document, $opts);
            }
        }

        return $document;
    }

    /**
     * Convenience wrapper for ledger uploads to keep older controllers stable.
     * Delegates to ->upload() by constructing an UploadRequestDTO.
     *
     * @param int                   $ledgerId     Required: ID of UnitBalanceLedger row
     * @param int|null              $unitId       Optional: can be null; will resolve from ledger
     * @param UploadedFile|null     $file         Optional: if not provided, use $bytes + $mime
     * @param string|null           $category     Optional: e.g. 'REPORT'
     * @param string|null           $description  Optional: e.g. 'Reporte Mensual mmyy'
     * @param \DateTimeInterface|null $dateForName Optional: used for yymm in file name
     * @param string|null           $mime         Optional: MIME when passing raw bytes
     * @param string|null           $originalName Optional: suggested filename
     * @param string|null           $bytes        Optional: raw bytes (for in-memory uploads)
     */

    public function uploadForLedger(
        int $ledgerId,
        ?int $unitId = null,
        ?UploadedFile $file = null,
        ?string $category = null,
        ?string $description = null,
        ?\DateTimeInterface $dateForName = null,
        ?string $mime = null,
        ?string $originalName = null,
        ?string $bytes = null,
        ?int $categoryId = null,
    ): UnitDocument {
        $dto = new UploadRequestDTO();
        $dto->transactionType = 'ledger';
        $dto->transactionId   = $ledgerId;
        $dto->unitId          = $unitId;           // may be null; will resolve from ledger entity
        $dto->file            = $file;
        $dto->bytes           = $bytes;
        $dto->mime            = $mime;
        $dto->originalName    = $originalName;
        $dto->category        = $category;
        $dto->description     = $description;
        $dto->dateForName     = $dateForName;
        $dto->categoryId     = $categoryId;

        return $this->upload($dto);
    }

    /** Convenience wrapper for unit-level uploads not tied to a specific transaction. */
    public function uploadForUnit(
        int $unitId,
        ?UploadedFile $file = null,
        ?string $category = null,
        ?string $description = null,
        ?\DateTimeInterface $dateForName = null,
        ?string $mime = null,
        ?string $originalName = null,
        ?string $bytes = null,
        ?int $categoryId = null,
    ): UnitDocument {
        $dto = new UploadRequestDTO();
        $dto->transactionType = 'unit';
        $dto->transactionId   = null; // no specific UnitTransactions row
        $dto->unitId          = $unitId;
        $dto->file            = $file;
        $dto->bytes           = $bytes;
        $dto->mime            = $mime;
        $dto->originalName    = $originalName;
        $dto->category        = $category;
        $dto->description     = $description;
        $dto->dateForName     = $dateForName;
        $dto->categoryId     = $categoryId;
        return $this->upload($dto);
    }

    /**
     * Upload a file for the HK Cleaning Checklist module.
     * This does NOT create a UnitDocument. It only uploads to S3 and returns the public URL.
     * Path convention: hk_cleanings_checklist/{unitId}/{checklistId}/{yyyymmdd_HHMMss}_{rand8}.{ext}
     *
     * Notes:
     * - Keeps original image formats (JPG/PNG/WEBP). Does NOT convert images to PDF.
     * - Uses owners2-unit-documents bucket (from env) and returns the S3 https URL
     *   or CloudFront URL if AWS_CDN_DOMAIN is set.
     */
    public function uploadForChecklist(
        int $unitId,
        int $checklistId,
        ?UploadedFile $file = null,
        ?string $bytes = null,
        ?string $mime = null,
        ?string $originalName = null
    ): string {
        // --- Validate input ---
        if (!$file instanceof UploadedFile && ($bytes === null || $bytes === '')) {
            throw new BadRequestHttpException('No file provided for checklist upload.');
        }
        if ($unitId <= 0 || $checklistId <= 0) {
            throw new BadRequestHttpException('unitId and checklistId are required for checklist uploads.');
        }

        // --- Bucket/Region setup (same as other uploads) ---
        $bucket = $_ENV['AWS_S3_BUCKET'] ?? getenv('AWS_S3_BUCKET') ?: 'owners2-unit-documents';
        $region = $_ENV['AWS_S3_REGION'] ?? getenv('AWS_S3_REGION') ?: 'us-east-2';

        $baseConfig = [
            'version' => 'latest',
            'region'  => $region,
            'use_path_style_endpoint' => false,
        ];
        $awsKey    = $_ENV['AWS_ACCESS_KEY_ID'] ?? getenv('AWS_ACCESS_KEY_ID') ?: null;
        $awsSecret = $_ENV['AWS_SECRET_ACCESS_KEY'] ?? getenv('AWS_SECRET_ACCESS_KEY') ?: null;
        if ($awsKey && $awsSecret) {
            $baseConfig['credentials'] = ['key' => $awsKey, 'secret' => $awsSecret];
        }
        $s3Client = new S3Client($baseConfig);

        // --- Build S3 key ---
        // Folder: hk_cleanings_checklist/{unitId}/{checklistId}
        $prefix = 'hk_cleanings_checklist/' . (int)$unitId . '/' . (int)$checklistId;

        // Base name derived from current datetime, plus a short random suffix.
        $now = new \DateTimeImmutable('now');
        $timestamp = $now->format('Ymd_His');
        $rand = substr(bin2hex(random_bytes(4)), 0, 8);
        $baseName = $timestamp . '_' . $rand;

        // Determine extension & content type
        if ($file instanceof UploadedFile) {
            $ext = $this->safeExtension($file);
            $contentType = $file->getMimeType() ?: ($mime ?: 'application/octet-stream');
        } else {
            $ext = $this->safeExtensionFromNameOrMime($originalName, $mime);
            $contentType = $mime ?: 'application/octet-stream';
        }
        $targetExt = $ext ?: 'bin';

        // Create unique key
        [$key, $finalName] = $this->ensureUniqueS3Key($s3Client, $bucket, $prefix, $baseName, $targetExt);

        // --- Upload ---
        try {
            if ($file instanceof UploadedFile) {
                $s3Client->putObject([
                    'Bucket'             => $bucket,
                    'Key'                => $key,
                    'SourceFile'         => $file->getPathname(),
                    'ContentType'        => $contentType,
                    'ContentDisposition' => 'inline',
                    'CacheControl'       => 'no-cache, no-store, max-age=0, must-revalidate',
                    'Expires'            => '0',
                ]);
            } else {
                $s3Client->putObject([
                    'Bucket'             => $bucket,
                    'Key'                => $key,
                    'Body'               => is_string($bytes) ? $bytes : '',
                    'ContentType'        => $contentType,
                    'ContentDisposition' => 'inline',
                    'CacheControl'       => 'no-cache, no-store, max-age=0, must-revalidate',
                    'Expires'            => '0',
                ]);
            }
        } catch (AwsException $e) {
            $awsMsg = $e->getAwsErrorMessage();
            $fallback = $e->getMessage();
            throw new BadRequestHttpException('S3 checklist upload failed: ' . ($awsMsg ?: $fallback));
        } catch (\Throwable $e) {
            throw new BadRequestHttpException('Checklist upload failed: ' . $e->getMessage());
        }

        // --- Build URL: prefer CDN if configured
        $cdnDomain = $_ENV['AWS_CDN_DOMAIN'] ?? getenv('AWS_CDN_DOMAIN') ?: null;
        if (is_string($cdnDomain) && $cdnDomain !== '') {
            $cdnDomain = rtrim($cdnDomain, '/');
            return sprintf('https://%s/%s', $cdnDomain, str_replace('%2F','/', rawurlencode($key)));
        }

        return sprintf('https://%s.s3.%s.amazonaws.com/%s', $bucket, $region, str_replace('%2F','/', rawurlencode($key)));
    }

    /**
     * Upload a file for the Unit Inventory module (photos with captions).
     * This does NOT create a UnitDocument. It only uploads to S3 and returns the public URL.
     * Path convention: inventory/{unitId}/{sessionId}/{filename}
     *
     * Notes:
     * - Keeps original image formats (JPG/PNG/WEBP). Does NOT convert images to PDF.
     * - Uses owners2-unit-documents bucket (from env) and returns the S3 https URL (or CloudFront if AWS_CDN_DOMAIN is set).
     */
    public function uploadForInventory(
        int $unitId,
        int $sessionId,
        ?UploadedFile $file = null,
        ?string $bytes = null,
        ?string $mime = null,
        ?string $originalName = null,
        ?\DateTimeInterface $dateForName = null,
        ?string $description = null
    ): string {
        // --- Validate input ---
        if (!$file instanceof UploadedFile && ($bytes === null || $bytes === '')) {
            throw new BadRequestHttpException('No file provided for inventory upload.');
        }
        if ($unitId <= 0 || $sessionId <= 0) {
            throw new BadRequestHttpException('unitId and sessionId are required for inventory uploads.');
        }

        // --- Bucket/Region setup (same as other uploads) ---
        $bucket = $_ENV['AWS_S3_BUCKET'] ?? getenv('AWS_S3_BUCKET') ?: 'owners2-unit-documents';
        $region = $_ENV['AWS_S3_REGION'] ?? getenv('AWS_S3_REGION') ?: 'us-east-2';

        $baseConfig = [
            'version' => 'latest',
            'region'  => $region,
            'use_path_style_endpoint' => false,
        ];
        $awsKey    = $_ENV['AWS_ACCESS_KEY_ID'] ?? getenv('AWS_ACCESS_KEY_ID') ?: null;
        $awsSecret = $_ENV['AWS_SECRET_ACCESS_KEY'] ?? getenv('AWS_SECRET_ACCESS_KEY') ?: null;
        if ($awsKey && $awsSecret) {
            $baseConfig['credentials'] = ['key' => $awsKey, 'secret' => $awsSecret];
        }
        $s3Client = new S3Client($baseConfig);

        // --- Build S3 key ---
        $prefix = 'inventory/' . (int)$unitId . '/' . (int)$sessionId;

        // base name derived from description or original name; fallback to 'photo'
        $when = ($dateForName ?: new \DateTimeImmutable())->format('ymd_His');
        $baseName = $this->slug($description ?: ($originalName ?: 'photo')) . '_' . $when;

        // Determine extension & content type
        $ext = null;
        if ($file instanceof UploadedFile) {
            $ext = $this->safeExtension($file);
            $contentType = $file->getMimeType() ?: ($mime ?: 'application/octet-stream');
        } else {
            $ext = $this->safeExtensionFromNameOrMime($originalName, $mime);
            $contentType = $mime ?: 'application/octet-stream';
        }
        $targetExt = $ext ?: 'bin'; // keep original image formats

        // Create unique key
        [$key, $finalName] = $this->ensureUniqueS3Key($s3Client, $bucket, $prefix, $baseName, $targetExt);

        // --- Upload ---
        try {
            if ($file instanceof UploadedFile) {
                $s3Client->putObject([
                    'Bucket'             => $bucket,
                    'Key'                => $key,
                    'SourceFile'         => $file->getPathname(),
                    'ContentType'        => $contentType,
                    'ContentDisposition' => 'inline',
                    'CacheControl'       => 'no-cache, no-store, max-age=0, must-revalidate',
                    'Expires'            => '0',
                ]);
            } else {
                $s3Client->putObject([
                    'Bucket'             => $bucket,
                    'Key'                => $key,
                    'Body'               => is_string($bytes) ? $bytes : '',
                    'ContentType'        => $contentType,
                    'ContentDisposition' => 'inline',
                    'CacheControl'       => 'no-cache, no-store, max-age=0, must-revalidate',
                    'Expires'            => '0',
                ]);
            }
        } catch (AwsException $e) {
            $awsMsg = $e->getAwsErrorMessage();
            $fallback = $e->getMessage();
            throw new BadRequestHttpException('S3 inventory upload failed: ' . ($awsMsg ?: $fallback));
        } catch (\Throwable $e) {
            throw new BadRequestHttpException('Inventory upload failed: ' . $e->getMessage());
        }

        // --- Build URL: prefer CDN if configured
        $cdnDomain = $_ENV['AWS_CDN_DOMAIN'] ?? getenv('AWS_CDN_DOMAIN') ?: null;
        if (is_string($cdnDomain) && $cdnDomain !== '') {
            $cdnDomain = rtrim($cdnDomain, '/');
            return sprintf('https://%s/%s', $cdnDomain, str_replace('%2F','/', rawurlencode($key)));
        }
        return sprintf('https://%s.s3.%s.amazonaws.com/%s', $bucket, $region, str_replace('%2F','/', rawurlencode($key)));
    }


    /**
     * If the incoming bytes represent an image and Imagick is available, convert to a single-page PDF.
     * Returns an array of [body, mime, originalName].
     */
    private function ensurePdfForImages(string $body, string $mime, string $originalName): array
    {
        $isImageMime = str_starts_with(strtolower($mime), 'image/');
        $isImageName = (bool) preg_match('/\.(jpe?g|png|webp)$/i', $originalName ?? '');
        $imagickAvailable = class_exists(\Imagick::class);

        if (!$imagickAvailable || (!$isImageMime && !$isImageName)) {
            return [$body, $mime, $originalName];
        }

        try {
            $img = new \Imagick();
            $img->setResolution(144, 144);
            $img->readImageBlob($body);
            // Flatten transparency onto white
            if ($img->getImageAlphaChannel()) {
                $img->setImageBackgroundColor('white');
                $img = $img->mergeImageLayers(\Imagick::LAYERMETHOD_FLATTEN);
            }
            $img->setImageFormat('pdf');
            $pdfBytes = $img->getImagesBlob();
            $img->clear();
            $img->destroy();

            $newName = $this->replaceExtension($originalName ?: 'upload', 'pdf');
            return [$pdfBytes, 'application/pdf', $newName];
        } catch (\Throwable $e) {
            // If conversion fails for any reason, fall back to original bytes/mime
            return [$body, $mime, $originalName];
        }
    }

    /** Replace the filename extension with a new one (without dot). */
    private function replaceExtension(string $name, string $newExt): string
    {
        $newExt = ltrim($newExt, '.');
        $pos = strrpos($name, '.');
        if ($pos === false) {
            return $name . '.' . $newExt;
        }
        return substr($name, 0, $pos) . '.' . $newExt;
    }

    /**
     * Resolve the ledger period (MM/YY) date used for naming.
     * Priority:
     *  1) Explicit $dateForName
     *  2) Parse from description pattern like "..._MM-YY"
     *  3) Fallback to now()
     */
    private function resolveLedgerPeriodDate(?\DateTimeInterface $dateForName, ?string $description): \DateTimeInterface
    {
        if ($dateForName instanceof \DateTimeInterface) {
            return \DateTimeImmutable::createFromInterface($dateForName);
        }
        if (is_string($description) && preg_match('/_(\d{2})-(\d{2})(?:\b|$)/', $description, $m)) {
            $mm = (int) $m[1];
            $yy = (int) $m[2];
            $yyyy = 2000 + $yy; // assume 20YY
            try {
                return new \DateTimeImmutable(sprintf('%04d-%02d-01', $yyyy, $mm));
            } catch (\Throwable $e) { /* ignore and fallback */ }
        }
        return new \DateTimeImmutable();
    }

    // ----------------------
    // Naming helpers (single source of truth for report files)
    // ----------------------

    /** Build a stable, lowercase slug for a unit (used in filenames & descriptions). */
    public function buildUnitSlug($unit): string
    {
        $raw = null;
        if (is_object($unit)) {
            if (method_exists($unit, 'getName') && $unit->getName()) {
                $raw = $unit->getName();
            } elseif (method_exists($unit, 'getUnitName') && $unit->getUnitName()) {
                $raw = $unit->getUnitName();
            } elseif (method_exists($unit, 'getListingName') && $unit->getListingName()) {
                $raw = $unit->getListingName();
            } elseif (method_exists($unit, 'getId')) {
                $raw = 'unit-' . $unit->getId();
            }
        } elseif (is_array($unit)) {
            $raw = $unit['unitName'] ?? $unit['name'] ?? ($unit['id'] ?? 'unit');
        }
        if (!is_string($raw) || $raw === '') {
            $raw = 'unit';
        }
        // slugify then normalize to underscores (safer across systems)
        $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', (string) $raw), '-'));
        return str_replace('-', '_', $slug);
    }

    /** Report description for S3/object names and UnitDocument descriptions. */
    public function buildReportDescription($unit, string $yearMonth): string
    {
        $slug = $this->buildUnitSlug($unit);
        $mm = substr($yearMonth, 5, 2);
        $yy = substr($yearMonth, 2, 2);
        return sprintf('%s_reporte-mensual_%s-%s', $slug, $mm, $yy);
    }

    /** Original filename for owner report PDFs, e.g. owner_report_20_2025-08.pdf */
    public function buildReportOriginalName(int $unitId, string $yearMonth): string
    {
        return sprintf('owner_report_%d_%s.pdf', $unitId, $yearMonth);
    }

    // ----------------------
    // Helpers
    // ----------------------

    private function toStringOrNull($val): ?string
    {
        if ($val === null) {
            return null;
        }
        // If already a non-empty string
        if (is_string($val)) {
            $s = trim($val);
            return $s !== '' ? $s : null;
        }
        // Scalars (int, float, bool) -> string
        if (is_scalar($val)) {
            $s = trim((string)$val);
            return $s !== '' ? $s : null;
        }
        // Objects: try common accessors, then __toString
        if (is_object($val)) {
            if (method_exists($val, 'getName')) {
                $s = trim((string)$val->getName());
                if ($s !== '') {
                    return $s;
                }
            }
            if (method_exists($val, 'getLabel')) {
                $s = trim((string)$val->getLabel());
                if ($s !== '') {
                    return $s;
                }
            }
            if (method_exists($val, '__toString')) {
                $s = trim((string)$val);
                if ($s !== '') {
                    return $s;
                }
            }
        }
        return null;
    }

    private function safeExtension(UploadedFile $file): ?string
    {
        // Prefer guessed extension; fall back to client one
        $ext = $file->guessExtension() ?: $file->getClientOriginalExtension();
        if (is_string($ext) && $ext !== '') {
            // whitelisting common doc/image/pdf types; extend as needed
            $allowed = ['pdf','jpg','jpeg','png','webp','doc','docx','xls','xlsx','csv','txt'];
            return in_array(strtolower($ext), $allowed, true) ? strtolower($ext) : 'bin';
        }
        return null;
    }

    private function safeExtensionFromNameOrMime(?string $name, ?string $mime): ?string
    {
        $allowed = ['pdf','jpg','jpeg','png','webp','doc','docx','xls','xlsx','csv','txt'];
        // Try by name first
        if ($name) {
            $dot = strrpos($name, '.');
            if ($dot !== false) {
                $ext = strtolower(substr($name, $dot + 1));
                if (in_array($ext, $allowed, true)) {
                    return $ext;
                }
            }
        }
        // Fallback by mime
        $map = [
            'application/pdf' => 'pdf',
            'image/jpeg'      => 'jpg',
            'image/png'       => 'png',
            'image/webp'      => 'webp',
            'text/plain'      => 'txt',
            'text/csv'        => 'csv',
            'application/vnd.ms-excel' => 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        ];
        if ($mime && isset($map[$mime])) {
            return $map[$mime];
        }
        return 'bin';
    }

    /** Unit name with separators removed, preserves original case; falls back to slugUnitName(). */
    private function unitNameNoSeparators(Unit $unit): string
    {
        if (method_exists($unit, 'getUnitName')) {
            $val = (string) $unit->getUnitName();
            if ($val !== '') {
                return preg_replace('/[^A-Za-z0-9]/', '', $val);
            }
        }
        // Fallback to existing slug (lowercase alnum) to ensure something stable
        return $this->slugUnitName($unit);
    }

    private function buildBaseName(
        ?Unit $unit,
        ?string $category,
        ?string $description,
        ?\DateTimeInterface $dateForName,
        string $transactionType
    ): string {
        // Special naming for ledger uploads based on entry_type/category
        if ($transactionType === 'ledger' && $category && $unit) {
            $label = strtolower(trim($category));
            // normalize accents/whitespace
            $label = preg_replace('/\s+/', ' ', iconv('UTF-8', 'ASCII//TRANSLIT', $label) ?: $label);
            $periodDate = $this->resolveLedgerPeriodDate($dateForName, $description);
            $yymm = $periodDate->format('ym');
            // Ledger: use new patterns for specific categories
            if ($label === 'report' || $label === 'month report' || str_contains($label, 'month report')) {
                // Month Report → <yymm>_report
                return $yymm . '_report';
            }
            if ($label === 'client report payment' || str_contains($label, 'client report payment')) {
                // Client Report Payment → <yymm>_client_payment
                return $yymm . '_client_payment';
            }
            if ($label === 'o2 payment' || str_contains($label, 'o2 payment')) {
                // O2 Payment → <yymm>_o2_payment
                return $yymm . '_o2_payment';
            }
            // Fallback: keep previous behavior for other ledger categories
        }

        $unitSlug = $unit ? $this->slugUnitName($unit) : 'housekeepers';
        $catSlug  = $category ? $this->slug($category) : 'uncategorized';
        $descSlug = $description ? $this->slug($description) : 'doc';
        $when     = ($dateForName ?: new \DateTimeImmutable())->format('ym'); // yymm

        if ($transactionType === 'hk') {
            // HK: unitname_category_description_yymm
            return $unitSlug . '_' . $catSlug . '_' . $descSlug . '_' . $when;
        }

        if ($transactionType === 'unit') {
            // Unit TRANSACTION uploads: unitId_description_YYYYMMDD (uniqueness suffix added later)
            $unitIdForName = ($unit && method_exists($unit, 'getId')) ? (string)$unit->getId() : 'unit';
            $yyyymmdd = ($dateForName ?: new \DateTimeImmutable())->format('Ymd');
            return $unitIdForName . '_' . $descSlug . '_' . $yyyymmdd;
        }

        // Fallback/default
        return $unitSlug . '_' . $descSlug . '_' . $when;
    }

    private function ensureUniqueS3Key(S3Client $s3, string $bucket, string $keyPrefix, string $baseName, ?string $ext): array
    {
        // Avoid any S3 HEAD/GET checks (403s in some IAM setups). Generate a unique name locally.
        $safePrefix = rtrim($keyPrefix, '/');
        $safeBase   = $baseName !== '' ? $baseName : 'document';
        $isReports = str_starts_with($safePrefix, 'reports/');
        $sep = $isReports ? '_' : '__';
        $suffix = gmdate('Ymd_His') . '_' . substr(bin2hex(random_bytes(4)), 0, 8);
        $candidateName = $safeBase . $sep . $suffix . ($ext ? ".{$ext}" : '');
        $candidateKey  = $safePrefix . '/' . $candidateName;
        return [$candidateKey, $candidateName];
    }

    private function slug(string $value): string
    {
        return strtolower($this->slugger->slug($value)->toString());
    }

    private function slugUnitName(Unit $unit): string
    {
        // Prefer the Unit's own name when available
        if (method_exists($unit, 'getUnitName')) {
            $uName = (string) $unit->getUnitName();
            if ($uName !== '') {
                // Use the project slugger to normalize, then strip non-alphanumerics just in case
                $slug = strtolower($this->slugger->slug($uName)->toString());
                return preg_replace('/[^a-z0-9]/', '', $slug);
            }
        }

        // Fallback: condo name + unit number (no separators), lowercased and alphanumeric only
        $condoName = null;
        $unitNum   = '';

        if (method_exists($unit, 'getCondo')) {
            $condoEntity = $unit->getCondo();
            if ($condoEntity) {
                if (method_exists($condoEntity, 'getName')) {
                    $condoName = (string) $condoEntity->getName();
                } elseif (method_exists($condoEntity, 'getCondoName')) {
                    $condoName = (string) $condoEntity->getCondoName();
                } elseif (method_exists($condoEntity, '__toString')) {
                    $condoName = (string) $condoEntity;
                }
            }
        }

        if (method_exists($unit, 'getUnitNumber') && $unit->getUnitNumber() !== null) {
            $unitNum = (string) $unit->getUnitNumber();
        }

        if ($condoName) {
            $joined = $condoName . $unitNum;
            return preg_replace('/[^a-z0-9]/', '', strtolower($joined));
        }

        // Last resort: literal 'unit'
        return 'unit';
    }
    /**
     * Attach an existing UnitDocument to a target using AttachOptions.
     *
     * @param int|UnitDocument $documentOrId
     * @param AttachOptions $opts
     * @return UnitDocumentAttachment
     * @throws BadRequestHttpException if the document is not found
     */
    public function attachExistingDocument(int|UnitDocument $documentOrId, AttachOptions $opts): UnitDocumentAttachment
    {
        if ($documentOrId instanceof UnitDocument) {
            $document = $documentOrId;
        } elseif (is_int($documentOrId)) {
            $document = $this->em->getRepository(UnitDocument::class)->find($documentOrId);
            if (!$document) {
                throw new BadRequestHttpException('Document not found for attachment.');
            }
        } else {
            throw new BadRequestHttpException('Invalid document reference.');
        }
        return $this->attach($document, $opts);
    }

    /**
     * Attach a document to a target with either replace or allow-many behavior.
     */
    public function attach(UnitDocument $document, AttachOptions $opts): UnitDocumentAttachment
    {
        // Replacement policy
        if ($opts->mode === 'replace') {
            if ($opts->scope === 'per-parent') {
                $this->attachmentRepo->deleteByTarget($opts->targetType, $opts->targetId);
            } else { // per-category
                $this->attachmentRepo->deleteByTargetAndCategory($opts->targetType, $opts->targetId, $opts->category);
            }
        }

        // Create the attachment
        $att = (new UnitDocumentAttachment())
            ->setDocument($document)
            ->setTargetType($opts->targetType)
            ->setTargetId($opts->targetId)
            ->setCategory($opts->category);

        // Special handling for Employee Cash Ledger attachments:
        //  - UnitDocument.category = "Cash Ledger"
        //  - UnitDocument.label    = "Cash Ledger"
        //  - UnitDocument.filename starts with "cash_"
        //  - UnitDocumentAttachment.category = "Cash Ledger"
        if ($opts->targetType === 'employee_cash_ledger') {
            if (method_exists($document, 'setCategory')) {
                $document->setCategory('Cash Ledger');
            }
            if (method_exists($document, 'setLabel')) {
                $document->setLabel('Cash Ledger');
            }
            if (method_exists($document, 'getFilename') && method_exists($document, 'setFilename')) {
                $currentName = $document->getFilename();
                if (is_string($currentName) && $currentName !== '' && !str_starts_with($currentName, 'cash_')) {
                    $document->setFilename('cash_' . $currentName);
                }
            }
            $att->setCategory('Cash Ledger');
            $this->em->persist($document);
        }

        // Special handling for Employee Task attachments:
        //  - UnitDocument.label    = "Tasks"
        //  - UnitDocumentAttachment.category = "Tasks"
        if ($opts->targetType === 'employee_task') {
            if (method_exists($document, 'setLabel')) {
                $document->setLabel('Tasks');
            }
            if (method_exists($att, 'setCategory')) {
                $att->setCategory('Tasks');
            }
            $this->em->persist($document);
        }

        // If this is a unit_transactions attachment, label the document accordingly
        if ($opts->targetType === 'unit_transactions' && method_exists($document, 'setLabel')) {
            $document->setLabel('Unit Transactions');
            $this->em->persist($document);
        }

        $this->em->persist($att);
        $this->em->flush();

        return $att;
    }

    /**
     * Convenience: upload a file (existing DTO flow) and immediately attach it.
     * Returns the newly created attachment.
     */
    public function uploadAndAttach(UploadRequestDTO $req, AttachOptions $opts): UnitDocumentAttachment
    {
        $doc = $this->upload($req);
        return $this->attach($doc, $opts);
    }
    /** Delete a UnitDocument: remove from S3 (best-effort) and DB. */
    public function delete(UnitDocument $doc): void
    {
        $bucket = $_ENV['AWS_S3_BUCKET'] ?? getenv('AWS_S3_BUCKET') ?: 'owners2-unit-documents';
        $region = $_ENV['AWS_S3_REGION'] ?? getenv('AWS_S3_REGION') ?: 'us-east-2';
        $baseConfig = [ 'version' => 'latest', 'region' => $region, 'use_path_style_endpoint' => false ];
        $awsKey    = $_ENV['AWS_ACCESS_KEY_ID'] ?? getenv('AWS_ACCESS_KEY_ID') ?: null;
        $awsSecret = $_ENV['AWS_SECRET_ACCESS_KEY'] ?? getenv('AWS_SECRET_ACCESS_KEY') ?: null;
        if ($awsKey && $awsSecret) { $baseConfig['credentials'] = ['key'=>$awsKey,'secret'=>$awsSecret]; }
        $s3 = new S3Client($baseConfig);

        $url = null;
        if (method_exists($doc, 'getS3Url') && $doc->getS3Url()) { $url = $doc->getS3Url(); }
        elseif (method_exists($doc, 'getDocumentUrl') && $doc->getDocumentUrl()) { $url = $doc->getDocumentUrl(); }
        elseif (method_exists($doc, 'getFilepath') && $doc->getFilepath()) { $url = $doc->getFilepath(); }

        // Derive key from URL if possible
        if (is_string($url) && $url !== '') {
            $parts = parse_url($url);
            if (!empty($parts['path'])) {
                $key = ltrim(rawurldecode($parts['path']), '/');
                try { $s3->deleteObject(['Bucket'=>$bucket,'Key'=>$key]); } catch (\Throwable $e) { /* best-effort */ }
            }
        }

        $this->em->remove($doc);
        $this->em->flush();
    }
}

/**
 * Simple data carrier for upload requests.
 */
class UploadRequestDTO
{
    public function __construct(
        public ?int $unitId = null,
        public ?int $transactionId = null,
        public string $transactionType = 'unit', // 'unit' | 'hk' | 'ledger' | 'o2' | 'task'
        public ?string $category = null,
        public ?string $description = null,
        public ?string $customToken = null,       // e.g. "tx987" or confirmation code
        public ?\DateTimeInterface $dateForName = null,
        public ?string $bytes = null,             // raw file bytes
        public ?string $mime = null,              // e.g. application/pdf
        public ?string $originalName = null,      // suggested filename
        public ?UploadedFile $file = null,
        // o2-specific fields
        public ?string $costCentre = null,
        public ?int $categoryId = null,
        public ?string $txType = null
    ) { }
}