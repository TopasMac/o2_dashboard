<?php

namespace App\Entity;

use App\Repository\AirbnbPayoutReconStateRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AirbnbPayoutReconStateRepository::class)]
#[ORM\Table(name: 'airbnb_payout_recon_state')]
class AirbnbPayoutReconState
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 32)]
    private ?string $reservationCode = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isPaid = false;

    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $paidAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $note = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $setByUserId = null;

    // ---- Getters & Setters ----
    public function getId(): ?int { return $id ?? null; }

    public function getReservationCode(): ?string { return $this->reservationCode; }
    public function setReservationCode(?string $reservationCode): self { $this->reservationCode = $reservationCode; return $this; }

    public function isPaid(): bool { return $this->isPaid; }
    public function setIsPaid(bool $isPaid): self { $this->isPaid = $isPaid; return $this; }

    public function getPaidAt(): ?\DateTimeInterface { return $this->paidAt; }
    public function setPaidAt(?\DateTimeInterface $paidAt): self { $this->paidAt = $paidAt; return $this; }

    public function getNote(): ?string { return $this->note; }
    public function setNote(?string $note): self { $this->note = $note; return $this; }

    public function getSetByUserId(): ?int { return $this->setByUserId; }
    public function setSetByUserId(?int $setByUserId): self { $this->setByUserId = $setByUserId; return $this; }
}