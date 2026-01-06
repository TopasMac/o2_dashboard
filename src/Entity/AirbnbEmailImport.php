<?php

namespace App\Entity;

use App\Repository\AirbnbEmailImportRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AirbnbEmailImportRepository::class)]
class AirbnbEmailImport
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id = null;

    #[ORM\Column(type: Types::DATE_MUTABLE)]
    private ?\DateTime $bookingDate = null;

    #[ORM\Column(length: 255)]
    private ?string $source = null;

    #[ORM\Column(length: 255, unique: true)]
    private ?string $confirmationCode = null;

    #[ORM\Column(length: 255)]
    private ?string $guestName = null;

    #[ORM\Column(length: 255)]
    private ?string $listingName = null;

    #[ORM\Column(nullable: true)]
    private ?int $guests = null;

    #[ORM\Column(length: 255)]
    private ?string $checkIn = null;

    #[ORM\Column(length: 255)]
    private ?string $checkOut = null;

    #[ORM\Column(nullable: true)]
    private ?float $payout = null;

    #[ORM\Column(nullable: true)]
    private ?float $cleaningFee = null;

    #[ORM\Column(nullable: true)]
    private ?float $roomFee = null;


    #[ORM\Column(name: "unit_id", type: "string", nullable: true)]
    private ?string $unitId = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getBookingDate(): ?\DateTime
    {
        return $this->bookingDate;
    }

    public function setBookingDate(\DateTime $bookingDate): static
    {
        $this->bookingDate = $bookingDate;

        return $this;
    }

    public function getSource(): ?string
    {
        return $this->source;
    }

    public function setSource(string $source): static
    {
        $this->source = $source;

        return $this;
    }

    public function getConfirmationCode(): ?string
    {
        return $this->confirmationCode;
    }

    public function setConfirmationCode(string $confirmationCode): static
    {
        $this->confirmationCode = $confirmationCode;

        return $this;
    }

    public function getGuestName(): ?string
    {
        return $this->guestName;
    }

    public function setGuestName(string $guestName): static
    {
        $this->guestName = $guestName;

        return $this;
    }

    public function getListingName(): ?string
    {
        return $this->listingName;
    }

    public function setListingName(string $listingName): static
    {
        $this->listingName = $listingName;

        return $this;
    }

    public function getGuests(): ?int
    {
        return $this->guests;
    }

    public function setGuests(?int $guests): static
    {
        $this->guests = $guests;

        return $this;
    }

    public function getCheckIn(): ?string
    {
        return $this->checkIn;
    }

    public function setCheckIn(string $checkIn): static
    {
        $this->checkIn = $checkIn;

        return $this;
    }

    public function getCheckOut(): ?string
    {
        return $this->checkOut;
    }

    public function setCheckOut(string $checkOut): static
    {
        $this->checkOut = $checkOut;

        return $this;
    }

    public function getPayout(): ?float
    {
        return $this->payout;
    }

    public function setPayout(?float $payout): static
    {
        $this->payout = $payout;

        return $this;
    }

    public function getCleaningFee(): ?float
    {
        return $this->cleaningFee;
    }

    public function setCleaningFee(?float $cleaningFee): static
    {
        $this->cleaningFee = $cleaningFee;

        return $this;
    }

    public function getRoomFee(): ?float
    {
        return $this->roomFee;
    }

    public function setRoomFee(?float $roomFee): static
    {
        $this->roomFee = $roomFee;

        return $this;
    }


    public function getUnitId(): ?string
    {
        return $this->unitId;
    }

    public function setUnitId(?string $unitId): static
    {
        $this->unitId = $unitId;
        return $this;
    }
}
