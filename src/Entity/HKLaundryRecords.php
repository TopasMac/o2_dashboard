<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'hk_laundry_records')]
#[ORM\HasLifecycleCallbacks]
#[ApiResource]
class HKLaundryRecords
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    private ?\DateTimeImmutable $laundryDate = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'RESTRICT')]
    private ?Unit $unit = null;

    #[ORM\ManyToOne(targetEntity: HKLaundryRates::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?HKLaundryRates $rate = null;

    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2)]
    private string $quantity = '0.00';

    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2, nullable: true)]
    private ?string $rateSnapshot = null;

    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2, nullable: true)]
    private ?string $expectedAmount = null;

    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2, nullable: true)]
    private ?string $chargedAmount = null;

    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    private ?int $providerId = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $createdBy = null;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $updatedBy = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private ?\DateTimeImmutable $updatedAt = null;

    public function __construct()
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;
        $this->laundryDate = new \DateTimeImmutable('today');
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable();
        $this->createdAt ??= $now;
        $this->updatedAt = $now;
        $this->laundryDate ??= new \DateTimeImmutable('today');
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getLaundryDate(): ?\DateTimeImmutable
    {
        return $this->laundryDate;
    }

    public function setLaundryDate(\DateTimeImmutable|\DateTimeInterface|string|null $laundryDate): self
    {
        $this->laundryDate = $this->normalizeDate($laundryDate);
        return $this;
    }

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    public function setUnit(?Unit $unit): self
    {
        $this->unit = $unit;
        return $this;
    }

    public function getRate(): ?HKLaundryRates
    {
        return $this->rate;
    }

    public function setRate(?HKLaundryRates $rate): self
    {
        $this->rate = $rate;
        return $this;
    }

    public function getQuantity(): string
    {
        return $this->quantity;
    }

    public function setQuantity(string|float|int $quantity): self
    {
        $this->quantity = number_format((float) $quantity, 2, '.', '');
        return $this;
    }

    public function getRateSnapshot(): ?string
    {
        return $this->rateSnapshot;
    }

    public function setRateSnapshot(string|float|int|null $rateSnapshot): self
    {
        $this->rateSnapshot = $rateSnapshot === null || $rateSnapshot === ''
            ? null
            : number_format((float) $rateSnapshot, 2, '.', '');

        return $this;
    }

    public function getExpectedAmount(): ?string
    {
        return $this->expectedAmount;
    }

    public function setExpectedAmount(string|float|int|null $expectedAmount): self
    {
        $this->expectedAmount = $expectedAmount === null || $expectedAmount === ''
            ? null
            : number_format((float) $expectedAmount, 2, '.', '');

        return $this;
    }

    public function getChargedAmount(): ?string
    {
        return $this->chargedAmount;
    }

    public function setChargedAmount(string|float|int|null $chargedAmount): self
    {
        $this->chargedAmount = $chargedAmount === null || $chargedAmount === ''
            ? null
            : number_format((float) $chargedAmount, 2, '.', '');

        return $this;
    }

    public function getProviderId(): ?int
    {
        return $this->providerId;
    }

    public function setProviderId(?int $providerId): self
    {
        $this->providerId = $providerId;
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

    public function getCreatedBy(): ?string
    {
        return $this->createdBy;
    }

    public function setCreatedBy(?string $createdBy): self
    {
        $this->createdBy = $createdBy;
        return $this;
    }

    public function getUpdatedBy(): ?string
    {
        return $this->updatedBy;
    }

    public function setUpdatedBy(?string $updatedBy): self
    {
        $this->updatedBy = $updatedBy;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?\DateTimeImmutable $createdAt): self
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

    private function normalizeDate(\DateTimeImmutable|\DateTimeInterface|string|null $value): ?\DateTimeImmutable
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof \DateTimeImmutable) {
            return $value;
        }

        if ($value instanceof \DateTimeInterface) {
            return \DateTimeImmutable::createFromInterface($value);
        }

        return new \DateTimeImmutable($value);
    }
}
