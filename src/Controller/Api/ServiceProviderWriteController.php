<?php

namespace App\Controller\Api;

use App\Entity\ServiceProvider;
use Doctrine\ORM\EntityManagerInterface;
use App\Service\ServiceProviderService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class ServiceProviderWriteController extends AbstractController
{
    public function __construct(
        private readonly ServiceProviderService $service,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/service-providers', name: 'api_service_providers_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        return $this->save($request);
    }

    #[Route('/api/service-providers/{id<\d+>}', name: 'api_service_providers_update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $provider = $this->em->find(ServiceProvider::class, $id);
        if (!$provider) {
            return $this->json(['ok' => false, 'error' => 'Provider not found'], 404);
        }

        return $this->save($request, $provider);
    }

    private function save(Request $request, ?ServiceProvider $existing = null): JsonResponse
    {
        $payload = $request->getContent();
        $data = [];

        if (is_string($payload) && trim($payload) !== '') {
            $decoded = json_decode($payload, true);
            if (!is_array($decoded)) {
                return $this->json([
                    'ok' => false,
                    'error' => 'Invalid JSON payload',
                ], 400);
            }
            $data = $decoded;
        }

        try {
            $provider = $existing
                ? $this->service->update($existing, $data)
                : $this->service->create($data);

            return $this->json([
                'ok' => true,
                'provider' => ServiceProviderReadController::details($provider),
            ], $existing ? 200 : 201, ['Cache-Control' => 'private, no-store']);
        } catch (\InvalidArgumentException $e) {
            return $this->json([
                'ok' => false,
                'error' => $e->getMessage(),
            ], 400);
        }
    }
}
