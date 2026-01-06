<?php

namespace App\Controller;

use App\Service\PdfRenderer;
use App\Service\Contracts\ContractRenderer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Doctrine\ORM\EntityManagerInterface;
use App\Entity\ContractDraft;
use Symfony\Contracts\Translation\TranslatorInterface;
use Symfony\Component\Translation\DataCollectorTranslator;
use Symfony\Component\Translation\Loader\ArrayLoader;
use Symfony\Component\Translation\Translator as CoreTranslator;
use Twig\Environment as TwigEnvironment;

class ContractsController extends AbstractController
{
    private TranslatorInterface $translator;

    public function __construct(TranslatorInterface $translator)
    {
        $this->translator = $translator;
    }

    private function applyContractOverrides(object $translator, array $overrides = null, string $lang = 'en'): void
    {
        if (!$overrides) {
            return;
        }

        // Unwrap DataCollectorTranslator if present
        if ($translator instanceof DataCollectorTranslator) {
            $translator = $translator->getTranslator();
        }

        // Only if the translator supports addLoader/addResource (Symfony core Translator)
        if ($translator instanceof CoreTranslator) {
            $translator->addLoader('array', new ArrayLoader());
            $translator->addResource('array', $overrides, $lang, 'contract');
        }
    }

    #[Route('/api/contract-drafts/{id}/preview/html', name: 'contract_draft_preview_html', methods: ['GET'])]
    public function draftPreviewHtml(int $id, Request $request, EntityManagerInterface $em, TwigEnvironment $twig): Response
    {
        $lang = $request->query->get('lang', 'en');
        /** @var ContractDraft|null $draft */
        $draft = $em->getRepository(ContractDraft::class)->find($id);
        if (!$draft) {
            return new JsonResponse(['ok' => false, 'error' => 'not_found', 'message' => 'Draft not found'], 404);
        }

        // Apply per-draft translation overrides for the selected language
        $overrides = $lang === 'es' ? $draft->getOverridesEs() : $draft->getOverridesEn();
        $this->applyContractOverrides($this->translator, is_array($overrides) ? $overrides : null, $lang);

        $template = strtolower($lang) === 'es' ? 'pdf/contracts/contract_es_html.twig' : 'pdf/contracts/contract_en_html.twig';

        $fields = $draft->getFields();
        // Normalize linens fee to a plain numeric string (e.g., "800")
        if (isset($fields['linensFee'])) {
            $raw = (string)$fields['linensFee'];
            // keep digits and optional decimal point; strip currency/whitespace/commas
            $normalized = preg_replace('/[^0-9.]/', '', $raw);
            // collapse thousands separators if they slipped in as dots
            if (substr_count($normalized, '.') > 1) {
                $normalized = preg_replace('/\.(?=.*\.)/', '', $normalized);
            }
            // trim leading zeros sensibly
            $fields['linensFee'] = ltrim($normalized, '0') !== '' ? ltrim($normalized, '0') : '0';
        }
        $company = [
            'name'           => 'Owners2',
            'legalName'      => 'Owners2 Property Management',
            'email'          => 'admin@owners2.com',
            'phone'          => '+52 984 142 9561',
            'logoUrl'        => '/img/company-logo.png',
            'representative' => 'António Pedro Tarana de Macedo',
        ];

        $client = [
            'name'     => $draft->getClientName(),
            'phone'    => $fields['ownerPhone'] ?? '',
            'email'    => $fields['ownerEmail'] ?? '',
            'idNumber' => $fields['ownerIdNumber'] ?? '',
        ];

        $unit = [
            'name'    => $draft->getUnitName(),
            'address' => $fields['address'] ?? '(address)',
        ];

        // Contract dynamic fields with sane defaults
        $contract = array_merge([
            'effectiveDate'           => (new \DateTimeImmutable())->format('Y-m-d'),
            'commission'              => $fields['commission'] ?? '20%',
            'taxRetention'            => $fields['taxRetention'] ?? '12%',
            'directBookingCommission' => $fields['directBookingCommission'] ?? '20%',
            'payoutDay'               => $fields['payoutDay'] ?? '10th',
            'initialTerm'             => $fields['initialTerm'] ?? 'one (1) year',
            'terminationNotice'       => $fields['terminationNotice'] ?? 'thirty (30) days',
            'currency'                => $fields['currency'] ?? 'MXN',
        ], $fields);

        // Replace placeholders via trans filter in Twig; we only pass context
        $context = compact('company', 'client', 'unit', 'contract');

        // Guard template existence
        if (method_exists($twig, 'getLoader') && method_exists($twig->getLoader(), 'exists')) {
            if (!$twig->getLoader()->exists($template)) {
                return new JsonResponse(['ok' => false, 'error' => 'template_missing', 'message' => sprintf('Template %s not found', $template)], 400);
            }
        }

        try {
            $html = $twig->render($template, $context);
            return new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
        } catch (\Throwable $e) {
            return new JsonResponse(['ok' => false, 'error' => 'render_failed', 'message' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/contract-drafts/{id}/preview', name: 'contract_draft_preview_pdf', methods: ['GET'])]
    public function draftPreviewPdf(int $id, Request $request, EntityManagerInterface $em, ContractRenderer $contractRenderer, PdfRenderer $renderer): Response
    {
        $lang = strtolower((string)$request->query->get('lang', 'en'));

        /** @var ContractDraft|null $draft */
        $draft = $em->getRepository(ContractDraft::class)->find($id);
        if (!$draft) {
            return new JsonResponse(['ok' => false, 'error' => 'not_found', 'message' => 'Draft not found'], 404);
        }

        // Choose template by language
        $template = $lang === 'es' ? 'pdf/contracts/contract_es_html.twig' : 'pdf/contracts/contract_en_html.twig';

        // Build context (mirror draftPreviewHtml so Twig macros receive what they expect)
        $fields = $draft->getFields();
        // Normalize linens fee to a plain numeric string (e.g., "800")
        if (isset($fields['linensFee'])) {
            $raw = (string)$fields['linensFee'];
            // keep digits and optional decimal point; strip currency/whitespace/commas
            $normalized = preg_replace('/[^0-9.]/', '', $raw);
            // collapse thousands separators if they slipped in as dots
            if (substr_count($normalized, '.') > 1) {
                $normalized = preg_replace('/\.(?=.*\.)/', '', $normalized);
            }
            // trim leading zeros sensibly
            $fields['linensFee'] = ltrim($normalized, '0') !== '' ? ltrim($normalized, '0') : '0';
        }
        $company = [
            'name'           => 'Owners2',
            'legalName'      => 'Owners2 Property Management',
            'email'          => 'admin@owners2.com',
            'phone'          => '+52 984 142 9561',
            'logoUrl'        => '/img/company-logo.png',
            'representative' => 'António Pedro Tarana de Macedo',
        ];
        $client = [
            'name'     => $draft->getClientName(),
            'phone'    => $fields['ownerPhone'] ?? '',
            'email'    => $fields['ownerEmail'] ?? '',
            'idNumber' => $fields['ownerIdNumber'] ?? '',
        ];
        $unit = [
            'name'    => $draft->getUnitName(),
            'address' => $fields['address'] ?? '(address)',
        ];
        $contract = array_merge([
            'effectiveDate'           => (new \DateTimeImmutable())->format('Y-m-d'),
            'commission'              => $fields['commission'] ?? '20%',
            'taxRetention'            => $fields['taxRetention'] ?? '12%',
            'directBookingCommission' => $fields['directBookingCommission'] ?? '20%',
            'payoutDay'               => $fields['payoutDay'] ?? '10th',
            'initialTerm'             => $fields['initialTerm'] ?? 'one (1) year',
            'terminationNotice'       => $fields['terminationNotice'] ?? 'thirty (30) days',
            'currency'                => $fields['currency'] ?? 'MXN',
        ], $fields ?? []);

        // Pass overrides and lang so the template's `sec.ov()` macro can apply them
        $context = [
            'company'      => $company,
            'client'       => $client,
            'unit'         => $unit,
            'contract'     => $contract,
            'lang'         => $lang,
            'overrides_en' => $draft->getOverridesEn() ?? [],
            'overrides_es' => $draft->getOverridesEs() ?? [],
        ];

        try {
            // Render PDF using template + context (renderer handles wkhtmltopdf header/footer)
            $pdf = $renderer->renderAsPdf(
                bodyTemplate: $template,
                bodyContext: $context,
                options: [],
                chrome: []
            );

            $response = new Response($pdf, 200);
            $response->headers->set('Content-Type', 'application/pdf');
            $response->headers->set(
                'Content-Disposition',
                sprintf('inline; filename="contract-draft-%d-%s.pdf"', $draft->getId(), $lang)
            );
            $response->headers->remove('X-Frame-Options');
            $response->headers->set('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000 https://dashboard.owners2.com");
            return $response;
        } catch (\Throwable $e) {
            return new JsonResponse(['ok' => false, 'error' => 'render_failed', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Preview a contract as PDF using Snappy.
     *
     * POST /api/contracts/preview
     * Body (JSON) example:
     * {
     *   "lang": "en",
     *   "headerRight": "Property Management Agreement",
     *   "company": { "name": "Owners2", "legalName": "Owners2 Property Management", "email": "admin@owners2.com", "phone": "+52 984 142 9561", "logoUrl": "/img/company-logo.png", "representative": "António Pedro Tarana de Macedo" },
     *   "client": { "name": "John Doe", "phone": "+52 555 555 555", "email": "john@example.com" },
     *   "unit":   { "name": "Cosmo 504", "address": "Av. 25 Nte 123, Playa del Carmen" },
     *   "contract": {
     *     "effectiveDate": "2025-09-15",
     *     "commission": "20%",
     *     "taxRetention": "12%",
     *     "directBookingCommission": "20%",
     *     "payoutDay": "10th",
     *     "initialTerm": "one (1) year",
     *     "terminationNotice": "thirty (30) days"
     *   }
     * }
     */
    #[Route('/api/contracts/preview', name: 'contracts_preview', methods: ['GET','POST'])]
    public function preview(Request $request, PdfRenderer $renderer, TwigEnvironment $twig): Response
    {
        $payload = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($payload)) {
            return new JsonResponse(['ok' => false, 'error' => 'bad_request', 'message' => 'Invalid JSON body'], 400);
        }

        $lang = $payload['lang'] ?? $request->query->get('lang', 'en');
        $template = match (strtolower((string)$lang)) {
            'es' => 'pdf/contracts/contract_es_html.twig', // create this next
            default => 'pdf/contracts/contract_en_html.twig',
        };

        // Context with safe defaults
        $company  = array_merge([
            'name'           => 'Owners2',
            'legalName'      => 'Owners2 Property Management',
            'email'          => 'admin@owners2.com',
            'phone'          => '+52 984 142 9561',
            'logoUrl'        => '/img/company-logo.png',
            'representative' => 'António Pedro Tarana de Macedo',
        ], (array)($payload['company'] ?? []));

        // Ensure logoUrl is absolute for wkhtmltopdf
        if (!empty($company['logoUrl']) && is_string($company['logoUrl'])) {
            $raw = $company['logoUrl'];
            if (str_starts_with($raw, '/')) {
                $schemeHost = $request->getSchemeAndHttpHost();
                $company['logoUrl'] = $schemeHost . $raw;
            }
        }

        $client   = array_merge([
            'name'      => '(Owner name)',
            'phone'     => '',
            'email'     => '',
            'idNumber'  => '',
        ], (array)($payload['client'] ?? []));

        $unit     = array_merge([
            'name'    => '',
            'address' => '(address)',
        ], (array)($payload['unit'] ?? []));

        $contract = array_merge([
            'effectiveDate'          => (new \DateTimeImmutable())->format('Y-m-d'),
            'commission'             => '20%',
            'taxRetention'           => '12%',
            'directBookingCommission'=> '20%',
            'payoutDay'              => '10th',
            'initialTerm'            => 'one (1) year',
            'terminationNotice'      => 'thirty (30) days',
        ], (array)($payload['contract'] ?? []));
        if (isset($contract['linensFee'])) {
            $raw = (string)$contract['linensFee'];
            $normalized = preg_replace('/[^0-9.]/', '', $raw);
            if (substr_count($normalized, '.') > 1) {
                $normalized = preg_replace('/\.(?=.*\.)/', '', $normalized);
            }
            $contract['linensFee'] = ltrim($normalized, '0') !== '' ? ltrim($normalized, '0') : '0';
        }

        // Normalize date strings into DateTime where applicable
        if (is_string($contract['effectiveDate'] ?? null)) {
            try {
                $contract['effectiveDate'] = new \DateTimeImmutable($contract['effectiveDate']);
            } catch (\Throwable $e) {
                // keep as string if parsing fails
            }
        }

        $context = [
            'company'  => $company,
            'client'   => $client,
            'unit'     => $unit,
            'contract' => $contract,
        ];

        $headerRight = $payload['headerRight'] ?? 'Property Management Agreement';

        // Ensure the body template actually exists to avoid hanging on render
        if (method_exists($twig, 'getLoader') && method_exists($twig->getLoader(), 'exists')) {
            if (!$twig->getLoader()->exists($template)) {
                return new JsonResponse([
                    'ok' => false,
                    'error' => 'template_missing',
                    'message' => sprintf('Template "%s" was not found. Please create it under templates/', $template),
                ], 400);
            }
        }

        try {
            // First render HTML to ensure template produces content
            $html = $twig->render($template, $context);
            if (!\is_string($html) || trim($html) === '') {
                return new JsonResponse([
                    'ok' => false,
                    'error' => 'empty_template_output',
                    'message' => sprintf('Template %s rendered empty HTML. Check blocks and data.', $template),
                ], 500);
            }

            $pdf = $renderer->renderAsPdf(
                bodyTemplate: $template,
                bodyContext: $context,
                options: [],
                chrome: ['headerRight' => $headerRight]
            );
            if (!\is_string($pdf) || strlen($pdf) < 800) {
                // Heuristic: extremely small PDF often indicates a blank page
                return new JsonResponse([
                    'ok' => false,
                    'error' => 'empty_pdf',
                    'message' => 'PDF appears to be empty. Verify images/paths and header/footer heights.',
                    'hint' => 'Ensure absolute image URLs and that header/footer are not overlapping body.',
                ], 500);
            }

            $response = new Response($pdf, 200);
            $response->headers->set('Content-Type', 'application/pdf');
            $response->headers->set('Content-Disposition', 'inline; filename="contract_preview.pdf"');
            // Allow embedding inside our dashboard iframe
            $response->headers->remove('X-Frame-Options');
            $response->headers->set('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000 https://dashboard.owners2.com");
            return $response;
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'render_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Debug helper: render the contract template as plain HTML (no PDF) to validate data and layout.
     *
     * GET /api/contracts/preview/html?lang=en
     * Optionally pass JSON in the body (some clients allow GET with body) or rely on defaults.
     */
    #[Route('/api/contracts/preview/html', name: 'contracts_preview_html', methods: ['GET'])]
    public function previewHtml(Request $request, TwigEnvironment $twig): Response
    {
        $payload = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $lang = $payload['lang'] ?? $request->query->get('lang', 'en');
        $template = match (strtolower((string)$lang)) {
            'es' => 'pdf/contracts/contract_es_html.twig',
            default => 'pdf/contracts/contract_en_html.twig',
        };

        $company  = array_merge([
            'name'           => 'Owners2',
            'legalName'      => 'Owners2 Property Management',
            'email'          => 'admin@owners2.com',
            'phone'          => '+52 984 142 9561',
            'logoUrl'        => '/img/company-logo.png',
            'representative' => 'António Pedro Tarana de Macedo',
        ], (array)($payload['company'] ?? []));

        if (!empty($company['logoUrl']) && is_string($company['logoUrl'])) {
            $raw = $company['logoUrl'];
            if (str_starts_with($raw, '/')) {
                $schemeHost = $request->getSchemeAndHttpHost();
                $company['logoUrl'] = $schemeHost . $raw;
            }
        }

        $client   = array_merge([
            'name'      => '(Owner name)',
            'phone'     => '',
            'email'     => '',
            'idNumber'  => '',
        ], (array)($payload['client'] ?? []));

        $unit     = array_merge([
            'name'    => '',
            'address' => '(address)',
        ], (array)($payload['unit'] ?? []));

        $contract = array_merge([
            'effectiveDate'          => (new \DateTimeImmutable())->format('Y-m-d'),
            'commission'             => '20%',
            'taxRetention'           => '12%',
            'directBookingCommission'=> '20%',
            'payoutDay'              => '10th',
            'initialTerm'            => 'one (1) year',
            'terminationNotice'      => 'thirty (30) days',
        ], (array)($payload['contract'] ?? []));

        if (is_string($contract['effectiveDate'] ?? null)) {
            try {
                $contract['effectiveDate'] = new \DateTimeImmutable($contract['effectiveDate']);
            } catch (\Throwable $e) {
                // ignore
            }
        }

        $context = [
            'company'  => $company,
            'client'   => $client,
            'unit'     => $unit,
            'contract' => $contract,
        ];

        // Guard template existence
        if (method_exists($twig, 'getLoader') && method_exists($twig->getLoader(), 'exists')) {
            if (!$twig->getLoader()->exists($template)) {
                return new JsonResponse([
                    'ok' => false,
                    'error' => 'template_missing',
                    'message' => sprintf('Template "%s" was not found. Please create it under templates/', $template),
                ], 400);
            }
        }

        try {
            $html = $twig->render($template, $context);
            if (!\is_string($html) || trim($html) === '') {
                $html = '<!doctype html><meta charset="utf-8"><title>Empty</title><body><p>Template rendered empty HTML. Verify blocks and context.</p></body>';
            }
            $response = new Response($html, 200);
            $response->headers->set('Content-Type', 'text/html; charset=UTF-8');
            // Allow embedding inside our dashboard iframe
            $response->headers->remove('X-Frame-Options');
            $response->headers->set('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000 https://dashboard.owners2.com");
            return $response;
        } catch (\Throwable $e) {
            return new JsonResponse([
                'ok' => false,
                'error' => 'render_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
    #[Route('/api/contracts/section', name: 'contracts_section_default', methods: ['GET'])]
    public function getContractSectionDefault(Request $request): JsonResponse
    {
        $lang = strtolower((string)$request->query->get('lang', 'en'));
        $key  = (string)$request->query->get('key', '');
        if ($key === '') {
            return $this->json(['ok' => false, 'error' => 'missing_key', 'message' => 'Missing "key" query param'], 400);
        }

        $allowed = ['intro','purpose','definitions','services','financial_terms','other','legal','contacts'];
        if (!in_array($key, $allowed, true)) {
            return $this->json(['ok' => false, 'error' => 'invalid_key', 'message' => 'Unknown section key'], 400);
        }

        $en = [
            'intro' => '<p>This Property Management Agreement (the “Agreement”) is entered into effect on <strong>__/__/____</strong> (the “Effective Date”), by and between <strong>Owners2 Property Management (“Owners2”)</strong>, hereby represented by the partner António Pedro Tarana de Macedo, and <strong>(Owner name)</strong> (the “Owner”), also collectively referred to as “the Parties.”</p>',
            'purpose' => '<p>The Owner owns the property located at <strong>(address)</strong> (the “Property”). Owners2 is in the business of managing properties of this type. The Owner desires to engage Owners2 to manage the Property.</p>',
            'definitions' => '<h3>Definitions</h3><ul class="no-border"><li><strong>Guest:</strong> The individual(s) staying at the Property under a reservation.</li><li><strong>Services:</strong> The management services described in Section 2 (Owners2 Services).</li><li><strong>Direct Booking:</strong> Any reservation not processed through an external booking platform (e.g., Airbnb); i.e., a reservation secured directly by Owners2 or the Owner outside such platforms.</li><li><strong>Net Revenue:</strong> Gross/Total payout actually received for a reservation minus taxes and any cleaning fee charged to the guest.</li></ul>',
            'services' => '<p>Owners2 agrees to manage the Property according to the following description. Owners2 will independently decide the tools, methods, and processes used to deliver the Services, always acting in good faith and with due care.</p><ol><li>Property Listing. Owners2 will list the Property on relevant platforms and conduct a market study to align pricing.</li><li>Guest Communication. Owners2 will communicate with guests and provide necessary information.</li><li>Reservations. Manage reservations and address incidents or concerns.</li><li>Check‑in / Check‑out. Ensure smooth check‑in/check‑out and perform inspections.</li><li>Cleaning. Clean the Property before and after each reservation, including linens/towels changes.</li><li>Supplies. Provide dish soap, trash bags, sponges, paper towels, toilet paper, shampoo, and bath soap.</li></ol>',
            'financial_terms' => '<ol><li><strong>Collection & Disbursement of Rent.</strong> Owners2 collects rent and disburses proceeds to the Owner. If the bank is not Mexican, transfer fees may apply. Owners2 provides detailed statements.</li><li><strong>Owners2 Commission Fee.</strong> 20% commission on Net Revenue (gross payout minus taxes and any cleaning fee).</li><li><strong>Taxes & Withholding.</strong> Owners2 may withhold/remit taxes as required; Owner remains responsible for Owner‑side taxes.</li><li><strong>Direct Bookings.</strong> Management fee is 20% of the rates Owners2 would charge. If Owner/family stays, only cleaning fee applies.</li><li><strong>Linens.</strong> Owner provides initial linens/towels; pooled‑linens system may apply. 5.1 Monthly Linens Fee: monthly fee for predictable replacements and quality.</li><li><strong>Maintenance & Repair.</strong> Owners2 arranges necessary repairs; emergencies may be approved without prior consent, with prompt notice; costs may be netted from payouts.</li><li><strong>Payment & Monthly Report.</strong> Monthly payouts by the 10th business day, with monthly report and proof of payment.</li></ol>',
            'other' => '<ol><li><strong>Use by the Owner.</strong> Owner may reserve the Property when available; cleaning after checkout performed by Owners2 and deducted.</li><li><strong>Booking Cancellation.</strong> Owner is responsible for penalties arising from requested cancellations.</li><li><strong>Access, Inventory & Photos.</strong> Provide keys/fobs, Wi‑Fi credentials, manuals; professional photos may be deducted from first payout.</li></ol>',
            'legal' => '<ol><li><strong>Representations & Warranties.</strong> Each Party is authorized to enter this Agreement and will not violate third‑party rights or laws.</li><li><strong>Compliance & House Rules.</strong> Owner warrants compliance with laws/HOA/permits; Owners2 may publish reasonable house rules.</li><li><strong>Legal Proceedings.</strong> Owners2 may handle platform claims or small‑claims filings; outside counsel/other actions require Owner approval; Owner pays external legal fees and costs; Owners2 not responsible for matters unrelated to management/rental.</li><li><strong>Damages.</strong> Owners2 will use commercially reasonable efforts to recover guest‑caused damages via platforms/deposits. If recovery fails, the Owner is ultimately responsible. Excludes ordinary wear/tear, structural/common‑area failures, and consequential damages; Owners2 liable only for its gross negligence/willful misconduct.</li><li><strong>Limitation of Liability.</strong> No consequential, incidental, special, exemplary or punitive damages to the extent permitted by law.</li><li><strong>Entire Agreement.</strong> This Agreement is the entire agreement; changes must be in writing by both Parties. Appendix A (Inventory) will be provided after execution for signature.</li></ol>',
            'contacts' => '<p>The parties agree to use the following contact information for all communications relating to this contract:</p><table class="no-border"><tr><td><strong>Owners2</strong><br>Phone: <strong>+52 984 142 9561</strong><br>Email: <strong>admin@owners2.com</strong></td><td><strong>(Owner)</strong><br>Phone: <strong>(phone)</strong><br>Email: <strong>(email)</strong></td></tr></table><p class="muted small">All communication between the parties relating to this contract shall be conducted through these contacts. If either party changes their contact information, they shall promptly notify the other party in writing of the new information.</p>',
        ];

        $es = [
            'intro' => '<p>Este Contrato de Administración de Propiedad (el “Contrato”) entra en vigor el <strong>__/__/____</strong> (la “Fecha de Efecto”), celebrado entre <strong>Owners2 Property Management (“Owners2”)</strong>, representada por el socio António Pedro Tarana de Macedo, y <strong>(Propietario)</strong> (el “Propietario”), denominados conjuntamente las “Partes”.</p>',
            'purpose' => '<p>El Propietario es dueño de la propiedad ubicada en <strong>(dirección)</strong> (la “Propiedad”). Owners2 se dedica a administrar propiedades de este tipo. El Propietario desea contratar a Owners2 para administrar la Propiedad.</p>',
            'definitions' => '<h3>Definiciones</h3><ul class="no-border"><li><strong>Huésped:</strong> Persona(s) que se hospedan en la Propiedad bajo una reservación.</li><li><strong>Servicios:</strong> Los servicios de administración descritos en la Sección 2.</li><li><strong>Reserva Directa:</strong> Reservación no procesada en plataforma externa (p. ej., Airbnb), sino gestionada directamente por Owners2 o el Propietario.</li><li><strong>Ingresos Netos:</strong> Pago bruto/total realmente recibido por una reserva menos impuestos y cualquier tarifa de limpieza cobrada al huésped.</li></ul>',
            'services' => '<p>Owners2 administrará la Propiedad según lo descrito a continuación. Owners2 decidirá de forma independiente las herramientas, métodos y procesos utilizados para prestar los Servicios, actuando siempre de buena fe y con la debida diligencia.</p><ol><li>Publicación del Anuncio. Publicar en plataformas relevantes con estudio de mercado para alinear precios.</li><li>Comunicación con Huéspedes. Comunicación y soporte.</li><li>Reservas. Gestión de reservaciones e incidentes.</li><li>Check‑in / Check‑out. Proceso fluido y revisiones.</li><li>Limpieza. Limpieza antes y después de cada reservación, con cambio de blancos.</li><li>Suministros. Jabón para platos, bolsas, esponjas, toallas de papel, papel higiénico, shampoo y jabón.</li></ol>',
            'financial_terms' => '<ol><li><strong>Cobro y Entrega de Rentas.</strong> Owners2 cobra y dispersa ingresos al Propietario; si la cuenta no es mexicana, pueden aplicar comisiones; entrega estados detallados.</li><li><strong>Comisión de Owners2.</strong> 20% sobre Ingresos Netos (pago bruto menos impuestos y cualquier tarifa de limpieza).</li><li><strong>Impuestos y Retenciones.</strong> Owners2 puede retener/enterar impuestos según la ley; el Propietario es responsable de sus impuestos.</li><li><strong>Reservas Directas.</strong> 20% de las tarifas que Owners2 cobraría; si el Propietario/familia se hospedan, solo se cobra limpieza.</li><li><strong>Blancos.</strong> El Propietario entrega blancos iniciales; sistema en pool; 5.1 Cuota Mensual de Blancos: cuota mensual para reposiciones y calidad predecibles.</li><li><strong>Mantenimiento y Reparaciones.</strong> Owners2 coordina reparaciones; emergencias sin aprobación previa con notificación pronta; costos compensados en pagos.</li><li><strong>Pago y Reporte Mensual.</strong> Pagos mensuales hasta el día hábil 10, con reporte mensual y comprobante.</li></ol>',
            'other' => '<ol><li><strong>Uso por el Propietario.</strong> Puede reservar cuando haya disponibilidad; la limpieza posterior la realiza Owners2 y se descuenta.</li><li><strong>Cancelación de Reservas.</strong> El Propietario asume las penalizaciones que se generen por cancelaciones solicitadas.</li><li><strong>Acceso, Inventario y Fotos.</strong> Entregar llaves/accesos, Wi‑Fi y manuales; fotos profesionales se pueden descontar del primer pago.</li></ol>',
            'legal' => '<ol><li><strong>Declaraciones y Garantías.</strong> Las Partes están autorizadas para celebrar este Contrato y no infringirán derechos de terceros ni leyes.</li><li><strong>Cumplimiento y Reglas de Casa.</strong> El Propietario garantiza cumplimiento de leyes/HOA/permisos; Owners2 podrá publicar reglas de casa razonables.</li><li><strong>Procedimientos Legales.</strong> Owners2 puede gestionar reclamaciones de plataforma o juicios de menor cuantía; abogados externos/procesos adicionales requieren aprobación del Propietario; éste cubre los honorarios externos; Owners2 no es responsable de asuntos ajenos a la administración/renta.</li><li><strong>Daños.</strong> Owners2 hará esfuerzos razonables para recuperar daños causados por huéspedes (plataforma/depósitos); si no se recupera, el Propietario es responsable final. Se excluye desgaste normal; fallas de sistemas/servicios/áreas comunes; y daños consecuenciales. Owners2 solo responde por negligencia grave o dolo.</li><li><strong>Limitación de Responsabilidad.</strong> En la medida permitida por la ley, ninguna Parte será responsable por daños consecuenciales, incidentales, especiales, ejemplares o punitivos.</li><li><strong>Acuerdo Íntegro.</strong> Este Contrato constituye el acuerdo íntegro; cambios por escrito firmados por ambas Partes. Un Anexo A (Inventario) será preparado y entregado al Propietario después de la firma para su firma.</li></ol>',
            'contacts' => '<table class="no-border"><tr><td style="width:50%; vertical-align: top;"><strong>Owners2</strong><br>Tel.: <strong>+52 984 142 9561</strong><br>Email: <strong>admin@owners2.com</strong></td><td style="width:50%; vertical-align: top;"><strong>Propietario</strong><br>Tel.: <strong>(teléfono)</strong><br>Email: <strong>(email)</strong></td></tr></table><p class="muted small">Toda comunicación relativa a este Contrato se realizará mediante estos contactos. Si alguna de las Partes cambia su información de contacto, deberá notificarlo por escrito a la otra Parte.</p>',
        ];

        $map = $lang === 'es' ? $es : $en;
        $html = $map[$key] ?? '';

        return $this->json([
            'ok' => true,
            'lang' => $lang,
            'key' => $key,
            'html' => $html,
        ]);
    }
}