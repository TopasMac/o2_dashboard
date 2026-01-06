<?php

namespace App\Controller\Reports;

use App\Service\Reports\UnitPurchaseListReportService;
use Knp\Snappy\Pdf;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Purchase list preview (HTML).
 *
 * Note: PDF wiring (wkhtmltopdf) will be added after the HTML preview is approved,
 * so the frontend "Preview" button can open this page for a clean view.
 */
class UnitPurchaseListReportController extends AbstractController
{
    public function __construct(
        private readonly UnitPurchaseListReportService $reportService,
        private readonly Pdf $pdf,
        private readonly TranslatorInterface $translator,
    ) {}

    private function debugWrite(string $name, string $contents): void
    {
        try {
            $dir = $this->getParameter('kernel.project_dir') . '/var';
            @file_put_contents($dir . '/' . $name, $contents);
        } catch (\Throwable) {
            // ignore
        }
    }

    private function applyLocaleFromData(array $data, Request $request): void
    {
        $langRaw = (string) ($data['clientLanguage'] ?? ($data['client']['language'] ?? ''));
        $lang = strtolower(trim($langRaw));
        if ($lang === 'es' || str_starts_with($lang, 'es_') || str_starts_with($lang, 'es-')) {
            $locale = 'es';
        } else {
            $locale = 'en';
        }

        // Apply to request + translator (do NOT do this in Twig)
        try {
            $request->setLocale($locale);
        } catch (\Throwable) {}

        try {
            $this->translator->setLocale($locale);
        } catch (\Throwable) {}
    }

    #[Route('/reports/purchase-lists/{id}/preview', name: 'report_purchase_list_preview', methods: ['GET'])]
    public function preview(int $id, Request $request): Response
    {
        try {
            @error_log('[UnitPurchaseListReportController.preview] HIT id=' . $id);

            $data = $this->reportService->buildByListId((int) $id);
            if (!($data['ok'] ?? false)) {
                return new Response('Purchase list not found.', 404);
            }

            $this->applyLocaleFromData($data, $request);

            $locale = (string) ($request->getLocale() ?: 'en');
            $meta = [
                'language' => $locale,
                // Used by reports_v2/_header.html.twig to override the default "Monthly Report" title
                'header_title' => 'Initial Kit',
                'header_title_domain' => 'unit_purchase_list',
            ];

            $list = $data['list'] ?? [];
            $unit = $data['unit'] ?? [];
            $lines = $data['lines'] ?? [];
            $totals = $data['totals'] ?? [];

            // Header payload for reports_v2/_header.html.twig (wkhtml header)
            $data['header'] = [
                'unitName' => (string) ($unit['name'] ?? ''),
                // Purchase lists are not month-bound; we show the created date as a label if available.
                'ym' => '',
            ];

            $html = $this->renderView('reports_v2/unit_items_purchase.pdf.twig', [
                'list' => $list,
                'unit' => $unit,
                'lines' => $lines,
                'totals' => $totals,
                'header' => $data['header'],
                'client' => ($data['client'] ?? null),
                'clientName' => ($data['clientName'] ?? null),
                'clientLanguage' => ($data['clientLanguage'] ?? null),
                'meta' => $meta,
            ]);

            $this->debugWrite('owners2_last_purchase_list_preview.html', $html);

            return new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
        } catch (\Throwable $e) {
            $msg = "[UnitPurchaseListReportController.preview] Failed\n"
                . "Exception: " . get_class($e) . "\n"
                . "Message: " . $e->getMessage() . "\n";

            $msg .= "Trace(0..2000):\n" . mb_substr($e->getTraceAsString(), 0, 2000) . "\n";
            @error_log($msg);

            return new Response($msg, 500, ['Content-Type' => 'text/plain; charset=UTF-8']);
        }
    }

    #[Route('/reports/purchase-lists/{id}/pdf', name: 'report_purchase_list_pdf', methods: ['GET'])]
    public function pdf(int $id, Request $request): Response
    {
        try {
            @error_log('[UnitPurchaseListReportController.pdf] HIT id=' . $id);

            $data = $this->reportService->buildByListId((int) $id);
            if (!($data['ok'] ?? false)) {
                return new Response('Purchase list not found.', 404);
            }

            $this->applyLocaleFromData($data, $request);

            $locale = (string) ($request->getLocale() ?: 'en');
            $meta = [
                'language' => $locale,
                // Used by reports_v2/_header.html.twig to override the default "Monthly Report" title
                'header_title' => 'Initial Kit',
                'header_title_domain' => 'unit_purchase_list',
            ];

            $list = $data['list'] ?? [];
            $unit = $data['unit'] ?? [];
            $lines = $data['lines'] ?? [];
            $totals = $data['totals'] ?? [];

            $header = [
                'unitName' => (string) ($unit['name'] ?? ''),
                'ym' => '',
            ];

            // Render header HTML to a temp file for wkhtmltopdf
            $headerHtml = $this->renderView('reports_v2/_header.html.twig', [
                'list' => $list,
                'unit' => $unit,
                'lines' => $lines,
                'totals' => $totals,
                'header' => $header,
                'client' => ($data['client'] ?? null),
                'clientName' => ($data['clientName'] ?? null),
                'clientLanguage' => ($data['clientLanguage'] ?? null),
                'meta' => $meta,
            ]);

            $this->debugWrite('owners2_last_purchase_list_header_gen.html', $headerHtml);

            $tmpDir = sys_get_temp_dir();
            $token = bin2hex(random_bytes(8));
            $headerPath = $tmpDir . '/o2_purchase_list_header_' . $id . '_' . $token . '.html';
            @file_put_contents($headerPath, $headerHtml);

            $bodyHtml = $this->renderView('reports_v2/unit_items_purchase.pdf.twig', [
                'list' => $list,
                'unit' => $unit,
                'lines' => $lines,
                'totals' => $totals,
                'header' => $header,
                'client' => ($data['client'] ?? null),
                'clientName' => ($data['clientName'] ?? null),
                'clientLanguage' => ($data['clientLanguage'] ?? null),
                'meta' => $meta,
            ]);

            $this->debugWrite('owners2_last_purchase_list_body_gen.html', $bodyHtml);

            if ($request->query->get('debug') === '1') {
                return new Response($bodyHtml, 200, [
                    'Content-Type' => 'text/html; charset=UTF-8',
                    'X-O2-Debug' => '1',
                ]);
            }

            $opts = [
                'encoding' => 'UTF-8',
                'print-media-type' => true,
                'enable-local-file-access' => true,

                // Match the same idea used in ReportV2Controller
                'margin-top' => 24,
                'margin-left' => 10,
                'margin-right' => 10,
                'margin-bottom' => 12,

                'header-html' => 'file://' . $headerPath,
                'header-spacing' => 8,

                // Keep PDFs stable
                'disable-smart-shrinking' => true,
            ];

            try {
                $pdfContent = $this->pdf->getOutputFromHtml($bodyHtml, $opts);
            } finally {
                @unlink($headerPath);
            }

            $unitSlug = preg_replace('/[^a-zA-Z0-9_-]+/', '-', (string) ($unit['name'] ?? 'unit'));
            $unitSlug = trim($unitSlug, '-');
            $filename = 'purchase-list-' . $id . '-' . ($unitSlug ?: 'unit') . '.pdf';

            return new Response($pdfContent, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
            ]);
        } catch (\Throwable $e) {
            $msg = "[UnitPurchaseListReportController.pdf] Failed before PDF output\n"
                . "Exception: " . get_class($e) . "\n"
                . "Message: " . $e->getMessage() . "\n";

            $msg .= "Trace(0..2000):\n" . mb_substr($e->getTraceAsString(), 0, 2000) . "\n";
            // Best-effort context (avoid throwing new errors)
            try {
                if (isset($headerPath)) {
                    $msg .= "HeaderPath: " . $headerPath . "\n";
                }
            } catch (\Throwable) {}
            try {
                if (isset($bodyHtml)) {
                    $msg .= "BodyHtml(0..2000):\n" . mb_substr($bodyHtml ?? '', 0, 2000) . "\n";
                }
            } catch (\Throwable) {}

            @error_log($msg);

            return new Response($msg, 500, ['Content-Type' => 'text/plain; charset=UTF-8']);
        }
    }

    #[Route('/api/reports/purchase-lists/{id}/pdf', name: 'api_report_purchase_list_pdf', methods: ['GET'])]
    public function apiPdf(int $id, Request $request): Response
    {
        try {
            @error_log('[UnitPurchaseListReportController.apiPdf] HIT id=' . $id);

            $data = $this->reportService->buildByListId((int) $id);
            if (!($data['ok'] ?? false)) {
                return new Response('Purchase list not found.', 404);
            }

            $this->applyLocaleFromData($data, $request);

            $locale = (string) ($request->getLocale() ?: 'en');
            $meta = [
                'language' => $locale,
                // Used by reports_v2/_header.html.twig to override the default "Monthly Report" title
                'header_title' => 'Initial Kit',
                'header_title_domain' => 'unit_purchase_list',
            ];

            $list = $data['list'] ?? [];
            $unit = $data['unit'] ?? [];
            $lines = $data['lines'] ?? [];
            $totals = $data['totals'] ?? [];

            $header = [
                'unitName' => (string) ($unit['name'] ?? ''),
                'ym' => '',
            ];

            // Render header HTML to a temp file for wkhtmltopdf
            $headerHtml = $this->renderView('reports_v2/_header.html.twig', [
                'list' => $list,
                'unit' => $unit,
                'lines' => $lines,
                'totals' => $totals,
                'header' => $header,
                'client' => ($data['client'] ?? null),
                'clientName' => ($data['clientName'] ?? null),
                'clientLanguage' => ($data['clientLanguage'] ?? null),
                'meta' => $meta,
            ]);

            $this->debugWrite('owners2_last_purchase_list_header_gen.html', $headerHtml);

            $tmpDir = sys_get_temp_dir();
            $token = bin2hex(random_bytes(8));
            $headerPath = $tmpDir . '/o2_purchase_list_header_' . $id . '_' . $token . '.html';
            @file_put_contents($headerPath, $headerHtml);

            $bodyHtml = $this->renderView('reports_v2/unit_items_purchase.pdf.twig', [
                'list' => $list,
                'unit' => $unit,
                'lines' => $lines,
                'totals' => $totals,
                'header' => $header,
                'client' => ($data['client'] ?? null),
                'clientName' => ($data['clientName'] ?? null),
                'clientLanguage' => ($data['clientLanguage'] ?? null),
                'meta' => $meta,
            ]);

            $this->debugWrite('owners2_last_purchase_list_body_gen.html', $bodyHtml);

            // Optional debug: return HTML instead of PDF
            if ($request->query->get('debug') === '1') {
                return new Response($bodyHtml, 200, [
                    'Content-Type' => 'text/html; charset=UTF-8',
                    'X-O2-Debug' => '1',
                ]);
            }

            $opts = [
                'encoding' => 'UTF-8',
                'print-media-type' => true,
                'enable-local-file-access' => true,

                'margin-top' => 24,
                'margin-left' => 10,
                'margin-right' => 10,
                'margin-bottom' => 12,

                'header-html' => 'file://' . $headerPath,
                'header-spacing' => 8,

                'disable-smart-shrinking' => true,
            ];

            try {
                $pdfContent = $this->pdf->getOutputFromHtml($bodyHtml, $opts);
            } finally {
                @unlink($headerPath);
            }

            $unitSlug = preg_replace('/[^a-zA-Z0-9_-]+/', '-', (string) ($unit['name'] ?? 'unit'));
            $unitSlug = trim($unitSlug, '-');
            $filename = 'purchase-list-' . $id . '-' . ($unitSlug ?: 'unit') . '.pdf';

            $disposition = ($request->query->get('download') === '1') ? 'attachment' : 'inline';

            return new Response($pdfContent, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => $disposition . '; filename="' . $filename . '"',
                // Helpful for debugging/proxies
                'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma' => 'no-cache',
            ]);
        } catch (\Throwable $e) {
            $msg = "[UnitPurchaseListReportController.apiPdf] Failed before PDF output\n"
                . "Exception: " . get_class($e) . "\n"
                . "Message: " . $e->getMessage() . "\n";

            $msg .= "Trace(0..2000):\n" . mb_substr($e->getTraceAsString(), 0, 2000) . "\n";

            // Best-effort context
            try {
                if (isset($headerPath)) {
                    $msg .= "HeaderPath: " . $headerPath . "\n";
                }
            } catch (\Throwable) {}
            try {
                if (isset($bodyHtml)) {
                    $msg .= "BodyHtml(0..2000):\n" . mb_substr($bodyHtml ?? '', 0, 2000) . "\n";
                }
            } catch (\Throwable) {}

            @error_log($msg);

            return new Response($msg, 500, ['Content-Type' => 'text/plain; charset=UTF-8']);
        }
    }
}