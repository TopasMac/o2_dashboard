<?php

namespace App\Controller\Api;

use App\Service\ICal\BookingIcalApplyService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/ical', name: 'api_ical_apply_')]
class IcalApplyController extends AbstractController
{
    public function __construct(
        private readonly BookingIcalApplyService $applyService,
    ) {}

    /**
     * Apply iCal updates for a single booking.
     *
     * Example payload:
     * {
     *   "bookingId": 123
     * }
     */
    #[Route('/apply', name: 'apply', methods: ['POST'])]
    public function apply(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $bookingId = $data['bookingId'] ?? null;

        if (!$bookingId) {
            return $this->json([
                'ok' => false,
                'error' => 'missing_booking_id',
                'message' => 'Booking ID is required'
            ], 400);
        }

        $result = $this->applyService->applyForBookingId((int)$bookingId);

        return $this->json($result);
    }

    /**
     * Apply iCal updates for multiple bookings at once.
     *
     * Example payload:
     * {
     *   "ids": [123, 124, 125]
     * }
     */
    #[Route('/apply/bulk', name: 'apply_bulk', methods: ['POST'])]
    public function applyBulk(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $ids = $data['ids'] ?? [];

        if (!is_array($ids) || empty($ids)) {
            return $this->json([
                'ok' => false,
                'error' => 'missing_ids',
                'message' => 'At least one booking ID is required'
            ], 400);
        }

        $results = [];
        foreach ($ids as $id) {
            $results[] = $this->applyService->applyForBookingId((int)$id);
        }

        return $this->json([
            'ok' => true,
            'count' => count($results),
            'results' => $results
        ]);
    }
}