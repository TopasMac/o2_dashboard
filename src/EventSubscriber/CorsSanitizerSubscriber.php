<?php
namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

final class CorsSanitizerSubscriber implements EventSubscriberInterface
{
    /** @var string[] */
    private array $baseAllowedOrigins = [
        'https://www.owners2.com',
        'https://owners2.com',
    ];

    public static function getSubscribedEvents(): array
    {
        // Run as late as possible so we can sanitize headers added by any other listener
        return [ KernelEvents::RESPONSE => ['onResponse', \PHP_INT_MIN] ];
    }

    public function onResponse(ResponseEvent $event): void
    {
        $request = $event->getRequest();
        $path    = $request->getPathInfo();

        // Only sanitize API responses
        if (strpos($path, '/api/') !== 0) {
            return;
        }

        // Build allow-list (prod = only owners2.com; dev/test = include localhost)
        $env = $_SERVER['APP_ENV'] ?? 'prod';
        $allowedOrigins = array_merge($this->baseAllowedOrigins, [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
        ]);

        // Determine the origin to echo back
        $originHeader = $request->headers->get('Origin', '');
        $echoOrigin   = in_array($originHeader, $allowedOrigins, true)
            ? $originHeader
            : 'https://www.owners2.com';

        // If this is a CORS preflight (OPTIONS), answer here and short‑circuit
        if ($request->isMethod('OPTIONS')) {
            $preflight = new Response('', 204);
            $preflight->headers->set('Access-Control-Allow-Origin', $echoOrigin);
            $preflight->headers->set('Access-Control-Allow-Credentials', 'true');
            $preflight->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            $preflight->headers->set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, X-Requested-With');
            $preflight->headers->set('Access-Control-Max-Age', '86400');
            $preflight->headers->set('Vary', 'Origin');
            // Debug headers (remove later if desired)
            $preflight->headers->set('X-Cors-Sanitized', '1');
            $preflight->headers->set('X-App-Env', $env);
            $event->setResponse($preflight);
            return;
        }

        $response = $event->getResponse();

        // Remove any duplicates that earlier layers may have added
        $response->headers->remove('Access-Control-Allow-Origin');
        $response->headers->remove('Access-Control-Allow-Methods');
        $response->headers->remove('Access-Control-Allow-Headers');
        $response->headers->remove('Access-Control-Allow-Credentials');
        $response->headers->remove('Access-Control-Max-Age');

        // Apply sane CORS headers
        $response->headers->set('Access-Control-Allow-Origin', $echoOrigin);
        $response->headers->set('Access-Control-Allow-Credentials', 'true');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, X-Requested-With');
        $response->headers->set('Access-Control-Max-Age', '86400');
        $response->headers->set('Vary', 'Origin');

        // Debug headers to verify sanitizer execution and runtime env (remove later)
        $response->headers->set('X-Cors-Sanitized', '1');
        $response->headers->set('X-App-Env', $env);
    }
}