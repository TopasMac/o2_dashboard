<?php

namespace App\Controller;

use App\Service\ReportDataBuilder;
use App\Service\Reports\UnitMonthlyReportService;
use App\Service\Document\DocumentUploadService;
use Knp\Snappy\Pdf;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use App\Entity\Unit;
// use App\Entity\Condo; // if Unit->getCondo() exists; safe to import even if unused
use App\Entity\OwnerReportCycle;
use App\Entity\UnitBalanceLedger;
use App\Entity\UnitDocument;
use Symfony\Contracts\HttpClient\HttpClientInterface;

class ReportController extends AbstractController
{
    /**
     * Compute opening balance as the last balance_after within the report month (YYYY-MM).
     * Falls back from yearmonth column to txn_date range if needed.
     */
    private function computeOpeningBalance(EntityManagerInterface $em, int $unitId, string $yearMonth): ?float
    {
        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return null;
        }
        [$y, $m] = array_map('intval', explode('-', $yearMonth));
        $monthStart = new \DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $y, $m));
        $nextStart  = $monthStart->modify('first day of next month')->setTime(0, 0, 0);

        $conn = $em->getConnection();
        // Try by yearmonth first
        $sql1 = 'SELECT balance_after FROM unit_balance_ledger WHERE unit_id = :uid AND yearmonth = :ym ORDER BY COALESCE(txn_date, created_at) DESC, id DESC LIMIT 1';
        $row1 = null;
        try {
            $row1 = $conn->executeQuery($sql1, ['uid' => $unitId, 'ym' => $yearMonth])->fetchAssociative();
        } catch (\Throwable $e) { /* ignore */ }
        if ($row1 && isset($row1['balance_after'])) {
            return (float)$row1['balance_after'];
        }

        // Fallback by txn_date window within the same month
        $sql2 = 'SELECT balance_after FROM unit_balance_ledger WHERE unit_id = :uid AND txn_date >= :start AND txn_date < :end ORDER BY txn_date DESC, id DESC LIMIT 1';
        try {
            $row2 = $conn->executeQuery($sql2, [
                'uid'   => $unitId,
                'start' => $monthStart->format('Y-m-d H:i:s'),
                'end'   => $nextStart->format('Y-m-d H:i:s'),
            ])->fetchAssociative();
            if ($row2 && isset($row2['balance_after'])) {
                return (float)$row2['balance_after'];
            }
        } catch (\Throwable $e) { /* ignore */ }

        return null;
    }
    /**
     * Return a base64 data URL for the company logo if available in public/img/company-logo.png
     */
    private function getEmbeddedLogoDataUrl(): ?string
    {
        try {
            $projectDir = $this->getParameter('kernel.project_dir');
            $logoPath = $projectDir . '/public/img/company-logo.png';
            if (is_readable($logoPath)) {
                $raw = @file_get_contents($logoPath);
                if ($raw !== false && strlen($raw) > 0) {
                    return 'data:image/png;base64,' . base64_encode($raw);
                }
            }
        } catch (\Throwable $e) {
            // ignore; return null
        }
        return null;
    }

    /**
     * Build the canonical report payload for a given unit + yearMonth.
     * Single source of truth for both Preview and Generate: no local mutations.
     */
    private function buildCanonicalReportPayload(int $unitId, string $yearMonth, ReportDataBuilder $builder, ?UnitMonthlyReportService $unitMonthly = null): array
    {
        // Build from the same canonical monthly service used by /api/reports/unit-monthly when available
        if ($unitMonthly) {
            $data = $unitMonthly->build($unitId, $yearMonth);
        } else {
            $data = $builder->build($unitId, $yearMonth);
        }

        // Embed logo as data URI so wkhtmltopdf can render offline (same behavior everywhere)
        $logoDataUrl = $this->getEmbeddedLogoDataUrl();
        if ($logoDataUrl) {
            if (!isset($data['company']) || !is_array($data['company'])) { $data['company'] = []; }
            if (empty($data['company']['logoUrl'])) { $data['company']['logoUrl'] = $logoDataUrl; }
        }

        // Ensure period is present in a canonical location used by the Twig
        if (!isset($data['report']) || !is_array($data['report'])) { $data['report'] = []; }
        if (empty($data['report']['period'])) {
            $data['report']['period'] = $yearMonth;
        }

        return $data;
    }

    /**
     * Compute compact workflow progress for a unit + month (report, payment, email).
     * Returns: ['reportIssued'=>bool,'paymentIssued'=>bool,'emailSent'=>bool,'progress'=>string]
     */
    private function computeCompactWorkflow(EntityManagerInterface $em, int $unitId, string $yearMonth): array
    {
        /** @var Unit|null $unit */
        $unit = $em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return [
                'reportIssued' => false,
                'paymentIssued' => false,
                'emailSent' => false,
                'progress' => '0/3',
            ];
        }

        // Resolve cycle row from OwnerReportCycle for this unit + month
        $cycleRepo = $em->getRepository(OwnerReportCycle::class);
        $cycle = null;
        try {
            $cycle = $cycleRepo->findOneBy(['unit' => $unit, 'yearMonth' => $yearMonth]);
            if (!$cycle) {
                $cycle = $cycleRepo->findOneBy(['unit' => $unit, 'reportMonth' => $yearMonth]);
            }
        } catch (\Throwable $e) {
            // ignore, keep $cycle = null
        }

        // Report issued: reportIssuedAt or reportUrl
        $reportIssuedAt = $cycle && method_exists($cycle, 'getReportIssuedAt') ? $cycle->getReportIssuedAt() : null;
        $reportUrl      = $cycle && method_exists($cycle, 'getReportUrl')      ? (string)$cycle->getReportUrl() : null;
        $reportIssued = ($reportIssuedAt instanceof \DateTimeInterface) || (is_string($reportUrl) && $reportUrl !== '');

        // Payment issued: payment_status not pending or any of amount/ref/at set, or presence of a ledger payment in next-month window
        $paymentStatus = $cycle && method_exists($cycle, 'getPaymentStatus') ? (string)$cycle->getPaymentStatus() : 'PENDING';
        $paymentAmount = $cycle && method_exists($cycle, 'getPaymentAmount') ? (float)$cycle->getPaymentAmount() : null;
        $paymentRef    = $cycle && method_exists($cycle, 'getPaymentRef')    ? (string)$cycle->getPaymentRef() : null;
        $paymentAt     = $cycle && method_exists($cycle, 'getPaymentAt')     ? $cycle->getPaymentAt() : null;

        $paymentIssued = false;
        $payStatusUpper = strtoupper((string)$paymentStatus);
        if (in_array($payStatusUpper, ['ISSUED','PAID','DONE','SENT'], true)) {
            $paymentIssued = true;
        }
        if (
            !$paymentIssued &&
            (
                ($paymentAt instanceof \DateTimeInterface)
                || ($paymentAmount !== null && abs($paymentAmount) > 0.0001)
                || (is_string($paymentRef) && $paymentRef !== '')
            )
        ) {
            $paymentIssued = true;
        }

        // Look for a REPORT_PAYMENT ledger row in the next-month window (payments recorded after the report month)
        if (!$paymentIssued) {
            try {
                [$y, $m] = array_map('intval', explode('-', $yearMonth));
                $monthStart = new \DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $y, $m));
                $nextStart  = $monthStart->modify('first day of next month')->setTime(0, 0, 0);
                $nextNext   = $nextStart->modify('first day of next month')->setTime(0, 0, 0);
                $conn = $em->getConnection();
                $sql = <<<SQL
SELECT id FROM unit_balance_ledger
WHERE unit_id = :uid
  AND entry_type IN ('O2 Report Payment','Client Report Payment')
  AND COALESCE(txn_date, created_at) >= :start
  AND COALESCE(txn_date, created_at) < :end
ORDER BY COALESCE(txn_date, created_at) DESC, id DESC
LIMIT 1
SQL;
                $ledgerPayment = $conn->executeQuery($sql, [
                    'uid'   => $unitId,
                    'start' => $nextStart->format('Y-m-d H:i:s'),
                    'end'   => $nextNext->format('Y-m-d H:i:s'),
                ])->fetchAssociative();
                if (is_array($ledgerPayment) && isset($ledgerPayment['id'])) {
                    $paymentIssued = true;
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }

        // Email sent: email_status in SENT/DONE or email_at/msg_id present
        $emailStatus   = $cycle && method_exists($cycle, 'getEmailStatus')   ? (string)$cycle->getEmailStatus() : 'PENDING';
        $emailMsgId    = $cycle && method_exists($cycle, 'getEmailMessageId')? (string)$cycle->getEmailMessageId() : null;
        $emailAt       = $cycle && method_exists($cycle, 'getEmailAt')       ? $cycle->getEmailAt() : null;
        $emailSent = false;
        $emailUpper = strtoupper((string)$emailStatus);
        if (in_array($emailUpper, ['SENT','DELIVERED','DONE'], true)) {
            $emailSent = true;
        }
        if (
            !$emailSent &&
            (
                ($emailAt instanceof \DateTimeInterface)
                || (is_string($emailMsgId) && $emailMsgId !== '')
            )
        ) {
            $emailSent = true;
        }

        // Progress 0–3
        $progressCount = 0;
        if ($reportIssued) { $progressCount++; }
        if ($paymentIssued) { $progressCount++; }
        if ($emailSent) { $progressCount++; }
        $progressStr = sprintf('%d/3', $progressCount);

        return [
            'reportIssued' => $reportIssued,
            'paymentIssued' => $paymentIssued,
            'emailSent' => $emailSent,
            'progress' => $progressStr,
        ];
    }

    #[Route('/api/unit-monthly/workflow', name: 'api_unit_monthly_workflow', methods: ['GET','POST'])]
    public function workflow(
        Request $request,
        EntityManagerInterface $em
    ): JsonResponse {
        // Accept GET query, then fallback to Request bag, then JSON body
        $unitId = (int) $request->query->get('unitId', 0);
        $yearMonth = (string) $request->query->get('yearMonth', '');

        if ($unitId <= 0) { $unitId = (int) $request->get('unitId', $unitId); }
        if ($yearMonth === '') { $yearMonth = (string) $request->get('yearMonth', $yearMonth); }

        if ($request->isMethod('POST')) {
            $ct = (string) $request->headers->get('Content-Type');
            if (stripos($ct, 'application/json') !== false) {
                $tmp = json_decode($request->getContent() ?: '', true);
                if (is_array($tmp)) {
                    if ($unitId <= 0) { $unitId = (int) ($tmp['unitId'] ?? 0); }
                    if ($yearMonth === '') { $yearMonth = (string) ($tmp['yearMonth'] ?? ''); }
                }
            }
        }

        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new JsonResponse(['error' => 'Missing or invalid unitId/yearMonth'], 400);
        }

        $workflow = $this->computeCompactWorkflow($em, $unitId, $yearMonth);
        return new JsonResponse([
            'unitId' => $unitId,
            'yearMonth' => $yearMonth,
            'workflow' => $workflow,
        ]);
    }
    #[Route(
        '/api/reports/{unitId}/{yearMonth}',
        name: 'owner_report_pdf',
        methods: ['GET'],
        requirements: [
            'unitId' => '\\d+',
            'yearMonth' => '\\d{4}-\\d{2}'
        ]
    )]
    public function report(
        string $unitId,
        string $yearMonth,
        ReportDataBuilder $builder,
        Pdf $pdf,
        EntityManagerInterface $em
    ): Response {
        $unitId = (int)$unitId;
        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new Response(json_encode(['error' => 'invalid_input', 'message' => 'Missing or invalid unitId/yearMonth']), 400, ['Content-Type' => 'application/json']);
        }
        // Build the report data
        $data = $builder->build($unitId, $yearMonth);
        // Ensure summary opening balance matches ledger month-end value
        try {
            $opening = $this->computeOpeningBalance($em, (int)$unitId, $yearMonth);
            if ($opening !== null) {
                if (!isset($data['summary']) || !is_array($data['summary'])) { $data['summary'] = []; }
                $data['summary']['openingBalance'] = (float)$opening;
                if (!isset($data['totals']) || !is_array($data['totals'])) { $data['totals'] = []; }
                $data['totals']['unitBalanceStart'] = (float)$opening; // many templates read this key
            }
        } catch (\Throwable $e) { /* ignore; keep builder value */ }

        // Ensure logo is embedded as data URI so wkhtmltopdf can render offline
        $logoDataUrl = $this->getEmbeddedLogoDataUrl();
        if ($logoDataUrl) {
            if (!isset($data['company']) || !is_array($data['company'])) { $data['company'] = []; }
            if (empty($data['company']['logoUrl'])) { $data['company']['logoUrl'] = $logoDataUrl; }
        }

        // Render Twig → HTML
        $html = $this->renderView('reports/owner_report.pdf.twig', $data);

        // Convert to PDF
        $output = $pdf->getOutputFromHtml($html);

        return new Response(
            $output,
            200,
            [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="owner_report.pdf"',
            ]
        );
    }

    #[Route(
        '/api/reports/owner/{unitId}/{yearMonth}/preview.{_format}',
        name: 'owner_report_preview',
        defaults: ['_format' => 'html'],
        requirements: ['_format' => 'html|pdf', 'unitId' => '\d+', 'yearMonth' => '\d{4}-\d{2}'],
        methods: ['GET']
    )]
    public function unifiedPreview(
        int $unitId,
        string $yearMonth,
        string $_format,
        Request $request,
        ReportDataBuilder $builder,
        Pdf $pdf,
        EntityManagerInterface $em,
        UnitMonthlyReportService $unitMonthly
    ): Response {
        // Validate input
        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new Response('Missing or invalid unitId/yearMonth', 400);
        }

        // Build canonical payload (identical for Preview and Generate)
        $data = $this->buildCanonicalReportPayload($unitId, $yearMonth, $builder, $unitMonthly);

        // Render native header partial to a temp file (explicit V2 header)
        $headerPath = null;
        $headerTpl  = 'reports_v2/_header.html.twig';
        try {
            $headerHtml = $this->renderView($headerTpl, $data);
            $tmp = tempnam(sys_get_temp_dir(), 'o2hdr_');
            if ($tmp) {
                $headerPath = $tmp . '.html';
                @file_put_contents($headerPath, $headerHtml);
            }
            // Diagnostics: dump header HTML and log temp path
            try {
                $debugHeader = $this->getParameter('kernel.project_dir') . '/var/owners2_last_header_preview.html';
                @file_put_contents($debugHeader, $headerHtml);
                @error_log('[ReportController][preview] header ok tpl=' . $headerTpl . ' path=' . (string)$headerPath . ' bytes=' . strlen((string)$headerHtml));
            } catch (\Throwable $e) { /* ignore */ }
        } catch (\Throwable $e) {
            $headerPath = null;
            @error_log('[ReportController][preview] header render failed tpl=' . (string)($headerTpl ?? 'n/a') . ' err=' . $e->getMessage());
            try {
                $debugErr = $this->getParameter('kernel.project_dir') . '/var/owners2_last_header_preview.error.txt';
                @file_put_contents($debugErr, 'tpl=' . (string)($headerTpl ?? 'n/a') . "\n" . $e->getMessage());
            } catch (\Throwable $e2) { /* ignore */ }
        }

        // (inline header fallback removed)

        // Render Twig → HTML once
        $html = $this->renderView('reports_v2/unit_report.pdf.twig', $data);

        // Debug: dump the exact HTML used for the Unit Report preview
        try {
            $debugPath = $this->getParameter('kernel.project_dir') . '/var/owners2_last_unit_report.html';
            @file_put_contents($debugPath, $html);
        } catch (\Throwable $e) {
            // ignore debug write errors
        }

        // Serve requested format
        if (strtolower((string)$_format) === 'pdf') {
            // PDF preview: disable external wkhtml footer; draw header via native header file
            $wkhtmlOpts = [
                'header-html'    => $headerPath ? ('file://' . $headerPath) : null,
                'header-line'    => false,
                'header-spacing' => 8,
                'footer-html'    => null,
                'footer-line'    => false,

                'no-outline'     => true,
                'quiet'          => true,
                'enable-local-file-access' => true,

                'margin-top'     => 24,
                'margin-bottom'  => 18,
                'margin-left'    => 12,
                'margin-right'   => 12,
            ];
            $output = $pdf->getOutputFromHtml($html, $wkhtmlOpts, true);
            $response = new Response($output, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="owner_report_preview.pdf"',
            ]);
            // Allow embedding in iframe (same policy as existing preview route)
            $response->headers->remove('X-Frame-Options');
            $allowedAncestors = [
                "'self'",
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://13.58.201.248',
                'https://13.58.201.248',
            ];
            $response->headers->set('Content-Security-Policy', 'frame-ancestors ' . implode(' ', array_unique($allowedAncestors)));
            return $response;
        }

        // Default: HTML
        $resp = new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
        $resp->headers->set('X-Frame-Options', 'ALLOWALL'); // allow iframe embedding
        return $resp;
    }

    #[Route('/api/reports/preview', name: 'owner_report_pdf_preview', methods: ['GET','POST'])]
    public function preview(
        Request $request,
        ReportDataBuilder $builder,
        Pdf $pdf,
        EntityManagerInterface $em
    ): Response {
        // Accept JSON POST or GET query for unitId/yearMonth
        $payload = [];
        $ct = (string) $request->headers->get('Content-Type');
        if ($request->isMethod('POST') && stripos($ct, 'application/json') !== false) {
            $tmp = json_decode($request->getContent() ?: '', true);
            if (is_array($tmp)) { $payload = $tmp; }
        }
        $unitId = (int) ($payload['unitId'] ?? $request->query->get('unitId', 0));
        $yearMonth = (string) ($payload['yearMonth'] ?? $request->query->get('yearMonth', ''));

        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new Response(json_encode(['error' => 'invalid_input', 'message' => 'Missing or invalid unitId/yearMonth']), 400, ['Content-Type' => 'application/json']);
        }

        // Redirect to unified route as PDF preview
        return $this->redirectToRoute('owner_report_preview', [
            'unitId'    => $unitId,
            'yearMonth' => $yearMonth,
            '_format'   => 'pdf',
        ], 302);
    }

    #[Route('/api/reports/payouts-to-clients', name: 'payouts_to_clients_pdf', methods: ['POST'])]
    public function payoutsToClients(
        Request $request,
        Pdf $pdf
    ): Response {
        $payload = json_decode($request->getContent() ?: '{}', true);
        $yearMonth = (string)($payload['yearMonth'] ?? '');
        $rows = $payload['rows'] ?? [];
        $showReferences = (bool)($payload['showReferences'] ?? false);

        if (!preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new Response(json_encode(['error' => 'Missing or invalid yearMonth']), 400, ['Content-Type' => 'application/json']);
        }
        if (!is_array($rows)) {
            return new Response(json_encode(['error' => 'rows must be an array']), 400, ['Content-Type' => 'application/json']);
        }

        // Prepare company context with embedded logo (data URI) so PDF engines can render it offline
        $company = [];
        try {
            $projectDir = $this->getParameter('kernel.project_dir');
            $logoPathPng = $projectDir . '/public/img/company-logo.png';
            if (is_readable($logoPathPng)) {
                $raw = file_get_contents($logoPathPng);
                if ($raw !== false && strlen($raw) > 0) {
                    $company['logoData'] = 'data:image/png;base64,' . base64_encode($raw);
                }
            }
        } catch (\Throwable $e) {
            // Ignore logo failures; PDF will render without a logo
        }

        $html = $this->renderView('reports/payouts_to_clients.html.twig', [
            'yearMonth' => $yearMonth,
            'rows' => $rows,
            'showReferences' => $showReferences,
            'company' => $company,
        ]);

        try {
            $output = $pdf->getOutputFromHtml($html);
        } catch (\Throwable $e) {
            return new Response(json_encode(['error' => 'Failed to render PDF', 'details' => $e->getMessage()]), 500, ['Content-Type' => 'application/json']);
        }

        $filename = sprintf('payouts_to_clients_%s.pdf', $yearMonth);
        $response = new Response($output, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $filename . '"',
        ]);

        // Allow embedding in the app for inline preview
        $response->headers->remove('X-Frame-Options');
        $allowedAncestors = [
            "'self'",
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://13.58.201.248',
            'https://13.58.201.248',
        ];
        $response->headers->set('Content-Security-Policy', 'frame-ancestors ' . implode(' ', array_unique($allowedAncestors)));

        return $response;
    }



    #[Route('/api/reports/services-payments/export.pdf', name: 'services_payments_export_pdf', methods: ['GET'])]
    public function servicesPaymentsExportPdf(
        Request $request,
        HttpClientInterface $httpClient,
        Pdf $pdf
    ): Response {
        $service = strtoupper((string) $request->query->get('service', ''));
        $month   = (int) $request->query->get('month', 0);
        $year    = (int) $request->query->get('year', 0);

        if (!in_array($service, ['HOA'], true)) {
            return new Response('Unsupported service for export. For now only HOA is available.', 400);
        }
        if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
            return new Response('Invalid month/year', 400);
        }

        // Fetch rows directly from the bulk endpoint on the same host (parity with FE)
        $rows = [];
        $ym = sprintf('%04d-%02d', $year, $month);

        // Forward Authorization/Cookie so the API authorizes this server-side request
        $httpOpts = ['timeout' => 8.0, 'headers' => []];
        if ($auth = (string) $request->headers->get('Authorization')) {
            $httpOpts['headers']['Authorization'] = $auth;
        }
        if ($cookie = (string) $request->headers->get('Cookie')) {
            $httpOpts['headers']['Cookie'] = $cookie;
        }

        $base = $request->getSchemeAndHttpHost(); // e.g., https://dashboard.owners2.com
        $url  = $base . '/api/services/expected-payments/bulk?yearMonth=' . urlencode($ym);

        try {
            $resp = $httpClient->request('GET', $url, $httpOpts);
            if ($resp->getStatusCode() === 200) {
                $json = $resp->toArray(false);
                if (isset($json['services']) && is_array($json['services'])) {
                    // exact key or case-insensitive
                    if (isset($json['services'][$service]) && is_array($json['services'][$service])) {
                        $rows = $json['services'][$service];
                    } else {
                        foreach ($json['services'] as $svcKey => $svcRows) {
                            if (is_string($svcKey) && strtoupper($svcKey) === strtoupper($service) && is_array($svcRows)) {
                                $rows = $svcRows;
                                break;
                            }
                        }
                    }
                }
            } else {
                @error_log(sprintf('[services-payments/export.pdf] HTTP %d for %s', $resp->getStatusCode(), $url));
            }
        } catch (\Throwable $e) {
            @error_log('[services-payments/export.pdf] HTTP fetch failed: ' . $e->getMessage());
        }

        // Company logo (data URI)
        $company = [];
        $logoData = $this->getEmbeddedLogoDataUrl();
        if ($logoData) {
            $company['logoData'] = $logoData;
        }

        // Render Twig → HTML
        $html = $this->renderView('reports/services_payments_html.twig', [
            'service' => $service,
            'svc'     => $service,
            'month'   => $month,
            'year'    => $year,
            'rows'    => $rows,
            'company' => $company,
        ]);

        // HTML → PDF (inline)
        $output = $pdf->getOutputFromHtml($html);

        $response = new Response($output, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="services_payments_' . strtolower($service) . '_' . sprintf('%02d', $month) . '_' . $year . '.pdf"',
        ]);


        return $response;
    }

    #[Route('/api/reports/unit-monthly/status', name: 'api_reports_unit_monthly_status', methods: ['GET','POST'])]
    #[Route('/api/unit-monthly/status', name: 'api_unit_monthly_status', methods: ['GET','POST'])]
    public function status(
        Request $request,
        EntityManagerInterface $em
    ): JsonResponse {
        // Accept GET query, then fallback to Request bag, then JSON body
        $unitId = (int) $request->query->get('unitId', 0);
        $yearMonth = (string) $request->query->get('yearMonth', '');

        if ($unitId <= 0) { $unitId = (int) $request->get('unitId', $unitId); }
        if ($yearMonth === '') { $yearMonth = (string) $request->get('yearMonth', $yearMonth); }

        if ($request->isMethod('POST')) {
            $ct = (string) $request->headers->get('Content-Type');
            if (stripos($ct, 'application/json') !== false) {
                $tmp = json_decode($request->getContent() ?: '', true);
                if (is_array($tmp)) {
                    if ($unitId <= 0) { $unitId = (int) ($tmp['unitId'] ?? 0); }
                    if ($yearMonth === '') { $yearMonth = (string) ($tmp['yearMonth'] ?? ''); }
                }
            }
        }

        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            // TEMP diagnostics (remove after we verify dev/prod parity)
            $diag = [
                'qs'        => (string) $request->getQueryString(),
                'method'    => (string) $request->getMethod(),
                'ctype'     => (string) $request->headers->get('Content-Type'),
                'parsed'    => ['unitId' => $unitId, 'yearMonth' => $yearMonth],
                'body'      => substr((string) $request->getContent(), 0, 200),
                'routes'    => ['this' => __FUNCTION__],
            ];
            @error_log('[status] invalid input: ' . json_encode($diag));
            return new JsonResponse(['error' => 'Missing or invalid unitId/yearMonth', 'diag' => $diag], 400);
        }

        /** @var Unit|null $unit */
        $unit = $em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found'], 404);
        }

        // Resolve cycle row from OwnerReportCycle for this unit + month
        $cycleRepo = $em->getRepository(OwnerReportCycle::class);

        // Prefer querying by yearMonth property if it exists on the entity, falling back to reportMonth.
        $cycle = null;
        try {
            $cycle = $cycleRepo->findOneBy(['unit' => $unit, 'yearMonth' => $yearMonth]);
            if (!$cycle) {
                $cycle = $cycleRepo->findOneBy(['unit' => $unit, 'reportMonth' => $yearMonth]);
            }
        } catch (\Throwable $e) {
            // ignore, keep $cycle = null
        }

        // Derive human-friendly states
        $reportIssuedAt = $cycle && method_exists($cycle, 'getReportIssuedAt') ? $cycle->getReportIssuedAt() : null;
        $reportUrl      = $cycle && method_exists($cycle, 'getReportUrl')      ? (string)$cycle->getReportUrl() : null;
        $reportIssuedBy = $cycle && method_exists($cycle, 'getReportIssuedBy') ? (string)$cycle->getReportIssuedBy() : null;

        $reportDone = ($reportIssuedAt instanceof \DateTimeInterface) || (is_string($reportUrl) && $reportUrl !== '');

        $paymentStatus = $cycle && method_exists($cycle, 'getPaymentStatus') ? (string)$cycle->getPaymentStatus() : 'PENDING';
        $paymentAmount = $cycle && method_exists($cycle, 'getPaymentAmount') ? (float)$cycle->getPaymentAmount() : null;
        $paymentRef    = $cycle && method_exists($cycle, 'getPaymentRef')    ? (string)$cycle->getPaymentRef() : null;
        $paymentMethod = $cycle && method_exists($cycle, 'getPaymentMethod') ? (string)$cycle->getPaymentMethod() : null;
        $paymentAt     = $cycle && method_exists($cycle, 'getPaymentAt')     ? $cycle->getPaymentAt() : null;
        $paymentBy     = $cycle && method_exists($cycle, 'getPaymentBy')     ? (string)$cycle->getPaymentBy() : null;

        // Look for a REPORT_PAYMENT ledger row in the next-month window (payments recorded after the report month)
        $ledgerPayment = null;
        try {
            [$y, $m] = array_map('intval', explode('-', $yearMonth));
            $monthStart = new \DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $y, $m));
            $nextStart  = $monthStart->modify('first day of next month')->setTime(0, 0, 0);
            $nextNext   = $nextStart->modify('first day of next month')->setTime(0, 0, 0);

            $conn = $em->getConnection();
            // Prefer txn_date if present; fall back to created_at
            $sql = <<<SQL
SELECT id, amount, balance_after, reference, payment_method,
       COALESCE(txn_date, created_at) AS paid_at,
       created_by
FROM unit_balance_ledger
WHERE unit_id = :uid
  AND entry_type IN ('O2 Report Payment','Client Report Payment')
  AND COALESCE(txn_date, created_at) >= :start
  AND COALESCE(txn_date, created_at) < :end
ORDER BY COALESCE(txn_date, created_at) DESC, id DESC
LIMIT 1
SQL;
            $ledgerPayment = $conn->executeQuery($sql, [
                'uid'   => $unitId,
                'start' => $nextStart->format('Y-m-d H:i:s'),
                'end'   => $nextNext->format('Y-m-d H:i:s'),
            ])->fetchAssociative();
        } catch (\Throwable $e) {
            @error_log('[status] ledger payment lookup failed: ' . $e->getMessage());
        }

        if (is_array($ledgerPayment)) {
            // Override/augment payment info from ledger row
            $paymentIssued = true;
            $paymentStatus = 'PAID';
            $paymentAmount = isset($ledgerPayment['amount']) ? (float)$ledgerPayment['amount'] : $paymentAmount;
            $paymentRef    = isset($ledgerPayment['reference']) ? (string)$ledgerPayment['reference'] : $paymentRef;
            $paymentMethod = isset($ledgerPayment['payment_method']) ? (string)$ledgerPayment['payment_method'] : $paymentMethod;
            $paymentBy     = isset($ledgerPayment['created_by']) ? (string)$ledgerPayment['created_by'] : $paymentBy;
            $paymentAt     = null;
            if (!empty($ledgerPayment['paid_at'])) {
                try { $paymentAt = new \DateTimeImmutable((string)$ledgerPayment['paid_at']); } catch (\Throwable $e) { $paymentAt = null; }
            }
            // Expose ledgerId later in the response
            $ledgerIdForPayment = (int)($ledgerPayment['id'] ?? 0);
        } else {
            $ledgerIdForPayment = null;
        }

        // Consider payment "ISSUED" if it has a non-pending status, or a timestamp/amount/ref present
        $paymentIssued = false;
        $payStatusUpper = strtoupper((string)$paymentStatus);
        if (in_array($payStatusUpper, ['ISSUED','PAID','DONE','SENT'], true)) {
            $paymentIssued = true;
        }
        if (
            !$paymentIssued &&
            (
                ($paymentAt instanceof \DateTimeInterface)
                || ($paymentAmount !== null && abs($paymentAmount) > 0.0001)
                || (is_string($paymentRef) && $paymentRef !== '')
            )
        ) {
            $paymentIssued = true;
        }

        $emailStatus   = $cycle && method_exists($cycle, 'getEmailStatus')   ? (string)$cycle->getEmailStatus() : 'PENDING';
        $emailTo       = $cycle && method_exists($cycle, 'getEmailTo')       ? (string)$cycle->getEmailTo() : null;
        $emailSubject  = $cycle && method_exists($cycle, 'getEmailSubject')  ? (string)$cycle->getEmailSubject() : null;
        $emailMsgId    = $cycle && method_exists($cycle, 'getEmailMessageId')? (string)$cycle->getEmailMessageId() : null;
        $emailAt       = $cycle && method_exists($cycle, 'getEmailAt')       ? $cycle->getEmailAt() : null;
        $emailBy       = $cycle && method_exists($cycle, 'getEmailBy')       ? (string)$cycle->getEmailBy() : null;

        $emailSent = false;
        $emailUpper = strtoupper((string)$emailStatus);
        if (in_array($emailUpper, ['SENT','DELIVERED','DONE'], true)) {
            $emailSent = true;
        }
        if (
            !$emailSent &&
            (
                ($emailAt instanceof \DateTimeInterface)
                || (is_string($emailMsgId) && $emailMsgId !== '')
            )
        ) {
            $emailSent = true;
        }

        // Progress 0–3
        $progressCount = 0;
        if ($reportDone) { $progressCount++; }
        if ($paymentIssued) { $progressCount++; }
        if ($emailSent) { $progressCount++; }

        $result = [
            'unitId'    => $unitId,
            'yearMonth' => $yearMonth,

            'report' => [
                'state'     => $reportDone ? 'ISSUED' : 'PENDING',
                'issuedAt'  => $reportIssuedAt ? $reportIssuedAt->format(\DateTimeInterface::ATOM) : null,
                'issuedBy'  => $reportIssuedBy,
                'url'       => $reportUrl,
            ],

            'payment' => [
                'state'   => $paymentIssued ? 'ISSUED' : 'PENDING',
                'status'  => $paymentStatus,
                'amount'  => $paymentAmount,
                'ref'     => $paymentRef,
                'method'  => $paymentMethod,
                'at'      => $paymentAt ? $paymentAt->format(\DateTimeInterface::ATOM) : null,
                'by'      => $paymentBy,
                'ledgerId'=> $ledgerIdForPayment ?? null,
            ],

            'email' => [
                'state'      => $emailSent ? 'SENT' : 'PENDING',
                'status'     => $emailStatus,
                'to'         => $emailTo,
                'subject'    => $emailSubject,
                'messageId'  => $emailMsgId,
                'at'         => $emailAt ? $emailAt->format(\DateTimeInterface::ATOM) : null,
                'by'         => $emailBy,
            ],

            'progress' => [
                'count' => $progressCount,
                'total' => 3,
                'label' => sprintf('%d/3', $progressCount),
            ],

            // Back-compat keys the old FE expected
            'exists'   => (bool) $cycle,
            'ledgerId' => $ledgerIdForPayment ?? null,
        ];

        return new JsonResponse($result);
    }
    #[Route('/api/reports/generate', name: 'api_reports_generate', methods: ['POST'])]
    #[Route('/api/reports/generate-ledger', name: 'api_reports_generate_ledger', methods: ['POST'])]
    #[Route('/api/reports/unit-monthly/generate', name: 'api_reports_unit_monthly_generate', methods: ['POST'])]
    #[Route('/api/unit-monthly/generate', name: 'api_unit_monthly_generate', methods: ['POST'])]
    public function generate(
        Request $request,
        ReportDataBuilder $builder,
        Pdf $pdf,
        EntityManagerInterface $em,
        DocumentUploadService $uploadService,
        UnitMonthlyReportService $unitMonthly
    ): JsonResponse {
        $payload = json_decode($request->getContent() ?: '{}', true);
        $unitId = (int)($request->query->get('unitId') ?? $payload['unitId'] ?? 0);
        $yearMonth = (string)($request->query->get('yearMonth') ?? $payload['yearMonth'] ?? '');
        $replace = filter_var($request->query->get('replace', $payload['replace'] ?? false), FILTER_VALIDATE_BOOL);

        // Extract explicit values from payload or overrides (sent by frontend)
        $overridesIn = $payload['overrides'] ?? [];
        $num = static function($v){
            if ($v === null) return null;
            if (is_numeric($v)) return (float)$v;
            if (is_string($v)) { $v = str_replace([',',' '], '', $v); return is_numeric($v) ? (float)$v : null; }
            return null;
        };
        // Treat zeros as "not provided" to avoid overwriting server math with accidental 0s
        $meaningful = static function($v) { return $v !== null && is_finite((float)$v) && abs((float)$v) > 0.0005; };

        $explicitAmount  = $num($payload['amount']          ?? null);
        $explicitClosing = $num($payload['balanceAfter']    ?? null);
        $explicitOpening = $num($payload['openingBalance']  ?? null);

        // Pull from overrides if not meaningfully provided at top level
        if (!$meaningful($explicitAmount))  { $explicitAmount  = $num($overridesIn['monthlyResult']  ?? null); }
        if (!$meaningful($explicitClosing)) { $explicitClosing = $num($overridesIn['closingBalance'] ?? null); }
        if (!$meaningful($explicitOpening)) { $explicitOpening = $num($overridesIn['openingBalance'] ?? null); }

        // Normalize: zeros are treated as missing
        if (!$meaningful($explicitAmount))  { $explicitAmount  = null; }
        if (!$meaningful($explicitClosing)) { $explicitClosing = null; }
        if (!$meaningful($explicitOpening)) { $explicitOpening = null; }

        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            return new JsonResponse(['error' => 'Missing or invalid unitId/yearMonth'], 400);
        }

        /** @var Unit|null $unit */
        $unit = $em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return new JsonResponse(['error' => 'Unit not found'], 404);
        }

        $docId = null;

        // Build the report data using the same builder used by preview
        try {
            // Single source of truth: build the exact same payload used by Preview
            $data = $this->buildCanonicalReportPayload($unitId, $yearMonth, $builder, $unitMonthly);

            // Render native header partial to a temp file (explicit V2 header)
            $headerPath = null;
            $headerTpl  = 'reports_v2/_header.html.twig';
            try {
                $headerHtml = $this->renderView($headerTpl, $data);
                $tmp = tempnam(sys_get_temp_dir(), 'o2hdr_');
                if ($tmp) {
                    $headerPath = $tmp . '.html';
                    @file_put_contents($headerPath, $headerHtml);
                }
                // Diagnostics: dump header HTML and log temp path
                try {
                    $debugHeaderGen = $this->getParameter('kernel.project_dir') . '/var/owners2_last_header_gen.html';
                    @file_put_contents($debugHeaderGen, $headerHtml);
                    @error_log('[ReportController][generate] header ok tpl=' . $headerTpl . ' path=' . (string)$headerPath . ' bytes=' . strlen((string)$headerHtml));
                } catch (\Throwable $e) { /* ignore */ }
            } catch (\Throwable $e) {
                $headerPath = null;
                @error_log('[ReportController][generate] header render failed tpl=' . (string)($headerTpl ?? 'n/a') . ' err=' . $e->getMessage());
                try {
                    $debugErr = $this->getParameter('kernel.project_dir') . '/var/owners2_last_header_gen.error.txt';
                    @file_put_contents($debugErr, 'tpl=' . (string)($headerTpl ?? 'n/a') . "\n" . $e->getMessage());
                } catch (\Throwable $e2) { /* ignore */ }
            }

            // (inline header fallback removed)
            // Ensure Twig doesn't use a stale compiled cache (prod env keeps old compiled file names)
            try {
                if ($this->container->has('twig')) {
                    $twig = $this->container->get('twig');
                    if (is_object($twig) && method_exists($twig, 'clearCacheFiles')) {
                        $twig->clearCacheFiles();
                    }
                }
            } catch (\Throwable $e) { /* ignore cache clear failures */ }

            // Use the new Unit Report template (same as Preview V2)
            $html = $this->renderView('reports_v2/unit_report.pdf.twig', $data);
            // (inline header injection removed)
            // Debug: dump the exact HTML used for the generated Unit Report (server-side)
            try {
                $debugPathGen = $this->getParameter('kernel.project_dir') . '/var/owners2_last_unit_report_gen.html';
                @file_put_contents($debugPathGen, $html);
                @error_log('[ReportController][generate] wrote HTML to ' . $debugPathGen . ' len=' . strlen((string)$html));
            } catch (\Throwable $e) { /* ignore debug write errors */ }

            $wkhtmlOpts = [
                'header-html'    => $headerPath ? ('file://' . $headerPath) : null,
                'header-line'    => false,
                'header-spacing' => 8,
                'footer-html'    => null,
                'footer-line'    => false,

                'no-outline'     => true,
                'quiet'          => true,
                'enable-local-file-access' => true,

                'margin-top'     => 24,
                'margin-bottom'  => 18,
                'margin-left'    => 12,
                'margin-right'   => 12,
            ];
            $pdfBinary = $pdf->getOutputFromHtml($html, $wkhtmlOpts, true);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Report generation failed', 'details' => $e->getMessage()], 500);
        }

        // Derive month boundaries (stamp the ledger on the FIRST day of the FOLLOWING month)
        [$y, $m] = array_map('intval', explode('-', $yearMonth));
        $monthStart = new \DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $y, $m));
        $monthEnd   = $monthStart->modify('last day of this month')->setTime(23, 59, 59);

        // Check for existing ledger record for this unit and *this report's posting month*.
        // A report for Y-M is posted on the FIRST DAY OF THE NEXT MONTH (nextStart).
        // Therefore, existence must be checked in [nextStart, nextNextStart).
        // Canonical entry_type: Month Report
        $ledgerRepo = $em->getRepository(UnitBalanceLedger::class);
        $nextStart      = $monthStart->modify('first day of next month')->setTime(0, 0, 0);
        $nextNextStart  = $nextStart->modify('first day of next month')->setTime(0, 0, 0);
  
        $qb = $ledgerRepo->createQueryBuilder('l');
  
        // Detect which date field exists on the entity to avoid DQL errors
        $dateField = null;
        if (method_exists(\App\Entity\UnitBalanceLedger::class, 'getTxnDate')) {
            $dateField = 'txnDate';
        } elseif (method_exists(\App\Entity\UnitBalanceLedger::class, 'getDate')) {
            $dateField = 'date';
        }
  
        $qb->andWhere('l.unit = :unit')
           ->andWhere('l.entryType = :type')
           ->setParameter('unit', $unit)
           ->setParameter('type', 'Month Report');
  
        if ($dateField) {
            $qb->andWhere(sprintf('l.%s >= :postStart', $dateField))
               ->andWhere(sprintf('l.%s < :postEnd',   $dateField))
               ->setParameter('postStart', $nextStart)
               ->setParameter('postEnd',   $nextNextStart);
        }

        $qb->setMaxResults(1);

        $existingLedger = $qb->getQuery()->getOneOrNullResult();

        if ($existingLedger && !$replace) {
            return new JsonResponse([
                'ok' => true,
                'existing' => true,
                'message' => 'A report for this unit and month already exists. Replace current file?',
                'ledgerId' => $existingLedger->getId(),
                'unitId' => $unitId,
                'yearMonth' => $yearMonth,
            ], 200);
        }

        // Persist ledger + UnitDocument + mark reportIssuedAt in a transaction
        $publicUrl = null; // If you later wire DocumentUploadService, set this accordingly
        try {
            $em->wrapInTransaction(function(EntityManagerInterface $txEm) use ($unit, $yearMonth, $monthStart, $monthEnd, $nextStart, $data, $pdfBinary, $existingLedger, &$publicUrl, &$docId, $uploadService, $explicitAmount, $explicitClosing, $explicitOpening, &$monthlyAmount, &$closingBalance) {
                // Local numeric parser (ensures we can parse numbers inside the TX closure)
                $num = static function($v) {
                    if ($v === null) return null;
                    if (is_numeric($v)) return (float)$v;
                    if (is_string($v)) {
                        $vv = str_replace([',',' '], '', $v);
                        return is_numeric($vv) ? (float)$vv : null;
                    }
                    return null;
                };
                // Remove existing document linked to the ledger (if any)
                if ($existingLedger && method_exists($existingLedger, 'getId')) {
                    $docRepo = $txEm->getRepository(UnitDocument::class);
                    $oldDoc = $docRepo->findOneBy(['ledger' => $existingLedger]);
                    if ($oldDoc) {
                        $txEm->remove($oldDoc);
                        $txEm->flush();
                    }
                }

                // If replacing, delete existing ledger first (UnitDocument should cascade-delete via FK)
                if ($existingLedger) {
                    $txEm->remove($existingLedger);
                    $txEm->flush();
                }

                // --- Determine balances and monthly amount robustly ---
                // 1) Previous balance strictly before txn date (first day of next month)
                $conn = $txEm->getConnection();
                $previousBalance = 0.0;
                try {
                    $cutoffStr = $nextStart->format('Y-m-d H:i:s');
                    @error_log(sprintf('[ReportController][generate] prev-balance lookup unit=%d cutoff=%s', $unit->getId(), $cutoffStr));

                    $prevSql = 'SELECT balance_after
                                FROM unit_balance_ledger
                                WHERE unit_id = :uid
                                  AND txn_date < :cutoff
                                ORDER BY txn_date DESC, id DESC
                                LIMIT 1';
                    $prevStmt = $conn->prepare($prevSql);
                    $prevStmt->bindValue('uid', $unit->getId());
                    $prevStmt->bindValue('cutoff', $cutoffStr);
                    $prevRow = $prevStmt->executeQuery()->fetchAssociative();

                    @error_log('[ReportController][generate] prev-balance row=' . json_encode($prevRow, JSON_UNESCAPED_SLASHES));
                    if ($prevRow && isset($prevRow['balance_after'])) {
                        $previousBalance = (float) $prevRow['balance_after'];
                    }
                } catch (\Throwable $e) {
                    @error_log('[ReportController][generate] prev-balance error: ' . $e->getMessage());
                }

                // Decide opening balance used for math
                $openingForMath = ($explicitOpening !== null) ? (float)$explicitOpening : (float)$previousBalance;

                // 2) Canonical monthly delta from the report payload (server-truth)
                // NOTE: We intentionally ignore client-provided overrides for amount/balances.
                $monthlyAmount = 0.0;
                try {
                    if (isset($data['monthlyResult'])) {
                        $monthlyAmount = (float) $data['monthlyResult'];
                    } elseif (isset($data['summary']['monthlyResult'])) {
                        $monthlyAmount = (float) $num($data['summary']['monthlyResult']);
                    }
                } catch (\Throwable $e) { /* ignore */ }

                // 3) Running balance after posting: previous balance + delta
                $closingBalance = (float) $openingForMath + (float) $monthlyAmount;

                // Create UnitBalanceLedger entry
                $ledger = new UnitBalanceLedger();
                if (method_exists($ledger, 'setUnit')) { $ledger->setUnit($unit); }
                // Prefer txnDate if entity uses it; fallback to date
                if (method_exists($ledger, 'setTxnDate')) { $ledger->setTxnDate($nextStart); }
                elseif (method_exists($ledger, 'setDate')) { $ledger->setDate($nextStart); }
                if (method_exists($ledger, 'setEntryType')) { $ledger->setEntryType('Month Report'); }
                elseif (method_exists($ledger, 'setType'))   { $ledger->setType('Month Report'); }
                if (method_exists($ledger, 'setAmount')) { $ledger->setAmount($monthlyAmount); }
                if (method_exists($ledger, 'setBalanceAfter')) { $ledger->setBalanceAfter($closingBalance); }
                if (method_exists($ledger, 'setReference')) {
                    $ref = sprintf('Client Report %s%s', substr($yearMonth, 2, 2), substr($yearMonth, 5, 2));
                    $ledger->setReference($ref);
                }
                if (method_exists($ledger, 'setCreatedBy')) { $ledger->setCreatedBy('system'); }
                // Explicitly set yearMonth to ensure correct report month is saved
                if (method_exists($ledger, 'setYearMonth')) { $ledger->setYearMonth($yearMonth); }
                // Ensure createdAt is set defensively
                if (method_exists($ledger, 'setCreatedAt') && method_exists($ledger, 'getCreatedAt') && $ledger->getCreatedAt() === null) {
                    $ledger->setCreatedAt(new \DateTimeImmutable());
                }
                // Do not set documentUrl here; only after upload
                $txEm->persist($ledger);

                // Flush to obtain an ID for the new ledger (needed if we upload via service)
                try {
                    $txEm->flush();
                } catch (\Throwable $e) {
                    throw new \RuntimeException('STAGE:ledger::' . $e->getMessage(), previous: $e);
                }

                // Upload the PDF using DocumentUploadService. We REQUIRE S3 upload to succeed; no more local placeholder.
                $didUploadViaService = false;
                $uploadError = null;
                if ($uploadService && method_exists($uploadService, 'uploadForLedger')) {
                    try {
                        $desc = $uploadService->buildReportDescription($unit, $yearMonth);
                        $originalName = $uploadService->buildReportOriginalName($unit->getId(), $yearMonth);

                        $docEntity = $uploadService->uploadForLedger(
                            ledgerId: $ledger->getId(),
                            unitId: $unit->getId(),
                            category: 'REPORT',
                            description: $desc,
                            dateForName: $monthStart, // report month (used for yymm)
                            mime: 'application/pdf',
                            originalName: $originalName,
                            bytes: $pdfBinary
                        );
                        if ($docEntity) {
                            if (method_exists($docEntity, 'getId')) { $docId = $docEntity->getId(); }
                            // Prefer S3 URL (document_url may be intentionally absent now)
                            $tmpUrl = null;
                            if (method_exists($docEntity, 'getS3Url')) { $tmpUrl = $docEntity->getS3Url(); }
                            if ((!is_string($tmpUrl) || $tmpUrl === '') && method_exists($docEntity, 'getDocumentUrl')) {
                                $tmpUrl = $docEntity->getDocumentUrl();
                            }
                            if (is_string($tmpUrl) && $tmpUrl !== '') {
                                $publicUrl = $tmpUrl; // lock-in URL from freshly saved entity
                            }
                        }
                        // Consider upload successful as long as the service returned an entity
                        $didUploadViaService = ($docEntity !== null);
                        if (!$didUploadViaService && !$uploadError) {
                            $uploadError = 'upload service returned no document entity';
                        }
                        // Ensure UnitDocument auditing fields are populated (avoid NOT NULL violations)
                        if ($docEntity) {
                            if (method_exists($docEntity, 'getCreatedBy') && method_exists($docEntity, 'setCreatedBy')) {
                                $cb = $docEntity->getCreatedBy();
                                if ($cb === null || $cb === '') { $docEntity->setCreatedBy('system'); }
                            }
                            if (method_exists($docEntity, 'getUploadedBy') && method_exists($docEntity, 'setUploadedBy')) {
                                $ub = $docEntity->getUploadedBy();
                                if ($ub === null || $ub === '') { $docEntity->setUploadedBy('system'); }
                            }
                            if (method_exists($docEntity, 'getCreatedAt') && method_exists($docEntity, 'setCreatedAt') && $docEntity->getCreatedAt() === null) {
                                $docEntity->setCreatedAt(new \DateTimeImmutable());
                            }
                            if (method_exists($docEntity, 'setUpdatedAt')) {
                                $docEntity->setUpdatedAt(new \DateTimeImmutable());
                            }
                            $txEm->persist($docEntity);
                            try {
                                $txEm->flush();
                            } catch (\Throwable $e) {
                                throw new \RuntimeException('STAGE:document::' . $e->getMessage(), previous: $e);
                            }
                        }
                        if (!is_string($publicUrl) || $publicUrl === '') {
                            // Re-fetch canonical URL from unit_document via attachment (target_type=unit_balance_ledger)
                            try {
                                $conn2 = $txEm->getConnection();
                                $sql = <<<SQL
SELECT d.s3_url, d.s3Url, d.document_url
FROM unit_document_attachment a
JOIN unit_document d ON d.id = a.document_id
WHERE a.target_type = 'unit_balance_ledger'
  AND a.target_id = :lid
  AND LOWER(a.category) IN ('report','reports','monthly_report','reportes')
ORDER BY a.id DESC
LIMIT 1
SQL;
                                $docRow = $conn2->executeQuery($sql, ['lid' => $ledger->getId()])->fetchAssociative();
                                if (is_array($docRow)) {
                                    $candidate = $docRow['s3_url'] ?? $docRow['s3Url'] ?? $docRow['document_url'] ?? null;
                                    if (is_string($candidate) && $candidate !== '') { $publicUrl = $candidate; }
                                }
                            } catch (\Throwable $e) {
                                @error_log('[ReportController][generate] attachment URL lookup failed: ' . $e->getMessage());
                            }

                            // Final fallback: resolve URL via attachment->document id, then unit_document (in case columns differ)
                            if (!is_string($publicUrl) || $publicUrl === '') {
                                try {
                                    $conn3 = $txEm->getConnection();
                                    $docIdRow = $conn3->executeQuery(
                                        'SELECT document_id FROM unit_document_attachment WHERE target_type = \'unit_balance_ledger\' AND target_id = :lid ORDER BY id DESC LIMIT 1',
                                        ['lid' => $ledger->getId()]
                                    )->fetchAssociative();
                                    if ($docIdRow && isset($docIdRow['document_id'])) {
                                        $docRow2 = $conn3->executeQuery(
                                            'SELECT s3_url, s3Url, document_url FROM unit_document WHERE id = :did',
                                            ['did' => (int)$docIdRow['document_id']]
                                        )->fetchAssociative();
                                        if ($docRow2) {
                                            $candidate2 = $docRow2['s3_url'] ?? $docRow2['s3Url'] ?? $docRow2['document_url'] ?? null;
                                            if (is_string($candidate2) && $candidate2 !== '') { $publicUrl = $candidate2; }
                                        }
                                    }
                                } catch (\Throwable $e) {
                                    @error_log('[ReportController][generate] fallback by document_id failed: ' . $e->getMessage());
                                }
                            }
                        }
                    } catch (\Throwable $e) {
                        $uploadError = $e->getMessage();
                    }
                } else {
                    $uploadError = 'DocumentUploadService missing or method not found';
                }

                if (!$didUploadViaService) {
                    $diag = sprintf('unit=%d ym=%s bytes=%d', $unit->getId(), $yearMonth, is_string($pdfBinary) ? strlen($pdfBinary) : 0);
                    $err = (string)$uploadError;
                    if ($err === '') { $err = 'no error detail from uploader'; }
                    @error_log('[ReportController][generate] S3 upload failed. ' . $diag . ' err=' . $err);
                    throw new \RuntimeException('Failed to upload report PDF to S3: ' . $err);
                }

                @error_log('[ReportController][generate] resolved publicUrl=' . (string)$publicUrl . ' ledgerId=' . (int)$ledger->getId());
                // Note: UnitBalanceLedger has no document URL field; linkage to the file is via unit_document (by ledger_id).
                // The public URL is stored in OwnerReportCycle->reportUrl for quick access by the UI.

                // Upsert OwnerReportCycle for (unit, yearMonth) and stamp report fields
                $cycleRepo = $txEm->getRepository(OwnerReportCycle::class);
                /** @var OwnerReportCycle|null $cycle */
                $cycle = $cycleRepo->findOneBy(['unit' => $unit, 'yearMonth' => $yearMonth]);
                if (!$cycle) {
                    $cycle = new OwnerReportCycle();
                    if (method_exists($cycle, 'setUnit')) { $cycle->setUnit($unit); }
                    if (method_exists($cycle, 'setYearMonth')) { $cycle->setYearMonth($yearMonth); }
                }

                // Derive user name/email for issued_by
                $issuedBy = 'system';
                try {
                    if (method_exists($this, 'getUser') && $this->getUser()) {
                        $u = $this->getUser();
                        if (is_object($u)) {
                            if (method_exists($u, 'getUserIdentifier') && $u->getUserIdentifier()) {
                                $issuedBy = (string) $u->getUserIdentifier();
                            } elseif (method_exists($u, 'getEmail') && $u->getEmail()) {
                                $issuedBy = (string) $u->getEmail();
                            } elseif (method_exists($u, 'getUsername') && $u->getUsername()) {
                                $issuedBy = (string) $u->getUsername();
                            }
                        }
                    }
                } catch (\Throwable $e) { /* default to 'system' */ }

                $now = new \DateTimeImmutable();
                if (method_exists($cycle, 'setReportMonth')) {
                    $cycle->setReportMonth($yearMonth);
                }
                if (method_exists($cycle, 'setReportIssuedAt')) {
                    $cycle->setReportIssuedAt($now);
                }
                if (method_exists($cycle, 'setReportIssuedBy')) {
                    $cycle->setReportIssuedBy($issuedBy);
                }
                $didSetUrlOnEntity = false;
                if (is_string($publicUrl) && $publicUrl !== '') {
                    if (method_exists($cycle, 'setReportUrl')) {
                        $cycle->setReportUrl($publicUrl);
                        $didSetUrlOnEntity = true;
                    } elseif (method_exists($cycle, 'setReportURL')) { // defensive naming
                        $cycle->setReportURL($publicUrl);
                        $didSetUrlOnEntity = true;
                    }
                } else {
                    @error_log('[ReportController][generate] publicUrl empty before persisting cycle for unit=' . $unit->getId() . ' ym=' . $yearMonth);
                }
                if (method_exists($cycle, 'setCreatedAt') && $cycle->getCreatedAt() === null) {
                    $cycle->setCreatedAt($now);
                }
                if (method_exists($cycle, 'setUpdatedAt')) {
                    $cycle->setUpdatedAt($now);
                }
                $txEm->persist($cycle);
                try {
                    $txEm->flush();
                } catch (\Throwable $e) {
                    throw new \RuntimeException('STAGE:cycle::' . $e->getMessage(), previous: $e);
                }

                // Guarantee report_url is set on this exact row if we have a URL
                if (is_string($publicUrl) && $publicUrl !== '') {
                    try {
                        $connFix = $txEm->getConnection();
                        // Update by primary key for absolute certainty
                        $cycleId = method_exists($cycle, 'getId') ? (int)$cycle->getId() : 0;
                        if ($cycleId > 0) {
                            $connFix->executeStatement(
                                'UPDATE owner_report_cycle SET report_url = :url WHERE id = :id',
                                ['url' => $publicUrl, 'id' => $cycleId]
                            );
                        } else {
                            // Fallback: update by unit + month columns
                            $updated = 0;
                            try {
                                $updated = $connFix->executeStatement(
                                    'UPDATE owner_report_cycle SET report_url = :url WHERE unit_id = :uid AND year_month = :ym',
                                    ['url' => $publicUrl, 'uid' => $unit->getId(), 'ym' => $yearMonth]
                                );
                            } catch (\Throwable $e) { /* ignore and try report_month */ }
                            if ($updated === 0) {
                                $connFix->executeStatement(
                                    'UPDATE owner_report_cycle SET report_url = :url WHERE unit_id = :uid AND report_month = :ym',
                                    ['url' => $publicUrl, 'uid' => $unit->getId(), 'ym' => $yearMonth]
                                );
                            }
                        }
                    } catch (\Throwable $e) {
                        @error_log('[ReportController][generate] PK update of report_url failed: ' . $e->getMessage());
                    }
                }

            });
        } catch (\Throwable $e) {
            $msg = (string)$e->getMessage();
            $stage = null;
            if (str_starts_with($msg, 'STAGE:')) {
                // Expected format: STAGE:<name>::<message>
                $parts = explode('::', substr($msg, 6), 2);
                $stage = $parts[0] ?? null;
                $msg = $parts[1] ?? $msg;
            }
            return new JsonResponse([
                'ok' => false,
                'error' => 'Failed to persist report state',
                'stage' => $stage,
                'details' => $msg,
            ], 500);
        }

        @error_log('[ReportController][generate] final publicUrl=' . (string)$publicUrl);
        return new JsonResponse([
            'ok' => true,
            'unitId' => $unitId,
            'yearMonth' => $yearMonth,
            'publicUrl' => $publicUrl,
            'documentId' => $docId ?? null,
            'reportIssuedAt' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
            'replaced' => (bool) $replace,
            'amount' => isset($monthlyAmount) ? round((float)$monthlyAmount, 2) : null,
            'balanceAfter' => isset($closingBalance) ? round((float)$closingBalance, 2) : null,
            'upload' => 's3',
        ]);
    }
    #[Route('/api/unit-monthly/register-payment', name: 'api_unit_monthly_register_payment', methods: ['POST'])]
    #[Route('/api/unit-monthly/payment', name: 'api_unit_monthly_payment', methods: ['POST'])]
    #[Route('/api/reports/unit-monthly/payment', name: 'api_reports_unit_monthly_payment', methods: ['POST'])]
    public function registerPayment(
        Request $request,
        EntityManagerInterface $em,
        DocumentUploadService $uploadService
    ): JsonResponse {
        $payload = json_decode($request->getContent() ?: '{}', true);
        $unitId        = (int)($payload['unitId'] ?? 0);
        $yearMonth     = (string)($payload['yearMonth'] ?? '');
        $amountIn      = $payload['amount'] ?? null;            // positive from UI
        $paymentMethod = (string)($payload['paymentMethod'] ?? 'Transfer');
        $reference     = (string)($payload['reference'] ?? '');
        // Accept txn_date from FE (preferred), fallback to legacy 'date'
        $dateStr       = (string)($payload['txn_date'] ?? $payload['date'] ?? '');

        if ($unitId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $yearMonth) || $amountIn === null) {
            return new JsonResponse(['ok' => false, 'error' => 'Missing or invalid unitId/yearMonth/amount'], 400);
        }

        /** @var Unit|null $unit */
        $unit = $em->getRepository(Unit::class)->find($unitId);
        if (!$unit) {
            return new JsonResponse(['ok' => false, 'error' => 'Unit not found'], 404);
        }

        $num = static function($v){
            if ($v === null) return null;
            if (is_numeric($v)) return (float)$v;
            if (is_string($v)) { $vv = str_replace([',',' '], '', $v); return is_numeric($vv) ? (float)$vv : null; }
            return null;
        };
        // Determine the ledger entry type (new enum values)
        $closingBalanceHint = $num($payload['closingBalance'] ?? null);
        $uiTypeRaw = strtoupper((string)($payload['entryType'] ?? $payload['uiEntryType'] ?? ''));
        $etype = null;
        if ($uiTypeRaw === 'O2_PAYMENT') {
            $etype = 'O2 Report Payment';
        } elseif ($uiTypeRaw === 'CLIENT_PAYMENT') {
            $etype = 'Client Report Payment';
        } elseif ($closingBalanceHint !== null) {
            // Fallback by balance direction: >0 means O2 pays client; <0 client pays O2
            $etype = ($closingBalanceHint > 0) ? 'O2 Report Payment' : 'Client Report Payment';
        } else {
            // Default if UI didn't specify and no hint: assume client pays O2
            $etype = 'Client Report Payment';
        }

        $amount = $num($amountIn);
        if ($amount === null) { return new JsonResponse(['ok' => false, 'error' => 'Invalid amount'], 400); }

        // Normalize sign: UI sends positive; store negative if payout to client (O2 Report Payment), positive if payment from client.
        if ($etype === 'O2 Report Payment') {
            $amount = -abs($amount);
        } else { // Client Report Payment
            $amount = abs($amount);
        }

        // Compute txn date: prefer provided date, else now
        try {
            $txnDate = $dateStr ? new \DateTimeImmutable($dateStr) : new \DateTimeImmutable();
        } catch (\Throwable $e) { $txnDate = new \DateTimeImmutable(); }

        // Determine posting window for this report: payments for Y-M are posted in [first of next month, first of the month after)
        [$y, $m] = array_map('intval', explode('-', $yearMonth));
        $monthStart = new \DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $y, $m));
        $postStart  = $monthStart->modify('first day of next month')->setTime(0, 0, 0);
        $postEnd    = $postStart->modify('first day of next month')->setTime(0, 0, 0);

        // Previous balance strictly before txnDate
        $conn = $em->getConnection();
        $prevBalance = 0.0;
        try {
            $prevSql = 'SELECT balance_after FROM unit_balance_ledger WHERE unit_id = :uid AND txn_date < :d ORDER BY txn_date DESC, id DESC LIMIT 1';
            $row = $conn->executeQuery($prevSql, ['uid' => $unitId, 'd' => $txnDate->format('Y-m-d H:i:s')])->fetchAssociative();
            if ($row && isset($row['balance_after'])) { $prevBalance = (float)$row['balance_after']; }
        } catch (\Throwable $e) { /* ignore */ }

        $balanceAfter = $prevBalance + $amount;

        // Upsert: look for an existing payment ledger in the posting window for this unit/month/type
        $ledgerRepo = $em->getRepository(UnitBalanceLedger::class);
        $qb = $ledgerRepo->createQueryBuilder('l');

        // Detect which date field the entity exposes
        $dateField = null;
        if (method_exists(\App\Entity\UnitBalanceLedger::class, 'getTxnDate')) {
            $dateField = 'l.txnDate';
        } elseif (method_exists(\App\Entity\UnitBalanceLedger::class, 'getDate')) {
            $dateField = 'l.date';
        }

        $qb->andWhere('l.unit = :unit')
           ->andWhere('l.entryType = :etype')
           ->setParameter('unit', $unit)
           ->setParameter('etype', $etype)
           ->setMaxResults(1);

        if ($dateField) {
            $qb->andWhere($dateField . ' >= :postStart')
               ->andWhere($dateField . ' < :postEnd')
               ->setParameter('postStart', $postStart)
               ->setParameter('postEnd',   $postEnd);
        }

        /** @var UnitBalanceLedger|null $existingPayment */
        $existingPayment = $qb->getQuery()->getOneOrNullResult();

        // Persist ledger row (upsert)
        $status = 'created';
        if ($existingPayment) {
            // Update existing payment
            if (method_exists($existingPayment, 'setTxnDate')) { $existingPayment->setTxnDate($txnDate); }
            elseif (method_exists($existingPayment, 'setDate')) { $existingPayment->setDate($txnDate); }
            if (method_exists($existingPayment, 'setAmount')) { $existingPayment->setAmount($amount); }
            if (method_exists($existingPayment, 'setBalanceAfter')) { $existingPayment->setBalanceAfter($balanceAfter); }
            if ($reference !== '' && method_exists($existingPayment, 'setReference')) { $existingPayment->setReference($reference); }
            if (method_exists($existingPayment, 'setPaymentMethod')) { $existingPayment->setPaymentMethod($paymentMethod ?: 'Transfer'); }
            if (method_exists($existingPayment, 'setYearMonth')) { $existingPayment->setYearMonth($yearMonth); }
            if (method_exists($existingPayment, 'setUpdatedAt')) { $existingPayment->setUpdatedAt(new \DateTimeImmutable()); }
            $em->persist($existingPayment);
            $em->flush();
            $ledger = $existingPayment;
            $status = 'updated';
        } else {
            // Create new payment
            $ledger = new UnitBalanceLedger();
            if (method_exists($ledger, 'setUnit')) { $ledger->setUnit($unit); }
            if (method_exists($ledger, 'setTxnDate')) { $ledger->setTxnDate($txnDate); }
            elseif (method_exists($ledger, 'setDate')) { $ledger->setDate($txnDate); }
            // Only set entryType
            if (method_exists($ledger, 'setEntryType')) { $ledger->setEntryType($etype); }
            if (method_exists($ledger, 'setAmount')) { $ledger->setAmount($amount); }
            if (method_exists($ledger, 'setBalanceAfter')) { $ledger->setBalanceAfter($balanceAfter); }
            if ($reference !== '' && method_exists($ledger, 'setReference')) { $ledger->setReference($reference); }
            if (method_exists($ledger, 'setPaymentMethod')) { $ledger->setPaymentMethod($paymentMethod ?: 'Transfer'); }
            if (method_exists($ledger, 'setYearMonth')) { $ledger->setYearMonth($yearMonth); }
            if (method_exists($ledger, 'setCreatedBy')) {
                $createdBy = 'system';
                try {
                    if (method_exists($this, 'getUser') && $this->getUser()) {
                        $u = $this->getUser();
                        if (is_object($u)) {
                            if (method_exists($u, 'getUserIdentifier') ) { $createdBy = (string)$u->getUserIdentifier(); }
                            elseif (method_exists($u, 'getEmail')) { $createdBy = (string)$u->getEmail(); }
                            elseif (method_exists($u, 'getUsername')) { $createdBy = (string)$u->getUsername(); }
                        }
                    }
                } catch (\Throwable $e) { /* keep system */ }
                $ledger->setCreatedBy($createdBy);
            }
            if (method_exists($ledger, 'setCreatedAt') && method_exists($ledger, 'getCreatedAt') && $ledger->getCreatedAt() === null) {
                $ledger->setCreatedAt(new \DateTimeImmutable());
            }
            $em->persist($ledger);
            $em->flush();
        }

        // --- Optional payment proof upload (category: REPORTE-PAGO) ---
        // Accept either multipart file "file" or JSON {fileBase64, fileName}
        $docId = null;
        $docUrl = null;
        try {
            $bytes = null;
            $mime = null;
            $originalName = null;

            // Multipart form-data path
            $uploadedFile = $request->files->get('file');
            if ($uploadedFile) {
                $originalName = $uploadedFile->getClientOriginalName() ?: 'payment-proof';
                $mime = $uploadedFile->getMimeType() ?: 'application/octet-stream';
                $bytes = @file_get_contents($uploadedFile->getPathname());
            }

            // JSON base64 path (data URL or raw base64)
            if ($bytes === null && isset($payload['fileBase64']) && is_string($payload['fileBase64'])) {
                $b64 = $payload['fileBase64'];
                $originalName = (string)($payload['fileName'] ?? 'payment-proof');
                if (preg_match('/^data:(.*?);base64,(.*)$/', $b64, $m)) {
                    $mime = $m[1] ?: 'application/octet-stream';
                    $bytes = base64_decode($m[2], true);
                } else {
                    $mime = 'application/octet-stream';
                    $bytes = base64_decode($b64, true);
                }
            }

            if ($bytes !== null && $uploadService && method_exists($uploadService, 'uploadForLedger')) {
                // Ensure we have a sensible original name with extension
                if (!$originalName) { $originalName = 'payment-proof'; }
                if (!preg_match('/\.(pdf|jpg|jpeg|png)$/i', $originalName)) {
                    // Default to pdf; DocumentUploadService may convert images if configured
                    $originalName .= '.pdf';
                }

                $desc = sprintf('Comprobante de pago %s', $yearMonth);
                $docEntity = $uploadService->uploadForLedger(
                    ledgerId: $ledger->getId(),
                    unitId: $unitId,
                    category: 'REPORTE-PAGO',
                    description: $desc,
                    dateForName: $txnDate,         // use payment date for name stamp
                    mime: $mime ?: 'application/octet-stream',
                    originalName: $originalName,
                    bytes: $bytes
                );

                if ($docEntity) {
                    // Ensure label and auditing fields are set as requested
                    if (method_exists($docEntity, 'setLabel')) { $docEntity->setLabel('Payment Proof'); }
                    if (method_exists($docEntity, 'setUploadedAt')) { $docEntity->setUploadedAt($txnDate); }
                    if (method_exists($docEntity, 'setUploadedBy') && method_exists($docEntity, 'getUploadedBy')) {
                        if (!$docEntity->getUploadedBy()) { $docEntity->setUploadedBy('system'); }
                    }
                    // Re-persist in case we changed label/audit fields after upload service created it
                    $em->persist($docEntity);
                    $em->flush();

                    if (method_exists($docEntity, 'getId'))        { $docId = $docEntity->getId(); }
                    if (method_exists($docEntity, 'getDocumentUrl')) {
                        $docUrl = (string)$docEntity->getDocumentUrl();
                    } elseif (method_exists($docEntity, 'getS3Url')) {
                        $docUrl = (string)$docEntity->getS3Url();
                    }
                }
            }
        } catch (\Throwable $e) {
            // Swallow proof upload issues so payment can still be recorded; FE can retry upload
            @error_log('[registerPayment] proof upload failed: ' . $e->getMessage());
        }

        // --- Upsert payment fields into OwnerReportCycle for (unit, yearMonth) ---
        try {
            $cycleRepo = $em->getRepository(OwnerReportCycle::class);

            /** @var OwnerReportCycle|null $cycle */
            $cycle = null;
            // Prefer yearMonth if the entity has it, else fall back to reportMonth
            try {
                $cycle = $cycleRepo->findOneBy(['unit' => $unit, 'yearMonth' => $yearMonth]);
            } catch (\Throwable $e) {
                // ignore
            }
            if (!$cycle) {
                try {
                    $cycle = $cycleRepo->findOneBy(['unit' => $unit, 'reportMonth' => $yearMonth]);
                } catch (\Throwable $e) {
                    // ignore
                }
            }
            if (!$cycle) {
                $cycle = new OwnerReportCycle();
                if (method_exists($cycle, 'setUnit')) { $cycle->setUnit($unit); }
                // Persist the month on both props defensively if they exist
                if (method_exists($cycle, 'setYearMonth')) { $cycle->setYearMonth($yearMonth); }
                if (method_exists($cycle, 'setReportMonth')) { $cycle->setReportMonth($yearMonth); }
            }

            // Normalize values for cycle (use the UI-provided amount as-is/positive)
            $amountForCycle = $num($amountIn);
            if ($amountForCycle === null) { $amountForCycle = 0.0; }
            $refForCycle    = $reference ?: null;
            $methodForCycle = $paymentMethod ?: 'Transfer';
            // Use the same txn date as the ledger row unless an explicit date was given (already parsed as $txnDate)
            $paymentAtDate  = $txnDate;

            // Update payment fields
            if (method_exists($cycle, 'setPaymentStatus')) { $cycle->setPaymentStatus('PAID'); }
            if (method_exists($cycle, 'setPaymentAmount')) { $cycle->setPaymentAmount($amountForCycle); }
            if (method_exists($cycle, 'setPaymentRef'))    { $cycle->setPaymentRef($refForCycle); }
            if (method_exists($cycle, 'setPaymentMethod')) { $cycle->setPaymentMethod($methodForCycle); }
            if (method_exists($cycle, 'setPaymentAt'))     { $cycle->setPaymentAt($paymentAtDate); }
            if (method_exists($cycle, 'setPaymentBy'))     { $cycle->setPaymentBy('system'); }

            // Keep generic timestamps if your entity exposes them
            $now = new \DateTimeImmutable();
            if (method_exists($cycle, 'setUpdatedAt')) { $cycle->setUpdatedAt($now); }
            if (method_exists($cycle, 'setCreatedAt') && method_exists($cycle, 'getCreatedAt') && $cycle->getCreatedAt() === null) {
                $cycle->setCreatedAt($now);
            }

            $em->persist($cycle);
            $em->flush();
        } catch (\Throwable $e) {
            @error_log('[registerPayment] failed to upsert OwnerReportCycle: ' . $e->getMessage());
            // Non-fatal: do not block the main payment registration
        }

        return new JsonResponse([
            'ok'        => true,
            'status'    => $status,               // 'created' | 'updated'
            'entryType' => $etype,
            'id'        => method_exists($ledger, 'getId') ? $ledger->getId() : null,
            'document'  => [
                'id'  => $docId,
                'url' => $docUrl,
            ],
        ]);
    }
    #[Route('/api/reports/hr/payment-request/preview', name: 'hr_payment_request_preview', methods: ['GET','POST'])]
    public function hrPaymentRequestPreview(
        Request $request,
        Pdf $pdf
    ): Response {
        // Accept JSON POST or GET query params
        $payload = [];
        $ct = (string) $request->headers->get('Content-Type');
        if ($request->isMethod('POST') && stripos($ct, 'application/json') !== false) {
            $tmp = json_decode($request->getContent() ?: '', true);
            if (is_array($tmp)) { $payload = $tmp; }
        }

        $division = (string)($payload['division'] ?? $request->query->get('division', ''));
        $rowsIn   = $payload['rows'] ?? $request->query->all('rows');

        if (!is_array($rowsIn)) { $rowsIn = []; }

        // Normalize rows to expected shape
        $norm = static function($v) { return is_scalar($v) ? (string)$v : ''; };
        $rows = array_values(array_filter(array_map(static function($r) use ($norm) {
            if (!is_array($r)) return null;
            $code        = $norm($r['employee_code'] ?? $r['code'] ?? '');
            $bankHolder  = $norm($r['bank_holder'] ?? $r['bankHolder'] ?? '');
            $bankName    = $norm($r['bank_name'] ?? $r['bankName'] ?? '');
            $bankAccount  = $norm($r['bank_account'] ?? $r['bankAccount'] ?? '');
            $amountRaw   = $r['amount'] ?? '';
            $amount      = is_numeric($amountRaw) ? (float)$amountRaw : (float) str_replace([',',' '], '', (string)$amountRaw);
            if ($code === '' && $bankHolder === '' && $bankName === '' && $bankAccount === '' && !$amount) {
                return null; // skip empty
            }
            return [
                'employee_code' => $code,
                'bank_holder'   => $bankHolder,
                'bank_name'     => $bankName,
                'bank_account'  => $bankAccount,
                'amount'        => $amount,
            ];
        }, $rowsIn)));

        // Company logo (data URI)
        $company = [];
        $logoData = $this->getEmbeddedLogoDataUrl();
        if ($logoData) { $company['logoData'] = $logoData; }

        // Render Twig → HTML
        $html = $this->renderView('reports/hr_payment_request_html.twig', [
            'division' => $division,
            'rows'     => $rows,
            'today'    => (new \DateTimeImmutable())->format('Y-m-d'),
            'company'  => $company,
        ]);

        // Serve HTML directly for preview (can be embedded in iframe)
        $resp = new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
        $resp->headers->set('X-Frame-Options', 'ALLOWALL');
        return $resp;
    }

    #[Route('/api/reports/hr/payment-request/export.pdf', name: 'hr_payment_request_export_pdf', methods: ['GET','POST'])]
    public function hrPaymentRequestExportPdf(
        Request $request,
        Pdf $pdf
    ): Response {
        // Accept JSON POST or GET query params
        $payload = [];
        $ct = (string) $request->headers->get('Content-Type');
        if ($request->isMethod('POST') && stripos($ct, 'application/json') !== false) {
            $tmp = json_decode($request->getContent() ?: '', true);
            if (is_array($tmp)) { $payload = $tmp; }
        }

        $division = (string)($payload['division'] ?? $request->query->get('division', ''));
        $rowsIn   = $payload['rows'] ?? $request->query->all('rows');
        if (!is_array($rowsIn)) { $rowsIn = []; }

        $norm = static function($v) { return is_scalar($v) ? (string)$v : ''; };
        $rows = array_values(array_filter(array_map(static function($r) use ($norm) {
            if (!is_array($r)) return null;
            $code        = $norm($r['employee_code'] ?? $r['code'] ?? '');
            $bankHolder  = $norm($r['bank_holder'] ?? $r['bankHolder'] ?? '');
            $bankName    = $norm($r['bank_name'] ?? $r['bankName'] ?? '');
            $bankAccount = $norm($r['bank_account'] ?? $r['bankAccount'] ?? '');
            $amountRaw   = $r['amount'] ?? '';
            $amount      = is_numeric($amountRaw) ? (float)$amountRaw : (float) str_replace([',',' '], '', (string)$amountRaw);
            if ($code === '' && $bankHolder === '' && $bankName === '' && $bankAccount === '' && !$amount) {
                return null;
            }
            return [
                'employee_code' => $code,
                'bank_holder'   => $bankHolder,
                'bank_name'     => $bankName,
                'bank_account'  => $bankAccount,
                'amount'        => $amount,
            ];
        }, $rowsIn)));

        // Company logo (data URI)
        $company = [];
        $logoData = $this->getEmbeddedLogoDataUrl();
        if ($logoData) { $company['logoData'] = $logoData; }

        // Render Twig → HTML
        $html = $this->renderView('reports/hr_payment_request_html.twig', [
            'division' => $division,
            'rows'     => $rows,
            'today'    => (new \DateTimeImmutable())->format('Y-m-d'),
            'company'  => $company,
        ]);

        try {
            $output = $pdf->getOutputFromHtml($html);
        } catch (\Throwable $e) {
            return new Response(json_encode(['error' => 'Failed to render PDF', 'details' => $e->getMessage()]), 500, ['Content-Type' => 'application/json']);
        }

        $divSafe = $division !== '' ? strtolower(preg_replace('/[^a-z0-9]+/i', '-', $division)) : 'all';
        $filename = sprintf('SolicitudPagos_%s_%s.pdf', $divSafe, (new \DateTimeImmutable())->format('dmY'));

        $response = new Response($output, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $filename . '"',
        ]);

        // Allow embedding in iframe (parity with other previews)
        $response->headers->remove('X-Frame-Options');
        $allowedAncestors = [
            "'self'",
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://13.58.201.248',
            'https://13.58.201.248',
        ];
        $response->headers->set('Content-Security-Policy', 'frame-ancestors ' . implode(' ', array_unique($allowedAncestors)));
        return $response;
    }
}