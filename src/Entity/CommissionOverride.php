<?php

namespace App\Entity;

use App\Repository\CommissionOverrideRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CommissionOverrideRepository::class)]
class CommissionOverride
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 255)]
    private string $unitId;

    #[ORM\Column(type: 'float')]
    private float $commissionPercent;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUnitId(): string
    {
        return $this->unitId;
    }

    public function setUnitId(string $unitId): self
    {
        $this->unitId = $unitId;

        return $this;
    }

    public function getCommissionPercent(): float
    {
        return $this->commissionPercent;
    }

    public function setCommissionPercent(float $commissionPercent): self
    {
        $this->commissionPercent = $commissionPercent;

        return $this;
    }
}
