<?php

namespace App\Controller;

use App\Service\Reports\UnitMonthlyReportService;
use Knp\Snappy\Pdf;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

class ReportV2Controller extends AbstractController
{
    public function __construct(
        private \Twig\Environment $twig,
        private Pdf $snappyPdf, // use Knp\Snappy directly for V2
        private UnitMonthlyReportService $unitMonthlyReportService,
    ) {
    }


    /**
     * V2 Unit Report preview (HTML or PDF).
     *
     * Renders a new template namespace (reports_v2/...) and writes the raw HTML
     * to var/v2_last_unit_report.html for easy inspection.
     *
     * Examples:
     *  - /api/v2/reports/unit/123/2025-10/preview.pdf
     *  - /api/v2/reports/unit/123/2025-10/preview.html
     */
    #[Route(
        '/api/v2/reports/unit/{unitId}/{yearMonth}/preview.{_format}',
        name: 'v2_unit_report_preview',
        requirements: ['_format' => 'html|pdf'],
        defaults: ['_format' => 'pdf'],
        methods: ['GET']
    )]
    public function unitReportPreview(Request $request, int $unitId, string $yearMonth, string $_format = 'pdf'): Response
    {
        // Build data using the current builder; we can later introduce UnitReportDataBuilderV2
        // and normalize keys for the new template.
        $data = [
            'unitId'    => $unitId,
            'yearMonth' => $yearMonth,
        ];

        // Canonical payload ONLY (same as /api/reports/unit-monthly and /api/unit-monthly/generate)
        try {
            $built = $this->unitMonthlyReportService->build($unitId, $yearMonth);
            if (is_array($built)) {
                $data = array_replace($built, $data);
            }
        } catch (\Throwable $e) {
            $msg = sprintf('V2 preview build failed for unit=%d ym=%s: %s', $unitId, $yearMonth, $e->getMessage());
            @error_log('[ReportV2Controller.unitReportPreview] ' . $msg);

            // If HTML requested, return a readable HTML error page.
            if (strtolower((string) $_format) === 'html') {
                return new Response('<pre>' . htmlspecialchars($msg, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</pre>', 500, [
                    'Content-Type' => 'text/html; charset=UTF-8',
                ]);
            }

            // Default: JSON error for PDF requests.
            return $this->json([
                'error'   => 'exception',
                'message' => $msg,
            ], 500);
        }

        // Tell templates to skip inline header (we're using wkhtml native header in V2)
        $data['disable_inline_header'] = true;

        // Allow overriding language quickly for testing (?lang=es or ?lang=en)
        if ($lang = $request->query->get('lang')) {
            $data['meta']['language'] = $lang;
        }

        // If no explicit lang override, derive from payload (unit-monthly endpoint provides "language")
        if (empty($data['meta']['language'])) {
            $payloadLang =
                ($data['language'] ?? null) ? $data['language'] :
                (($data['client']['language'] ?? null) ?: ($data['unit']['language'] ?? null));

            if (is_string($payloadLang) && $payloadLang !== '') {
                $data['meta']['language'] = strtolower($payloadLang);
            } else {
                // sensible default if nothing provided
                $data['meta']['language'] = 'es';
            }
        }

        // ---- Header payload for native wkhtml header ----
        // Prefer common unit name keys; fall back to a generic label
        $unitName =
            ($data['unit']['unitName'] ?? null) ??
            ($data['unit']['name'] ?? null) ??
            ($data['unit']['title'] ?? null) ??
            ($data['unit']['label'] ?? null) ??
            ($data['unitName'] ?? null) ??
            ('Unit ' . $unitId);

        // Expect yearMonth as "YYYY-MM"; produce "mm-yyyy"
        $dt = \DateTime::createFromFormat('Y-m', $yearMonth);
        if ($dt instanceof \DateTimeInterface) {
            $ym = $dt->format('m-Y');
        } else {
            // Fallback: try to parse loosely or swap if already "mm-yyyy"
            if (preg_match('/^(\\d{4})-(\\d{2})$/', $yearMonth, $m)) {
                $ym = $m[2] . '-' . $m[1];
            } elseif (preg_match('/^(\\d{2})[-\\/](\\d{4})$/', $yearMonth, $m)) {
                $ym = $m[1] . '-' . $m[2];
            } else {
                $ym = $yearMonth; // last resort: pass through
            }
        }

        $data['header'] = [
            'unitName' => $unitName,
            'ym'       => $ym,
        ];

        // New template namespace for V2 (create this next)
        $template = 'reports_v2/unit_report.pdf.twig';

        // Render Twig → HTML once
        $html = $this->renderView($template, $data);

        // Debug: dump the exact HTML we sent to wkhtml in a V2-specific file
        try {
            $debugPath = $this->getParameter('kernel.project_dir') . '/var/v2_last_unit_report.html';
            @file_put_contents($debugPath, $html);
        } catch (\Throwable $e) {
            // ignore debug write errors
        }

        // Render the V2 header HTML to a temporary file for wkhtml's native header
        $headerHtml = $this->renderView('reports_v2/_header.html.twig', $data);
        $headerPath = $this->getParameter('kernel.project_dir') . '/var/v2_header_unit_report.html';
        try {
            @file_put_contents($headerPath, $headerHtml);
        } catch (\Throwable $e) {
            // ignore header write errors; we'll fall back to no header
            $headerPath = null;
        }

        // If HTML requested, return directly (useful for inspecting structure/styles)
        if (strtolower((string) $_format) === 'html') {
            return new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
        }

        // PDF preview: disable external wkhtml header/footer; we draw header/footer inline in the base template.
        $wkhtmlOpts = [
            // Use native header; ensure we don't also pass footer unless needed
            'header-html'   => $headerPath ? ('file://' . $headerPath) : null,
            'header-line'   => false,
            'header-spacing'=> 8,     // small gap between header and content
            'footer-html'   => null,
            'footer-line'   => false,

            'no-outline'    => true,
            // Allow debug via ?wkdebug=1 (prints wkhtml errors/warnings instead of swallowing them)
            'quiet'         => $request->query->getBoolean('wkdebug') ? false : true,

            // Be resilient to slow/missing external assets; prevents long hangs on broken URLs
            'load-error-handling'       => 'ignore',
            'load-media-error-handling' => 'ignore',

            // We don't rely on JS for PDF rendering; disabling avoids slow scripts/timeouts
            'disable-javascript'        => true,

            // Ensure local file URLs work for header/assets
            'enable-local-file-access'  => true,

            // One source of truth for top spacing; wkhtml reserves space for the native header
            'margin-top'    => 24,    // increased to match service defaults; prevents header/logo clipping (mm)
            'margin-bottom' => 18,
            'margin-left'   => 12,
            'margin-right'  => 12,
        ];

        // Use Knp\Snappy directly (consistent with existing v1 controller)
        $output = $this->snappyPdf->getOutputFromHtml($html, $wkhtmlOpts);

        return new Response($output, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'inline; filename="unit_report_v2_preview.pdf"',
        ]);
    }
}
