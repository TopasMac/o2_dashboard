<?php

namespace App\Service;

use App\Entity\Employee;

/**
 * Resolves fine-grained access permissions for a user based on:
 * - Symfony security roles (ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_CLIENT)
 * - Employee profile (division, area, city)
 *
 * The goal is to centralize access logic so that controllers / frontend
 * only deal with simple permission strings like:
 *
 *   - access.all
 *   - dashboard.view_city
 *   - tasks.view_team
 *   - tasks.view_self
 *   - city.all
 *   - city.playa
 *   - city.tulum
 *   - client.associated_units
 *
 * and do NOT need to know about (area, city, division) combinations.
 */
class AccessProfileResolverService
{
    /**
     * Resolve permissions for the current user.
     *
     * @param Employee|null $employee  The linked Employee entity, if any.
     * @param string[]      $userRoles Symfony security roles (e.g. ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_CLIENT).
     *
     * @return string[] A de-duplicated list of permission strings.
     */
    public function resolve(?Employee $employee, array $userRoles = []): array
    {
        $permissions = [];

        $roles = array_unique($userRoles);

        $isAdmin  = \in_array('ROLE_ADMIN', $roles, true);
        $isClient = \in_array('ROLE_CLIENT', $roles, true);

        // 1) Admin: full access, all cities, independent of Employee.
        if ($isAdmin) {
            $permissions = array_merge(
                $permissions,
                $this->getAdminBasePermissions(),
                $this->getManagerBasePermissions(),
                $this->getSupervisorBasePermissions(),
                $this->getCleanerBasePermissions(),
                $this->getAllCityPermissions()
            );

            return array_values(array_unique($permissions));
        }

        // 2) Client: associated-unit access only, no Employee needed.
        if ($isClient) {
            $permissions = array_merge(
                $permissions,
                $this->getClientBasePermissions()
            );

            // City scope for clients is effectively "limited to associated units".
            $permissions[] = 'city.associated_units';

            return array_values(array_unique($permissions));
        }

        // 3) Employees (Manager / Supervisor / Cleaner / Admin-area) – require Employee entity.
        if (!$employee instanceof Employee) {
            // No employee profile and not admin/client: no fine-grained permissions.
            return [];
        }

        $area = $this->normalizeArea($employee->getArea());
        $city = $this->normalizeCity($employee->getCity());

        // Base city permissions based on the employee's city assignment.
        $permissions = array_merge(
            $permissions,
            $this->getCityPermissionsFor($city)
        );

        // Area-based inheritance:
        //
        // - Manager: manager perms + supervisor perms + cleaner perms
        // - Supervisor: supervisor perms + cleaner perms
        // - Cleaner: cleaner perms only
        // - Admin (area-based, not ROLE_ADMIN): for now treat like Manager
        switch ($area) {
            case 'ADMIN':
                $permissions = array_merge(
                    $permissions,
                    $this->getManagerBasePermissions(),
                    $this->getSupervisorBasePermissions(),
                    $this->getCleanerBasePermissions()
                );
                break;

            case 'MANAGER':
                $permissions = array_merge(
                    $permissions,
                    $this->getManagerBasePermissions(),
                    $this->getSupervisorBasePermissions(),
                    $this->getCleanerBasePermissions()
                );
                break;

            case 'SUPERVISOR':
                $permissions = array_merge(
                    $permissions,
                    $this->getSupervisorBasePermissions(),
                    $this->getCleanerBasePermissions()
                );
                break;

            case 'CLEANER':
            default:
                $permissions = array_merge(
                    $permissions,
                    $this->getCleanerBasePermissions()
                );
                break;
        }

        return array_values(array_unique($permissions));
    }

    /**
     * Permissions for Symfony ROLE_ADMIN.
     *
     * "admin - full access"
     */
    private function getAdminBasePermissions(): array
    {
        return [
            'access.all',
            'dashboard.view_all',
            'tasks.view_all',
            'tasks.assign_any',
            'reports.view_all',
            'employees.manage_all',
            'units.manage_all',
        ];
    }

    /**
     * Manager permissions:
     * - specific per-page/table permissions
     * - all supervisor permissions
     */
    private function getManagerBasePermissions(): array
    {
        return [
            'dashboard.view_city',
            'tasks.view_team',
            'tasks.assign_team',
            'reports.view_city',
            'employees.view_city',
        ];
    }

    /**
     * Supervisor permissions:
     * - specific per-page/table permissions
     * - all cleaner permissions
     */
    private function getSupervisorBasePermissions(): array
    {
        return [
            'tasks.view_team',
            'tasks.assign_team_limited',
            'dashboard.view_team_activity',
        ];
    }

    /**
     * Cleaner permissions:
     * - specific per-page/table permissions
     */
    private function getCleanerBasePermissions(): array
    {
        return [
            'tasks.view_self',
            'tasks.update_status_self',
            'dashboard.view_my_tasks',
        ];
    }

    /**
     * Client permissions:
     * - associated unit access only
     */
    private function getClientBasePermissions(): array
    {
        return [
            'client.associated_units',
            'dashboard.view_client_units',
        ];
    }

    /**
     * City-level permissions for "all cities".
     */
    private function getAllCityPermissions(): array
    {
        return [
            'city.all',
            'city.playa',
            'city.tulum',
            'city.general',
        ];
    }

    /**
     * Return city permissions based on the employee's city:
     * - General: can see all cities.
     * - Playa del Carmen: only Playa.
     * - Tulum: only Tulum.
     * - (fallback) unknown: treat as general.
     */
    private function getCityPermissionsFor(string $city): array
    {
        switch ($city) {
            case 'PLAYA':
            case 'PLAYA DEL CARMEN':
                return ['city.playa'];

            case 'TULUM':
                return ['city.tulum'];

            case 'GENERAL':
            default:
                // General users can see all cities.
                return $this->getAllCityPermissions();
        }
    }

    /**
     * Normalize area strings to a canonical form.
     */
    private function normalizeArea(?string $area): string
    {
        $area = \mb_strtoupper(\trim((string) $area));

        // Support some variations if they appear in the database.
        if ($area === 'ADMINISTRADOR') {
            return 'ADMIN';
        }

        return $area;
    }

    /**
     * Normalize city strings to a canonical form.
     */
    private function normalizeCity(?string $city): string
    {
        $city = \mb_strtoupper(\trim((string) $city));

        if ($city === '') {
            return 'GENERAL';
        }

        if (\strpos($city, 'PLAYA') !== false) {
            return 'PLAYA';
        }

        if (\strpos($city, 'TULUM') !== false) {
            return 'TULUM';
        }

        if ($city === 'GENERAL') {
            return 'GENERAL';
        }

        // Fallback: treat unknown as GENERAL for now.
        return 'GENERAL';
    }
}