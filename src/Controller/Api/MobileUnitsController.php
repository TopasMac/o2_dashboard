<?php

namespace App\Controller\Api;

use App\Entity\Employee;
use App\Service\CleaningCityScopeService;
use App\Service\MobileUnitAccessService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

class MobileUnitsController extends AbstractController
{
    #[Route('/api/mobile/units-access', name: 'api_mobile_units_access', methods: ['GET'])]
    public function __invoke(
        Request $request,
        CleaningCityScopeService $cityScope,
        MobileUnitAccessService $units,
    ): JsonResponse {
        $user = $this->getUser();
        $employee = $user && method_exists($user, 'getEmployee') ? $user->getEmployee() : null;
        $employee = $employee instanceof Employee ? $employee : null;
        $isAdmin = $this->isGranted('ROLE_ADMIN');

        $cityScope->assertUnitAccessRole($employee, $isAdmin);

        $requestedCity = $request->query->get('city');
        $city = $cityScope->resolve($employee, $isAdmin, is_string($requestedCity) ? $requestedCity : null);

        return $this->json($units->list($city));
    }
}
