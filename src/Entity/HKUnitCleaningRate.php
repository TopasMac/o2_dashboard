<?php

namespace App\Entity;

use App\Repository\HKUnitCleaningRateRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: HKUnitCleaningRateRepository::class)]
#[ORM\Table(name: 'hk_unit_cleaning_rate')]
#[ORM\Index(columns: ['unit_id'], name: 'idx_unit')]
#[ORM\Index(columns: ['city'], name: 'idx_city')]
#[ORM\HasLifecycleCallbacks]
class HKUnitCleaningRate
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: 'unit_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    #[ORM\Column(type: 'string', length: 100)]
    private string $city;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    private string $amount;

    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $effectiveFrom;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $effectiveTo = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'datetime')]
    private \DateTimeInterface $createdAt;

    #[ORM\Column(type: 'datetime')]
    private \DateTimeInterface $updatedAt;

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
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

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    public function setUnit(?Unit $unit): self
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

    public function getAmount(): string
    {
        return $this->amount;
    }

    public function setAmount(string $amount): self
    {
        $this->amount = $amount;
        return $this;
    }

    public function getEffectiveFrom(): \DateTimeInterface
    {
        return $this->effectiveFrom;
    }

    public function setEffectiveFrom(\DateTimeInterface $effectiveFrom): self
    {
        $this->effectiveFrom = $effectiveFrom;
        return $this;
    }

    public function getEffectiveTo(): ?\DateTimeInterface
    {
        return $this->effectiveTo;
    }

    public function setEffectiveTo(?\DateTimeInterface $effectiveTo): self
    {
        $this->effectiveTo = $effectiveTo;
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

    public function getCreatedAt(): \DateTimeInterface
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeInterface
    {
        return $this->updatedAt;
    }
}