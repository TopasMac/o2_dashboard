<?php

namespace App\DataFixtures;

use App\Entity\Employee;
use App\Entity\User;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Symfony\Component\HttpKernel\KernelInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class AppFixtures extends Fixture
{
    public function __construct(
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly KernelInterface $kernel,
    ) {
    }

    public function load(ObjectManager $manager): void
    {
        if ($this->kernel->getEnvironment() === 'prod') {
            throw new \LogicException('Local development fixtures cannot run in production.');
        }

        $admin = $manager->getRepository(User::class)->findOneBy([
            'email' => 'admin@owners2.local',
        ]);

        if (!$admin instanceof User) {
            $admin = new User();
        }

        $admin
            ->setEmail('admin@owners2.local')
            ->setName('Local Administrator')
            ->setRoles(['ROLE_ADMIN'])
            ->setIsEnabled(true);

        $admin->setPassword(
            $this->passwordHasher->hashPassword(
                $admin,
                'Owners2Local!2026',
            ),
        );

        $manager->persist($admin);
        $manager->flush();

        $employee = $admin->getEmployee();
        if (!$employee instanceof Employee) {
            $employee = $manager->getRepository(Employee::class)->findOneBy([
                'employeeCode' => 'O2LOCAL001',
            ]);
        }
        if (!$employee instanceof Employee) {
            $employee = $manager->getRepository(Employee::class)->findOneBy([
                'email' => 'admin@owners2.local',
            ]);
        }
        if (!$employee instanceof Employee) {
            $employee = new Employee();
        }

        $employee
            ->setEmployeeCode('O2LOCAL001')
            ->setName('Local Administrator')
            ->setShortName('Local Admin')
            ->setDivision('Owners2')
            ->setArea('Admin')
            ->setCity('General')
            ->setDateStarted(new \DateTimeImmutable('2026-01-01'))
            ->setInitialSalary('0.00')
            ->setCurrentSalary('0.00')
            ->setStatus('Active')
            ->setPlatformEnabled(true)
            ->setNotes('Synthetic employee for local development only.')
            ->setUser($admin)
            ->setEmail('admin@owners2.local');

        $manager->persist($employee);
        $manager->flush();

        // Both legacy relationship directions exist in the current schema.
        // Link both so authentication and employee-oriented APIs resolve the
        // same synthetic record regardless of which side they read.
        $admin->setEmployee($employee);
        $manager->persist($admin);
        $manager->flush();
    }
}
