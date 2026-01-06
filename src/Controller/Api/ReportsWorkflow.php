<?php

namespace App\Controller\Api;

use Doctrine\ORM\EntityManagerInterface;
use Aws\S3\S3Client;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use App\Entity\Unit;
use Symfony\Component\HttpFoundation\Response;
use Doctrine\DBAL\Connection;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use App\Service\DocumentUploadService;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Mime\Part\Multipart\FormDataPart;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use App\Repository\UnitDocumentRepository;
use App\Entity\UnitDocument;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Email;

class ReportsWorkflow extends AbstractController
{
    /** @var S3Client|null */
    private ?S3Client $s3 = null;
    private string $s3Bucket;
    private int $presignTtl;

    public function __construct(?S3Client $s3 = null)
    {
        $this->s3Bucket = $_ENV['AWS_S3_BUCKET'] ?? 'owners2-unit-documents';
        $this->presignTtl = (int)($_ENV['REPORTS_PRESIGN_TTL'] ?? 900); // seconds

        if ($s3 instanceof S3Client) {
            $this->s3 = $s3;
        } else {
            // Lazily create an S3 client using environment/instance-role credentials
            $region = getenv('AWS_DEFAULT_REGION') ?: 'us-east-2';
            try {
                $this->s3 = new S3Client([
                    'version' => 'latest',
                    'region'  => $region,
                    // Credentials are resolved automatically from env/metadata if not provided
                ]);
            } catch (\Throwable $e) {
                // Defer failure until first use to avoid controller instantiation fatal
                $this->s3 = null;
            }
        }
    }
    private function ymToToken(string $yearMonth): string
    {
        // Convert YYYY-MM to MM-YY (e.g., 2025-08 -> 08-25)
        if (!preg_match('/^(\\d{4})-(\\d{2})$/', $yearMonth, $m)) {
            return $yearMonth; // fallback if format unexpected
        }
        $yy = substr($m[1], -2);
        return $m[2] . '-' . $yy;
    }

    private function extractS3KeyFromUrl(?string $url): ?string
    {
        if (!$url) { return null; }
        // Handle virtual-hosted–style and path-style URLs.
        $parts = parse_url($url);
        if (!isset($parts['path'])) { return null; }
        $path = ltrim($parts['path'], '/');
        // If the host already contains the bucket (virtual-hosted style), path is the key.
        // If path-style like /bucket/key, drop the first segment when it matches our bucket.
        if (!empty($parts['host']) && str_contains($parts['host'], '.amazonaws.com')) {
            // Check for path-style where path starts with bucket
            $firstSlash = strpos($path, '/');
            if ($firstSlash !== false) {
                $firstSegment = substr($path, 0, $firstSlash);
                if ($firstSegment === $this->s3Bucket) {
                    return substr($path, $firstSlash + 1);
                }
            }
            return $path;
        }
        // If it's just a plain path we already store, return as-is
        return $path ?: null;
    }

    private function slugify(string $text): string
    {
        $text = trim((string)$text);
        if ($text === '') {
            return 'unit';
        }

        // Normalize to lowercase (ASCII-safe fallback below)
        $lower = function (string $s): string {
            return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
        };

        $text = $lower($text);

        // Try best-effort transliteration without hard dependency on iconv/intl
        $ascii = $text;
        if (function_exists('iconv')) {
            $out = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
            if (is_string($out) && $out !== '') {
                $ascii = $out;
            }
        } elseif (class_exists('Transliterator')) {
            $tr = \Transliterator::create('Any-Latin; Latin-ASCII; [:Nonspacing Mark:] Remove; NFC');
            if ($tr) {
                $out = $tr->transliterate($text);
                if (is_string($out) && $out !== '') {
                    $ascii = $out;
                }
            }
        }

        // Keep only a-z, 0-9 and replace other sequences with dashes
        $ascii = preg_replace('~[^a-z0-9]+~', '-', $ascii);
        $ascii = trim($ascii, '-');

        return $ascii !== '' ? $ascii : 'unit';
    }

    private function buildReportFilename(EntityManagerInterface $em, int $unitId, string $yearMonth): string
    {
        // Format: <unit-slug>_reporte-mensual_<MM-YY>_<YYMM>__01.pdf
        // Prefer the canonical unit_name (e.g., "Singular_111" → "Singular111")
        $unitName = 'unit-'.$unitId;
        try {
            $unit = $em->getRepository(Unit::class)->find($unitId);
            if ($unit) {
                $candidates = [];

                // 1) Strong preference: explicit unit_name field if available
                if (method_exists($unit, 'getUnitName')) { $candidates[] = $unit->getUnitName(); }

                // 2) Fallbacks (only if unit_name is empty)
                if (method_exists($unit, 'getName'))         { $candidates[] = $unit->getName(); }
                if (method_exists($unit, 'getListingName'))  { $candidates[] = $unit->getListingName(); }
                if (method_exists($unit, 'getTitle'))        { $candidates[] = $unit->getTitle(); }
                if (method_exists($unit, 'getDisplayName'))  { $candidates[] = $unit->getDisplayName(); }
                if (method_exists($unit, 'getCode'))         { $candidates[] = $unit->getCode(); }
                if (method_exists($unit, 'getShortName'))    { $candidates[] = $unit->getShortName(); }

                foreach ($candidates as $cand) {
                    $cand = is_string($cand) ? trim($cand) : (is_object($cand) && method_exists($cand, '__toString') ? trim((string)$cand) : '');
                    if ($cand !== '') { $unitName = $cand; break; }
                }
            }
        } catch (\Throwable $e) {
            // ignore; fall back to generic name
        }

        // Transform "Singular_111" → "Singular111" and strip any non-alphanumerics (keep case)
        $base = preg_replace('/[_\s]+/', '', (string)$unitName);
        $base = preg_replace('/[^A-Za-z0-9]/', '', $base);
        if ($base === '') {
            $base = 'unit'.$unitId;
        }
        $mmYY = $this->ymToToken($yearMonth); // 08-25
        // YYMM token like 2508
        if (preg_match('/^(\d{4})-(\d{2})$/', $yearMonth, $m)) {
            $yy = substr($m[1], -2);
            $yymm = $yy . $m[2];
        } else {
            $yymm = str_replace('-', '', substr($yearMonth, 2));
        }
        return sprintf('%s_reporte-mensual-%s_%s__01.pdf', $base, $mmYY, $yymm);
    }
    /**
     * Owner Workflow overview for a given month.
     *
     * Query params:
     *  - yearMonth: YYYY-MM (defaults to current month)
     *  - city: optional exact match filter
     *  - q: optional free text (unit name contains)
     *
     * Response shape:
     *  {
     *    "yearMonth": "2025-08",
     *    "summary": { "units": 0, "reportsSent": 0, "paymentsDone": 0, "emailsSent": 0 },
     *    "rows": [
     *       { "unitId": 0, "unitName": "...", "city": "...",
     *         "report": "Not issued", "payment": "Pending", "email": "Pending",
     *         "lastUpdatedAt": "ISO8601" }
     *    ]
     *  }
     */
    #[Route('/api/owner-workflow', name: 'api_owner_workflow', methods: ['GET'])]
    public function ownerWorkflow(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $yearMonth = $request->query->get('yearMonth') ?: (new \DateTimeImmutable('today'))->format('Y-m');
        $city      = $request->query->get('city');
        $q         = $request->query->get('q'); // free text search on unit name (if available)

        $conn = $em->getConnection();

        // Compute next month window (inclusive start, exclusive end) for REPORT_POSTING lookup
        try {
            $baseMonth = \DateTimeImmutable::createFromFormat('Y-m', $yearMonth);
            if (!$baseMonth) {
                throw new \RuntimeException('Invalid yearMonth format');
            }
            $nextStart = $baseMonth->modify('first day of next month')->setTime(0, 0, 0);
            $nextEnd   = $nextStart->modify('first day of next month')->setTime(0, 0, 0);
            $nextStartStr = $nextStart->format('Y-m-d'); // e.g., 2025-09-01
            $nextEndStr   = $nextEnd->format('Y-m-d');   // e.g., 2025-10-01
        } catch (\Throwable $e) {
            // Fallback: treat as no next-month window if parsing fails
            $nextStartStr = null;
            $nextEndStr   = null;
        }

        // Params for SQL variants
        $params = ['ym' => $yearMonth];
        $whereExtra = '';
        if ($city) {
            $whereExtra .= " AND bms.city = :city";
            $params['city'] = $city;
        }

        // Stable base: list units from booking_month_slice for the month; we'll enrich with Doctrine per-unit lookups
        $sql = "
            SELECT
                bms.unit_id                         AS unitId,
                MAX(COALESCE(bms.city, ''))         AS city
            FROM booking_month_slice bms
            WHERE bms.year_month = :ym{$whereExtra}
            GROUP BY bms.unit_id
            ORDER BY MAX(COALESCE(bms.city, '')) ASC, bms.unit_id ASC
        ";

        try {
            $rows = $conn->fetchAllAssociative($sql, $params) ?: [];
        } catch (\Throwable $e) {
            return new JsonResponse([
                'error' => 'DB query failed',
                'message' => $e->getMessage(),
                'params' => $params,
            ], 500);
        }

        // Map to API rows and enrich with Doctrine — fetch Unit + OwnerReportCycle(reportIssuedAt)
        $apiRows = [];
        $nowIso  = (new \DateTimeImmutable('now'))->format(DATE_ATOM);

        $unitRepo  = $em->getRepository(Unit::class);

        foreach ($rows as $r) {
            $unitId  = (int)($r['unitId'] ?? 0);
            $cityVal = trim((string)($r['city'] ?? ''));

            $unit = $unitId ? $unitRepo->find($unitId) : null;
            $unitName = $unit && method_exists($unit, 'getName') ? (string)$unit->getName() : ($unitId > 0 ? ('Unit #'.$unitId) : 'Unknown unit');

            $issuedAtIso = null;
            try {
                $issuedAtRaw = null;
                if ($nextStartStr !== null && $nextEndStr !== null) {
                    $issuedAtRaw = $conn->fetchOne(
                        "SELECT COALESCE(created_at, txn_date)
                         FROM unit_balance_ledger
                         WHERE unit_id = :uid
                           AND entry_type = 'REPORT_POSTING'
                           AND txn_date >= :nextStart
                           AND txn_date < :nextEnd
                         ORDER BY id DESC
                         LIMIT 1",
                        ['uid' => $unitId, 'nextStart' => $nextStartStr, 'nextEnd' => $nextEndStr]
                    );
                }
                if (!empty($issuedAtRaw)) {
                    // Normalize to ISO 8601
                    $issuedAtIso = (new \DateTimeImmutable($issuedAtRaw))->format(DATE_ATOM);
                }
            } catch (\Throwable $e) {
                // ignore; leave $issuedAtIso = null
            }

            $apiRows[] = [
                'unitId'        => $unitId,
                'unitName'      => $unitName,
                'city'          => $cityVal,
                'report'        => $issuedAtIso ? 'Done' : 'Not issued',
                'payment'       => 'Pending',
                'email'         => 'Pending',
                'reportIssuedAt'=> $issuedAtIso,
                'lastUpdatedAt' => $nowIso,
            ];
        }

        // Sort rows alphabetically by unitName
        usort($apiRows, function ($a, $b) {
            return strcasecmp($a['unitName'], $b['unitName']);
        });

        // Summary counts: reportsSent is count of rows with non-null reportIssuedAt
        $summary = [
            'units'        => count($apiRows),
            'reportsSent'  => count(array_filter($apiRows, fn($r) => !empty($r['reportIssuedAt']))),
            'paymentsDone' => 0,
            'emailsSent'   => 0,
        ];

        return new JsonResponse([
            'yearMonth' => $yearMonth,
            'summary'   => $summary,
            'rows'      => $apiRows,
        ]);
    }

    #[Route('/api/reports/generate-ledger', name: 'api_reports_generate_ledger', methods: ['POST'])]
    public function generateReport(Request $request, EntityManagerInterface $em, ?DocumentUploadService $uploader, \Psr\Log\LoggerInterface $logger): JsonResponse
    {
        try {
        // Create an HTTP client locally to avoid autowire failures at controller dispatch
        $http = \Symfony\Component\HttpClient\HttpClient::create();
        // Robust payload extraction: JSON first, then form, then empty array
        $payload = [];
        $raw = $request->getContent();
        if ($raw !== '' && $raw !== null) {
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $payload = $decoded;
            }
        }
        if (!$payload) {
            // Accept application/x-www-form-urlencoded as fallback
            $payload = $request->request->all();
        }
        if (!is_array($payload)) {
            $payload = [];
        }
        $unitId     = isset($payload['unitId']) ? (int)$payload['unitId'] : 0;
        $yearMonth  = isset($payload['yearMonth']) ? (string)$payload['yearMonth'] : null; // YYYY-MM
        // Accept several keys for closing balance; coerce to float when possible
        $amountInRaw = $payload['closingBalance']
            ?? $payload['closing_balance']
            ?? $payload['amount']
            ?? $payload['balance']
            ?? $payload['closing']
            ?? null;
        // Optional replace/overwrite signal from client
        $replaceRaw = $payload['replace'] ?? $payload['overwrite'] ?? null;
        $replace = false;
        if ($replaceRaw !== null) {
            $truthy = [true, 1, '1', 'true', 'TRUE', 'yes', 'on'];
            $replace = in_array($replaceRaw, $truthy, true);
        }
        $amountIn = null;
        if ($amountInRaw !== null) {
            // Normalize decimal separator and cast
            if (is_string($amountInRaw)) {
                $amountInRaw = str_replace([',', ' '], ['', ''], $amountInRaw);
            }
            if (is_numeric($amountInRaw)) {
                $amountIn = (float)$amountInRaw;
            }
        }

        if ($unitId <= 0 || !$yearMonth) {
            return new JsonResponse([
                'error' => 'invalid_request',
                'message' => 'Provide unitId (int) and yearMonth (YYYY-MM).'
            ], Response::HTTP_BAD_REQUEST);
        }
        $logger->info('[ReportsWorkflow] generate-ledger entry', [
            'unitId' => $unitId,
            'yearMonth' => $yearMonth,
            'hasUploader' => $uploader !== null,
        ]);

        // If no amount provided, auto-fetch from our summary endpoint
        if ($amountIn === null) {
            try {
                $base = $request->getSchemeAndHttpHost();
                $url  = $base . '/api/client_monthly_summary?yearMonth=' . urlencode($yearMonth) . '&unitId=' . urlencode((string)$unitId);
                $resp = $http->request('GET', $url, [
                    // Forward auth header if present, so the internal call has permission
                    'headers' => array_filter([
                        'Authorization' => $request->headers->get('Authorization'),
                        'Accept'        => 'application/json',
                    ]),
                ]);
                if ($resp->getStatusCode() === 200) {
                    $data = $resp->toArray(false);
                    if (is_array($data) && isset($data[0]['closingBalance'])) {
                        $cb = $data[0]['closingBalance'];
                        if (is_string($cb)) {
                            $cb = str_replace([',', ' '], ['', ''], $cb);
                        }
                        if (is_numeric($cb)) {
                            $amountIn = (float)$cb;
                        }
                    }
                }
            } catch (\Throwable $e) {
                // swallow; will default to 0 if not retrievable
            }
        }

        // Resolve yymm for reference and compute cutoff (last day of month) and nextMonthFirst (first day of next month)
        try {
            $monthStart      = new \DateTimeImmutable($yearMonth.'-01');
            $yymm            = $monthStart->format('ym');
            $cutoffDateObj   = $monthStart->modify('last day of this month');
            $nextMonthFirst  = $monthStart->modify('first day of next month');
        } catch (\Throwable $e) {
            return new JsonResponse([
                'error' => 'invalid_date',
                'message' => 'yearMonth must be YYYY-MM',
            ], Response::HTTP_BAD_REQUEST);
        }

        $conn = $em->getConnection();

        // Compute previous balance as-of cutoff (end of report month).
        // Only include transactions with txn_date <= cutoff to freeze the snapshot.
        $balanceBefore = 0.0;
        try {
            $sqlPrev = "SELECT ROUND(COALESCE(SUM(b.amount),0), 2) AS bal
                        FROM unit_balance_ledger b
                        WHERE b.unit_id = :uid
                          AND b.txn_date <= :cutoff";
            $balanceBefore = (float)($conn->fetchOne($sqlPrev, [
                'uid'    => $unitId,
                'cutoff' => $cutoffDateObj->format('Y-m-d'),
            ]) ?? 0);
        } catch (\Throwable $e) {
            // non-fatal, keep 0
        }
        $logger->info('[ReportsWorkflow] balanceBefore cutoff applied', [
            'unitId'        => $unitId,
            'yearMonth'     => $yearMonth,
            'cutoff'        => $cutoffDateObj->format('Y-m-d'),
            'balanceBefore' => $balanceBefore,
        ]);

        // Amount should be the closing balance for this report. If not provided, default to 0.0 for now.
        $amount = ($amountIn !== null && is_numeric($amountIn)) ? (float)$amountIn : 0.0;
        // For REPORT_POSTING, treat the amount as the opening balance of the next month.
        // Balance after this posting should equal the report's closing amount (independent of prior running total).
        $balanceAfter = round($amount, 2);

        // Build reference like Client Report yymm
        $reference = sprintf('Client Report %s', $yymm);
        $logger->info('[ReportsWorkflow] generate-ledger start', ['unitId' => $unitId, 'yearMonth' => $yearMonth, 'reference' => $reference]);

        // Idempotency guard: if a REPORT_POSTING already exists for (unit, yearmonth), return it or delete if replace requested
        try {
            $existingId = $conn->fetchOne(
                "SELECT id FROM unit_balance_ledger WHERE unit_id = :uid AND yearmonth = :ym AND entry_type = 'REPORT_POSTING' LIMIT 1",
                ['uid' => $unitId, 'ym' => $yearMonth]
            );
            if ($existingId) {
                if ($replace) {
                    // Delete existing document (per-ledger + category) and ledger row in a TX, then proceed to re-insert
                    $conn->beginTransaction();
                    try {
                        // Remove any UnitDocument linked to this ledger with category REPORT
                        $conn->executeStatement(
                            "DELETE FROM unit_document WHERE ledger_id = :lid AND category = 'REPORT'",
                            ['lid' => (int)$existingId]
                        );
                        // Remove the existing ledger row
                        $conn->executeStatement(
                            "DELETE FROM unit_balance_ledger WHERE id = :lid",
                            ['lid' => (int)$existingId]
                        );
                        $conn->commit();
                        $logger->info('[ReportsWorkflow] replace=true -> deleted existing REPORT_POSTING and attached document', ['ledgerId' => (int)$existingId]);
                    } catch (\Throwable $txe) {
                        try { $conn->rollBack(); } catch (\Throwable $ignored) {}
                        $logger->error('[ReportsWorkflow] replace delete failed', ['error' => $txe->getMessage()]);
                        return new JsonResponse([
                            'error' => 'replace_failed',
                            'message' => $txe->getMessage(),
                        ], Response::HTTP_INTERNAL_SERVER_ERROR);
                    }
                    // fall through to normal insert path below
                } else {
                    $row = $conn->fetchAssociative(
                        "SELECT amount, balance_after FROM unit_balance_ledger WHERE id = :lid",
                        ['lid' => (int)$existingId]
                    ) ?: ['amount' => $amount, 'balance_after' => $amount];
                    return new JsonResponse([
                        'ok' => true,
                        'endpoint' => 'generate-ledger',
                        'existing' => true,
                        'ledgerId' => (int)$existingId,
                        'unitId' => $unitId,
                        'yearMonth' => $yearMonth,
                        'reference' => sprintf('Client Report %s', $yymm),
                        'amount' => number_format((float)($row['amount'] ?? $amount), 2, '.', ''),
                        'balanceBefore' => number_format($balanceBefore, 2, '.', ''),
                        'balanceAfter' => number_format((float)($row['balance_after'] ?? $amount), 2, '.', ''),
                        'documentId' => null,
                        'publicUrl'  => null,
                        'note' => 'REPORT_POSTING already exists for this unit/month. Returning existing row.',
                    ], Response::HTTP_OK);
                }
            }
        } catch (\Throwable $e) {
            // ignore and fall through to insert
        }

        // Insert ledger row via DBAL to avoid entity mismatches.
        $now = (new \DateTimeImmutable('now'));
        $nowSqlDate = $now->format('Y-m-d');
        $createdAt  = $now->format('Y-m-d');
        // The txn_date for REPORT_POSTING is set to the first day of the next month (nextMonthFirst).

        try {
            $sql = "INSERT INTO `unit_balance_ledger` (`unit_id`,`yearmonth`,`entry_type`,`amount`,`balance_after`,`payment_method`,`reference`,`note`,`created_at`,`created_by`,`txn_date`)
                    VALUES (:unit_id, :yearmonth, :entry_type, :amount, :balance_after, :payment_method, :reference, :note, :created_at, :created_by, :txn_date)";

            $params = [
                'unit_id'        => $unitId,
                'yearmonth'      => $yearMonth,
                'entry_type'     => 'REPORT_POSTING',
                'amount'         => $amount,
                'balance_after'  => $balanceAfter,
                'payment_method' => null,
                'reference'      => $reference,
                'note'           => null,
                'created_at'     => $createdAt,
                'created_by'     => 'system',
                'txn_date'       => $nextMonthFirst->format('Y-m-d'),
            ];

            $conn->executeStatement($sql, $params);
            $ledgerId = (int)$conn->lastInsertId();

            // --- Step 2: Fetch preview PDF as bytes and upload (no local file writes) ---
            $documentId = null;
            $publicUrl  = null;
            $uploaded = false;

            // Compute filename for report
            $fileName = $this->buildReportFilename($em, $unitId, $yearMonth);

            try {
                $base   = $request->getSchemeAndHttpHost();
                $genUrl = $base . '/api/reports/preview?unitId='.(int)$unitId.'&yearMonth='.urlencode($yearMonth);
                $logger->info('[ReportsWorkflow] fetching preview PDF', ['url' => $genUrl]);
                $resp   = $http->request('GET', $genUrl, [
                    'headers' => array_filter([
                        'Authorization' => $request->headers->get('Authorization'),
                        'Accept'        => 'application/pdf',
                    ]),
                ]);
                $logger->info('[ReportsWorkflow] preview HTTP status', ['status' => $resp->getStatusCode()]);

                if ($resp->getStatusCode() === 200) {
                    // Get raw bytes (don't throw on non-2xx to allow graceful handling)
                    $pdfBytes = $resp->getContent(false);
                    // Basic sanity: require some non-trivial length
                    if (is_string($pdfBytes) && strlen($pdfBytes) > 100) {
                        // 1) Try direct S3 upload via DocumentUploadService first (if available)
                        if ($uploader) {
                            try {
                                $docEntity = $uploader->uploadForLedger(
                                    ledgerId: $ledgerId,
                                    unitId: $unitId,
                                    category: 'REPORT',
                                    description: sprintf('Client Report %s', $this->ymToToken($yearMonth)),
                                    dateForName: $yearMonth . '-01',
                                    mime: 'application/pdf',
                                    originalName: $fileName,
                                    bytes: $pdfBytes
                                );
                                if ($docEntity) {
                                    $documentId = method_exists($docEntity, 'getId') ? $docEntity->getId() : null;
                                    if (method_exists($docEntity, 'getDocumentUrl') && $docEntity->getDocumentUrl()) {
                                        $publicUrl = $docEntity->getDocumentUrl();
                                    } elseif (method_exists($docEntity, 'getS3Url')) {
                                        $publicUrl = $docEntity->getS3Url();
                                    }
                                    $uploaded = true;
                                    $logger->info('[ReportsWorkflow] uploaded via DocumentUploadService', ['documentId' => $documentId, 'publicUrl' => $publicUrl]);
                                }
                            } catch (\Throwable $e) {
                                $logger->error('[ReportsWorkflow] uploader service failed, falling back to S3/HTTP fallback', ['error' => $e->getMessage()]);
                            }
                        } else {
                            $logger->warning('[ReportsWorkflow] uploader service not injected; skipping direct upload path');
                        }

                        // 1b) Direct S3 fallback (PutObject) + manual UnitDocument insert
                        if (!$uploaded) {
                            try {
                                if (!$this->s3) {
                                    // attempt late init if constructor failed earlier
                                    $region = getenv('AWS_DEFAULT_REGION') ?: 'us-east-2';
                                    $this->s3 = new S3Client(['version' => 'latest', 'region' => $region]);
                                }
                                // Build an S3 key like reports/<unit>/<filename>
                                $fileName = $this->buildReportFilename($em, $unitId, $yearMonth);
                                $s3Key    = sprintf('reports/%d/%s', $unitId, $fileName);
                                $result   = $this->s3->putObject([
                                    'Bucket'      => $this->s3Bucket,
                                    'Key'         => $s3Key,
                                    'Body'        => $pdfBytes,
                                    'ContentType' => 'application/pdf',
                                    'ACL'         => 'private',
                                ]);
                                // Derive a URL we can store (virtual-hosted-style)
                                $publicUrl = sprintf('https://%s.s3.%s.amazonaws.com/%s',
                                    $this->s3Bucket,
                                    getenv('AWS_DEFAULT_REGION') ?: 'us-east-2',
                                    $s3Key
                                );

                                // Insert UnitDocument row via DBAL (minimal required fields)
                                $conn->insert('unit_document', [
                                    'unit_id'      => $unitId,
                                    'ledger_id'    => $ledgerId,
                                    'category'     => 'REPORT',
                                    'filename'     => $fileName,
                                    's3_url'       => $publicUrl,
                                    'document_url' => $publicUrl,
                                    'uploaded_at'  => (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
                                    'uploaded_by'  => 'system',
                                ]);
                                $documentId = (int)$conn->lastInsertId();
                                $uploaded = true;
                                $logger->info('[ReportsWorkflow] uploaded via direct S3 PutObject + DB insert', ['documentId' => $documentId, 'publicUrl' => $publicUrl, 'key' => $s3Key]);
                            } catch (\Throwable $e) {
                                $logger->error('[ReportsWorkflow] direct S3 upload failed', ['error' => $e->getMessage()]);
                            }
                        }

                        // 2) If service upload and direct S3 did not run/succeed, fall back to existing HTTP upload path
                        if (!$uploaded) {
                            // Write $pdfBytes to a temp file
                            $tmpPath = tempnam(sys_get_temp_dir(), 'report_pdf_');
                            if ($tmpPath !== false) {
                                $finalTmpPath = $tmpPath . '.pdf';
                                rename($tmpPath, $finalTmpPath);
                                $tmpPath = $finalTmpPath;
                            }
                            if ($tmpPath === false || file_put_contents($tmpPath, $pdfBytes) === false) {
                                $logger->error('[ReportsWorkflow] failed to write temp PDF file', ['tmpPath' => $tmpPath]);
                            } else {
                                // Build FormDataPart for upload
                                $formData = new FormDataPart([
                                    'unit'            => (string)$unitId,
                                    'transaction'     => (string)$ledgerId,
                                    'transactionType' => 'ledger',
                                    'category'        => 'REPORT',
                                    'description'     => sprintf('Reporte Mensual %s', (new \DateTimeImmutable($yearMonth.'-01'))->format('m/y')),
                                    'dateForName'     => $yearMonth . '-01',
                                    'document'        => DataPart::fromPath(
                                        $tmpPath,
                                        $fileName,
                                        'application/pdf'
                                    ),
                                ]);
                                $uploadUrl = $base . '/api/unit-documents/upload';
                                $headers = $formData->getPreparedHeaders()->toArray();
                                // Forward Authorization header if present
                                $authHeader = $request->headers->get('Authorization');
                                if ($authHeader) {
                                    $headers['Authorization'] = $authHeader;
                                }
                                $logger->info('[ReportsWorkflow] POSTing to /api/unit-documents/upload', [
                                    'uploadUrl' => $uploadUrl,
                                    'headers'   => $headers,
                                    'fields'    => [
                                        'unit'            => (string)$unitId,
                                        'transaction'     => (string)$ledgerId,
                                        'transactionType' => 'ledger',
                                        'category'        => 'REPORT',
                                        'dateForName'     => $yearMonth . '-01',
                                    ],
                                    'documentKey' => 'document',
                                    'path'        => $tmpPath,
                                ]);
                                try {
                                    $uploadResp = $http->request('POST', $uploadUrl, [
                                        'headers' => $headers,
                                        'body'    => $formData->bodyToIterable(),
                                    ]);
                                    $logger->info('[ReportsWorkflow] upload response status', [
                                        'status' => $uploadResp->getStatusCode(),
                                    ]);
                                    $status = $uploadResp->getStatusCode();
                                    $respBody = $uploadResp->getContent(false);
                                    if ($status === 201 || $status === 200) {
                                        $json = @json_decode($respBody, true);
                                        if (is_array($json)) {
                                            $documentId = $json['id'] ?? null;
                                            $publicUrl = $json['publicUrl']
                                                ?? $json['url']
                                                ?? $json['s3Url']
                                                ?? $json['documentUrl']
                                                ?? null;
                                        }
                                    } else {
                                        $logger->error('[ReportsWorkflow] upload failed', [
                                            'status' => $status,
                                            'body'   => $respBody,
                                        ]);
                                    }
                                } catch (\Throwable $e) {
                                    $logger->error('[ReportsWorkflow] upload failed', [
                                        'error' => $e->getMessage(),
                                    ]);
                                } finally {
                                    if (isset($tmpPath) && is_file($tmpPath)) {
                                        @unlink($tmpPath);
                                    }
                                }
                            }
                        }
                    } // end if (!$uploaded) fallback
                }
            } catch (\Throwable $e) {
                $logger->error('[ReportsWorkflow] preview fetch failed', ['error' => $e->getMessage()]);
                // If preview fetch fails, we return without document; UI can retry attachment later
            }
        } catch (\Throwable $e) {
            // If unique-constraint violation happened (duplicate), fetch the existing row and return it
            $msg = $e->getMessage();
            $isDup = str_contains($msg, 'Duplicate entry') || str_contains($msg, '1062');
            if ($isDup) {
                try {
                    $existingId = $conn->fetchOne(
                        "SELECT id FROM unit_balance_ledger WHERE unit_id = :uid AND yearmonth = :ym AND entry_type = 'REPORT_POSTING' LIMIT 1",
                        ['uid' => $unitId, 'ym' => $yearMonth]
                    );
                    if ($existingId) {
                        $row = $conn->fetchAssociative(
                            "SELECT amount, balance_after FROM unit_balance_ledger WHERE id = :lid",
                            ['lid' => (int)$existingId]
                        ) ?: ['amount' => $amount, 'balance_after' => $amount];
                        return new JsonResponse([
                            'ok' => true,
                            'endpoint' => 'generate-ledger',
                            'existing' => true,
                            'ledgerId' => (int)$existingId,
                            'unitId' => $unitId,
                            'yearMonth' => $yearMonth,
                            'reference' => sprintf('Client Report %s', $yymm),
                            'amount' => number_format((float)($row['amount'] ?? $amount), 2, '.', ''),
                            'balanceBefore' => number_format($balanceBefore, 2, '.', ''),
                            'balanceAfter' => number_format((float)($row['balance_after'] ?? $amount), 2, '.', ''),
                            'documentId' => null,
                            'publicUrl'  => null,
                            'note' => 'REPORT_POSTING already existed (race). Returning existing row.',
                        ], Response::HTTP_OK);
                    }
                } catch (\Throwable $e2) {
                    // fall through to generic error below
                }
            }
            return new JsonResponse([
                'error' => 'insert_failed',
                'message' => $msg,
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        // Upsert OwnerReportCycle with latest issued-at and URL when a document exists
        $issuedAtIso = null;
        if ($documentId) {
            try {
                $nowTs = (new \DateTimeImmutable('now'));
                $issuedAtIso = $nowTs->format(DATE_ATOM);
                $nowSql = $nowTs->format('Y-m-d H:i:s');

                $orcId = $conn->fetchOne(
                    'SELECT id FROM owner_report_cycle WHERE unit_id = :uid AND report_month = :ym LIMIT 1',
                    ['uid' => $unitId, 'ym' => $yearMonth]
                );
                if ($orcId) {
                    $conn->update('owner_report_cycle', [
                        'report_issued_at' => $nowSql,
                        'report_issued_by' => 'system',
                        'report_url'       => $publicUrl,
                    ], [
                        'id' => (int)$orcId,
                    ]);
                } else {
                    $conn->insert('owner_report_cycle', [
                        'unit_id'         => $unitId,
                        'report_month'    => $yearMonth,
                        'report_issued_at'=> $nowSql,
                        'report_issued_by'=> 'system',
                        'report_url'      => $publicUrl,
                        'payment_status'  => 'PENDING',
                    ]);
                }
            } catch (\Throwable $e) {
                // Non-fatal: keep going even if the ORC upsert fails
            }
        }
        $logger->info('[ReportsWorkflow] generate-ledger end', [
            'ledgerId' => $ledgerId,
            'documentId' => $documentId,
            'publicUrl' => $publicUrl
        ]);
        return new JsonResponse([
            'ok' => true,
            'endpoint'  => 'generate-ledger',
            'ledgerId'   => $ledgerId,
            'unitId'     => $unitId,
            'yearMonth'  => $yearMonth,
            'reference'  => $reference,
            'amount'     => number_format($amount, 2, '.', ''),
            'balanceBefore' => number_format($balanceBefore, 2, '.', ''),
            'balanceAfter'  => number_format($balanceAfter, 2, '.', ''),
            'reportIssuedAt' => $issuedAtIso,
            'documentId' => $documentId,
            'publicUrl'  => $publicUrl,
            'debug' => [
                'raw'             => $raw,
                'receivedPayload' => $payload,
                'parsedAmountIn'  => $amountIn,
                'replaceRequested'=> $replace,
                'info'            => 'Auto-computed from /api/client_monthly_summary when not provided.',
                'uploadAttempted' => isset($pdfBytes) && is_string($pdfBytes) && strlen($pdfBytes) > 100,
                'categoryUsed'    => 'REPORT',
                'cutoffDate'      => $cutoffDateObj->format('Y-m-d'),
                'nextMonthFirst'  => $nextMonthFirst->format('Y-m-d'),
            ],
            'next' => 'Step 2: upload PDF and attach to UnitDocument with ledger_id',
        ], Response::HTTP_CREATED);
        } catch (\Throwable $e) {
            // Top-level guard: always return JSON with the real error message instead of generic HTML 500
            $logger->error('[ReportsWorkflow] generate-ledger: unhandled exception', [
                'error' => $e->getMessage(),
                'trace' => substr($e->getTraceAsString(), 0, 3000),
            ]);
            return new JsonResponse([
                'error'   => 'unhandled_exception',
                'message' => $e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }


    #[Route('/api/reports/file', name: 'api_reports_file', methods: ['GET'])]
    public function reportFile(Request $request, UnitDocumentRepository $docs): Response
    {
        // Allow either normal JWT (handled by firewall) or X-Flow-Token header
        $flowHeader = $request->headers->get('X-Flow-Token');
        $hasJwt = (bool) $request->headers->get('Authorization');
        if (!$hasJwt) {
            $expected = $_ENV['FLOW_ATTACH_TOKEN'] ?? 'o2-flow-attach-SECRET-123';
            if (!$flowHeader || !hash_equals($expected, $flowHeader)) {
                return $this->json(['error' => 'Unauthorized'], Response::HTTP_UNAUTHORIZED);
            }
        }

        // Validate params
        $unitId = (int) ($request->query->get('unitId') ?? 0);
        $yearMonth = trim((string) ($request->query->get('yearMonth') ?? ''));
        if ($unitId <= 0 || !preg_match('/^\\d{4}-\\d{2}$/', $yearMonth)) {
            return $this->json(['error' => 'Missing or invalid unitId/yearMonth'], Response::HTTP_BAD_REQUEST);
        }

        // Convert to MM-YY token to match filenames like sunset_reporte-mensual-08-25_2508.pdf
        $token = $this->ymToToken($yearMonth);

        // Find REPORT documents for this unit, newest first
        $qb = $docs->createQueryBuilder('d')
            ->andWhere('d.category = :cat')
            ->andWhere('d.unit = :unitId')
            ->setParameter('cat', 'REPORT')
            ->setParameter('unitId', $unitId)
            ->orderBy('d.id', 'DESC');
        /** @var UnitDocument[] $candidates */
        $candidates = $qb->getQuery()->getResult();

        $match = null;
        foreach ($candidates as $doc) {
            $fn = (string) ($doc->getFilename() ?? '');
            if ($token && stripos($fn, $token) !== false) { $match = $doc; break; }
        }

        if (!$match) {
            return $this->json(['error' => 'Report PDF not found.'], Response::HTTP_NOT_FOUND);
        }

        $filename  = $match->getFilename() ?: ('report_' . $yearMonth . '.pdf');
        $publicUrl = $match->getDocumentUrl() ?: $match->getS3Url();
        $key = $this->extractS3KeyFromUrl($publicUrl);

        if (!$key) {
            // As a last resort, if the UnitDocument stored only a local path, try to stream it
            $localPath = method_exists($match, 'getLocalPath') ? $match->getLocalPath() : null;
            if ($localPath && is_readable($localPath)) {
                $resp = new BinaryFileResponse($localPath);
                $resp->headers->set('Content-Type', 'application/pdf');
                $resp->setContentDisposition('inline', $filename);
                return $resp;
            }
            return $this->json(['error' => 'S3 key unavailable for document.'], Response::HTTP_NOT_FOUND);
        }

        if (!$this->s3) {
            $region = getenv('AWS_DEFAULT_REGION') ?: 'us-east-2';
            $this->s3 = new S3Client(['version' => 'latest', 'region' => $region]);
        }
        // Build presigned request with optional Content-Disposition
        $cmd = $this->s3->getCommand('GetObject', [
            'Bucket' => $this->s3Bucket,
            'Key'    => $key,
            // Force a filename if caller wants to download explicitly
            'ResponseContentDisposition' => $request->query->getBoolean('download')
                ? ('attachment; filename="' . $filename . '"')
                : ('inline; filename="' . $filename . '"'),
            'ResponseContentType' => 'application/pdf',
        ]);
        $presigned = $this->s3->createPresignedRequest($cmd, "+{$this->presignTtl} seconds");
        $url = (string) $presigned->getUri();

        // 302 redirect to the presigned S3 URL so clients (including Flow) can fetch directly
        return $this->redirect($url, Response::HTTP_FOUND, [
            'Cache-Control' => 'no-store',
        ]);
    }
    #[Route('/api/reports/send-email2', name: 'api_reports_send_email_v2', methods: ['POST'])]
    public function sendReportEmail(
        Request $request,
        EntityManagerInterface $em,
        HttpClientInterface $http,
        MailerInterface $mailer,
        \Psr\Log\LoggerInterface $logger
    ): JsonResponse {
        // Accept JSON or form body
        $payload = [];
        $raw = $request->getContent();
        if ($raw !== '' && $raw !== null) {
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $payload = $decoded;
            }
        }
        if (!$payload) {
            $payload = $request->request->all();
        }
        if (!is_array($payload)) { $payload = []; }

        $unitId    = isset($payload['unitId']) ? (int)$payload['unitId'] : 0;
        $yearMonth = isset($payload['yearMonth']) ? (string)$payload['yearMonth'] : '';
        $to        = $payload['to'] ?? $payload['recipient'] ?? null; // string or array
        $cc        = $payload['cc'] ?? null; // optional
        $bcc       = $payload['bcc'] ?? null; // optional
        $subject   = (string)($payload['subject'] ?? $payload['emailSubject'] ?? sprintf('Owner Report %s — Unit %d', $yearMonth, $unitId));
        $bodyHtml  = (string)($payload['body'] ?? $payload['htmlBody'] ?? '<p>Adjunto el reporte mensual.</p>');

        if ($unitId <= 0 || !preg_match('/^\\d{4}-\\d{2}$/', $yearMonth) || empty($to)) {
            return new JsonResponse([
                'error' => 'invalid_request',
                'message' => 'Provide unitId (int), yearMonth (YYYY-MM), and "to" (email or array of emails).'
            ], Response::HTTP_BAD_REQUEST);
        }

        // Normalize recipients to array
        $toList = is_array($to) ? $to : array_map('trim', preg_split('/[,;]+/', (string)$to));
        $ccList = is_array($cc) ? $cc : ($cc ? array_map('trim', preg_split('/[,;]+/', (string)$cc)) : []);
        $bccList = is_array($bcc) ? $bcc : ($bcc ? array_map('trim', preg_split('/[,;]+/', (string)$bcc)) : []);

        // 1) Try to find an existing REPORT document that matches this unit & month token
        $token = $this->ymToToken($yearMonth);

        $docsRepo = $em->getRepository(UnitDocument::class);
        $qb = $docsRepo->createQueryBuilder('d')
            ->andWhere('d.category = :cat')
            ->andWhere('d.unit = :unitId')
            ->setParameter('cat', 'REPORT')
            ->setParameter('unitId', $unitId)
            ->orderBy('d.id', 'DESC');
        /** @var UnitDocument[] $candidates */
        $candidates = $qb->getQuery()->getResult();

        $match = null;
        foreach ($candidates as $doc) {
            $fn = (string) ($doc->getFilename() ?? '');
            if ($token && stripos($fn, $token) !== false) { $match = $doc; break; }
        }

        $filename  = null;
        $pdfBytes  = null;

        // 2) If found, load bytes either from localPath or publicUrl
        if ($match) {
            $filename  = $match->getFilename() ?: ('report_'.$yearMonth.'.pdf');
            $localPath = method_exists($match, 'getLocalPath') ? $match->getLocalPath() : null;
            $publicUrl = $match->getDocumentUrl() ?: $match->getS3Url();
            if ($localPath && is_readable($localPath)) {
                $pdfBytes = @file_get_contents($localPath);
            } elseif ($publicUrl) {
                $pdfBytes = @file_get_contents($publicUrl);
            }
        }

        // 3) If not found or not loadable, generate preview bytes on the fly (no local write needed)
        if (!$pdfBytes || !is_string($pdfBytes) || strlen($pdfBytes) < 100) {
            try {
                $base   = $request->getSchemeAndHttpHost();
                $genUrl = $base . '/api/reports/preview?unitId='.(int)$unitId.'&yearMonth='.urlencode($yearMonth);
                $logger->info('[ReportsWorkflow] send-email: fetching preview PDF', ['url' => $genUrl]);
                $resp   = $http->request('GET', $genUrl, [
                    'headers' => array_filter([
                        'Authorization' => $request->headers->get('Authorization'),
                        'Accept'        => 'application/pdf',
                    ]),
                ]);
                if ($resp->getStatusCode() === 200) {
                    $bytes = $resp->getContent(false);
                    if (is_string($bytes) && strlen($bytes) > 100) {
                        $pdfBytes = $bytes;
                        if (!$filename) {
                            $filename = sprintf('client-report-%d-%s.pdf', $unitId, $yearMonth);
                        }
                    }
                }
            } catch (\Throwable $e) {
                $logger->error('[ReportsWorkflow] send-email: preview fetch failed', ['error' => $e->getMessage()]);
            }
        }

        if (!$pdfBytes || !is_string($pdfBytes) || strlen($pdfBytes) < 100) {
            return new JsonResponse([
                'error' => 'pdf_unavailable',
                'message' => 'Could not load or generate the report PDF bytes.'
            ], Response::HTTP_BAD_REQUEST);
        }

        // 4) Compose and send the email with attachment
        try {
            $email = (new Email())
                ->subject($subject)
                ->html($bodyHtml);

            foreach ($toList as $addr) {
                if ($addr) { $email->addTo($addr); }
            }
            foreach ($ccList as $addr) {
                if ($addr) { $email->addCc($addr); }
            }
            foreach ($bccList as $addr) {
                if ($addr) { $email->addBcc($addr); }
            }

            $email->attach($pdfBytes, $filename ?? 'owner-report.pdf', 'application/pdf');
            $mailer->send($email);

            return new JsonResponse([
                'ok' => true,
                'endpoint' => 'send-email',
                'unitId' => $unitId,
                'yearMonth' => $yearMonth,
                'attached' => $filename,
                'usedStoredDocument' => (bool)$match,
            ], Response::HTTP_OK);
        } catch (\Throwable $e) {
            $logger->error('[ReportsWorkflow] send-email failed', ['error' => $e->getMessage()]);
            return new JsonResponse([
                'error' => 'send_failed',
                'message' => $e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }
}