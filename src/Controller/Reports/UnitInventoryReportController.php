<?php
declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\Reports\UnitInventoryReportBuilder;
use App\Service\Reports\SignedUrlService;
use App\Service\Reports\ReportSignedUrlTrait;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Doctrine\ORM\EntityManagerInterface;
use Knp\Snappy\Pdf;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Twig\Environment as TwigEnvironment;
use App\Controller\Reports\ReportPdfControllerTrait;

class UnitInventoryReportController extends AbstractController
{
    use ReportPdfControllerTrait;
    use ReportSignedUrlTrait;
    public function __construct(
        private readonly UnitInventoryReportBuilder $builder,
        private readonly TwigEnvironment $twig,
        private readonly Pdf $pdf,
        private readonly EntityManagerInterface $em,
        #[Autowire(param: 'kernel.project_dir')] private readonly string $projectDir,
        SignedUrlService $signedUrlService
    ) {
        $this->setSignedUrlService($signedUrlService);
    }

    /**
     * Quick HTML preview of the report (no PDF file written).
     * Example: GET /api/unit-inventory/session/2/report/preview?mode=items|photos|both
     */
    #[Route(
        path: '/api/unit-inventory/session/{id}/report/preview',
        name: 'api_unit_inventory_report_preview',
        methods: ['GET']
    )]
    public function preview(int $id, Request $request): Response
    {
        $mode = (string) $request->query->get('mode', UnitInventoryReportBuilder::MODE_ITEMS);
        $data = $this->builder->build($id, $mode);

        $template = $this->resolveTemplate($mode);
        $html = $this->twig->render($template, $data);

        return new Response($html, Response::HTTP_OK, ['Content-Type' => 'text/html; charset=UTF-8']);
    }

    /**
     * Generate and save a PDF report.
     * Example: POST /api/unit-inventory/session/2/report/pdf?mode=items|photos|both
     * Returns: { ok: true, url: "/uploads/inventory_reports/{unitId}/{sessionId}/inventory_items_{sessionId}.pdf" }
     */
    #[Route(
        path: '/api/unit-inventory/session/{id}/report/pdf',
        name: 'api_unit_inventory_report_pdf',
        methods: ['POST']
    )]
    public function pdf(int $id, Request $request): JsonResponse
    {
        $mode = (string) $request->query->get('mode', UnitInventoryReportBuilder::MODE_ITEMS);
        $data = $this->builder->build($id, $mode);

        $template = $this->resolveTemplate($mode);
        $html = $this->twig->render($template, $data);

        // --- Render shared header/footer to temporary files using trait helpers ---
        $headerTmp = $this->renderHeaderTmp([
            'header_right_label' => sprintf('Inventario — %s — %s', (string)($data['meta']['unitName'] ?? ''), (new \DateTimeImmutable('now'))->format('d-m-Y')),
        ]);
        $footerTmp = $this->renderFooterTmp([
            'left_label'  => 'Owners2',
            'right_label' => (string)($data['meta']['city'] ?? ''),
        ]);

        // Build file paths
        $unitId = (int) ($data['meta']['unitId'] ?? 0);
        $sessionId = (int) ($data['meta']['sessionId'] ?? $id);

        $fs = new Filesystem();
        $publicDir = rtrim($this->getParameter('kernel.project_dir'), '/').'/public';
        $dir = $publicDir."/uploads/inventory_reports/{$unitId}/{$sessionId}";
        if (!$fs->exists($dir)) {
            $fs->mkdir($dir, 0775);
        }

        $fileBase = match ($mode) {
            UnitInventoryReportBuilder::MODE_ITEMS => "inventory_items_{$sessionId}.pdf",
            UnitInventoryReportBuilder::MODE_PHOTOS => "inventory_photos_{$sessionId}.pdf",
            default => "inventory_both_{$sessionId}.pdf",
        };

        $absPath = $dir.'/'.$fileBase;
        $relPath = "/uploads/inventory_reports/{$unitId}/{$sessionId}/{$fileBase}";

        // Base A4 options + wkhtml extras
        $options = array_merge($this->a4PdfOptions($headerTmp, $footerTmp), [
            'margin-left'  => '6mm',
            'margin-right' => '6mm',
            'header-center' => 'Owners2 (diagnostic)',
            'footer-right'  => '[page]/[toPage]',
            'dpi' => 96,
            'lowquality' => true,
            'quiet' => true,
            'javascript-delay' => 150,
            'enable-local-file-access' => true,
            'print-media-type' => true,
            'no-stop-slow-scripts' => true,
            'viewport-size' => '1280x1024',
        ]);

        try {
            $this->pdf->generateFromHtml($html, $absPath, $options, true);
        } finally {
            @is_file($headerTmp) && @unlink($headerTmp);
            @is_file($footerTmp) && @unlink($footerTmp);
        }

        // Stamp issuedAt fields if applicable (idempotent: only set if null)
        $this->maybeMarkIssued($id, $mode);

        return $this->json(['ok' => true, 'url' => $relPath]);
    }

    private function resolveTemplate(string $mode): string
    {
        // Only the Items report template exists for now; others will be added later.
        return match ($mode) {
            UnitInventoryReportBuilder::MODE_ITEMS => 'reports/pdf/unit_inv_items_report.html.twig',
            default => 'reports/pdf/unit_inv_items_report.html.twig', // TEMP fallback until photos/both templates are created
        };
    }

    /**
     * Update invIssuedAt / photoIssuedAt depending on the report mode.
     */
    private function maybeMarkIssued(int $sessionId, string $mode): void
    {
        $repo = $this->em->getRepository(\App\Entity\NewUnit\UnitInventorySession::class);
        $session = $repo->find($sessionId);
        if (!$session) {
            return;
        }

        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));

        if ($mode === UnitInventoryReportBuilder::MODE_ITEMS || $mode === UnitInventoryReportBuilder::MODE_BOTH) {
            if (method_exists($session, 'getInvIssuedAt') && !$session->getInvIssuedAt()) {
                $session->setInvIssuedAt($now);
            }
        }
        if ($mode === UnitInventoryReportBuilder::MODE_PHOTOS || $mode === UnitInventoryReportBuilder::MODE_BOTH) {
            if (method_exists($session, 'getPhotoIssuedAt') && !$session->getPhotoIssuedAt()) {
                $session->setPhotoIssuedAt($now);
            }
        }

        // Auto-advance status if both issued
        if (
            method_exists($session, 'getInvIssuedAt') &&
            method_exists($session, 'getPhotoIssuedAt') &&
            method_exists($session, 'getStatus') &&
            method_exists($session, 'setStatus')
        ) {
            if ($session->getInvIssuedAt() && $session->getPhotoIssuedAt()) {
                $cur = (string) $session->getStatus();
                // Only auto-advance if not already further along
                if (!in_array($cur, ['sent', 'signed'], true)) {
                    $session->setStatus('ready');
                }
            }
        }

        $this->em->flush();
    }
    /**
     * HTML Preview — Items report
     *
     * GET /api/reports/unit-inventory/items/{id}
     */
    #[Route(
        path: '/api/reports/unit-inventory/items/{id}',
        name: 'report_unit_inventory_items_html',
        methods: ['GET']
    )]
    public function itemsHtml(int $id): Response
    {
        // Build normalized data for items only
        $data = $this->builder->build($id, UnitInventoryReportBuilder::MODE_ITEMS);

        // Render the items PDF body template as plain HTML for inline preview
        return $this->render('reports/pdf/unit_inv_items_report.html.twig', [
            'data'      => $data,
            'meta'      => $data['meta'] ?? [],
            'areas'     => $data['areas'] ?? [],
            'isPreview' => true,
        ]);
    }

    /**
     * Returns a short-lived signed URL to stream the Items PDF (inline in iframe).
     * GET /api/reports/unit-inventory/items/{id}/signed?ttl=300
     */
    #[Route(
        path: '/api/reports/unit-inventory/items/{id}/signed',
        name: 'report_unit_inventory_items_signed',
        methods: ['GET']
    )]
    public function itemsSigned(int $id, Request $request): JsonResponse
    {
        $ttl = (int) $request->query->get('ttl', 300);
        $path = "/api/reports/unit-inventory/items/{$id}/download";
        return $this->buildReportSignedUrl($request, $path, $ttl);
    }

    /**
     * Streams the Items PDF (inline by default) after verifying signature/expiry.
     * GET /api/reports/unit-inventory/items/{id}/download?exp=...&sig=...&disposition=inline|attachment
     */
    #[Route(
        path: '/api/reports/unit-inventory/items/{id}/download',
        name: 'report_unit_inventory_items_download',
        methods: ['GET']
    )]
    public function itemsDownload(int $id, Request $request): Response
    {
        // Verify signed URL validity
        $this->verifySignedUrl($request);

        // Build report data and render HTML body
        $data = $this->builder->build($id, UnitInventoryReportBuilder::MODE_ITEMS);
        $html = $this->twig->render('reports/pdf/unit_inv_items_report.html.twig', $data);

        // Allow toggling debug via query (?debug=1) to avoid PHP-FPM env hassles
        $debugMode = ($request->query->get('debug') === '1') || (getenv('REPORTS_DEBUG') === '1');

        if ($debugMode) {
            // ==== DEBUG MODE: Use temp files (file://) for header/footer to avoid any HTTP redirects/TLS issues ====
            $headerTmp = $this->renderHeaderTmp([
                'header_right_label' => sprintf('Inventario — %s — %s', (string)($data['meta']['unitName'] ?? ''), (new \DateTimeImmutable('now'))->format('d-m-Y')),
            ]);
            $footerTmp = $this->renderFooterTmp([
                'left_label'  => 'Owners2',
                'right_label' => (string)($data['meta']['city'] ?? ''),
            ]);
            @chmod($headerTmp, 0644);
            @chmod($footerTmp, 0644);

            $options = [
                'print-media-type'          => true,
                'enable-local-file-access'  => true,
                'no-stop-slow-scripts'      => true,
                'javascript-delay'          => 200,
                'encoding'                  => 'UTF-8',
                'dpi'                       => 96,
                'lowquality'                => false,
                'quiet'                     => false, // show wkhtml logs in stderr
                'viewport-size'             => '1280x1024',
                'load-error-handling'       => 'ignore',
                'load-media-error-handling' => 'ignore',

                // ensure enough space for header/footer
                'margin-top'                => '25mm',
                'margin-bottom'             => '18mm',
                'margin-left'               => '12mm',
                'margin-right'              => '12mm',

                // Use file:// temp files in debug mode
                'header-html'               => $this->toFileUrl($headerTmp),
                'footer-html'               => $this->toFileUrl($footerTmp),
                'header-spacing'            => 4,
                'footer-spacing'            => 4,

                // Optional: capture JS errors
                'debug-javascript'          => true,

                // Added as per instruction:
                'disable-smart-shrinking'    => true,
                'header-center'              => 'Owners2 (diag)',
            ];

            // Always write options file for visibility
            $optLog = sys_get_temp_dir().'/wkhtml_items_'.$id.'_opts.json';
            @file_put_contents($optLog, json_encode($options, JSON_PRETTY_PRINT));

            // Also log the exact file paths used for header/footer
            @file_put_contents(sys_get_temp_dir().'/wkhtml_items_'.$id.'_debug_urls.txt', $this->toFileUrl($headerTmp)."\n".$this->toFileUrl($footerTmp));
        } else {
            // ==== NORMAL MODE: use temp files via trait helpers (single source of truth) ====
            $headerTmp = $this->renderHeaderTmp([
                'header_right_label' => sprintf('Inventario — %s — %s', (string)($data['meta']['unitName'] ?? ''), (new \DateTimeImmutable('now'))->format('d-m-Y')),
            ]);
            $footerTmp = $this->renderFooterTmp([
                'left_label'  => 'Owners2',
                'right_label' => (string)($data['meta']['city'] ?? ''),
            ]);
            @chmod($headerTmp, 0644);
            @chmod($footerTmp, 0644);

            $options = $this->a4PdfOptions($headerTmp, $footerTmp, [
                'margin-top'       => '22mm',
                'margin-bottom'    => '16mm',
                'margin-left'      => '12mm',
                'margin-right'     => '12mm',
                'dpi'              => 96,
                'lowquality'       => true,
                'quiet'            => true,
                'javascript-delay' => 150,
                'viewport-size'    => '1280x1024',
                'load-error-handling'       => 'ignore',
                'load-media-error-handling' => 'ignore',
                // Added as per instruction:
                'disable-smart-shrinking' => true,
                'header-center'           => 'Owners2 (diag)',
            ]);
        }

        try {
            $pdfBytes = $this->pdf->getOutputFromHtml($html, $options);
        } finally {
            if (!$debugMode) {
                @is_file($headerTmp) && @unlink($headerTmp);
                @is_file($footerTmp) && @unlink($footerTmp);
            }
        }

        $dispositionMode = $request->query->get('disposition', 'inline') === 'attachment'
            ? ResponseHeaderBag::DISPOSITION_ATTACHMENT
            : ResponseHeaderBag::DISPOSITION_INLINE;

        $unitName = (string) ($data['meta']['unitName'] ?? 'Unit');
        $dateStr  = (new \DateTimeImmutable('now'))->format('Ymd');
        $safeUnit = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $unitName);
        $filename = sprintf('Inventory_Items_%s_%s.pdf', $safeUnit, $dateStr);

        $response = new Response($pdfBytes, 200, ['Content-Type' => 'application/pdf']);
        $response->headers->set(
            'Content-Disposition',
            $response->headers->makeDisposition($dispositionMode, $filename)
        );

        return $response;
    }
    /**
     * Very simple header HTML for wkhtml debug fetch.
     * GET /api/reports/header/preview?label=...
     */
    #[Route(
        path: '/api/reports/header/preview',
        name: 'report_header_preview',
        methods: ['GET']
    )]
    public function headerPreview(Request $request): Response
    {
        $label = (string) $request->query->get('label', 'Owners2 Report');
        $html = '<!doctype html><html><head><meta charset="utf-8"><style>
          body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;}
          .hdr{display:flex;justify-content:space-between;align-items:center;width:100%;padding:6px 12px;border-bottom:1px solid #ddd;}
          .left{font-weight:700}
          .right{font-weight:500}
        </style></head><body><div class="hdr"><div class="left">Owners2</div><div class="right">'.htmlspecialchars($label, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8').'</div></div></body></html>';
        return new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
    }

    /**
     * Very simple footer HTML for wkhtml debug fetch.
     * GET /api/reports/footer/preview?left=...&right=...
     */
    #[Route(
        path: '/api/reports/footer/preview',
        name: 'report_footer_preview',
        methods: ['GET']
    )]
    public function footerPreview(Request $request): Response
    {
        $left  = (string) $request->query->get('left', 'Owners2');
        $right = (string) $request->query->get('right', '');
        $html = '<!doctype html><html><head><meta charset="utf-8"><style>
          body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;}
          .ftr{display:flex;justify-content:space-between;align-items:center;width:100%;padding:6px 12px;border-top:1px solid #ddd;}
          .left{opacity:.8}
          .right{opacity:.8}
        </style></head><body><div class="ftr"><div class="left">'.htmlspecialchars($left, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8').'</div><div class="right">'.htmlspecialchars($right, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8').'</div></div></body></html>';
        return new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
    }
}