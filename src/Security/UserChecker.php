<?php

namespace App\Security;

use Symfony\Component\Security\Core\User\UserCheckerInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\Exception\DisabledException;
use App\Entity\User;

class UserChecker implements UserCheckerInterface
{
    public function checkPreAuth(UserInterface $user): void
    {
        if (!$user instanceof User) {
            return;
        }

        if (method_exists($user, 'isEnabled') && !$user->isEnabled()) {
            $ex = new DisabledException('Account disabled');
            $ex->setUser($user);
            throw $ex;
        }
    }

    public function checkPostAuth(UserInterface $user): void
    {
        // Not used but required by interface
    }
}