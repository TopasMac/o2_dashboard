<?php

namespace App\Controller\Api;

use App\Service\AirbnbReviewService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class AirbnbReviewController extends AbstractController
{
    /**
     * Expose the Airbnb review queue for the Manager Dashboard card.
     *
     * This endpoint returns a structured payload with:
     *  - the operational window (from/to)
     *  - aggregate stats (made / skipped / expired / pending)
     *  - the list of Airbnb bookings in that window with their current review status
     *
     * All business rules are delegated to AirbnbReviewService so that the
     * frontend remains thin and any future reports can reuse the same logic.
     */
    #[Route('/api/dashboard/airbnb-review-queue', name: 'api_airbnb_review_queue', methods: ['GET'])]
    public function reviewQueue(AirbnbReviewService $reviewService): JsonResponse
    {
        // Use America/Cancun as the reference timezone for "today" to align with
        // how dates are normally handled in the dashboard.
        $tz = new \DateTimeZone('America/Cancun');
        $today = new \DateTimeImmutable('today', $tz);

        $payload = $reviewService->getReviewQueue($today);

        return $this->json($payload);
    }
}