<?php

namespace App\DataFixtures;

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
    }
}
