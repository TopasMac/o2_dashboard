<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use Symfony\Component\Serializer\Annotation\Groups;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'unit_balance')]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    operations: [new Get(), new GetCollection()],
    normalizationContext: ['groups' => ['unit_balance:read']]
)]
class UnitBalance
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['unit_balance:read'])]
    private ?int $id = null;

    #[ORM\OneToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    #[Groups(['unit_balance:read'])]
    private ?Unit $unit = null;

    // Positive => we owe client | Negative => client owes us
    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['unit_balance:read'])]
    private string $currentBalance = '0.00';

    #[ORM\Column(type: 'date_immutable')]
    #[Groups(['unit_balance:read'])]
    private ?\DateTimeImmutable $updatedAt = null;

    public function getId(): ?int { return $this->id; }
    public function getUnit(): ?Unit { return $this->unit; }
    public function setUnit(Unit $unit): self { $this->unit = $unit; return $this; }

    public function getCurrentBalance(): string { return $this->currentBalance; }
    public function setCurrentBalance(string $v): self { $this->currentBalance = $v; return $this; }

    public function getUpdatedAt(): ?\DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeImmutable $d): self { $this->updatedAt = $d; return $this; }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        if (!$this->updatedAt) {
            $this->updatedAt = new \DateTimeImmutable('today');
        }
    }
}