<?php

namespace App\Controller\Api;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

final class HealthController
{
    #[Route('/api/health', name: 'api_health', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        return new JsonResponse([
            'ok' => true,
            'env' => $_ENV['APP_ENV'] ?? null,
            'time' => (new \DateTimeImmutable())->format(DATE_ATOM),
        ]);
    }
}