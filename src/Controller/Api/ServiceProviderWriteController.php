<?php

namespace App\Controller\Api;

use App\Service\ServiceProviderService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class ServiceProviderWriteController extends AbstractController
{
    public function __construct(private readonly ServiceProviderService $service)
    {
    }

    #[Route('/api/service-providers', name: 'api_service_providers_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
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
            $provider = $this->service->create($data);

            return $this->json([
                'ok' => true,
                'provider' => [
                    'id' => $provider->getId(),
                    'provider_id' => $provider->getProviderId(),
                    'name' => $provider->getName(),
                    'occupation' => $provider->getOccupation(),
                    'area' => $provider->getArea(),
                    'phone' => $provider->getPhone(),
                    'whatsapp' => $provider->getWhatsapp(),
                    'email' => $provider->getEmail(),
                    'bank_name' => $provider->getBankName(),
                    'account_holder' => $provider->getAccountHolder(),
                    'clabe' => $provider->getClabe(),
                    'account_number' => $provider->getAccountNumber(),
                    'notes' => $provider->getNotes(),
                    'is_active' => $provider->isActive(),
                    'last_job_at' => $provider->getLastJobAt()?->format('Y-m-d H:i:s'),
                    'created_at' => $provider->getCreatedAt()->format('Y-m-d H:i:s'),
                    'updated_at' => $provider->getUpdatedAt()->format('Y-m-d H:i:s'),
                ],
            ], 201);
        } catch (\InvalidArgumentException $e) {
            return $this->json([
                'ok' => false,
                'error' => $e->getMessage(),
            ], 400);
        } catch (\Throwable $e) {
            // Avoid leaking internals; log via Symfony logger if needed.
            return $this->json([
                'ok' => false,
                'error' => 'Unexpected error',
            ], 500);
        }
    }
}