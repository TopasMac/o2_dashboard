<?php

namespace App\Entity;

use App\Repository\BookingConfigRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: BookingConfigRepository::class)]
class BookingConfig
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private int $id;

    #[ORM\Column(type: 'string', length: 50, unique: true)]
    private string $configCode;

    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $effectiveDate;

    #[ORM\Column(type: 'float')]
    private float $defaultTaxPercentage;

    #[ORM\Column(type: 'float')]
    private float $defaultCommissionPercentage;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    public function getId(): int
    {
        return $this->id;
    }

    public function getConfigCode(): string
    {
        return $this->configCode;
    }

    public function setConfigCode(string $configCode): self
    {
        $this->configCode = $configCode;
        return $this;
    }

    public function getEffectiveDate(): \DateTimeInterface
    {
        return $this->effectiveDate;
    }

    public function setEffectiveDate(\DateTimeInterface $effectiveDate): self
    {
        $this->effectiveDate = $effectiveDate;
        return $this;
    }

    public function getDefaultTaxPercentage(): float
    {
        return $this->defaultTaxPercentage;
    }

    public function setDefaultTaxPercentage(float $defaultTaxPercentage): self
    {
        $this->defaultTaxPercentage = $defaultTaxPercentage;
        return $this;
    }

    public function getDefaultCommissionPercentage(): float
    {
        return $this->defaultCommissionPercentage;
    }

    public function setDefaultCommissionPercentage(float $defaultCommissionPercentage): self
    {
        $this->defaultCommissionPercentage = $defaultCommissionPercentage;
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
}