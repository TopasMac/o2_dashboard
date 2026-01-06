<?php

namespace App\Controller\Api;

use App\Service\OccupancyCalculatorService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class OccupancyReportController extends AbstractController
{
    private OccupancyCalculatorService $occupancyCalculator;

    public function __construct(OccupancyCalculatorService $occupancyCalculator)
    {
        $this->occupancyCalculator = $occupancyCalculator;
    }

    #[Route('/api/occupancy-report', name: 'api_occupancy_report', methods: ['GET'])]
    public function index(): JsonResponse
    {
        $data = $this->occupancyCalculator->calculate();
        return $this->json($data);
    }
}