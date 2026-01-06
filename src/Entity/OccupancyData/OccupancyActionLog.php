<?php

namespace App\Entity\OccupancyData;

use App\Entity\Unit;
use App\Entity\User;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'occupancy_action_log')]
#[ORM\HasLifecycleCallbacks]
class OccupancyActionLog
{
    public const TYPE_NOTE = 'note';
    public const TYPE_PRICE_ADJUST = 'price_adjust';
    public const TYPE_PROMO = 'promo';
    public const TYPE_MIN_STAY_CHANGE = 'min_stay_change';
    public const TYPE_CALENDAR_BLOCK = 'calendar_block';
    public const TYPE_SYNC = 'sync';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // Link to Unit
    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    // First day of the month this action applies to
    #[ORM\Column(type: 'date')]
    private ?\DateTimeInterface $period = null;

    // Action type (string enum)
    #[ORM\Column(type: 'string', length: 32)]
    private string $actionType = self::TYPE_NOTE;

    // Optional snapshot of occupancy percent at the time of the action
    #[ORM\Column(type: 'smallint', nullable: true)]
    private ?int $occPercent = null;

    // Arbitrary structured details for the action (e.g., {"oldPrice": 120, "newPrice": 99})
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $meta = null;

    // Optional pin to prioritize display in UI drawers
    #[ORM\Column(type: 'boolean')]
    private bool $pinned = false;

    // User that created the action
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
    public function touchUpdatedAt(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

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

    /**
     * Accepts either a DateTimeInterface or a YYYY-MM string.
     */
    public function setPeriod(\DateTimeInterface|string $period): self
    {
        if (is_string($period)) {
            // Normalize "YYYY-MM" to first day of month
            $period = \DateTimeImmutable::createFromFormat('Y-m-d', $period . '-01') ?: new \DateTimeImmutable($period);
        }
        $this->period = $period;
        return $this;
    }

    public function getActionType(): string
    {
        return $this->actionType;
    }

    public function setActionType(string $actionType): self
    {
        $this->actionType = $actionType;
        return $this;
    }

    public function getOccPercent(): ?int
    {
        return $this->occPercent;
    }

    public function setOccPercent(?int $occPercent): self
    {
        $this->occPercent = $occPercent;
        return $this;
    }

    public function getMeta(): ?array
    {
        return $this->meta;
    }

    public function setMeta(?array $meta): self
    {
        $this->meta = $meta;
        return $this;
    }

    public function isPinned(): bool
    {
        return $this->pinned;
    }

    public function setPinned(bool $pinned): self
    {
        $this->pinned = $pinned;
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
