<?php

namespace App\EventListener;

use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;

class LoginSuccessListener
{
    public function onAuthenticationSuccessResponse(AuthenticationSuccessEvent $event): void
    {
        $data = $event->getData();
        $user = $event->getUser();

        // Add the user name to the login response
        if (method_exists($user, 'getName')) {
            $data['name'] = $user->getName();
        }

        // Add user roles to the login response
        if (method_exists($user, 'getRoles')) {
            $data['roles'] = $user->getRoles();
        }

        $event->setData($data);
    }
}