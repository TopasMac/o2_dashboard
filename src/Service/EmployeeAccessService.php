<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Employee;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Service responsible for creating and linking platform User accounts for Employees.
 *
 * Usage:
 *  - Decide in the UI which employees should have access (platformEnabled).
 *  - Call createUserForEmployee($employee) from a controller/command.
 *  - The service will:
 *      * create a User using the employee's email as username
 *      * assign roles based on division/area (ROLE_MANAGER, ROLE_EMPLOYEE, etc.)
 *      * generate and hash a random password (unless you provide one)
 *      * link Employee <-> User and set platformEnabled = true
 *      * return the User and the plain password (for display/email)
 */
class EmployeeAccessService
{
    private EntityManagerInterface $em;
    private UserPasswordHasherInterface $passwordHasher;

    public function __construct(EntityManagerInterface $em, UserPasswordHasherInterface $passwordHasher)
    {
        $this->em = $em;
        $this->passwordHasher = $passwordHasher;
    }

    /**
     * Create a platform User for the given Employee, link it, and return both
     * the User and the plain password (for one-time display).
     *
     * @return array{user: User, plainPassword: string}
     */
    public function createUserForEmployee(Employee $employee, ?string $plainPassword = null): array
    {
        $email = trim((string) $employee->getEmail());
        if ($email === '') {
            throw new \InvalidArgumentException('Employee must have an email address to create platform access.');
        }

        if ($employee->getUser() !== null) {
            throw new \LogicException('This employee already has a linked User account.');
        }

        if ($plainPassword === null) {
            $plainPassword = $this->generateRandomPassword(10);
        }

        $user = new User();
        $user->setEmail(strtolower($email));

        // If User has a name field, try to use the employee's shortName, falling back to full name
        if (method_exists($user, 'setName')) {
            $displayName = null;
            if (method_exists($employee, 'getShortName')) {
                $displayName = $employee->getShortName();
            }
            if (($displayName === null || $displayName === '') && method_exists($employee, 'getName')) {
                $displayName = $employee->getName();
            }
            if ($displayName !== null && $displayName !== '') {
                $user->setName((string) $displayName);
            }
        }

        // Assign roles based on division/area
        $roles = $this->determineRolesForEmployee($employee);
        $user->setRoles($roles);

        $hashed = $this->passwordHasher->hashPassword($user, $plainPassword);
        $user->setPassword($hashed);
        $user->setPlainPassword($plainPassword);

        // Link both sides of the association when possible
        $employee->setUser($user);
        if (method_exists($user, 'setEmployee')) {
            $user->setEmployee($employee);
        }

        if (method_exists($employee, 'setPlatformEnabled')) {
            $employee->setPlatformEnabled(true);
        }

        $this->em->persist($user);
        $this->em->persist($employee);
        $this->em->flush();

        return [
            'user' => $user,
            'plainPassword' => $plainPassword,
        ];
    }

    /**
     * Update the platform User password for the given employee (when a User already exists).
     */
    public function updateUserPasswordForEmployee(Employee $employee, string $plainPassword): void
    {
        $user = $employee->getUser();
        if (!$user instanceof User) {
            throw new \LogicException('Cannot update password: employee is not linked to a User.');
        }

        if ($plainPassword === '') {
            throw new \InvalidArgumentException('Plain password cannot be empty.');
        }

        $hashed = $this->passwordHasher->hashPassword($user, $plainPassword);
        $user->setPassword($hashed);

        if (method_exists($user, 'setPlainPassword')) {
            $user->setPlainPassword($plainPassword);
        }

        $this->em->persist($user);
        $this->em->flush();
    }

    /**
     * Determine the primary roles for an employee based on division/area.
     *
     * New model:
     *  - ROLE_ADMIN    – never auto-assigned here (only manual)
     *  - ROLE_MANAGER  – office / management (Owners2 Admin/Manager)
     *  - ROLE_EMPLOYEE – any employee who can log in (supervisors, cleaners, etc.)
     *  - ROLE_CLIENT   – owners (handled elsewhere, not here)
     */
    public function determineRolesForEmployee(Employee $employee): array
    {
        $division = strtolower((string) (method_exists($employee, 'getDivision') ? $employee->getDivision() : ''));
        $area     = strtolower((string) (method_exists($employee, 'getArea') ? $employee->getArea() : ''));

        $roles = [];

        // ----- ADMIN IS NEVER AUTO-ASSIGNED -----
        // ROLE_ADMIN should only be added manually on specific User accounts.

        // ----- MANAGEMENT (Owners2 Admin/Managers) -----
        if ($division === 'owners2' && \in_array($area, ['admin', 'manager'], true)) {
            $roles[] = 'ROLE_MANAGER';
            $roles[] = 'ROLE_EMPLOYEE';

            return array_values(array_unique($roles));
        }

        // ----- HOUSEKEEPERS (any area) -----
        // Cleaners, supervisors, assistants all count as EMPLOYEE.
        if ($division === 'housekeepers') {
            $roles[] = 'ROLE_EMPLOYEE';

            return array_values(array_unique($roles));
        }

        // ----- SUPERVISORS IN ANY DIVISION -----
        if ($area === 'supervisor') {
            $roles[] = 'ROLE_EMPLOYEE';

            return array_values(array_unique($roles));
        }

        // ----- DEFAULT: any employee who can log in -----
        $roles[] = 'ROLE_EMPLOYEE';

        return array_values(array_unique($roles));
    }

    /**
     * Simple random password generator.
     */
    private function generateRandomPassword(int $length = 10): string
    {
        // 0-9 a-z A-Z, avoiding ambiguous chars if needed
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        $alphabetLength = strlen($alphabet);

        $password = '';
        for ($i = 0; $i < $length; $i++) {
            $idx = random_int(0, $alphabetLength - 1);
            $password .= $alphabet[$idx];
        }

        return $password;
    }
}
