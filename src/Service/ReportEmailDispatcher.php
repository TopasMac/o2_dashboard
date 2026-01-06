<?php

namespace App\Service;

use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Component\HttpClient\HttpClient;

class ReportEmailDispatcher
{
    private ?HttpClientInterface $client = null;
    private string $flowUrl = '';
    private ?string $flowToken = null;

    public function __construct(?HttpClientInterface $client = null, ?string $flowUrl = null, ?string $flowToken = null)
    {
        // Lazily resolve dependencies so missing envs don’t break container build
        $this->client    = $client ?: HttpClient::create();
        $this->flowUrl   = $flowUrl
            ?? ($_ENV['FLOW_REPORT_EMAIL_URL']   ?? getenv('FLOW_REPORT_EMAIL_URL')   ?: '');
        $this->flowToken = $flowToken
            ?? ($_ENV['FLOW_REPORT_EMAIL_TOKEN'] ?? getenv('FLOW_REPORT_EMAIL_TOKEN') ?: null);
    }

    /**
     * Build a default HTML body based on a language code.
     * If $language is 'es' → Spanish, if 'en' → English, otherwise bilingual fallback.
     */
    private function buildDefaultBody(?string $language): string
    {
        $lang = $language ? strtolower(trim($language)) : null;
        if ($lang === 'es') {
            return <<<HTML
<p>Estimado Cliente,</p>
<p>Adjunto encontrarás tu informe mensual.</p>
<p>Si tienes alguna pregunta, no dudes en ponerte en contacto con nosotros.</p>
<p>Saludos cordiales,<br/>Owners2</p>
HTML;
        }
        if ($lang === 'en') {
            return <<<HTML
<p>Dear Partner,</p>
<p>Attached you will find your monthly report.</p>
<p>If you have any questions, please don’t hesitate to reach out.</p>
<p>Best regards,<br/>Owners2</p>
HTML;
        }
        // Fallback: bilingual
        return <<<HTML
<p>Dear Partner / Estimado Cliente,</p>
<p>Please find attached your monthly report. If you have any questions, please don’t hesitate to reach out.</p>
<p>Adjunto encontrarás tu informe mensual. Si tienes alguna pregunta, no dudes en ponerte en contacto con nosotros.</p>
<p>Best regards / Saludos cordiales,<br/>Owners2</p>
HTML;
    }

    /** @return bool */
    private function boolish(mixed $v): bool
    {
        if (is_bool($v)) return $v;
        if (is_int($v)) return $v === 1;
        if ($v === null) return false;
        $s = strtolower(trim((string)$v));
        return in_array($s, ['1','true','yes','y','on'], true);
    }

    private function buildAttachmentFromUrl(string $url, ?string $filename = null, string $contentType = 'application/pdf'): ?array
    {
        $raw = @file_get_contents($url);
        if ($raw === false) {
            return null;
        }
        $name = $filename ?: basename(parse_url($url, PHP_URL_PATH) ?: 'report.pdf');
        return [
            'filename' => $name,
            'contentType' => $contentType,
            'contentBase64' => base64_encode($raw),
        ];
    }

    /**
     * Dispatch an email request to the Power Automate Flow.
     *
     * @param string $to Recipient email address
     * @param string $subject Subject line
     * @param string $htmlBody HTML body content
     * @param array  $extra Optional extra payload fields
     *
     * @return array Response from Flow
     */
    public function sendEmail(string $to, string $subject, string $htmlBody, array $extra = []): array
    {
        if ($this->flowUrl === '') {
            return [
                'status' => 500,
                'data'   => [
                    'error'   => 'FLOW_REPORT_EMAIL_URL is not configured',
                    'details' => 'Set FLOW_REPORT_EMAIL_URL (and optional FLOW_REPORT_EMAIL_TOKEN) in your environment.',
                ],
            ];
        }
        $body = trim($htmlBody);
        // Allow language hint in extra payload (e.g., set by frontend from Client.language)
        $language = $extra['language'] ?? null;
        // If the caller did not provide a body, generate one based on language
        if ($body === '') {
            $body = $this->buildDefaultBody(is_string($language) ? $language : null);
        }

        $payload = [
            'to'       => $to,
            'subject'  => $subject,
            'htmlBody' => $body,
        ];

        // Normalize attach flag and attachments for Flow schema
        $attachFlag = $this->boolish($extra['attach'] ?? false);
        $attachments = [];

        if (isset($extra['attachments']) && is_array($extra['attachments']) && count($extra['attachments']) > 0) {
            // Convert any url-based items into Flow-compatible attachments; keep base64 items as-is
            foreach ($extra['attachments'] as $att) {
                if (!is_array($att)) { continue; }

                // Already Flow-ready?
                if (!empty($att['contentBase64']) && !empty($att['filename'])) {
                    $attachments[] = [
                        'filename'      => (string)$att['filename'],
                        'contentType'   => (string)($att['contentType'] ?? 'application/pdf'),
                        'contentBase64' => (string)$att['contentBase64'],
                    ];
                    continue;
                }

                // URL-based? build bytes
                $url  = $att['url']      ?? $att['s3Url'] ?? $att['fileUrl'] ?? null;
                $name = $att['filename'] ?? $att['name']  ?? null;
                if (is_string($url) && $url !== '') {
                    $flowAtt = $this->buildAttachmentFromUrl($url, $name);
                    if ($flowAtt) {
                        $attachments[] = $flowAtt;
                    }
                }
            }
        } elseif ($attachFlag) {
            // Try to build a single attachment from a URL hint
            $url = $extra['s3Url'] ?? $extra['fileUrl'] ?? null;
            if (is_string($url) && $url !== '') {
                $name = $extra['filename'] ?? null;
                $att = $this->buildAttachmentFromUrl($url, $name);
                if ($att) {
                    $attachments = [$att];
                }
            }
        }

        if (count($attachments) > 0) {
            $payload['attachments'] = $attachments;
        }

        // Only pass through keys the Flow trigger schema expects
        if (array_key_exists('unitId', $extra))   { $payload['unitId']   = $extra['unitId']; }
        if (array_key_exists('yearMonth', $extra)) { $payload['yearMonth'] = $extra['yearMonth']; }
        if (array_key_exists('attach', $extra))    { $payload['attach']    = $attachFlag; }
        if (array_key_exists('s3Key', $extra))     { $payload['s3Key']     = $extra['s3Key']; }

        $headers = [
            'Content-Type' => 'application/json',
        ];
        if ($this->flowToken) {
            $headers['X-Flow-Token'] = $this->flowToken;
        }

        if (!$this->client) {
            $this->client = HttpClient::create();
        }
        $response = $this->client->request('POST', $this->flowUrl, [
            'headers' => $headers,
            'json' => $payload,
        ]);

        $statusCode = $response->getStatusCode();
        $data = [];
        try {
            $data = $response->toArray(false);
        } catch (\Exception $e) {
            $data = ['error' => $e->getMessage()];
        }

        return [
            'status' => $statusCode,
            'data' => $data,
        ];
    }
}