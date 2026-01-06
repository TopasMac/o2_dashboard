<?php
namespace App\Controller\Api;

use App\Entity\AirbnbEmailImport;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use App\Service\BookingProcessingService;

class AirbnbImportController extends AbstractController
{
    #[Route('/api/airbnb-import', name: 'airbnb_import', methods: ['POST'])]
    public function import(Request $request, EntityManagerInterface $em, BookingProcessingService $bookingProcessor, \App\Service\BookingAggregatorService $bookingAggregator): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $guestName = $data['guestName'] ?? '';
        $body = $data['body'] ?? '';

        if (!$body) {
            return new JsonResponse(['error' => 'Missing body'], 400);
        }

        $lines = explode("\n", $body);

        // Extract confirmation code using regex
        if (preg_match('/CONFIRMATION CODE\s+([A-Z0-9]+)/i', $body, $matches)) {
            $reservationCode = trim($matches[1]);
        } else {
            return new JsonResponse(['error' => 'Could not extract reservation code'], 422);
        }

        // Extract listing name more flexibly
        $listingName = null;
        foreach ($lines as $i => $line) {
            if (stripos($line, 'Entire home/flat') !== false) {
                for ($j = $i - 1; $j >= $i - 4 && $j >= 0; $j--) {
                    if (trim($lines[$j]) !== '') {
                        $listingName = trim($lines[$j]);
                        break;
                    }
                }
                break;
            }
        }

        // Extract number of guests
        $guests = null;
        foreach ($lines as $i => $line) {
            if (trim($line) === 'GUESTS' && isset($lines[$i + 2])) {
                if (preg_match('/(\d+)/', $lines[$i + 2], $match)) {
                    $guests = (int) $match[1];
                }
                break;
            }
        }

        // Extract check-in and check-out dates
        $checkIn = null;
        $checkOut = null;

        // Normalize newlines
        $lines = preg_split('/\r\n|\r|\n/', $body);

        // Extract Check-in
        foreach ($lines as $i => $line) {
            if (stripos($line, 'Check-in') !== false && isset($lines[$i + 2])) {
                if (preg_match('/\b(\d{1,2})\s+([A-Za-z]{3,9})\b/', $lines[$i + 2], $match)) {
                    $checkIn = $match[1] . ' ' . $match[2];
                }
            }
            if ($checkIn) break;
        }

        // Extract Checkout
        foreach ($lines as $i => $line) {
            if (stripos($line, 'Checkout') !== false && isset($lines[$i + 2])) {
                if (preg_match('/\b(\d{1,2})\s+([A-Za-z]{3,9})\b/', $lines[$i + 2], $match)) {
                    $checkOut = $match[1] . ' ' . $match[2];
                }
            }
            if ($checkOut) break;
        }

        preg_match('/YOU EARN\s+\$?([0-9.,]+)/i', $body, $payoutMatch);
        $payout = isset($payoutMatch[1]) ? (float) str_replace(',', '', $payoutMatch[1]) : null;

        preg_match('/Cleaning fee\s+\$?([0-9.,]+)/i', $body, $cleaningMatch);
        $cleaningFee = isset($cleaningMatch[1]) ? (float) str_replace(',', '', $cleaningMatch[1]) : null;

        $roomFee = null;

        foreach ($lines as $index => $line) {
            // OLD format: $810.00 x 8 nights
            if (stripos($line, 'GUEST PAID') !== false && isset($lines[$index + 2])) {
                if (preg_match('/\$([0-9.,]+)/', $lines[$index + 2], $match)) {
                    $roomFee = (float) str_replace(',', '', $match[1]);
                    break;
                }
            }

            // NEW format: Accommodation → 2 lines below → $2,000.00
            if (stripos($line, 'Accommodation') !== false && isset($lines[$index + 2])) {
                if (preg_match('/\$([0-9.,]+)/', $lines[$index + 2], $match)) {
                    $roomFee = (float) str_replace(',', '', $match[1]);
                    break;
                }
            }
        }

        $record = new AirbnbEmailImport();
        $receivedDate = isset($data['receivedDate']) ? new \DateTime($data['receivedDate']) : new \DateTime();
        $record->setBookingDate($receivedDate);
        $record->setSource("Airbnb");
        $record->setConfirmationCode($reservationCode);
        $record->setGuestName($guestName);
        $record->setListingName($listingName);
        $record->setGuests($guests ?? 0);
        $record->setCheckIn($checkIn ?? 'N/A');
        $record->setCheckOut($checkOut ?? 'N/A');
        $record->setPayout($payout);
        $record->setCleaningFee($cleaningFee);
        $record->setRoomFee($roomFee);

        $em->persist($record);
        $em->flush(); // Save to DB so it's available to parse


        $em->flush();

        return new JsonResponse(['success' => true, 'code' => $reservationCode]);
    }
}