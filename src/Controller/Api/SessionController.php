<?php

namespace App\Controller\Api;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\SecurityBundle\Security;
use App\Service\AccessProfileResolverService;

#[Route('/api/session')]
class SessionController extends AbstractController
{
    public function __construct(
        private Security $security,
        private AccessProfileResolverService $accessProfileResolver,
    ) {}

    #[Route('/properties', name: 'api_session_properties', methods: ['GET'])]
    #[Route('/me', name: 'api_session_me', methods: ['GET'])]
    public function properties(): JsonResponse
    {
        $user = $this->security->getUser();

        $roles = [];
        $displayName = null;
        $username = null;
        $employeePayload = null;
        $employee = null;
        $permissions = [];
        $isEnabled = true;

        if ($user) {
            $roles = method_exists($user, 'getRoles') ? (array) $user->getRoles() : [];

            if (method_exists($user, 'getFullName') && $user->getFullName()) {
                $displayName = (string) $user->getFullName();
            } elseif (method_exists($user, 'getUserIdentifier')) {
                $displayName = (string) $user->getUserIdentifier();
            } elseif (method_exists($user, 'getUsername')) {
                $displayName = (string) $user->getUsername();
            } elseif (method_exists($user, 'getEmail')) {
                $displayName = (string) $user->getEmail();
            }

            if (method_exists($user, 'getUserIdentifier')) {
                $username = (string) $user->getUserIdentifier();
            } elseif (method_exists($user, 'getUsername')) {
                $username = (string) $user->getUsername();
            } else {
                $username = $displayName;
            }

            if (method_exists($user, 'getEmployee')) {
                $employee = $user->getEmployee();
                if ($employee) {
                    $employeePayload = [
                        'id'        => method_exists($employee, 'getId') ? $employee->getId() : null,
                        'area'      => method_exists($employee, 'getArea') ? $employee->getArea() : null,
                        'city'      => method_exists($employee, 'getCity') ? $employee->getCity() : null,
                        'division'  => method_exists($employee, 'getDivision') ? $employee->getDivision() : null,
                        'shortName' => method_exists($employee, 'getShortName') ? $employee->getShortName() : null,
                    ];
                }
            }
            // Resolve fine-grained permissions based on roles and employee profile.
            $permissions = $this->accessProfileResolver->resolve($employee, $roles);
            if (method_exists($user, 'isEnabled')) {
                $isEnabled = (bool) $user->isEnabled();
            }
        }

        $serverTime = (new \DateTimeImmutable('now', new \DateTimeZone('America/Cancun')))->format('Y-m-d H:i:s');

        return $this->json([
            'authenticated' => (bool) $user,
            'isEnabled'    => $isEnabled,
            'username'      => $username,
            'displayName'   => $displayName,
            'roles'         => $roles,
            'serverTime'    => $serverTime,
            'employee'      => $employeePayload,
            'permissions'   => $permissions,
        ]);
    }
}