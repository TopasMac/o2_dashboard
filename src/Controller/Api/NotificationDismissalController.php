<?php

namespace App\Controller\Api;

use App\Entity\NotificationDismissal;
use App\Entity\Unit;
use App\Repository\NotificationDismissalRepository;
use App\Repository\UnitRepository;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\SecurityBundle\Security;

#[Route('/api')]
class NotificationDismissalController extends AbstractController
{
    public function __construct(
        private readonly NotificationDismissalRepository $dismissalRepository,
        private readonly UnitRepository $unitRepository,
        private readonly EntityManagerInterface $em,
        private readonly Security $security,
    ) {
    }

    #[Route('/service-alert-dismissals', name: 'api_service_alert_dismissals_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $user = $this->security->getUser();
        if (!$user) {
            return $this->json(
                ['success' => false, 'error' => 'Unauthorized'],
                JsonResponse::HTTP_UNAUTHORIZED
            );
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(
                ['success' => false, 'error' => 'Invalid JSON payload'],
                JsonResponse::HTTP_BAD_REQUEST
            );
        }

        $alertType = $data['alertType'] ?? null; // 'overdue' | 'due_soon' | 'mismatch'
        $service   = $data['service'] ?? null;   // 'HOA' | 'Internet' | 'Water' | 'CFE'
        $monthYear = $data['monthYear'] ?? null; // 'YYYY-MM'
        $unitId    = $data['unitId'] ?? null;

        if (!$alertType || !$service || !$monthYear) {
            return $this->json(
                ['success' => false, 'error' => 'Missing required fields (alertType, service, monthYear)'],
                JsonResponse::HTTP_BAD_REQUEST
            );
        }

        /** @var Unit|null $unit */
        $unit = null;
        if ($unitId !== null) {
            $unit = $this->unitRepository->find($unitId);
        }

        // Check if dismissal already exists for this user + unit + type + service + monthYear
        $existing = $this->dismissalRepository->findOneBy([
            'user'      => $user,
            'unit'      => $unit,
            'alertType' => $alertType,
            'service'   => $service,
            'monthYear' => $monthYear,
        ]);

        if ($existing) {
            return $this->json([
                'success'   => true,
                'id'        => $existing->getId(),
                'duplicate' => true,
            ]);
        }

        $dismissal = new NotificationDismissal();
        $dismissal->setUser($user);
        $dismissal->setUnit($unit);
        $dismissal->setAlertType($alertType);
        $dismissal->setService($service);
        $dismissal->setMonthYear($monthYear);
        $dismissal->setDismissedAt(new DateTimeImmutable());

        $this->em->persist($dismissal);
        $this->em->flush();

        return $this->json([
            'success' => true,
            'id'      => $dismissal->getId(),
        ]);
    }
}
