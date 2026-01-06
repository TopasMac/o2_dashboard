<?php

namespace App\Entity;

use App\Repository\AllBookingsRepository;
use App\Entity\IcalEvent;
use Doctrine\ORM\Mapping as ORM;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use Symfony\Component\Serializer\Annotation\Groups;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Symfony\Component\Serializer\Annotation\MaxDepth;

#[ApiResource(
    operations: [
        new GetCollection(), // GET /api/all_bookings
        new Get(),           // GET /api/all_bookings/{id}
    ],
    normalizationContext: ['groups' => ['all_bookings:read']],
    paginationItemsPerPage: 30,
    paginationClientItemsPerPage: true,
    paginationMaximumItemsPerPage: 500,
    paginationClientEnabled: true
)]
#[ApiFilter(SearchFilter::class, properties: [
    'status' => 'exact',
    'guestType' => 'exact',
    'confirmationCode' => 'partial',
    'unitId' => 'exact',
    'unitName' => 'partial',
    'reservationCode' => 'partial',
])]
#[ApiFilter(OrderFilter::class, properties: ['checkIn'])]
#[ORM\Entity(repositoryClass: AllBookingsRepository::class)]
#[ORM\HasLifecycleCallbacks]
class AllBookings
{
    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: "confirmation_code", length: 20)]
    private ?string $confirmationCode = null;

    public function setConfirmationCode(?string $confirmationCode): self
    {
        $this->confirmationCode = $confirmationCode;
        return $this;
    }

    public function getConfirmationCode(): ?string
    {
        return $this->confirmationCode;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'reservation_code', type: 'string', length: 32, nullable: true)]
    private ?string $reservationCode = null;

    public function getReservationCode(): ?string
    {
        return $this->reservationCode;
    }

    public function setReservationCode(?string $reservationCode): self
    {
        $this->reservationCode = $reservationCode;
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'date_immutable')]
    private ?\DateTimeImmutable $bookingDate = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(length: 20)]
    private ?string $source = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(length: 100)]
    private ?string $guestName = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(length: 50, nullable: true)]
    private ?string $status = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'hold_expires_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $holdExpiresAt = null;

    public function getHoldExpiresAt(): ?\DateTimeImmutable
    {
        return $this->holdExpiresAt;
    }

    public function setHoldExpiresAt(?\DateTimeInterface $expiresAt): self
    {
        if ($expiresAt === null) {
            $this->holdExpiresAt = null;
        } elseif ($expiresAt instanceof \DateTimeImmutable) {
            $this->holdExpiresAt = $expiresAt;
        } else {
            $this->holdExpiresAt = \DateTimeImmutable::createFromMutable($expiresAt);
        }
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'hold_policy', type: 'string', length: 10, nullable: true)]
    private ?string $holdPolicy = null; // '24h' | '48h' | 'custom'

    public function getHoldPolicy(): ?string
    {
        return $this->holdPolicy;
    }

    public function setHoldPolicy(?string $holdPolicy): self
    {
        $this->holdPolicy = $holdPolicy;
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'original_code', type: 'string', length: 32, nullable: true)]
    private ?string $originalCode = null; // stores O2H... when later converted

    public function getOriginalCode(): ?string
    {
        return $this->originalCode;
    }

    public function setOriginalCode(?string $originalCode): self
    {
        $this->originalCode = $originalCode;
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'confirmed_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $confirmedAt = null;

    public function getConfirmedAt(): ?\DateTimeImmutable
    {
        return $this->confirmedAt;
    }

    public function setConfirmedAt(?\DateTimeInterface $confirmedAt): self
    {
        if ($confirmedAt === null) {
            $this->confirmedAt = null;
        } elseif ($confirmedAt instanceof \DateTimeImmutable) {
            $this->confirmedAt = $confirmedAt;
        } else {
            $this->confirmedAt = \DateTimeImmutable::createFromMutable($confirmedAt);
        }
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'date_sync_status', type: 'string', length: 20, nullable: true)]
    private ?string $dateSyncStatus = 'none';

    public function getDateSyncStatus(): ?string
    {
        return $this->dateSyncStatus;
    }

    public function setDateSyncStatus(?string $dateSyncStatus): self
    {
        $this->dateSyncStatus = $dateSyncStatus;
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'last_ical_sync_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastIcalSyncAt = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'last_updated_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastUpdatedAt = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'last_updated_via', type: 'string', length: 20, nullable: true)]
    private ?string $lastUpdatedVia = null;

    public function getLastIcalSyncAt(): ?\DateTimeImmutable
    {
        return $this->lastIcalSyncAt;
    }

    public function setLastIcalSyncAt(?\DateTimeInterface $lastIcalSyncAt): self
    {
        if ($lastIcalSyncAt === null) {
            $this->lastIcalSyncAt = null;
        } elseif ($lastIcalSyncAt instanceof \DateTimeImmutable) {
            $this->lastIcalSyncAt = $lastIcalSyncAt;
        } else {
            $this->lastIcalSyncAt = \DateTimeImmutable::createFromMutable($lastIcalSyncAt);
        }
        return $this;
    }

    public function getLastUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->lastUpdatedAt;
    }

    public function setLastUpdatedAt(?\DateTimeInterface $lastUpdatedAt): self
    {
        if ($lastUpdatedAt === null) {
            $this->lastUpdatedAt = null;
        } elseif ($lastUpdatedAt instanceof \DateTimeImmutable) {
            $this->lastUpdatedAt = $lastUpdatedAt;
        } else {
            $this->lastUpdatedAt = \DateTimeImmutable::createFromMutable($lastUpdatedAt);
        }
        return $this;
    }

    public function getLastUpdatedVia(): ?string
    {
        return $this->lastUpdatedVia;
    }

    public function setLastUpdatedVia(?string $lastUpdatedVia): self
    {
        $this->lastUpdatedVia = $lastUpdatedVia;
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'string', length: 255, name: "unit_name")]
    private ?string $unitName = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: "unit_id", type: "integer", nullable: true)]
    private ?int $unitId = null;

    public function getUnitId(): ?int
    {
        return $this->unitId;
    }

    public function setUnitId(?int $unitId): self
    {
        $this->unitId = $unitId;
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\ManyToOne(targetEntity: IcalEvent::class)]
    #[ORM\JoinColumn(name: 'ical_event_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?IcalEvent $icalEvent = null;

    public function getIcalEvent(): ?IcalEvent
    {
        return $this->icalEvent;
    }

    public function setIcalEvent(?IcalEvent $icalEvent): self
    {
        $this->icalEvent = $icalEvent;
        return $this;
    }

    /**
     * Get the unit name for display (use this for all display logic, do not resolve via unitId).
     */
    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    public function getUnitName(): ?string
    {
        return $this->unitName;
    }

    /**
     * Set the unit name for display.
     */
    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    public function setUnitName(?string $unitName): self
    {
        $this->unitName = $unitName;
        return $this;
    }


    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(length: 50)]
    private ?string $city = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'integer')]
    private ?int $guests = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'date_immutable')]
    private ?\DateTimeImmutable $checkIn = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'date_immutable')]
    private ?\DateTimeImmutable $checkOut = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'integer')]
    private ?int $days = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float')]
    private ?float $payout = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float')]
    private ?float $taxPercent = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float')]
    private ?float $taxAmount = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float')]
    private ?float $netPayout = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float', nullable: true)]
    private ?float $cleaningFee = null;


    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: "commission_percent", type: 'float')]
    private ?float $commissionPercent = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: "commission_value", type: 'float')]
    private ?float $commissionValue = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float')]
    private ?float $clientIncome = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float')]
    private ?float $o2Total = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: "commission_base", type: 'float', nullable: true)]
    private ?float $commissionBase = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'float', nullable: true)]
    private ?float $roomFee = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $checkInNotes = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $checkOutNotes = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $paymentMethod = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $guestType = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $paymentType = null;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $overlapWarning = false;

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    #[ORM\Column(name: 'is_paid', type: 'boolean', options: ['default' => false])]
    private bool $isPaid = false;

    #[Groups(['all_bookings:read'])]
    #[ORM\Column(name: 'ical_ack_signature', type: 'string', length: 128, nullable: true)]
    private ?string $icalAckSignature = null;

    #[Groups(['all_bookings:read'])]
    #[ORM\Column(name: 'ical_ack_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $icalAckAt = null;

    #[Groups(['all_bookings:read'])]
    #[ORM\Column(name: 'ical_ack_user_id', type: 'integer', nullable: true)]
    private ?int $icalAckUserId = null;

    #[ORM\OneToMany(mappedBy: 'booking', targetEntity: MeterReading::class, cascade: ['persist', 'remove'])]
    #[Groups(['all_bookings:read'])]
    #[MaxDepth(1)]
    private Collection $meterReadings;

    public function getPaymentType(): ?string
    {
        return $this->paymentType;
    }

    public function setPaymentType(?string $paymentType): self
    {
        $this->paymentType = $paymentType;
        return $this;
    }

    public function isPaid(): bool
    {
        return $this->isPaid;
    }

    public function setIsPaid(bool $isPaid): self
    {
        $this->isPaid = $isPaid;
        return $this;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    public function getPaid(): bool
    {
        return $this->isPaid;
    }

    public function setPaid(bool $paid): self
    {
        $this->isPaid = $paid;
        return $this;
    }

    // --- iCal Acknowledgement (Reviewed/Checked) ---

    public function getIcalAckSignature(): ?string
    {
        return $this->icalAckSignature;
    }

    public function setIcalAckSignature(?string $signature): self
    {
        $this->icalAckSignature = $signature;
        return $this;
    }

    public function getIcalAckAt(): ?\DateTimeImmutable
    {
        return $this->icalAckAt;
    }

    public function setIcalAckAt(?\DateTimeInterface $ackAt): self
    {
        if ($ackAt === null) {
            $this->icalAckAt = null;
        } elseif ($ackAt instanceof \DateTimeImmutable) {
            $this->icalAckAt = $ackAt;
        } else {
            $this->icalAckAt = \DateTimeImmutable::createFromMutable($ackAt);
        }
        return $this;
    }

    public function getIcalAckUserId(): ?int
    {
        return $this->icalAckUserId;
    }

    public function setIcalAckUserId(?int $userId): self
    {
        $this->icalAckUserId = $userId;
        return $this;
    }


    public function __construct()
    {
        $this->meterReadings = new ArrayCollection();
    }

    /**
     * @return Collection<int, MeterReading>
     */
    public function getMeterReadings(): Collection
    {
        return $this->meterReadings;
    }

    public function addMeterReading(MeterReading $reading): self
    {
        if (!$this->meterReadings->contains($reading)) {
            $this->meterReadings[] = $reading;
            $reading->setBooking($this);
        }
        return $this;
    }

    public function removeMeterReading(MeterReading $reading): self
    {
        if ($this->meterReadings->removeElement($reading)) {
            if ($reading->getBooking() === $this) {
                $reading->setBooking(null);
            }
        }
        return $this;
    }

    public function setBookingDate(?\DateTimeInterface $bookingDate): self
    {
        if ($bookingDate === null) {
            $this->bookingDate = null;
        } elseif ($bookingDate instanceof \DateTimeImmutable) {
            $this->bookingDate = $bookingDate;
        } else {
            $this->bookingDate = \DateTimeImmutable::createFromMutable($bookingDate);
        }
        return $this;
    }

    public function setSource(?string $source): self
    {
        $this->source = $source;
        return $this;
    }

    public function setGuestName(?string $guestName): self
    {
        $this->guestName = $guestName;
        return $this;
    }


    public function setCity(?string $city): self
    {
        $this->city = $city;
        return $this;
    }

    public function setGuests(?int $guests): self
    {
        $this->guests = $guests;
        return $this;
    }

    public function setCheckIn(?\DateTimeInterface $checkIn): self
    {
        if ($checkIn === null) {
            $this->checkIn = null;
        } elseif ($checkIn instanceof \DateTimeImmutable) {
            $this->checkIn = $checkIn;
        } else {
            $this->checkIn = \DateTimeImmutable::createFromMutable($checkIn);
        }
        return $this;
    }

    public function setCheckOut(?\DateTimeInterface $checkOut): self
    {
        if ($checkOut === null) {
            $this->checkOut = null;
        } elseif ($checkOut instanceof \DateTimeImmutable) {
            $this->checkOut = $checkOut;
        } else {
            $this->checkOut = \DateTimeImmutable::createFromMutable($checkOut);
        }
        return $this;
    }

    public function setDays(?int $days): self
    {
        $this->days = $days;
        return $this;
    }

    public function setPayout(?float $payout): self
    {
        $this->payout = $payout;
        return $this;
    }

    public function getPayout(): ?float
    {
        return $this->payout;
    }

    public function setTaxPercent(?float $taxPercent): self
    {
        $this->taxPercent = $taxPercent;
        return $this;
    }

    public function setTaxAmount(?float $taxAmount): self
    {
        $this->taxAmount = $taxAmount;
        return $this;
    }

    public function getTaxPercent(): ?float
    {
        return $this->taxPercent;
    }

    public function setNetPayout(?float $netPayout): self
    {
        $this->netPayout = $netPayout;
        return $this;
    }

    public function setCleaningFee(?float $cleaningFee): self
    {
        $this->cleaningFee = $cleaningFee;
        return $this;
    }


    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    public function setCommissionPercent(?float $commissionPercent): self
    {
        $this->commissionPercent = $commissionPercent;
        return $this;
    }


    public function setCommissionValue(?float $commissionValue): self
    {
        $this->commissionValue = $commissionValue;
        return $this;
    }

    #[Groups(['all_bookings:read'])]
    public function getCommissionValue(): ?float
    {
        return $this->commissionValue;
    }

    #[Groups(['all_bookings:read', 'all_bookings:write'])]
    public function getCommissionPercent(): ?float
    {
        return $this->commissionPercent;
    }

    public function setClientIncome(?float $clientIncome): self
    {
        $this->clientIncome = $clientIncome;
        return $this;
    }

    public function setO2Total(?float $o2Total): self
    {
        $this->o2Total = $o2Total;
        return $this;
    }

    public function setRoomFee(?float $roomFee): self
    {
        $this->roomFee = $roomFee;
        return $this;
    }

    public function getRoomFee(): ?float
    {
        return $this->roomFee;
    }
    /**
     * Get the booking date.
     */
    public function getBookingDate(): ?\DateTimeInterface
    {
        return $this->bookingDate;
    }


    /**
     * String representation for debugging/logging.
     */
    public function __toString(): string
    {
        return $this->confirmationCode ?? 'Booking';
    }

    /**
     * Calculate the total amount Owners2 receives (commission + cleaning fee).
     */
    #[Groups(['all_bookings:read'])]
    public function getO2Total(): float
    {
        return ($this->cleaningFee ?? 0) + ($this->commissionValue ?? 0);
    }

    /**
     * Commission base used for reporting:
     * Prefer the persisted value; if null, fall back to computed net_payout - cleaning_fee.
     */
    #[Groups(['all_bookings:read'])]
    public function getCommissionBase(): float
    {
        if ($this->commissionBase !== null) {
            return $this->commissionBase;
        }
        return ($this->netPayout ?? 0) - ($this->cleaningFee ?? 0);
    }

    #[Groups(['all_bookings:write'])]
    public function setCommissionBase(?float $commissionBase): self
    {
        $this->commissionBase = $commissionBase;
        return $this;
    }
    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSource(): ?string
    {
        return $this->source;
    }

    public function getGuestName(): ?string
    {
        return $this->guestName;
    }

    public function getStatus(): ?string
    {
        return $this->status;
    }

    public function setStatus(?string $status): self
    {
        $this->status = $status;

        if (strtolower((string)$status) === 'cancelled') {
            $this->cleaningFee = 0.0;
        }

        return $this;
    }

    public function getCity(): ?string
    {
        return $this->city;
    }

    public function getGuests(): ?int
    {
        return $this->guests;
    }

    public function getCheckIn(): ?\DateTimeInterface
    {
        return $this->checkIn;
    }

    public function getCheckOut(): ?\DateTimeInterface
    {
        return $this->checkOut;
    }

    public function getDays(): ?int
    {
        return $this->days;
    }

    public function getTaxAmount(): ?float
    {
        return $this->taxAmount;
    }

    public function getNetPayout(): ?float
    {
        return $this->netPayout;
    }

    public function getCleaningFee(): ?float
    {
        return $this->cleaningFee;
    }



    public function getClientIncome(): ?float
    {
        return $this->clientIncome;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function getCheckInNotes(): ?string
    {
        return $this->checkInNotes;
    }

    public function getCheckOutNotes(): ?string
    {
        return $this->checkOutNotes;
    }

    public function getPaymentMethod(): ?string
    {
        return $this->paymentMethod;
    }

    public function setPaymentMethod(?string $paymentMethod): self
    {
        $this->paymentMethod = $paymentMethod;
        return $this;
    }

    public function getGuestType(): ?string
    {
        return $this->guestType;
    }

    public function setGuestType(?string $guestType): self
    {
        $this->guestType = $guestType;
        return $this;
    }

    #[Groups(['all_bookings:read'])]
    public function getNetToOwner(): float
    {
        return ($this->netPayout ?? 0) - ($this->commissionValue ?? 0) - ($this->cleaningFee ?? 0);
    }

    public function setNotes(?string $notes): self
    {
        $this->notes = $notes;
        return $this;
    }

    public function setCheckInNotes(?string $checkInNotes): self
    {
        $this->checkInNotes = $checkInNotes;
        return $this;
    }

    public function setCheckOutNotes(?string $checkOutNotes): self
    {
        $this->checkOutNotes = $checkOutNotes;
        return $this;
    }
    #[Groups(['all_bookings:read'])]
    public function getMeterReadingSegments(): array
    {
        $segments = [];
        $readings = $this->meterReadings->toArray();
        usort($readings, fn($a, $b) => $a->getReadingDate() <=> $b->getReadingDate());

        for ($i = 1; $i < count($readings); $i++) {
            $previous = $readings[$i - 1];
            $current = $readings[$i];
            $days = $previous->getReadingDate()->diff($current->getReadingDate())->days ?: 1;

            $allowed = $days * $current->getAllowedPerDay();
            $registered = $current->getValue() - $previous->getValue();
            $difference = $registered - $allowed;
            $toCharge = max(0, $difference) * $current->getPricePerExtra();

            $segments[] = [
                'from' => $previous->getReadingDate()->format('Y-m-d'),
                'to' => $current->getReadingDate()->format('Y-m-d'),
                'allowedPeriod' => $allowed,
                'consumption' => $registered,
                'difference' => $difference,
                'toCharge' => $toCharge,
            ];
        }
        return $segments;
    }

    public function setOverlapWarning(bool $overlapWarning): self
    {
        $this->overlapWarning = $overlapWarning;
        return $this;
    }

    #[Groups(['all_bookings:read'])]
    public function hasOverlapWarning(): bool
    {
        return $this->overlapWarning;
    }
    #[ORM\PrePersist]
    #[ORM\PreUpdate]
    public function normalizeDates(): void
    {
        if ($this->bookingDate instanceof \DateTimeInterface) {
            $this->bookingDate = \DateTimeImmutable::createFromFormat('Y-m-d', $this->bookingDate->format('Y-m-d')) ?: null;
        }
        if ($this->checkIn instanceof \DateTimeInterface) {
            $this->checkIn = \DateTimeImmutable::createFromFormat('Y-m-d', $this->checkIn->format('Y-m-d')) ?: null;
        }
        if ($this->checkOut instanceof \DateTimeInterface) {
            $this->checkOut = \DateTimeImmutable::createFromFormat('Y-m-d', $this->checkOut->format('Y-m-d')) ?: null;
        }
        if ($this->holdExpiresAt instanceof \DateTimeInterface && !($this->holdExpiresAt instanceof \DateTimeImmutable)) {
            $this->holdExpiresAt = \DateTimeImmutable::createFromMutable($this->holdExpiresAt);
        }
        if ($this->confirmedAt instanceof \DateTimeInterface && !($this->confirmedAt instanceof \DateTimeImmutable)) {
            $this->confirmedAt = \DateTimeImmutable::createFromMutable($this->confirmedAt);
        }
        // Auto-populate commissionBase if not explicitly set (idempotent)
        if ($this->commissionBase === null) {
            $this->commissionBase = ($this->netPayout ?? 0) - ($this->cleaningFee ?? 0);
        }
    }
}