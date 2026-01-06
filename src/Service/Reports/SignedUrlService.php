<?php

namespace App\Service\Reports;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Small helper to create and verify short‑lived signed URLs for PDF/asset delivery.
 *
 * Signature = base64url( HMAC-SHA256( json_encode(payload), APP_SECRET ) )
 * Payload   = {
 *   path: string,          // absolute path portion (e.g. "/api/reports/unit-inventory/items/2/download")
 *   exp:  int,             // unix epoch expiry (UTC)
 *   uid?: int|null         // optional user id scoping, if you want it
 * }
 */
class SignedUrlService
{
    private string $secret;

    public function __construct(#[Autowire(param: 'kernel.secret')] string $appSecret)
    {
        $this->secret = $appSecret;
    }

    /** Build a fully-qualified signed URL for the given path using current host from Request. */
    public function buildSignedUrl(Request $req, string $path, array $query = [], int $ttlSeconds = 300, ?int $userId = null): string
    {
        if ($path === '' || $path[0] !== '/') {
            throw new \InvalidArgumentException('Path must be an absolute path starting with "/"');
        }

        $exp = time() + max(1, $ttlSeconds);
        $payload = [
            'path' => $path,
            'exp'  => $exp,
        ];
        if ($userId !== null) {
            $payload['uid'] = (int) $userId;
        }

        $sig = $this->sign($payload);

        $qs = array_merge($query, [
            'exp' => $exp,
            'sig' => $sig,
        ]);

        $base = $req->getSchemeAndHttpHost(); // e.g. https://dev.dashboard.owners2.com
        return $base . $path . (empty($qs) ? '' : ('?' . http_build_query($qs)));
    }

    /** Verify the current Request against the expected path and optional expected user id. */
    public function assertValid(Request $req, ?int $expectedUserId = null): void
    {
        $exp = $req->query->get('exp');
        $sig = $req->query->get('sig');

        if ($exp === null || $sig === null) {
            throw new BadRequestHttpException('Missing exp or sig');
        }
        if (!ctype_digit((string) $exp)) {
            throw new BadRequestHttpException('Invalid exp');
        }
        $exp = (int) $exp;
        if ($exp < time()) {
            throw new AccessDeniedHttpException('Signed URL expired');
        }

        $payload = [
            'path' => $req->getPathInfo(),
            'exp'  => $exp,
        ];
        if ($expectedUserId !== null) {
            $payload['uid'] = (int) $expectedUserId;
        }

        $calc = $this->sign($payload);
        // timing-safe compare
        if (!hash_equals($calc, (string) $sig)) {
            throw new AccessDeniedHttpException('Invalid signature');
        }
    }

    /** Create base64url signature for payload. */
    public function sign(array $payload): string
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('Failed to encode payload');
        }
        $raw = hash_hmac('sha256', $json, $this->secret, true);
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}