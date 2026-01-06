<?php
namespace App\EventListener;

use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpFoundation\JsonResponse;

class ApiExceptionListener
{
    public function onKernelException(ExceptionEvent $event): void
    {
        $req = $event->getRequest();
        if (str_starts_with($req->getPathInfo(), '/api/')) {
            $e = $event->getThrowable();
            $event->setResponse(new JsonResponse([
                'error'   => 'exception',
                'message' => $e->getMessage(),
            ], 500));
        }
    }
}