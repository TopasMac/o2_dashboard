<?php

namespace App\Service\Reports;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Trait to standardize signed URL generation and validation for all report controllers.
 */
trait ReportSignedUrlTrait
{
    protected SignedUrlService $signedUrlService;

    /** Inject the shared SignedUrlService */
    public function setSignedUrlService(SignedUrlService $service): void
    {
        $this->signedUrlService = $service;
    }

    /**
     * Create a signed URL for any download endpoint.
     * Example: /api/reports/unit-inventory/items/{id}/download
     */
    protected function buildReportSignedUrl(Request $request, string $path, int $ttlSeconds = 300): JsonResponse
    {
        $url = $this->signedUrlService->buildSignedUrl($request, $path, [], $ttlSeconds);
        return new JsonResponse(['ok' => true, 'url' => $url]);
    }

    /**
     * Verify the current request’s signature and expiry before serving a file.
     */
    protected function verifySignedUrl(Request $request): void
    {
        $this->signedUrlService->assertValid($request);
    }
}