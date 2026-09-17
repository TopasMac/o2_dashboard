<?php

namespace App\Service;

use App\Entity\Employee;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

final class CleaningCityScopeService
{
    public function resolve(?Employee $employee, bool $isAdmin, ?string $requestedCity): ?string
    {
        $requestedCity = $this->clean($requestedCity);

        if ($isAdmin || !$employee instanceof Employee) {
            return $requestedCity;
        }

        if ($this->normalize($employee->getArea()) !== 'CLEANER') {
            return $requestedCity;
        }

        return match ($this->normalize($employee->getCity())) {
            'PLAYA', 'PLAYA DEL CARMEN' => 'Playa del Carmen',
            'TULUM' => 'Tulum',
            'GENERAL' => $requestedCity,
            default => throw new AccessDeniedHttpException(
                'The cleaner account does not have a supported city assignment.'
            ),
        };
    }

    public function assertCleaningAccess(?Employee $employee, bool $isAdmin, string $cleaningCity): void
    {
        if ($isAdmin || !$employee instanceof Employee) {
            return;
        }

        if ($this->normalize($employee->getArea()) !== 'CLEANER') {
            return;
        }

        $employeeCity = $this->cityGroup($employee->getCity());
        if ($employeeCity === 'GENERAL') {
            return;
        }

        if ($employeeCity === null || $employeeCity !== $this->cityGroup($cleaningCity)) {
            throw new AccessDeniedHttpException('The cleaning is outside the cleaner account city scope.');
        }
    }

    private function clean(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private function normalize(?string $value): string
    {
        return strtoupper(trim((string) $value));
    }

    private function cityGroup(?string $value): ?string
    {
        return match ($this->normalize($value)) {
            'PLAYA', 'PLAYA DEL CARMEN' => 'PLAYA',
            'TULUM' => 'TULUM',
            'GENERAL' => 'GENERAL',
            default => null,
        };
    }
}
