<?php

namespace App\Entity\OccupancyData;

use App\Entity\Unit;
use App\Entity\User;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'occupancy_alert_state')]
#[ORM\UniqueConstraint(name: 'uniq_alert_unit_period_type_version', columns: ['unit_id', 'period', 'alert_type', 'version'])]
#[ORM\HasLifecycleCallbacks]
class OccupancyAlertState
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_SNOOZED = 'snoozed';
    public const STATUS_DISMISSED = 'dismissed';

    public const TYPE_LOW = 'low';
    public const TYPE_HIGH = 'high';
    public const TYPE_OVERBOOK = 'overbook';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    // First day of the month this alert belongs to
    #[ORM\Column(type: 'date')]
    private ?\DateTimeInterface $period = null;

    #[ORM\Column(type: 'string', length: 16)]
    private string $alertType;

    #[ORM\Column(type: 'string', length: 16)]
    private string $status = self::STATUS_ACTIVE;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $snoozeUntil = null;

    #[ORM\Column(type: 'string', length: 300, nullable: true)]
    private ?string $reason = null;

    #[ORM\Column(type: 'integer')]
    private int $version = 1;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'RESTRICT')]
    private ?User $createdBy = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    // Getters and setters

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

    public function getPeriod(): ?\DateTimeInterface
    {
        return $this->period;
    }

    public function setPeriod(\DateTimeInterface|string $period): self
    {
        if (is_string($period)) {
            $period = \DateTimeImmutable::createFromFormat('Y-m-d', $period . '-01') ?: new \DateTimeImmutable($period);
        }
        $this->period = $period;
        return $this;
    }

    public function getAlertType(): string
    {
        return $this->alertType;
    }

    public function setAlertType(string $alertType): self
    {
        $this->alertType = $alertType;
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

    public function getSnoozeUntil(): ?\DateTimeInterface
    {
        return $this->snoozeUntil;
    }

    public function setSnoozeUntil(?\DateTimeInterface $snoozeUntil): self
    {
        $this->snoozeUntil = $snoozeUntil;
        return $this;
    }

    public function getReason(): ?string
    {
        return $this->reason;
    }

    public function setReason(?string $reason): self
    {
        $this->reason = $reason;
        return $this;
    }

    public function getVersion(): int
    {
        return $this->version;
    }

    public function setVersion(int $version): self
    {
        $this->version = $version;
        return $this;
    }

    public function getCreatedBy(): ?User
    {
        return $this->createdBy;
    }

    public function setCreatedBy(User $createdBy): self
    {
        $this->createdBy = $createdBy;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?\DateTimeImmutable $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }
}