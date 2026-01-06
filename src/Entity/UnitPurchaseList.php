<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'unit_purchase_list')]
#[ORM\Index(name: 'idx_unit_purchase_list_unit', columns: ['unit_id'])]
class UnitPurchaseList
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_SENT = 'sent';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_PURCHASED = 'purchased';
    public const STATUS_CANCELLED = 'cancelled';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: 'unit_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    #[ORM\Column(type: Types::STRING, length: 20, options: ['default' => self::STATUS_DRAFT])]
    private string $status = self::STATUS_DRAFT;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $sentAt = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $approvedAt = null;

    // When this purchase list is charged/posted into the unit monthly report cycle (YYYY-MM)
    #[ORM\Column(type: Types::STRING, length: 7, nullable: true)]
    private ?string $chargedYearMonth = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $lastReviewedAt = null;

    // Reference code to display in monthly report instead of listing all items (e.g. O2PL-202512-000123)
    #[ORM\Column(type: Types::STRING, length: 32, nullable: true)]
    private ?string $listReference = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    // Optional snapshots/totals (can be computed from lines too)
    #[ORM\Column(name: 'total_cost', type: Types::DECIMAL, precision: 12, scale: 2, nullable: true)]
    private ?string $totalCost = null;

    #[ORM\Column(name: 'total_sell_price', type: Types::DECIMAL, precision: 12, scale: 2, nullable: true)]
    private ?string $totalSellPrice = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
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

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): self
    {
        $this->status = $status;
        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getSentAt(): ?\DateTimeImmutable
    {
        return $this->sentAt;
    }

    public function setSentAt(?\DateTimeImmutable $sentAt): self
    {
        $this->sentAt = $sentAt;
        return $this;
    }

    public function getApprovedAt(): ?\DateTimeImmutable
    {
        return $this->approvedAt;
    }

    public function setApprovedAt(?\DateTimeImmutable $approvedAt): self
    {
        $this->approvedAt = $approvedAt;
        return $this;
    }

    public function getChargedYearMonth(): ?string
    {
        return $this->chargedYearMonth;
    }

    public function setChargedYearMonth(?string $chargedYearMonth): self
    {
        $this->chargedYearMonth = $chargedYearMonth;
        return $this;
    }

    public function getLastReviewedAt(): ?\DateTimeImmutable
    {
        return $this->lastReviewedAt;
    }

    public function setLastReviewedAt(?\DateTimeImmutable $lastReviewedAt): self
    {
        $this->lastReviewedAt = $lastReviewedAt;
        return $this;
    }

    public function getListReference(): ?string
    {
        return $this->listReference;
    }

    public function setListReference(?string $listReference): self
    {
        $this->listReference = $listReference;
        return $this;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function setNotes(?string $notes): self
    {
        $this->notes = $notes;
        return $this;
    }

    public function getTotalCost(): ?string
    {
        return $this->totalCost;
    }

    public function setTotalCost(?string $totalCost): self
    {
        $this->totalCost = $totalCost;
        return $this;
    }

    public function getTotalSellPrice(): ?string
    {
        return $this->totalSellPrice;
    }

    public function setTotalSellPrice(?string $totalSellPrice): self
    {
        $this->totalSellPrice = $totalSellPrice;
        return $this;
    }

    public static function allowedStatuses(): array
    {
        return [
            self::STATUS_DRAFT,
            self::STATUS_SENT,
            self::STATUS_APPROVED,
            self::STATUS_PURCHASED,
            self::STATUS_CANCELLED,
        ];
    }
}