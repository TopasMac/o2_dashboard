<?php

namespace App\Entity;

use App\Repository\PrivateReservationRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: PrivateReservationRepository::class)]
class PrivateReservation
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private int $id;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $bookingDate;

    #[ORM\Column(type: 'string', length: 100)]
    private string $guestName;

    #[ORM\Column(type: 'string', length: 255)]
    private string $unitId;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $city = null;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $checkIn;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $checkOut;

    #[ORM\Column(type: 'integer')]
    private int $nrOfGuests;

    #[ORM\Column(type: 'string', length: 50)]
    private string $source;

    #[ORM\Column(type: 'float')]
    private float $payout;

    #[ORM\Column(type: 'float', nullable: true)]
    private ?float $cleaningFee = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $guestType = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $paymentMethod = null;

    public function __construct()
    {
        $this->bookingDate = new \DateTimeImmutable();
    }

    // Add getters and setters for each field here...

    public function getUnitId(): string
    {
        return $this->unitId;
    }

    public function setUnitId(string $unitId): self
    {
        $this->unitId = $unitId;
        return $this;
    }

    public function getCheckIn(): \DateTimeImmutable
    {
        return $this->checkIn;
    }

    public function setCheckIn(\DateTimeImmutable $checkIn): self
    {
        $this->checkIn = $checkIn;
        return $this;
    }

    public function getCheckOut(): \DateTimeImmutable
    {
        return $this->checkOut;
    }

    public function setCheckOut(\DateTimeImmutable $checkOut): self
    {
        $this->checkOut = $checkOut;
        return $this;
    }

    public function getBookingDate(): \DateTimeImmutable
    {
        return $this->bookingDate;
    }

    public function setBookingDate(\DateTimeImmutable $bookingDate): self
    {
        $this->bookingDate = $bookingDate;
        return $this;
    }

    public function getGuestName(): string
    {
        return $this->guestName;
    }

    public function setGuestName(string $guestName): self
    {
        $this->guestName = $guestName;
        return $this;
    }

    public function getCity(): ?string
    {
        return $this->city;
    }

    public function setCity(?string $city): self
    {
        $this->city = $city;
        return $this;
    }

    public function getNrOfGuests(): int
    {
        return $this->nrOfGuests;
    }

    public function setNrOfGuests(int $nrOfGuests): self
    {
        $this->nrOfGuests = $nrOfGuests;
        return $this;
    }

    public function getSource(): string
    {
        return $this->source;
    }

    public function setSource(string $source): self
    {
        $this->source = $source;
        return $this;
    }

    public function getPayout(): float
    {
        return $this->payout;
    }

    public function setPayout(float $payout): self
    {
        $this->payout = $payout;
        return $this;
    }

    public function getCleaningFee(): ?float
    {
        return $this->cleaningFee;
    }

    public function setCleaningFee(?float $cleaningFee): self
    {
        $this->cleaningFee = $cleaningFee;
        return $this;
    }

    public function getGuestType(): ?string
    {
        return $this->guestType;
    }

    public function setGuestType(?string $guestType): self
    {
        $this->guestType = $guestType;
        return $this;
    }

    public function getPaymentMethod(): ?string
    {
        return $this->paymentMethod;
    }

    public function setPaymentMethod(?string $paymentMethod): self
    {
        $this->paymentMethod = $paymentMethod;
        return $this;
    }
}