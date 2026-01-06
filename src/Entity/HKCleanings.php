<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use App\Entity\Employee;

#[ORM\Entity]
#[ORM\Table(name: 'hk_cleanings')]
#[ORM\UniqueConstraint(name: 'uniq_unit_checkout_type', columns: ['unit_id','checkout_date','cleaning_type'])]
#[ORM\HasLifecycleCallbacks]
class HKCleanings
{
    public const TYPE_CHECKOUT = 'checkout';
    public const TYPE_MIDSTAY  = 'midstay';
    public const TYPE_DEEP     = 'deep';
    public const TYPE_OWNER    = 'owner';

    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_DONE      = 'done';
    public const STATUS_PAID      = 'paid';
    public const STATUS_PENDING   = 'pending';
    public const STATUS_CANCELLED = 'cancelled';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // Snapshot relation to the unit (required)
    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: 'unit_id', referencedColumnName: 'id', nullable: false, onDelete: 'RESTRICT')]
    private ?Unit $unit = null;

    // City snapshot (e.g., 'Playa', 'Tulum')
    #[ORM\Column(type: 'string', length: 64)]
    private string $city;

    // Optional linkages to a booking
    #[ORM\Column(name: 'booking_id', type: 'integer', nullable: true)]
    private ?int $bookingId = null;

    #[ORM\Column(name: 'reservation_code', type: 'string', length: 64, nullable: true)]
    private ?string $reservationCode = null;

    // Business date for the cleaning (belongs to checkout month)
    #[ORM\Column(name: 'checkout_date', type: 'date')]
    private \DateTimeInterface $checkoutDate;

    // Cleaning type
    #[ORM\Column(name: 'cleaning_type', type: 'string', length: 16)]
    private string $cleaningType = self::TYPE_CHECKOUT;

    // Fee actually collected by O2 (optional, may differ)
    #[ORM\Column(name: 'o2_collected_fee', type: 'decimal', precision: 10, scale: 2, nullable: true)]
    private ?string $o2CollectedFee = null;

    // Amount Owners2 pays housekeeper in Tulum per cleaning
    #[ORM\Column(name: 'cleaning_cost', type: 'decimal', precision: 10, scale: 2, nullable: true)]
    private ?string $cleaningCost = null;


    // Workflow status
    #[ORM\Column(type: 'string', length: 16)]
    private string $status = self::STATUS_PENDING;

    // Optional worker reference by id (keep simple for now)
    #[ORM\Column(name: 'assigned_to_id', type: 'integer', nullable: true)]
    private ?int $assignedToId = null;

    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(name: 'done_by_employee_id', referencedColumnName: 'id', nullable: true)]
    private ?Employee $doneByEmployee = null;

    #[ORM\Column(name: 'done_at', type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $doneAt = null;

    #[ORM\Column(name: 'assign_notes', type: 'text', nullable: true)]
    private ?string $assignNotes = null;

    #[ORM\Column(name: 'created_at', type: 'datetime_immutable')]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(name: 'updated_at', type: 'datetime_immutable')]
    private ?\DateTimeImmutable $updatedAt = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    public function setUnit(Unit $unit): self
    {
        $this->unit = $unit;
        return $this;
    }

    public function getCity(): string
    {
        return $this->city;
    }

    public function setCity(string $city): self
    {
        $this->city = $city;
        return $this;
    }

    public function getBookingId(): ?int
    {
        return $this->bookingId;
    }

    public function setBookingId(?int $bookingId): self
    {
        $this->bookingId = $bookingId;
        return $this;
    }

    public function getReservationCode(): ?string
    {
        return $this->reservationCode;
    }

    public function setReservationCode(?string $reservationCode): self
    {
        $this->reservationCode = $reservationCode;
        return $this;
    }

    public function getCheckoutDate(): \DateTimeInterface
    {
        return $this->checkoutDate;
    }

    public function setCheckoutDate(\DateTimeInterface $checkoutDate): self
    {
        $this->checkoutDate = $checkoutDate;
        return $this;
    }

    public function getCleaningType(): string
    {
        return $this->cleaningType;
    }

    public function setCleaningType(string $cleaningType): self
    {
        $this->cleaningType = $cleaningType;
        return $this;
    }


    public function getCleaningCost(): ?string
    {
        return $this->cleaningCost;
    }

    public function setCleaningCost(?string $cleaningCost): self
    {
        $this->cleaningCost = $cleaningCost;
        return $this;
    }

    public function getO2CollectedFee(): ?string
    {
        return $this->o2CollectedFee;
    }

    public function setO2CollectedFee(?string $o2CollectedFee): self
    {
        $this->o2CollectedFee = $o2CollectedFee;
        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): self
    {
        $this->status = $status;
        return $this;
    }

    public function getAssignedToId(): ?int
    {
        return $this->assignedToId;
    }

    public function setAssignedToId(?int $assignedToId): self
    {
        $this->assignedToId = $assignedToId;
        return $this;
    }

    public function getDoneByEmployee(): ?Employee
    {
        return $this->doneByEmployee;
    }

    public function setDoneByEmployee(?Employee $employee): self
    {
        $this->doneByEmployee = $employee;
        return $this;
    }

    public function getDoneAt(): ?\DateTimeInterface
    {
        return $this->doneAt;
    }

    public function setDoneAt(?\DateTimeInterface $doneAt): self
    {
        $this->doneAt = $doneAt;
        return $this;
    }

    public function getAssignNotes(): ?string
    {
        return $this->assignNotes;
    }

    public function setAssignNotes(?string $assignNotes): self
    {
        $this->assignNotes = $assignNotes;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable('now');
        $this->createdAt = $this->createdAt ?? $now;
        $this->updatedAt = $this->updatedAt ?? $now;
        // sensible defaults
        if (!$this->cleaningType) {
            $this->cleaningType = self::TYPE_CHECKOUT;
        }
        if (!$this->status) {
            $this->status = self::STATUS_PENDING;
        }
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now');
    }
}
