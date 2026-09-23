<?php

namespace App\Service;

use App\Entity\AirbnbEmailImport;
use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use App\Service\BookingAggregatorService;
use App\Repository\BookingConfigRepository;
use App\Service\MonthSliceRefresher;

class BookingProcessingService
{
    private EntityManagerInterface $em;
    private BookingAggregatorService $aggregator;
    private MonthSliceRefresher $refresher;

    public function __construct(EntityManagerInterface $em, BookingAggregatorService $aggregator, MonthSliceRefresher $refresher)
    {
        $this->em = $em;
        $this->aggregator = $aggregator;
        $this->refresher = $refresher;
    }

    public function processAirbnbEmails(): ?\App\Entity\AllBookings
    {
        $repository = $this->em->getRepository(AirbnbEmailImport::class);
        $unitRepo = $this->em->getRepository(Unit::class);
        $bookingConfigRepo = $this->em->getRepository(\App\Entity\BookingConfig::class);
        $o2Config = $bookingConfigRepo->findOneBy(['configCode' => 'o2_1220']);

        $emails = $repository->findAll();

        foreach ($emails as $email) {
            // Preserve the existing duplicate guard except for a strict iCalendar placeholder.
            $existing = $this->em->getRepository(\App\Entity\AllBookings::class)->findOneBy(['confirmationCode' => $email->getConfirmationCode()]);
            if ($existing) {
                if ($this->isIcalPlaceholder($existing)) {
                    $this->hydrateIcalPlaceholder($existing, $email);
                }
                continue;
            }

            $unitName = $email->getListingName();
            $unit = $unitRepo->findOneBy(['listingName' => $unitName]);

            // Try to guess year from booking date and check-in text
            $bookingDate = $email->getBookingDate();
            $checkInText = $email->getCheckIn();
            $checkOutText = $email->getCheckOut();

            $checkIn = $this->guessDateFromText($bookingDate, $checkInText);
            $checkOut = $this->guessDateFromText($bookingDate, $checkOutText);

            $booking = new \App\Entity\AllBookings();
            $booking->setBookingDate($bookingDate);
            $booking->setSource('Airbnb');
            $booking->setPaymentMethod('platform');
            $booking->setGuestType('Airbnb_guest');
            $booking->setConfirmationCode($email->getConfirmationCode());
            $booking->setGuestName($email->getGuestName());
            $booking->setGuests($email->getGuests());
            $booking->setCheckIn($checkIn);
            $booking->setCheckOut($checkOut);
            // Calculate number of nights (checkOut is departure day, exclusive)
            if ($checkIn && $checkOut) {
                $days = $checkIn->diff($checkOut)->days;
                // Safety: never allow negative/zero nights for valid ranges
                if ($days <= 0) {
                    continue;
                }
                $booking->setDays($days);
            } else {
                // Skip entry if we can't calculate days
                continue;
            }
            // Determine booking status
            $now = new \DateTimeImmutable();
            if ($now < $checkIn) {
                $booking->setStatus('upcoming');
            } elseif ($now >= $checkIn && $now <= $checkOut) {
                $booking->setStatus('ongoing');
            } else {
                $booking->setStatus('past');
            }
            $booking->setPayout($email->getPayout());
            $booking->setCleaningFee($email->getCleaningFee());
            $booking->setRoomFee($email->getRoomFee());

            if ($unit) {
                $email->setUnitId($unit->getId());
                $booking->setUnitId($unit->getId());
                $booking->setUnitName($unit->getUnitName()); // Use friendly name from unit table
                $booking->setCity($unit->getCity());
                $paymentType = $unit->getPaymentType() ?? 'OWNERS2';
                $booking->setPaymentType($paymentType);

                if ($paymentType === 'OWNERS2') {
                    $taxPercent = 12;
                    $commissionPercent = 20;
                } elseif ($paymentType === 'CLIENT') {
                    $taxPercent = 0;
                    $commissionPercent = 20;
                } else {
                    $taxPercent = null;
                    $commissionPercent = null;
                }

                $booking->setTaxPercent($taxPercent);

                $taxAmount = ($taxPercent / 100) * $booking->getPayout();
                $booking->setTaxAmount($taxAmount);

                $netPayout = $booking->getPayout() - $taxAmount;
                $booking->setNetPayout($netPayout);

                if ($paymentType === 'OWNERS2') {
                    $commissionValue = ($booking->getNetPayout() - $booking->getCleaningFee()) * ($commissionPercent / 100);
                } elseif ($paymentType === 'CLIENT') {
                    $commissionValue = ($booking->getRoomFee() * $booking->getDays()) * ($commissionPercent / 100);
                } else {
                    $commissionValue = null;
                }

                $booking->setCommissionPercent($commissionPercent);
                $booking->setCommissionValue($commissionValue);

                if ($commissionValue !== null) {
                    $clientIncome = $booking->getNetPayout() - $booking->getCleaningFee() - $commissionValue;
                    $o2Total = $commissionValue + $booking->getCleaningFee();

                    $booking->setClientIncome($clientIncome);
                    $booking->setO2Total($o2Total);
                }
            }
            // Mark Airbnb imports as paid so downstream logic and slicer behave as expected
            if ($booking->getSource() === 'Airbnb') {
                $booking->setIsPaid(true);
            }
            // Normalize commission_base and derived amounts
            $this->aggregator->recalculateAllBookingFields($booking);
            // OWNER override: when the owner books their own unit
            if (strtoupper((string) $booking->getGuestType()) === 'OWNER') {
                if (method_exists($booking, 'setCommissionBase')) {
                    $booking->setCommissionBase(0.0);
                }
                $booking->setO2Total((float) ($booking->getCleaningFee() ?? 0));
                $booking->setTaxPercent(0);
                $booking->setCommissionPercent(0);
            }
            $this->em->persist($booking);
            // Flush now so the booking gets an ID we can use for slicing
            $this->em->flush();
            // Auto-create month slices now that we have a booking ID
            try {
                $in  = $booking->getCheckIn();
                $out = $booking->getCheckOut();
                if ($booking->getId() && $in instanceof \DateTimeInterface && $out instanceof \DateTimeInterface) {
                    @error_log('[BookingProcessingService] creating slices for bookingId='.(int)$booking->getId());
                    $this->refresher->refreshForBooking((int)$booking->getId(), $in, $out);
                    @error_log('[BookingProcessingService] slices created for bookingId='.(int)$booking->getId());
                } else {
                    @error_log('[BookingProcessingService] skipping slices (no id or dates)');
                }
            } catch (\Throwable $e) {
                @error_log('[BookingProcessingService] month-slice refresh failed for bookingId='.(int)$booking->getId().': '.$e->getMessage());
            }
        }

        $this->em->flush();

        return null;
    }

    private function hydrateIcalPlaceholder(\App\Entity\AllBookings $booking, AirbnbEmailImport $email): void
    {
        $bookingDate = $email->getBookingDate();
        $checkIn = $this->guessDateFromText($bookingDate, $email->getCheckIn());
        $checkOut = $this->guessDateFromText($bookingDate, $email->getCheckOut());
        if (!$checkIn || !$checkOut || $checkOut <= $checkIn) {
            return;
        }

        $days = $checkIn->diff($checkOut)->days;
        if ($days <= 0) {
            return;
        }

        // Hydrate the managed placeholder without replacing its ID, unit,
        // iCalendar association, reservation code, or reconciliation metadata.
        if ($booking->getUnitId() !== null) {
            $email->setUnitId($booking->getUnitId());
        }
        $booking->setBookingDate($bookingDate);
        $booking->setSource('Airbnb');
        $booking->setPaymentMethod('platform');
        $booking->setGuestType('Airbnb_guest');
        $booking->setConfirmationCode($email->getConfirmationCode());
        $booking->setGuestName($email->getGuestName());
        $booking->setGuests($email->getGuests());
        $booking->setCheckIn($checkIn);
        $booking->setCheckOut($checkOut);
        $booking->setDays($days);
        $booking->setPayout($email->getPayout());
        $booking->setCleaningFee($email->getCleaningFee());
        $booking->setRoomFee($email->getRoomFee());
        $booking->setIsPaid(true);

        $this->aggregator->recalculateAllBookingFields($booking);
        $booking->setLastUpdatedAt(new \DateTimeImmutable());
        $booking->setLastUpdatedVia('email');

        $this->em->persist($booking);
        // The existing AllBookingsHKCleaningsListener handles checkout-cleaning sync.
        $this->em->flush();

        try {
            $in = $booking->getCheckIn();
            $out = $booking->getCheckOut();
            if ($booking->getId() && $in instanceof \DateTimeInterface && $out instanceof \DateTimeInterface) {
                $this->refresher->refreshForBooking((int) $booking->getId(), $in, $out);
            }
        } catch (\Throwable $e) {
            @error_log('[BookingProcessingService] month-slice refresh failed for hydrated bookingId='.(int)$booking->getId().': '.$e->getMessage());
        }
    }

    private function isIcalPlaceholder(\App\Entity\AllBookings $booking): bool
    {
        return strcasecmp(trim((string) $booking->getSource()), 'Airbnb') === 0
            && $booking->getIcalEvent() !== null
            && strcasecmp(trim((string) $booking->getLastUpdatedVia()), 'ical-create') === 0
            && strcasecmp(trim((string) $booking->getGuestName()), 'Missing email') === 0
            && abs((float) ($booking->getPayout() ?? 0.0)) < 0.00001;
    }

    private function guessDateFromText(?\DateTimeInterface $baseDate, ?string $text): ?\DateTimeInterface
    {
        if (!$text || !$baseDate) return null;

        // Example input: "20 Jun"
        if (preg_match('/(\d{1,2})\s+([A-Za-z]{3})/', $text, $matches)) {
            $day = (int)$matches[1];
            $monthStr = $matches[2];
            $month = date_parse($monthStr)['month'];

            if (!$month) return null;

            $year = (int)$baseDate->format('Y');

            // If the month has already passed, assume next year
            if ($month < (int)$baseDate->format('n')) {
                $year += 1;
            }

            return \DateTime::createFromFormat('Y-n-j', "$year-$month-$day") ?: null;
        }

        return null;
    }
}
