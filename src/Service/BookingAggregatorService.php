<?php

namespace App\Service;

use App\Entity\ParsedAirbnbEmail;
use App\Entity\AllBookings;
use App\Entity\Unit;
use App\Entity\PrivateReservation;
use App\Entity\HKCleanings;
use App\Repository\BookingConfigRepository;
use App\Service\MonthSliceRefresher;
use Psr\Log\LoggerInterface;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Common\Collections\ArrayCollection;

class BookingAggregatorService
{
    private EntityManagerInterface $entityManager;
    private BookingConfigRepository $bookingConfigRepository;
    private BookingCalculatorService $bookingCalculatorService;
    private ReservationConfigService $reservationConfigService;
    private MonthSliceRefresher $refresher;
    private LoggerInterface $logger;

    /**
     * Strip any HTML/markup and decode entities to keep DB fields plain text.
     */
    private function sanitizePlain(?string $s): string
    {
        if ($s === null) { return ''; }
        $decoded = html_entity_decode($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        return trim(strip_tags($decoded));
    }

    /**
     * Normalize datetimes to hotel semantics to avoid edge-overlaps and keep cleaning windows consistent.
     * Policy: check-in at 15:00, check-out at 11:00 (local server time).
     */
    private function applyHotelSemantics(AllBookings $booking): void
    {
        $ci = $booking->getCheckIn();
        if ($ci instanceof \DateTimeInterface) {
            $ciNorm = (new \DateTime($ci->format('Y-m-d 15:00:00')));
            $booking->setCheckIn($ciNorm);
        }
        $co = $booking->getCheckOut();
        if ($co instanceof \DateTimeInterface) {
            $coNorm = (new \DateTime($co->format('Y-m-d 11:00:00')));
            $booking->setCheckOut($coNorm);
        }
    }

    private function validateOverlap(AllBookings $booking): void
    {
        // --- Direct PHP-FPM logging (bypasses Monolog) ---
        $cand = sprintf(
            '[OverlapCheck] Candidate unitId=%s checkIn=%s checkOut=%s id=%s status=%s',
            (string)$booking->getUnitId(),
            $booking->getCheckIn()?->format('Y-m-d H:i:s'),
            $booking->getCheckOut()?->format('Y-m-d H:i:s'),
            (string)$booking->getId(),
            (string)$booking->getStatus()
        );
        error_log($cand);

        $qb = $this->entityManager->getRepository(AllBookings::class)
            ->createQueryBuilder('b')
            ->where('b.unitId = :unitId')
            // Overlap check with half-open interval semantics [checkIn, checkOut)
            ->andWhere('b.checkIn < :checkOut')
            ->andWhere('b.checkOut > :checkIn')
            // Explicitly allow back-to-back reservations where edges touch
            ->andWhere('NOT (b.checkIn = :checkOut OR b.checkOut = :checkIn)')
            ->andWhere("COALESCE(b.status, '') NOT LIKE :cancelPrefix")
            ->setParameter('unitId', $booking->getUnitId())
            ->setParameter('checkIn', $booking->getCheckIn())
            ->setParameter('checkOut', $booking->getCheckOut())
            ->setParameter('cancelPrefix', 'Cancel%');

        if (method_exists($booking, 'getId') && $booking->getId()) {
            $qb->andWhere('b.id != :selfId')->setParameter('selfId', $booking->getId());
        }

        $overlaps = $qb->getQuery()->getResult();

        error_log(sprintf('[OverlapCheck] overlaps_count=%d', is_countable($overlaps) ? count($overlaps) : -1));

        if (!empty($overlaps)) {
            foreach ($overlaps as $o) {
                error_log(sprintf(
                    '[OverlapCheck] Overlap id=%s unitId=%s status=%s checkIn=%s checkOut=%s code=%s',
                    (string)$o->getId(),
                    (string)$o->getUnitId(),
                    (string)(method_exists($o, 'getStatus') ? $o->getStatus() : ''),
                    $o->getCheckIn()?->format('Y-m-d H:i:s'),
                    $o->getCheckOut()?->format('Y-m-d H:i:s'),
                    (string)(method_exists($o, 'getConfirmationCode') ? $o->getConfirmationCode() : '')
                ));
            }
            error_log('[OverlapCheck] Throwing overlap exception');
            throw new \Exception("Another booking already exists for this date range.");
        }
    }

    /**
     * Create (idempotently) an HKCleanings row for Owner private reservations.
     * Unique key in HKCleanings: (unit_id, checkout_date, cleaning_type)
     */
    private function ensureOwnerHKCleaning(AllBookings $booking, Unit $unit): void
    {
        try {
            $co = $booking->getCheckOut();
            if (!$co instanceof \DateTimeInterface) {
                return;
            }

            // Use date-only for checkout_date
            $checkoutDate = new \DateTimeImmutable($co->format('Y-m-d'));

            $repo = $this->entityManager->getRepository(HKCleanings::class);
            $existing = null;
            try {
                $existing = $repo->findOneBy([
                    'unit' => $unit,
                    'checkoutDate' => $checkoutDate,
                    'cleaningType' => HKCleanings::TYPE_OWNER,
                ]);
            } catch (\Throwable $e) {
                $existing = null;
            }

            if ($existing instanceof HKCleanings) {
                // Keep it linked to the latest booking if missing
                if (method_exists($existing, 'getBookingId') && method_exists($existing, 'setBookingId')) {
                    if ($existing->getBookingId() === null && $booking->getId()) {
                        $existing->setBookingId((int) $booking->getId());
                    }
                }
                if (method_exists($existing, 'getReservationCode') && method_exists($existing, 'setReservationCode')) {
                    if (!$existing->getReservationCode() && $booking->getReservationCode()) {
                        $existing->setReservationCode((string) $booking->getReservationCode());
                    }
                }
                // Do not overwrite assignments/status/cost if it already exists.
                return;
            }

            $cleaning = new HKCleanings();
            $cleaning->setUnit($unit);
            $cleaning->setCity((string) ($unit->getCity() ?? ''));

            if (method_exists($cleaning, 'setBookingId') && $booking->getId()) {
                $cleaning->setBookingId((int) $booking->getId());
            }
            if (method_exists($cleaning, 'setReservationCode')) {
                $cleaning->setReservationCode((string) ($booking->getReservationCode() ?? $booking->getConfirmationCode() ?? ''));
            }
            $cleaning->setCheckoutDate($checkoutDate);
            $cleaning->setCleaningType(HKCleanings::TYPE_OWNER);
            $cleaning->setStatus(HKCleanings::STATUS_PENDING);

            // O2 collected fee for owner stays: use unit cleaning_fee (booking cleaning fee is 0)
            if (method_exists($cleaning, 'setO2CollectedFee')) {
                $cleaning->setO2CollectedFee((float) ($unit->getCleaningFee() ?? 0));
            }

            // cleaning_cost: use hk_unit_cleaning_rate.amount if present, else 0
            $rate = 0.0;
            try {
                $conn = $this->entityManager->getConnection();
                $val = $conn->fetchOne(
                    'SELECT amount FROM hk_unit_cleaning_rate WHERE unit_id = :uid LIMIT 1',
                    ['uid' => (int) $unit->getId()]
                );
                if ($val !== false && $val !== null && $val !== '') {
                    $rate = (float) $val;
                }
            } catch (\Throwable $e) {
                $rate = 0.0;
            }
            if (method_exists($cleaning, 'setCleaningCost')) {
                $cleaning->setCleaningCost($rate);
            }

            $this->entityManager->persist($cleaning);
            $this->entityManager->flush();
        } catch (\Throwable $e) {
            // Never block booking creation due to cleaning row side-effect
            $this->logger->error('[Aggregator] ensureOwnerHKCleaning failed: ' . $e->getMessage());
        }
    }

    public function __construct(
        EntityManagerInterface $entityManager,
        BookingConfigRepository $bookingConfigRepository,
        BookingCalculatorService $bookingCalculatorService,
        ReservationConfigService $reservationConfigService,
        MonthSliceRefresher $refresher,
        LoggerInterface $logger
    ) {
        $this->entityManager = $entityManager;
        $this->bookingConfigRepository = $bookingConfigRepository;
        $this->bookingCalculatorService = $bookingCalculatorService;
        $this->reservationConfigService = $reservationConfigService;
        $this->refresher = $refresher;
        $this->logger = $logger;
    }

    public function createAllBookingFromPrivateReservation(PrivateReservation $reservation): AllBookings
    {
        $unit = $this->entityManager
            ->getRepository(Unit::class)
            ->find($reservation->getUnitId());
        if (!$unit) {
            throw new \Exception("Unit not found for unitId: " . $reservation->getUnitId());
        }

        $booking = new AllBookings();
        $booking->setUnitId($unit->getId());
        $booking->setUnitName($unit->getUnitName());
        $booking->setBookingDate($reservation->getBookingDate() ?? new \DateTime());

        // Special logic for Owner guest type
        if (strtolower($reservation->getGuestType()) === 'owner') {
            $booking
                ->setGuestName('Reserva Propietario')
                ->setCity($unit->getCity())
                ->setGuests($reservation->getNrOfGuests())
                ->setCheckIn($reservation->getCheckIn())
                ->setCheckOut($reservation->getCheckOut())
                ->setConfirmationCode('O2M' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 7)))
                ->setReservationCode($booking->getConfirmationCode())
                ->setSource('Private')
                ->setPaymentMethod('no_pay')
                ->setPayout(0);
            $ownerLabel = 'Reserva Propietario';
            $formNotesRaw = method_exists($reservation, 'getNotes') ? (string)($reservation->getNotes() ?? '') : '';
            $formNotes = $this->sanitizePlain($formNotesRaw);
            $booking->setNotes($formNotes ? ($ownerLabel . ' — ' . $formNotes) : $ownerLabel);
            $booking->setIsPaid(true);

            // Recalculate using booking calculator service for owner bookings
            $config = $this->reservationConfigService->getConfigForType('private_cash');
            $this->bookingCalculatorService->recalculate($booking, $unit, $config);
        } else {
            $booking
                ->setGuestName($this->sanitizePlain($reservation->getGuestName()))
                ->setCity($unit->getCity())
                ->setGuests($reservation->getNrOfGuests())
                ->setCheckIn($reservation->getCheckIn())
                ->setCheckOut($reservation->getCheckOut())
                ->setConfirmationCode('O2M' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 7)))
                ->setReservationCode($booking->getConfirmationCode())
                ->setSource('Private');

            if ($reservation->getCheckIn()->diff($reservation->getCheckOut())->days > 15) {
                $booking->setCheckInNotes('Check meter');
                $booking->setCheckOutNotes('Check meter');
            }

            // Set tax based on payment method and apply config
            $paymentMethod = $reservation->getPaymentMethod() ?? 'cash';
            $booking->setPaymentMethod($paymentMethod);

            $configType = strtolower($paymentMethod) === 'card' ? 'private_card' : 'private_cash';
            $config = $this->reservationConfigService->getConfigForType($configType);

            // Override: for CLIENT units with Card method, use privcard_0825 (id=1)
            if (strcasecmp($unit->getPaymentType() ?? '', 'CLIENT') === 0 && strcasecmp($paymentMethod, 'card') === 0) {
                $configOverride = null;
                try {
                    if (method_exists($this->bookingConfigRepository, 'findOneBy')) {
                        $configOverride = $this->bookingConfigRepository->findOneBy(['code' => 'privcard_0825']);
                    }
                } catch (\Throwable $e) { /* ignore and fall back */ }
                if ($configOverride) {
                    $config = $configOverride;
                }
                // Ensure defaults even if config entity lacks them
                if (method_exists($config, 'getDefaultTaxPercentage') && $config->getDefaultTaxPercentage() === null && method_exists($config, 'setDefaultTaxPercentage')) {
                    $config->setDefaultTaxPercentage(10);
                }
                if (method_exists($config, 'getDefaultCommissionPercentage') && $config->getDefaultCommissionPercentage() === null && method_exists($config, 'setDefaultCommissionPercentage')) {
                    $config->setDefaultCommissionPercentage(20);
                }
                // Also pre-set on booking if not set yet (belt & suspenders)
                if ($booking->getTaxPercent() === null) {
                    $booking->setTaxPercent(10);
                }
                if ($booking->getCommissionPercent() === null) {
                    $booking->setCommissionPercent(20);
                }
            }

            // Ensure cleaning fee is set from unit before recalculation
            if ($booking->getCleaningFee() === null && $unit) {
                $booking->setCleaningFee($unit->getCleaningFee());
            }

            // Ensure commission percent is set from config before recalculation
            if ($booking->getCommissionPercent() === null && $config && method_exists($config, 'getDefaultCommissionPercentage')) {
                $booking->setCommissionPercent($config->getDefaultCommissionPercentage());
            }

            // Map monetary inputs from reservation before recalculation
            if (method_exists($reservation, 'getPayout') && $reservation->getPayout() !== null) {
                $booking->setPayout((float) $reservation->getPayout());
            }
            if (method_exists($reservation, 'getRoomFee') && $reservation->getRoomFee() !== null) {
                $booking->setRoomFee((float) $reservation->getRoomFee());
            }

            $this->bookingCalculatorService->recalculate($booking, $unit, $config);
        }

        // Normalize times to hotel semantics before calculations & validations
        $this->applyHotelSemantics($booking);

        $booking->setGuestType($reservation->getGuestType() ?? 'new_guest');

        // Ensure days is calculated
        if ($booking->getCheckIn() && $booking->getCheckOut()) {
            $booking->setDays($booking->getCheckOut()->diff($booking->getCheckIn())->days);
        }

        // Ensure status is set based on check-in and check-out dates
        $now = new \DateTime();
        if ($booking->getCheckOut() < $now) {
            $booking->setStatus('Past');
        } elseif ($booking->getCheckIn() > $now) {
            $booking->setStatus('Upcoming');
        } else {
            $booking->setStatus('Current');
        }

        // Ensure any other required numeric fields are not null
        if ($booking->getTaxPercent() === null) {
            $booking->setTaxPercent(0);
        }
        if ($booking->getTaxAmount() === null) {
            $booking->setTaxAmount(0);
        }
        if ($booking->getNetPayout() === null) {
            $booking->setNetPayout(0);
        }
        if ($booking->getCommissionPercent() === null) {
            $booking->setCommissionPercent(0);
        }
        if ($booking->getCommissionValue() === null) {
            $booking->setCommissionValue(0);
        }
        if ($booking->getClientIncome() === null) {
            $booking->setClientIncome(0);
        }
        if ($booking->getO2Total() === null) {
            $booking->setO2Total(0);
        }
        if ($booking->getRoomFee() === null) {
            $booking->setRoomFee(0);
        }

        // Final normalization to ensure commission_base and derived fields are consistent
        $this->logger->debug('[Aggregator] About to call recalculateAllBookingFields', ['code' => $booking->getConfirmationCode()]);
        $this->recalculateAllBookingFields($booking);
        $this->logger->debug('[Aggregator] Finished recalculateAllBookingFields', ['code' => $booking->getConfirmationCode()]);

        $this->validateOverlap($booking);

        // Stamp last updated (manual create via PrivateReservation form)
        if (method_exists($booking, 'setLastUpdatedAt')) {
            $booking->setLastUpdatedAt(new \DateTimeImmutable());
        }
        if (method_exists($booking, 'setLastUpdatedVia')) {
            $booking->setLastUpdatedVia('manual');
        }
        $this->entityManager->persist($booking);
        $this->entityManager->flush();
        $this->logger->debug('[Aggregator] flushed booking persisted', ['id' => (int)$booking->getId()]);

        // Side-effect: for Owner private reservations, create a pending HK cleaning row
        if (is_string($reservation->getGuestType()) && strtolower($reservation->getGuestType()) === 'owner') {
            $this->ensureOwnerHKCleaning($booking, $unit);
        }

        return $booking;
    }

    public function createAllBookingFromManualAirbnb(array $data): AllBookings
    {
        $unit = $this->entityManager
            ->getRepository(Unit::class)
            ->find($data['unit_id']);
        if (!$unit) {
            throw new \Exception("Unit not found for unitId: " . $data['unit_id']);
        }

        $booking = new AllBookings();
        $booking->setBookingDate($data['booking_date'] ?? new \DateTime());
        $booking->setUnitId($unit->getId());
        $booking->setUnitName($unit->getUnitName());

        $booking
            ->setGuestName($this->sanitizePlain($data['guest_name']))
            ->setCity($unit->getCity())
            ->setGuests($data['guests'] ?? 0)
            ->setCheckIn($data['check_in'])
            ->setCheckOut($data['check_out'])
            ->setConfirmationCode($data['confirmation_code'])
            ->setReservationCode($data['confirmation_code'])
            ->setSource('Airbnb');
        $booking->setIsPaid(false);

        // Normalize times to hotel semantics before calculations & validations
        $this->applyHotelSemantics($booking);

        if ($data['check_in']->diff($data['check_out'])->days > 15) {
            $booking->setCheckInNotes('Check meter');
            $booking->setCheckOutNotes('Check meter');
        }

        // Ensure cleaning fee is set from unit before recalculation
        if ($booking->getCleaningFee() === null && $unit) {
            $booking->setCleaningFee($unit->getCleaningFee());
        }

        // Apply config based on unit's payment_type
        $paymentType = strtoupper($unit->getPaymentType());
        $configType = $paymentType === 'OWNERS2' ? 'o2' : 'client';
        $config = $this->reservationConfigService->getConfigForType($configType);

        // Use booking_config defaults when CLIENT + Airbnb (future configs adapt automatically)
        if (strcasecmp($unit->getPaymentType() ?? '', 'CLIENT') === 0
            && strcasecmp($booking->getSource() ?? '', 'Airbnb') === 0
            && $config) {
            if (method_exists($config, 'getDefaultCommissionPercentage') && $config->getDefaultCommissionPercentage() !== null) {
                $booking->setCommissionPercent((float) $config->getDefaultCommissionPercentage());
            }
            if (method_exists($config, 'getDefaultTaxPercentage') && $config->getDefaultTaxPercentage() !== null) {
                $booking->setTaxPercent((float) $config->getDefaultTaxPercentage());
            }
        }

        $this->bookingCalculatorService->recalculate($booking, $unit, $config);

        $booking->setPaymentMethod('platform');
        $booking->setGuestType('Airbnb_guest');

        // Ensure days is calculated
        if ($booking->getCheckIn() && $booking->getCheckOut()) {
            $booking->setDays($booking->getCheckOut()->diff($booking->getCheckIn())->days);
        }

        // Ensure status is set based on check-in and check-out dates
        $now = new \DateTime();
        if ($booking->getCheckOut() < $now) {
            $booking->setStatus('Past');
        } elseif ($booking->getCheckIn() > $now) {
            $booking->setStatus('Upcoming');
        } else {
            $booking->setStatus('Current');
        }

        // Ensure any other required numeric fields are not null
        if ($booking->getTaxPercent() === null) {
            $booking->setTaxPercent(0);
        }
        if ($booking->getTaxAmount() === null) {
            $booking->setTaxAmount(0);
        }
        if ($booking->getNetPayout() === null) {
            $booking->setNetPayout(0);
        }
        if ($booking->getCommissionPercent() === null) {
            $booking->setCommissionPercent(0);
        }
        if ($booking->getCommissionValue() === null) {
            $booking->setCommissionValue(0);
        }
        if ($booking->getClientIncome() === null) {
            $booking->setClientIncome(0);
        }
        if ($booking->getO2Total() === null) {
            $booking->setO2Total(0);
        }
        if ($booking->getRoomFee() === null) {
            $booking->setRoomFee(0);
        }

        // Final normalization to ensure commission_base and derived fields are consistent
        $this->logger->debug('[Aggregator] About to call recalculateAllBookingFields', ['code' => $booking->getConfirmationCode()]);
        $this->recalculateAllBookingFields($booking);
        $this->logger->debug('[Aggregator] Finished recalculateAllBookingFields', ['code' => $booking->getConfirmationCode()]);

        $this->validateOverlap($booking);

        // Stamp last updated (manual create via Airbnb form)
        if (method_exists($booking, 'setLastUpdatedAt')) {
            $booking->setLastUpdatedAt(new \DateTimeImmutable());
        }
        if (method_exists($booking, 'setLastUpdatedVia')) {
            $booking->setLastUpdatedVia('manual');
        }
        $this->entityManager->persist($booking);
        $this->entityManager->flush();
        $this->logger->debug('[Aggregator] flushed booking persisted', ['id' => (int)$booking->getId()]);

        return $booking;
    }
    /**
     * Recalculate all relevant fields for an edited booking.
     */
    public function recalculateAllBookingFields(AllBookings $booking): void
    {
        $unit = $this->entityManager->getRepository(Unit::class)->find($booking->getUnitId());
        if (!$unit) {
            throw new \Exception("Unit not found for unitId: " . $booking->getUnitId());
        }

        // Enforce hotel semantics on edits as well
        $this->applyHotelSemantics($booking);

        // Default paid flag when not explicitly set
        if (method_exists($booking, 'getIsPaid') && method_exists($booking, 'setIsPaid')) {
            $currentPaid = $booking->getIsPaid();
            if ($currentPaid === null) {
                $src = $booking->getSource();
                $guestType = $booking->getGuestType();
                $isOwner = is_string($guestType) && strtolower($guestType) === 'owner';

                if ($isOwner) {
                    // Owner stays are considered paid by definition
                    $booking->setIsPaid(true);
                } elseif ($src === 'Airbnb') {
                    // Airbnb bookings default to unpaid; will flip to paid when recon matches
                    $booking->setIsPaid(false);
                }
            }
        }

        // Classify special reservation guest types
        $guestType = $booking->getGuestType();
        $guestTypeLower = is_string($guestType) ? strtolower($guestType) : '';
        $isBlock = $guestTypeLower === 'block';
        $isHold  = $guestTypeLower === 'hold';

        // Get appropriate config based on unit's payment type and booking source
        $paymentType = strtoupper($unit->getPaymentType());
        if ($booking->getSource() === 'Airbnb') {
            $configType = $paymentType === 'OWNERS2' ? 'o2' : 'client';
        } elseif ($booking->getSource() === 'Private') {
            $method = strtolower($booking->getPaymentMethod() ?? 'cash');
            $configType = $method === 'card' ? 'private_card' : 'private_cash';
        } else {
            // Fallback: treat other sources (e.g. Block/Hold/Soft) like standard Airbnb configs
            // so ReservationConfigService does not receive an unknown "default" type.
            $configType = $paymentType === 'OWNERS2' ? 'o2' : 'client';
        }

        $config = $this->reservationConfigService->getConfigForType($configType);

        // Override: for CLIENT units with Card method, use privcard_0825 (id=1)
        if ($booking->getSource() === 'Private') {
            $method = strtolower($booking->getPaymentMethod() ?? 'cash');
            if (strcasecmp($unit->getPaymentType() ?? '', 'CLIENT') === 0 && $method === 'card') {
                $configOverride = null;
                try {
                    if (method_exists($this->bookingConfigRepository, 'findOneBy')) {
                        $configOverride = $this->bookingConfigRepository->findOneBy(['code' => 'privcard_0825']);
                    }
                } catch (\Throwable $e) { /* ignore */ }
                if ($configOverride) {
                    $config = $configOverride;
                }
                // Ensure defaults present
                if (method_exists($config, 'getDefaultTaxPercentage') && $config->getDefaultTaxPercentage() === null && method_exists($config, 'setDefaultTaxPercentage')) {
                    $config->setDefaultTaxPercentage(10);
                }
                if (method_exists($config, 'getDefaultCommissionPercentage') && $config->getDefaultCommissionPercentage() === null && method_exists($config, 'setDefaultCommissionPercentage')) {
                    $config->setDefaultCommissionPercentage(20);
                }
                // Pre-apply to booking if still unset
                if ($booking->getTaxPercent() === null) {
                    $booking->setTaxPercent(10);
                }
                if ($booking->getCommissionPercent() === null) {
                    $booking->setCommissionPercent(20);
                }
            }
        }

        // Use booking_config defaults when CLIENT + Airbnb (adapts to future configs)
        if ($booking->getSource() === 'Airbnb'
            && strcasecmp($unit->getPaymentType() ?? '', 'CLIENT') === 0
            && $config) {
            if (method_exists($config, 'getDefaultCommissionPercentage') && $config->getDefaultCommissionPercentage() !== null) {
                $booking->setCommissionPercent((float) $config->getDefaultCommissionPercentage());
            }
            if (method_exists($config, 'getDefaultTaxPercentage') && $config->getDefaultTaxPercentage() !== null) {
                $booking->setTaxPercent((float) $config->getDefaultTaxPercentage());
            }
        }

        // Preserve tax if booking is being edited as Cancelled (skip for Blocks)
        $originalStatus = $booking->getStatus();
        $preserveTaxPercent = null;
        $preserveTaxAmount = null;
        if (!$isBlock && is_string($originalStatus) && strcasecmp($originalStatus, 'Cancelled') === 0) {
            $preserveTaxPercent = $booking->getTaxPercent();
            $preserveTaxAmount  = $booking->getTaxAmount();
        }

        // If this booking is marked as Cancelled via the edit form,
        // force-clean monetary inputs as requested:
        $status = $booking->getStatus();
        if (is_string($status) && strcasecmp($status, 'Cancelled') === 0) {
            // Always zero fees when cancelled
            $booking->setCleaningFee(0);
            $booking->setRoomFee(0);
            // Default payout to 0 if not explicitly set (allow residual values)
            if ($booking->getPayout() === null) {
                $booking->setPayout(0);
            }
        }

        // If cleaning fee not set, get it from unit (skip for Owner stays)
        $isOwnerStay = is_string($booking->getGuestType()) && strtolower($booking->getGuestType()) === 'owner';
        if (!$isOwnerStay && $booking->getCleaningFee() === null && $unit->getCleaningFee() !== null) {
            $booking->setCleaningFee($unit->getCleaningFee());
        }

        // Recalculate using calculator
        $this->bookingCalculatorService->recalculate($booking, $unit, $config);

        // For Blocks, force tax to zero regardless of config (Holds may have tax based on payment method)
        if ($isBlock) {
            $booking->setTaxPercent(0);
            $booking->setTaxAmount(0);
        }

        // Restore preserved tax for Cancelled bookings (keep pre-cancel tax % and amount)
        if (is_string($originalStatus) && strcasecmp($originalStatus, 'Cancelled') === 0) {
            if ($preserveTaxPercent !== null) {
                $booking->setTaxPercent($preserveTaxPercent);
            }
            if ($preserveTaxAmount !== null) {
                $booking->setTaxAmount($preserveTaxAmount);
            }
        }

        // Update days
        if ($booking->getCheckIn() && $booking->getCheckOut()) {
            $booking->setDays($booking->getCheckOut()->diff($booking->getCheckIn())->days);
        }

        // Update status:
        //  - Blocks / Holds: only "Active" or "Cancelled"
        //  - Other bookings: Past / Upcoming / Current, while respecting manual Cancelled
        if ($isBlock || $isHold) {
            if (is_string($originalStatus) && strcasecmp($originalStatus, 'Cancelled') === 0) {
                $booking->setStatus('Cancelled');
            } else {
                // For non-cancelled Blocks/Holds, always use "Active"
                $booking->setStatus('Active');
            }
        } else {
            // Normal bookings: respect manual Cancelled, otherwise derive from dates
            if (is_string($originalStatus) && strcasecmp($originalStatus, 'Cancelled') === 0) {
                $booking->setStatus('Cancelled');
            } else {
                $now = new \DateTime();
                if ($booking->getCheckOut() < $now) {
                    $booking->setStatus('Past');
                } elseif ($booking->getCheckIn() > $now) {
                    $booking->setStatus('Upcoming');
                } else {
                    $booking->setStatus('Current');
                }
            }
        }

        // === Commission base & derived fields normalization ===
        // If commission_base is still null, fall back to net_payout as base (entity lifecycle will also set it on persist).
        $base = $booking->getCommissionBase();
        if ($base === null) {
            $base = (float) ($booking->getNetPayout() ?? 0);
            $booking->setCommissionBase($base);
        }

        // Ensure commission percent is numeric
        $percent = (float) ($booking->getCommissionPercent() ?? 0);
        $commissionValue = round(($percent / 100.0) * (float) $base, 2);
        $booking->setCommissionValue($commissionValue);

        // client_income = commission_base - commission_value
        $booking->setClientIncome(round((float) $base - $commissionValue, 2));

        // o2_total = commission_value + cleaning_fee
        $cleaning = (float) ($booking->getCleaningFee() ?? 0);
        $booking->setO2Total(round($commissionValue + $cleaning, 2));
    }
}