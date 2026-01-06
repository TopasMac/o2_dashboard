<?php

namespace App\Controller;

use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

class SpaController
{
    #[Route('/{reactRouting}', name: 'spa', requirements: ['reactRouting' => '^(?!api|_(profiler|wdt)).*'], priority: -1)]
    public function index(): Response
    {
        return new Response(file_get_contents(__DIR__.'/../../public/index.html'));
    }
}