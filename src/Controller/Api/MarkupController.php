<?php

namespace App\Controller\Api;

use App\Service\MarkupCalculatorService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class MarkupController extends AbstractController
{
    #[Route('/api/markup/calc', name: 'api_markup_calc', methods: ['GET'])]
    public function calc(Request $request, MarkupCalculatorService $markupService): JsonResponse
    {
        $amount = (float) $request->query->get('amount', 0);

        $markup = $markupService->calculate($amount);

        return $this->json([
            'amount' => $amount,
            'markup' => $markup,
            'charged' => $amount + $markup,
        ]);
    }
}