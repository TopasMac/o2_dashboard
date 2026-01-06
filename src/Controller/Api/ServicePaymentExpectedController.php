<?php

namespace App\Controller\Api;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use App\State\ExpectedPaymentReportProvider;
use Knp\Snappy\Pdf as PdfGenerator;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;
use ApiPlatform\Metadata\GetCollection;

class ServicePaymentExpectedController extends AbstractController
{
    #[IsGranted('PUBLIC_ACCESS')]
    #[Route('/api/services/expected-payments', name: 'api_services_expected_payments', methods: ['GET'])]
    public function expectedPaymentsJson(Request $request, ExpectedPaymentReportProvider $provider): Response
    {
        $service = $request->query->get('service');
        $month = (int) $request->query->get('month');
        $year = (int) $request->query->get('year');

        // Fetch data via provider (wrap filters and provide a dummy Operation)
        $report = $provider->provide(
            operation: new GetCollection(),
            uriVariables: [],
            context: [
                'filters' => [
                    'service' => $service,
                    'month' => $month,
                    'year' => $year,
                ],
            ]
        );

        // Be tolerant to either array payload or DTO
        $payload = is_array($report) ? ($report[0] ?? []) : $report;
        $items = is_array($payload) ? ($payload['items'] ?? []) : ($payload->items ?? []);

        return $this->json([
            'service' => $service,
            'month' => $month,
            'year' => $year,
            'items' => $items,
        ]);
    }

    #[IsGranted('PUBLIC_ACCESS')]
    #[Route('/reports/expected-payments/preview', name: 'reports_expected_payments_preview')]
    public function expectedPaymentsPreview(Request $request, ExpectedPaymentReportProvider $provider): Response
    {
        $service = $request->query->get('service');
        $month = (int) $request->query->get('month');
        $year = (int) $request->query->get('year');

        // Call provider directly to fetch rows (wrap filters and provide a dummy Operation)
        $report = $provider->provide(
            operation: new GetCollection(),
            uriVariables: [],
            context: [
                'filters' => [
                    'service' => $service,
                    'month' => $month,
                    'year' => $year,
                ],
            ]
        );

        // Be tolerant to either array payload or DTO
        $payload = is_array($report) ? ($report[0] ?? []) : $report;
        $items = is_array($payload) ? ($payload['items'] ?? []) : ($payload->items ?? []);

        // Prepare base64 logo for reliable PDF rendering
        $logoData = null;
        $logoPath = $this->getParameter('kernel.project_dir') . '/public/img/company-logo.png';
        if (is_readable($logoPath)) {
            $mime = 'image/png';
            $raw = @file_get_contents($logoPath);
            if ($raw !== false) {
                $logoData = 'data:' . $mime . ';base64,' . base64_encode($raw);
            }
        }

        return $this->render('reports/services_payments_html.twig', [
            'service' => $service,
            'month' => $month,
            'year' => $year,
            'items' => $items,
            'generatedAt' => new \DateTimeImmutable(),
            'company' => [
                'logoData' => $logoData,
            ],
            'isPreview' => true,
        ]);
    }
    
    #[IsGranted('PUBLIC_ACCESS')]
    #[Route('/reports/expected-payments/export.pdf', name: 'reports_expected_payments_export_pdf')]
    public function expectedPaymentsExportPdf(
        Request $request,
        ExpectedPaymentReportProvider $provider,
        PdfGenerator $pdf
    ): Response {
        $service = $request->query->get('service');
        $month = (int) $request->query->get('month');
        $year = (int) $request->query->get('year');

        // Fetch data via provider (wrap filters and provide a dummy Operation)
        $report = $provider->provide(
            operation: new GetCollection(),
            uriVariables: [],
            context: [
                'filters' => [
                    'service' => $service,
                    'month' => $month,
                    'year' => $year,
                ],
            ]
        );

        // Be tolerant to either array payload or DTO
        $payload = is_array($report) ? ($report[0] ?? []) : $report;
        $items = is_array($payload) ? ($payload['items'] ?? []) : ($payload->items ?? []);

        // Prepare base64 logo for reliable PDF rendering
        $logoData = null;
        $logoPath = $this->getParameter('kernel.project_dir') . '/public/img/company-logo.png';
        if (is_readable($logoPath)) {
            $mime = 'image/png';
            $raw = @file_get_contents($logoPath);
            if ($raw !== false) {
                $logoData = 'data:' . $mime . ';base64,' . base64_encode($raw);
            }
        }

        // Render HTML using the same Twig used for preview
        $html = $this->renderView('reports/services_payments_html.twig', [
            'service' => $service,
            'month' => $month,
            'year' => $year,
            'items' => $items,
            'generatedAt' => new \DateTimeImmutable(),
            'company' => [
                'logoData' => $logoData,
            ],
        ]);

        // Generate PDF
        $pdfContent = $pdf->getOutputFromHtml($html);

        $filename = sprintf('services-payments-%s-%04d-%02d.pdf', $service ?: 'report', $year, $month);

        return new Response($pdfContent, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $filename . '"',
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
        ]);
    }
    #[IsGranted('PUBLIC_ACCESS')]
    #[Route('/reports/ping', name: 'reports_ping', methods: ['GET'])]
    public function ping(): Response
    {
        return new Response('OK', 200, ['Content-Type' => 'text/plain']);
    }

    #[IsGranted('PUBLIC_ACCESS')]
    #[Route('/reports/_pdf/header', name: 'reports_pdf_header', methods: ['GET'])]
    public function pdfHeader(Request $request): Response
    {
        // Inline minimal HTML header with the company logo (base64 for reliability)
        $logoData = null;
        $logoPath = $this->getParameter('kernel.project_dir') . '/public/img/company-logo.png';
        if (is_readable($logoPath)) {
            $mime = 'image/png';
            $raw = @file_get_contents($logoPath);
            if ($raw !== false) {
                $logoData = 'data:' . $mime . ';base64,' . base64_encode($raw);
            }
        }

        $html = '<!doctype html><html><head><meta charset="utf-8">'
            . '<style>body{margin:0;padding:2px 8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:10pt;color:#111}'
            . '.hdr{display:flex;align-items:center;gap:10px}'
            . '.hdr img{height:14pt;display:block}'
            . '</style></head><body>'
            . '<div class="hdr">'
            . ($logoData ? '<img src="' . htmlspecialchars($logoData, ENT_QUOTES) . '" alt="Logo" />' : '<strong>Owners2</strong>')
            . '</div>'
            . '</body></html>';

        return new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
    }

    #[IsGranted('PUBLIC_ACCESS')]
    #[Route('/api/services/expected-payments/bulk', name: 'api_services_expected_payments_bulk', methods: ['GET'])]
    public function expectedPaymentsBulk(Request $request, ExpectedPaymentReportProvider $provider): Response
    {
        // Accept either yearMonth=YYYY-MM or separate month/year
        $yearMonth = $request->query->get('yearMonth');
        $month = $request->query->getInt('month');
        $year = $request->query->getInt('year');

        if ($yearMonth && preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            $year = (int) substr($yearMonth, 0, 4);
            $month = (int) substr($yearMonth, 5, 2);
        }
        if (!$month || !$year) {
            return $this->json(['error' => 'Provide yearMonth=YYYY-MM or month & year'], 400);
        }

        // Optional: filter by a subset of units
        $unitIdsCsv = $request->query->get('unitId'); // "1,8,9"
        $unitIds = null;
        if ($unitIdsCsv) {
            $unitIds = array_values(array_filter(array_map(static function ($v) {
                $v = trim((string)$v);
                return ctype_digit($v) ? (int)$v : null;
            }, explode(',', $unitIdsCsv)), static fn($v) => $v !== null));
        }

        // Helper to call provider and extract items list (array or DTO tolerant)
        $fetch = function (string $service) use ($provider, $month, $year, $unitIds) {
            $filters = ['service' => $service, 'month' => $month, 'year' => $year];
            if ($unitIds) $filters['unitIds'] = $unitIds; // provider may ignore if unsupported
            $report = $provider->provide(
                operation: new GetCollection(),
                uriVariables: [],
                context: ['filters' => $filters]
            );
            $payload = is_array($report) ? ($report[0] ?? []) : $report;
            $items = is_array($payload) ? ($payload['items'] ?? []) : ($payload->items ?? []);
            return $items;
        };

        // Fetch all services in one response
        $services = [
            'HOA'      => $fetch('hoa'),
            'Internet' => $fetch('internet'),
            'Water'    => $fetch('aguakan'), // a.k.a. Aguakan
            'CFE'      => $fetch('cfe'),
        ];

        return $this->json([
            'year' => $year,
            'month' => $month,
            'yearMonth' => sprintf('%04d-%02d', $year, $month),
            'services' => $services,
        ]);
    }
}