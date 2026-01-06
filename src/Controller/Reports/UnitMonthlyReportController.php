<?php

namespace App\Controller\Reports;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use App\Service\Reports\UnitMonthlyReportService;
use Symfony\Component\HttpFoundation\Response;
use App\Service\Document\DocumentUploadService;
use Twig\Environment as TwigEnvironment;
use Dompdf\Dompdf;
use Dompdf\Options;
use Doctrine\DBAL\Connection;
use App\Service\ReportDataBuilder;
use Knp\Snappy\Pdf;

/**
 * Aggregator endpoint (BFF) for the Unit Monthly Report page.
 * Accepts a unitId and yearMonth (YYYY-MM) and returns a consolidated payload.
 */
class UnitMonthlyReportController extends AbstractController
{
    public function __construct(
        private readonly UnitMonthlyReportService $service,
        private readonly DocumentUploadService $uploader,
        private readonly TwigEnvironment $twig,
        private readonly Connection $db,
        private readonly ReportDataBuilder $reportDataBuilder,
        private readonly Pdf $snappyPdf,
    ) {
    }

    /**
     * Minimal MVP endpoint. For now, returns a stubbed structure that the frontend can consume.
     * Later we will delegate to UnitMonthlyReportService to assemble real data.
     */
    #[Route('/api/reports/unit-monthly', name: 'api_reports_unit_monthly', methods: ['POST'])]
    public function unitMonthly(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '{}', true) ?? [];

        $unitId = $payload['unitId'] ?? $payload['unit_id'] ?? null;
        $ym     = $payload['yearMonth'] ?? $payload['year_month'] ?? null;

        if (!is_numeric($unitId)) {
            return $this->json([
                'error' => 'unitId is required and must be numeric',
            ], 400);
        }

        $ym = $this->normalizeYearMonth($ym);
        if ($ym === null) {
            return $this->json([
                'error' => "yearMonth must be in 'YYYY-MM' format",
            ], 400);
        }

        // TODO: Inject and delegate to UnitMonthlyReportService once implemented.
        $response = $this->service->build((int) $unitId, $ym);

        // --- Normalize bookings payload: ensure `cleaningFee` is present for edit forms ---
        try {
            if (isset($response['bookings']['rows']) && is_array($response['bookings']['rows'])) {
                foreach ($response['bookings']['rows'] as $i => $row) {
                    if (!is_array($row)) { continue; }
                    // Prefer the raw booking cleaning fee; if missing, backfill from cleaningFeeInMonth
                    $raw = $row['cleaningFee'] ?? null;
                    if ($raw === null || $raw === '') {
                        $fallback = $row['cleaningFeeInMonth'] ?? 0;
                        $response['bookings']['rows'][$i]['cleaningFee'] = (float) $fallback;
                    } else {
                        $response['bookings']['rows'][$i]['cleaningFee'] = (float) $raw;
                    }
                }
            }
        } catch (\Throwable $e) {
            // ignore normalization issues; the form will still fall back client-side if needed
        }

        $json = new JsonResponse($response, 200);
        $json->headers->set('Cache-Control', 'no-store');
        return $json;
    }

    /**
     * Preview the Unit Monthly Report without persisting ledger entries.
     * Returns HTML suitable for embedding in an iframe (no downloads).
     */
    #[Route('/api/reports/unit-monthly/preview', name: 'api_reports_unit_monthly_preview', methods: ['GET'], priority: 100)]
    #[Route('/api/unit-monthly/preview', name: 'api_unit_monthly_preview', methods: ['GET'], priority: 100)]
    public function preview(Request $request, TwigEnvironment $twig): Response
    {
        $unitId = $request->query->getInt('unitId', 0);
        $ym = $this->normalizeYearMonth($request->query->get('yearMonth'));
        if ($unitId <= 0 || !$ym) {
            return new Response('Missing or invalid unitId/yearMonth', Response::HTTP_BAD_REQUEST);
        }
        // Redirect to unified HTML preview
        return $this->redirectToRoute('owner_report_preview', [
            'unitId'    => $unitId,
            'yearMonth' => $ym,
            '_format'   => 'html',
        ], 302);
    }

    /**
     * Check if a report posting already exists for a unit/month.
     * Returns { exists: bool, posting?: {...} }
     */
    #[Route('/api/reports/unit-monthly/status', name: 'api_reports_unit_monthly_status', methods: ['GET'])]
    public function status(Request $request): JsonResponse
    {
        $unitId = $request->query->getInt('unitId', 0);
        $ym = $this->normalizeYearMonth($request->query->get('yearMonth'));
        if ($unitId <= 0 || !$ym) {
            return $this->json(['error' => 'Missing or invalid unitId/yearMonth'], 400);
        }

        // Delegate to service; expected to return null if not found or an associative array with details if found.
        $existing = $this->service->findExistingReportPosting($unitId, $ym);
        return $this->json([
            'exists'  => (bool) $existing,
            'posting' => $existing,
        ]);
    }

    /**
     * Generate the monthly report PDF, upload it, and upsert a REPORT_POSTING row in unit_balance_ledger.
     * Body: { unitId, yearMonth, replace?: bool }
     */
    #[Route('/__legacy__/reports/unit-monthly/generate', name: 'legacy_reports_unit_monthly_generate', methods: ['POST'], priority: -255, condition: 'false')]
    #[Route('/__legacy__/unit-monthly/generate', name: 'legacy_unit_monthly_generate', methods: ['POST'], priority: -255, condition: 'false')]
    public function generate(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent() ?: '{}', true) ?? [];
        $unitId = (int) ($payload['unitId'] ?? $payload['unit_id'] ?? 0);
        $ym     = $this->normalizeYearMonth($payload['yearMonth'] ?? $payload['year_month'] ?? null);
        $replace = (bool) ($payload['replace'] ?? true);

        if ($unitId <= 0 || !$ym) {
            return $this->json(['error' => 'Missing or invalid unitId/yearMonth'], 400);
        }

        // Default createdBy from user or system
        $createdBy = 'system';
        try {
            $user = $this->getUser();
            if ($user) {
                if (method_exists($user, 'getUserIdentifier') && $user->getUserIdentifier()) {
                    $createdBy = (string) $user->getUserIdentifier();
                } elseif (method_exists($user, 'getEmail') && $user->getEmail()) {
                    $createdBy = (string) $user->getEmail();
                }
            }
        } catch (\Throwable) {
            // fallback to system
        }

        // Delegate to service to perform the heavy lifting
        try {
            $result = $this->service->generateAndUpsertReportPosting($unitId, $ym, $replace, $createdBy);
            $cycleVerify = null; // debug payload
            // Prefer the URL produced by the service (it already performs the canonical upload)
            $s3Url = is_array($result) ? ($result['s3Url'] ?? null) : null;

            // Only render/upload if s3Url is still empty
            if (!is_string($s3Url) || $s3Url === '') {
                // --- Build PDF with the same data as preview ---
                $bundle = $this->service->build($unitId, $ym);
                // --- Normalize comments to plain string (generate) ---
                try {
                    $commentsSrc = $bundle['comments'] ?? ($bundle['notes']['report'] ?? null);
                    if (is_array($commentsSrc)) {
                        $parts = [];
                        foreach ($commentsSrc as $item) {
                            if (is_array($item)) {
                                $line = $item['note_comment'] ?? ($item['text'] ?? ($item['note'] ?? ($item['message'] ?? null)));
                            } else {
                                $line = $item;
                            }
                            $line = is_string($line) ? trim($line) : '';
                            if ($line !== '') { $parts[] = $line; }
                        }
                        $bundle['comments'] = implode("\n", $parts);
                    } elseif (!isset($bundle['comments']) && is_string($commentsSrc)) {
                        $bundle['comments'] = $commentsSrc;
                    }
                } catch (\Throwable $e) { /* ignore normalization errors */ }

                // --- Align generate bundle to template expectations ---
                try {
                    // Bookings: alias commissionBaseInMonth -> pagoNeto / netPay / ownerPayoutInMonth (ensure numeric)
                    if (isset($bundle['bookings']['rows']) && is_array($bundle['bookings']['rows'])) {
                        foreach ($bundle['bookings']['rows'] as $i => $row) {
                            if (!is_array($row)) continue;
                            $val = null;
                            if (isset($row['commissionBaseInMonth'])) {
                                $val = (float)$row['commissionBaseInMonth'];
                            } elseif (isset($row['ownerPayoutInMonth'])) {
                                $val = (float)$row['ownerPayoutInMonth'];
                            }
                            if ($val !== null) {
                                $bundle['bookings']['rows'][$i]['pagoNeto'] = $val;
                                $bundle['bookings']['rows'][$i]['netPay'] = $val;
                                $bundle['bookings']['rows'][$i]['ownerPayoutInMonth'] = $val;
                            }
                            if (!isset($row['paymentMethod']) && isset($row['bookingPaymentMethod'])) {
                                $bundle['bookings']['rows'][$i]['paymentMethod'] = $row['bookingPaymentMethod'];
                            }
                        }
                    }
                    // Expenses: stable ordering by categoryName then date asc
                    if (isset($bundle['expenses']['rows']) && is_array($bundle['expenses']['rows'])) {
                        usort($bundle['expenses']['rows'], function($a, $b) {
                            $ca = strtolower((string)($a['categoryName'] ?? $a['category'] ?? ''));
                            $cb = strtolower((string)($b['categoryName'] ?? $b['category'] ?? ''));
                            if ($ca !== $cb) return $ca <=> $cb;
                            $da = isset($a['date']) ? strtotime((string)$a['date']) : 0;
                            $db = isset($b['date']) ? strtotime((string)$b['date']) : 0;
                            return $da <=> $db;
                        });
                    }
                    // Ensure each expense row exposes `category` for template headers
                    if (isset($bundle['expenses']['rows']) && is_array($bundle['expenses']['rows'])) {
                        foreach ($bundle['expenses']['rows'] as $j => $erow) {
                            if (is_array($erow)) {
                                if (!isset($erow['category']) && isset($erow['categoryName'])) {
                                    $bundle['expenses']['rows'][$j]['category'] = $erow['categoryName'];
                                }
                            }
                        }
                    }
                } catch (\Throwable $e) { /* ignore */ }

                $html = null;
                try {
                    $html = $this->twig->render('reports/owner_report.pdf.twig', [
                        'unit'     => $bundle['unit']     ?? [],
                        'client'   => $bundle['client']   ?? [],
                        'reservas' => $bundle['bookings']['rows'] ?? [],
                        'gastos'   => $bundle['expenses']['rows'] ?? [],
                        'abonos'   => $bundle['abonos']['rows']   ?? [],
                        'comments' => $bundle['comments'] ?? ($bundle['notes']['report'] ?? []),
                        'totals'   => [
                            'gastosTotalClient' => $bundle['expenses']['totals']['amount'] ?? 0,
                            'abonosTotalClient' => $bundle['abonos']['totals']['amount'] ?? 0,
                            'o2Commission'      => $bundle['bookings']['totals']['o2Commission'] ?? 0,
                            'unitBalanceStart'  => $bundle['openingBalance'] ?? 0,
                        ],
                        'summary'  => [
                            'monthlyEarnings' => $bundle['monthlyResult'] ?? 0,
                            'closingBalance'  => $bundle['closingBalance'] ?? 0,
                        ],
                        'meta'     => [
                            'monthLabel' => $ym,
                            'language'   => 'es',
                        ],
                        'company'  => [
                            'logoUrl' => null,
                        ],
                    ]);
                } catch (\Throwable $e) {
                    @error_log('[UnitMonthlyReportController.generate] Twig render failed: ' . $e->getMessage());
                    $html = '<html><body><h2>Unit Monthly Report</h2>' .
                            '<h3 style="color:#b00;">Template error: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES) . '</h3>' .
                            '<pre>' .
                            htmlspecialchars(json_encode($bundle, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE), ENT_QUOTES) .
                            '</pre></body></html>';
                }

                // Render HTML to PDF bytes
                $pdfBytes = null;
                try {
                    if (class_exists(Options::class) && class_exists(Dompdf::class)) {
                        $options = new Options();
                        $options->set('isRemoteEnabled', true);
                        $dompdf = new Dompdf($options);
                        $dompdf->loadHtml($html);
                        $dompdf->setPaper('A4', 'portrait');
                        $dompdf->render();
                        $pdfBytes = $dompdf->output();
                    }
                } catch (\Throwable $e) {
                    @error_log('[UnitMonthlyReportController] PDF render failed: ' . $e->getMessage());
                }

                // Fallback: try wkhtmltopdf CLI if Dompdf failed or is unavailable
                if ((!is_string($pdfBytes) || $pdfBytes === '') && is_string($html) && $html !== '') {
                    try {
                        $tmpHtml = tempnam(sys_get_temp_dir(), 'o2_html_') . '.html';
                        $tmpPdf  = tempnam(sys_get_temp_dir(), 'o2_pdf_')  . '.pdf';
                        file_put_contents($tmpHtml, $html);
                        // Use --quiet to suppress console noise; add minimal margins for safety
                        $cmd = sprintf(
                            'wkhtmltopdf --quiet --margin-top 8mm --margin-bottom 8mm --margin-left 8mm --margin-right 8mm %s %s',
                            escapeshellarg($tmpHtml),
                            escapeshellarg($tmpPdf)
                        );
                        @exec($cmd, $out, $code);
                        if (is_file($tmpPdf) && filesize($tmpPdf) > 0) {
                            $pdfBytes = file_get_contents($tmpPdf);
                        } else {
                            @error_log('[UnitMonthlyReportController] wkhtmltopdf failed code=' . (string)$code);
                        }
                    } catch (\Throwable $e) {
                        @error_log('[UnitMonthlyReportController] wkhtmltopdf exception: ' . $e->getMessage());
                    } finally {
                        if (isset($tmpHtml) && is_file($tmpHtml)) { @unlink($tmpHtml); }
                        if (isset($tmpPdf)  && is_file($tmpPdf))  { @unlink($tmpPdf); }
                    }
                }

                // Upload PDF to S3 and create UnitDocument linked to the new ledger row
                $ledgerId = (int)($result['ledgerId'] ?? 0);
                if (is_string($pdfBytes) && $pdfBytes !== '') {
                    try {
                        $s3Doc = $this->uploader->uploadForLedger(
                            $ledgerId,
                            $unitId,
                            file: null,
                            category: 'Report',
                            description: $this->uploader->buildReportDescription($bundle['unit'] ?? null, $ym),
                            dateForName: new \DateTimeImmutable($ym . '-01'),
                            mime: 'application/pdf',
                            originalName: $this->uploader->buildReportOriginalName($unitId, $ym),
                            bytes: $pdfBytes
                        );
                        if (is_object($s3Doc) && method_exists($s3Doc, 'getS3Url')) {
                            $s3Url = $s3Doc->getS3Url();
                        }
                    } catch (\Throwable $e) {
                        @error_log('[UnitMonthlyReportController] uploadForLedger failed: ' . $e->getMessage());
                    }
                }

                // Prefer the canonical URL stored in unit_document (linked by transaction)
                try {
                    $docRow = $this->db->fetchAssociative(
                        'SELECT s3_url, s3Url, document_url FROM unit_document WHERE transaction_type = :t AND transaction_id = :id AND category = :c ORDER BY id DESC LIMIT 1',
                        ['t' => 'ledger', 'id' => $ledgerId, 'c' => 'Report']
                    );
                    if (is_array($docRow)) {
                        $s3Url = $docRow['s3_url'] ?? $docRow['s3Url'] ?? $docRow['document_url'] ?? $s3Url;
                    }
                } catch (\Throwable $e) {
                    @error_log('[UnitMonthlyReportController] unit_document lookup failed: ' . $e->getMessage());
                }
            }

            // Attach URL to response (owner_report_cycle.report_url update handled elsewhere)
            $result['s3Url'] = $s3Url;
            @error_log('[UnitMonthlyReportController.generate] s3Url (final) unit=' . $unitId . ' ym=' . $ym . ' url=' . (string)$s3Url);

            // If uploaded, stamp details in owner_report_cycle (transactional upsert + verify on primary)
            if ($s3Url) {
                try {
                    $now = new \DateTimeImmutable();
                    $conn = $this->db;

                    $conn->beginTransaction();
                    try {
                        // Locate existing row for (unit, month)
                        $cycleRow = $conn->fetchAssociative(
                            'SELECT `id`, `unit_id`, `report_month`, `report_url`
                               FROM `owner_report_cycle`
                              WHERE `unit_id` = :uid AND `report_month` = :ym
                           ORDER BY `id` DESC LIMIT 1',
                            ['uid' => $unitId, 'ym' => $ym]
                        );

                        if (is_array($cycleRow) && !empty($cycleRow['id'])) {
                            $cycleId = (int)$cycleRow['id'];
                            $conn->executeStatement(
                                'UPDATE `owner_report_cycle`
                                     SET `report_url` = :url,
                                         `report_issued_at` = :issuedAt,
                                         `report_issued_by` = :issuedBy,
                                         `updated_at` = :updatedAt
                                   WHERE `id` = :id',
                                [
                                    'url'      => $s3Url,
                                    'issuedAt' => $now,
                                    'issuedBy'  => $createdBy,
                                    'updatedAt' => $now,
                                    'id'       => $cycleId,
                                ]
                            );
                            @error_log('[UnitMonthlyReportController.generate] owner_report_cycle updated by PK id=' . $cycleId);
                        } else {
                            // Insert new row
                            $conn->executeStatement(
                                'INSERT INTO `owner_report_cycle` (`unit_id`,`report_month`,`report_url`,`report_issued_at`,`report_issued_by`,`created_at`,`updated_at`)
                                 VALUES (:uid,:ym,:url,:issuedAt,:issuedBy,:createdAt,:updatedAt)',
                                [
                                    'uid' => $unitId,
                                    'ym'  => $ym,
                                    'url' => $s3Url,
                                    'issuedAt' => $now,
                                    'issuedBy' => $createdBy,
                                    'createdAt' => $now,
                                    'updatedAt' => $now,
                                ]
                            );
                            @error_log('[UnitMonthlyReportController.generate] owner_report_cycle inserted for unit=' . $unitId . ' ym=' . $ym);
                        }

                        // Read-back verification on the same connection/transaction (primary)
                        $verify = $conn->fetchAssociative(
                            'SELECT `id`, `unit_id`, `report_month`, `report_url`
                               FROM `owner_report_cycle`
                              WHERE `unit_id` = :uid AND `report_month` = :ym
                           ORDER BY `id` DESC LIMIT 1',
                            ['uid' => $unitId, 'ym' => $ym]
                        );
                        $conn->commit();

                        @error_log('[UnitMonthlyReportController.generate] cycle VERIFY: ' . json_encode($verify));
                        $cycleVerify = $verify; // expose in API response for debugging
                    } catch (\Throwable $txe) {
                        $conn->rollBack();
                        throw $txe;
                    }
                } catch (\Throwable $e) {
                    @error_log('[UnitMonthlyReportController] owner_report_cycle upsert error: ' . $e->getMessage());
                }
            }

            return $this->json(['ok' => true, 'result' => $result, 'dbg' => 'reports/UnitMonthlyReportController', 'cycleVerify' => $cycleVerify]);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * List units that are candidates for payment requests for a given month.
     *
     * Query params:
     *  - yearMonth: YYYY-MM
     *
     * Response: { items: [ { unitId, unitName, closingBalance, paymentStatus, paymentRequested, ... } ] }
     */
    #[Route('/api/reports/unit-monthly/payment-candidates', name: 'api_reports_unit_monthly_payment_candidates', methods: ['GET'])]
    public function paymentCandidates(Request $request): JsonResponse
    {
        $ym = $this->normalizeYearMonth($request->query->get('yearMonth'));
        if (!$ym) {
            return $this->json([
                'error' => "yearMonth must be in 'YYYY-MM' format",
            ], 400);
        }

        try {
            $items = $this->service->getPaymentCandidates($ym);
        } catch (\Throwable $e) {
            return $this->json([
                'error' => 'Failed to load payment candidates',
                'message' => $e->getMessage(),
            ], 500);
        }

        $json = new JsonResponse(['items' => $items], 200);
        $json->headers->set('Cache-Control', 'no-store');
        return $json;
    }

    /**
     * Generate a payment request PDF for the selected units and month.
     *
     * Body: { yearMonth: 'YYYY-MM', unitIds: [1,2,3,...] }
     *
     * Returns a PDF stream (attachment).
     */
    #[Route('/api/reports/unit-monthly/payment-request/pdf', name: 'api_reports_unit_monthly_payment_request_pdf', methods: ['POST'])]
    public function paymentRequestPdf(Request $request): Response
    {
        $payload = json_decode($request->getContent() ?: '{}', true) ?? [];
        $yearMonth = $payload['yearMonth'] ?? $payload['year_month'] ?? null;
        $ym = $this->normalizeYearMonth($yearMonth);
        $unitIds = $payload['unitIds'] ?? $payload['unit_ids'] ?? [];

        if (!$ym) {
            return new Response("yearMonth must be in 'YYYY-MM' format", Response::HTTP_BAD_REQUEST);
        }

        if (!is_array($unitIds)) {
            $unitIds = [];
        }

        try {
            $bundle = $this->service->buildPaymentRequestRows($ym, $unitIds);
        } catch (\Throwable $e) {
            return new Response('Failed to build payment request data: ' . $e->getMessage(), Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        // Render HTML using the dedicated Twig template
        try {
            $html = $this->twig->render('reports_v2/unit_report_pay_request.pdf.twig', $bundle);
        } catch (\Throwable $e) {
            $html = '<html><body><h2>Payment Request</h2>' .
                '<h3 style="color:#b00;">Template error: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES) . '</h3>' .
                '<pre>' .
                htmlspecialchars(json_encode($bundle, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE), ENT_QUOTES) .
                '</pre></body></html>';
        }

        // Enrich bundle with header data for the shared V2 header template
        try {
            $headerYm = $ym;
            try {
                $dt = new \DateTimeImmutable($ym . '-01');
                $headerYm = $dt->format('M Y');
            } catch (\Throwable $e) {
                $headerYm = $ym;
            }

            if (!isset($bundle['meta']) || !is_array($bundle['meta'])) {
                $bundle['meta'] = [];
            }
            if (empty($bundle['meta']['monthLabel'])) {
                $bundle['meta']['monthLabel'] = $headerYm;
            }
            if (empty($bundle['meta']['language'])) {
                $bundle['meta']['language'] = 'es';
            }

            $bundle['header'] = [
                'unitName' => 'Payment Requests',
                'ym'       => $headerYm,
            ];
        } catch (\Throwable $e) {
            // non-fatal; header will fall back to simple values if needed
        }

        $pdfBytes = null;

        // Try Snappy (wkhtmltopdf with shared V2 header) first
        try {
            $headerHtml = $this->twig->render('reports_v2/_header.html.twig', $bundle);
            $projectDir = $this->getParameter('kernel.project_dir');
            $headerPath = $projectDir . '/var/v2_header_payment_request.html';
            @file_put_contents($headerPath, $headerHtml);

            $wkhtmlOpts = [
                'header-html'    => $headerPath ? ('file://' . $headerPath) : null,
                'header-line'    => false,
                'header-spacing' => 8,
                'footer-html'    => null,
                'footer-line'    => false,
                'no-outline'     => true,
                'quiet'          => true,
                'margin-top'     => 24,
                'margin-bottom'  => 18,
                'margin-left'    => 12,
                'margin-right'   => 12,
            ];

            $pdfBytes = $this->snappyPdf->getOutputFromHtml($html, $wkhtmlOpts);
        } catch (\Throwable $e) {
            @error_log('[UnitMonthlyReportController.paymentRequestPdf] Snappy failed: ' . $e->getMessage());
        }

        // If Snappy failed, try Dompdf as a fallback
        if (!is_string($pdfBytes) || $pdfBytes === '') {
            try {
                if (class_exists(Options::class) && class_exists(Dompdf::class)) {
                    $options = new Options();
                    $options->set('isRemoteEnabled', true);
                    $dompdf = new Dompdf($options);
                    $dompdf->loadHtml($html);
                    $dompdf->setPaper('A4', 'portrait');
                    $dompdf->render();
                    $pdfBytes = $dompdf->output();
                }
            } catch (\Throwable $e) {
                @error_log('[UnitMonthlyReportController.paymentRequestPdf] Dompdf failed: ' . $e->getMessage());
            }
        }

        // Final fallback: wkhtmltopdf CLI if everything else failed
        if ((!is_string($pdfBytes) || $pdfBytes === '') && is_string($html) && $html !== '') {
            try {
                $tmpHtml = tempnam(sys_get_temp_dir(), 'o2_html_') . '.html';
                $tmpPdf  = tempnam(sys_get_temp_dir(), 'o2_pdf_')  . '.pdf';
                file_put_contents($tmpHtml, $html);
                $cmd = sprintf(
                    'wkhtmltopdf --quiet --margin-top 8mm --margin-bottom 8mm --margin-left 8mm --margin-right 8mm %s %s',
                    escapeshellarg($tmpHtml),
                    escapeshellarg($tmpPdf)
                );
                @exec($cmd, $out, $code);
                if (is_file($tmpPdf) && filesize($tmpPdf) > 0) {
                    $pdfBytes = file_get_contents($tmpPdf);
                } else {
                    @error_log('[UnitMonthlyReportController.paymentRequestPdf] wkhtmltopdf failed code=' . (string)$code);
                }
            } catch (\Throwable $e) {
                @error_log('[UnitMonthlyReportController.paymentRequestPdf] wkhtmltopdf exception: ' . $e->getMessage());
            } finally {
                if (isset($tmpHtml) && is_file($tmpHtml)) { @unlink($tmpHtml); }
                if (isset($tmpPdf)  && is_file($tmpPdf))  { @unlink($tmpPdf); }
            }
        }

        if (!is_string($pdfBytes) || $pdfBytes === '') {
            return new Response('Failed to render PDF', Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        // Mark payment_requested = 1 for selected units (if any)
        if (!empty($unitIds)) {
            try {
                $now = new \DateTimeImmutable();
                $ymForDb = $yearMonth ?: $ym;
                foreach ($unitIds as $uidRaw) {
                    $uid = (int) $uidRaw;
                    if ($uid <= 0) {
                        continue;
                    }
                    $affected = $this->db->executeStatement(
                        'UPDATE owner_report_cycle
                             SET payment_requested = 1, updated_at = :now
                           WHERE unit_id = :uid AND report_month = :ym',
                        [
                            'now' => $now,
                            'uid' => $uid,
                            'ym'  => $ymForDb,
                        ]
                    );
                    @error_log(sprintf(
                        '[UnitMonthlyReportController.paymentRequestPdf] payment_requested update unit_id=%d ym=%s affected=%d',
                        $uid,
                        $ymForDb,
                        (int) $affected
                    ));
                }
            } catch (\Throwable $e) {
                @error_log('[UnitMonthlyReportController.paymentRequestPdf] payment_requested update failed: ' . $e->getMessage());
            }
        }

        $filename = sprintf('payment_request_%s.pdf', str_replace(['/', '_'], '-', $ym));

        return new Response($pdfBytes, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    /**
     * Validate and normalize a yearMonth string to YYYY-MM or return null.
     */
    private function normalizeYearMonth(?string $ym): ?string
    {
        if (!$ym) return null;
        $ym = trim($ym);
        // Accept common variants: YYYY-M, YYYY/MM, YYYY_MM
        $ym = str_replace(['/', '_', ' '], ['-', '-', ''], $ym);
        if (!preg_match('/^(\\d{4})-(\\d{1,2})$/', $ym, $m)) {
            return null;
        }
        $year = (int) $m[1];
        $month = (int) $m[2];
        if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
            return null;
        }
        return sprintf('%04d-%02d', $year, $month);
    }
}