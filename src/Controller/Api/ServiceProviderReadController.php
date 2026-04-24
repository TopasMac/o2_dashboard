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

        $data = array_map(function (ServiceProvider $sp) {
            return [
                'id' => $sp->getId(),
                'provider_id' => $sp->getProviderId(),
                'name' => $sp->getName(),
                'occupation' => $sp->getOccupation(),
                'area' => $sp->getArea(),
                'phone' => $sp->getPhone(),
                'whatsapp' => $sp->getWhatsapp(),
                'email' => $sp->getEmail(),
                'is_active' => $sp->isActive(),
                'last_job_at' => $sp->getLastJobAt()?->format('Y-m-d H:i:s'),
            ];
        }, $providers);

        return $this->json([
            'ok' => true,
            'count' => count($data),
            'providers' => $data,
        ]);
    }
}