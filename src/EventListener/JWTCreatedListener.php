<?php

namespace App\EventListener;

use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTCreatedEvent;

class JWTCreatedListener
{
    public function onJWTCreated(JWTCreatedEvent $event): void
    {
        $user = $event->getUser();
        $data = $event->getData();

        // Add the user name to the JWT payload
        if (method_exists($user, 'getName')) {
            $data['name'] = $user->getName();
        }

        $event->setData($data);
    }
}
