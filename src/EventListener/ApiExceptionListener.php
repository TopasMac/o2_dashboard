<?php
namespace App\EventListener;

use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpFoundation\JsonResponse;

class ApiExceptionListener
{
    public function onKernelException(ExceptionEvent $event): void
    {
        $req = $event->getRequest();
        // Let Symfony preserve HTTP error statuses for these admin endpoints.
        $route = (string) $req->attributes->get('_route');
        if (str_starts_with($route, 'api_service_providers_') || str_starts_with($route, 'api_service_jobs_')) {
            return;
        }

        if (str_starts_with($req->getPathInfo(), '/api/')) {
            $e = $event->getThrowable();
            $event->setResponse(new JsonResponse([
                'error'   => 'exception',
                'message' => $e->getMessage(),
            ], 500));
        }
    }
}
