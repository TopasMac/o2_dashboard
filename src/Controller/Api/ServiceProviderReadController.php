<?php

namespace App\Controller\Api;

use App\Entity\ServiceProvider;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class ServiceProviderReadController extends AbstractController
{
    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    #[Route('/api/service-providers', name: 'api_service_providers_list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        $city = $request->query->get('city');
        $includeInactive = $request->query->get('includeInactive') === '1';

        $qb = $this->em->createQueryBuilder()
            ->select('sp')
            ->from(ServiceProvider::class, 'sp')
            ->orderBy('sp.name', 'ASC');

        if (!$includeInactive) {
            $qb->andWhere('sp.isActive = :active')
               ->setParameter('active', true);
        }

        if (is_string($city) && in_array($city, [
            ServiceProvider::AREA_PLAYA,
            ServiceProvider::AREA_TULUM,
        ], true)) {
            $qb->andWhere('sp.area IN (:areas)')
               ->setParameter('areas', [$city, ServiceProvider::AREA_BOTH]);
        }

        $providers = $qb->getQuery()->getResult();

        $data = array_map(static function (ServiceProvider $provider): array {
            $number = $provider->getAccountNumber() ?: $provider->getClabe();
            $accountDigits = preg_replace('/[^0-9]/', '', $number ?? '');

            return self::summary($provider) + [
                'account_holder' => $provider->getAccountHolder(),
                'bank_name' => $provider->getBankName(),
                'account_number_last_four' => strlen($accountDigits) > 4 ? substr($accountDigits, -4) : null,
                'notes' => $provider->getNotes(),
                'created_at' => $provider->getCreatedAt()->format('Y-m-d'),
            ];
        }, $providers);

        return $this->json([
            'ok' => true,
            'count' => count($data),
            'providers' => $data,
        ], 200, ['Cache-Control' => 'private, no-store']);
    }

    #[Route('/api/service-providers/{id<\d+>}', name: 'api_service_providers_detail', methods: ['GET'])]
    public function detail(int $id): JsonResponse
    {
        $provider = $this->em->find(ServiceProvider::class, $id);
        if (!$provider) {
            return $this->json(['ok' => false, 'error' => 'Provider not found'], 404);
        }

        return $this->json(['ok' => true, 'provider' => self::details($provider)], 200, ['Cache-Control' => 'private, no-store']);
    }

    public static function summary(ServiceProvider $provider): array
    {
        return [
            'id' => $provider->getId(),
            'provider_id' => $provider->getProviderId(),
            'name' => $provider->getName(),
            'occupation' => $provider->getOccupation(),
            'area' => $provider->getArea(),
            'phone' => $provider->getPhone(),
            'whatsapp' => $provider->getWhatsapp(),
            'email' => $provider->getEmail(),
            'is_active' => $provider->isActive(),
            'last_job_at' => $provider->getLastJobAt()?->format('Y-m-d H:i:s'),
        ];
    }

    public static function details(ServiceProvider $provider): array
    {
        return self::summary($provider) + [
            'bank_name' => $provider->getBankName(),
            'account_holder' => $provider->getAccountHolder(),
            'clabe' => $provider->getClabe(),
            'account_number' => $provider->getAccountNumber(),
            'notes' => $provider->getNotes(),
            'created_at' => $provider->getCreatedAt()->format('Y-m-d H:i:s'),
            'updated_at' => $provider->getUpdatedAt()->format('Y-m-d H:i:s'),
        ];
    }
}
