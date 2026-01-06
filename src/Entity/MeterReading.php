<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use App\Repository\MeterReadingRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;

#[ORM\Entity(repositoryClass: MeterReadingRepository::class)]
#[ApiResource(
    normalizationContext: ['groups' => ['meter_reading:read']],
    denormalizationContext: ['groups' => ['meter_reading:write']]
)]
class MeterReading
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['meter_reading:read', 'all_bookings:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: AllBookings::class, inversedBy: 'meterReadings')]
    #[ORM\JoinColumn(nullable: false, onDelete: "CASCADE")]
    #[Groups(['meter_reading:read', 'meter_reading:write', 'all_bookings:read'])]
    private ?AllBookings $booking = null;

    #[ORM\Column(length: 20)]
    #[Groups(['meter_reading:read', 'meter_reading:write', 'all_bookings:read'])]
    private string $type;

    #[ORM\Column(type: 'date_immutable')]
    #[Groups(['meter_reading:read', 'meter_reading:write', 'all_bookings:read'])]
    private \DateTimeImmutable $readingDate;

    #[ORM\Column(type: 'float')]
    #[Groups(['meter_reading:read', 'meter_reading:write', 'all_bookings:read'])]
    private float $value;

    #[ORM\Column(type: 'float')]
    #[Groups(['meter_reading:read', 'meter_reading:write', 'all_bookings:read'])]
    private float $allowedPerDay = 25;

    #[ORM\Column(type: 'float')]
    #[Groups(['meter_reading:read', 'meter_reading:write', 'all_bookings:read'])]
    private float $pricePerExtra = 10;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getBooking(): ?AllBookings
    {
        return $this->booking;
    }

    public function setBooking(?AllBookings $booking): self
    {
        $this->booking = $booking;
        return $this;
    }

    public function getType(): string
    {
        return $this->type;
    }

    public function setType(string $type): self
    {
        $this->type = $type;
        return $this;
    }

    public function getReadingDate(): \DateTimeImmutable
    {
        return $this->readingDate;
    }

    public function setReadingDate(\DateTimeImmutable $readingDate): self
    {
        $this->readingDate = $readingDate;
        return $this;
    }

    public function getValue(): float
    {
        return $this->value;
    }

    public function setValue(float $value): self
    {
        $this->value = $value;
        return $this;
    }

    public function getAllowedPerDay(): float
    {
        return $this->allowedPerDay;
    }

    public function setAllowedPerDay(float $allowedPerDay): self
    {
        $this->allowedPerDay = $allowedPerDay;
        return $this;
    }

    public function getPricePerExtra(): float
    {
        return $this->pricePerExtra;
    }

    public function setPricePerExtra(float $pricePerExtra): self
    {
        $this->pricePerExtra = $pricePerExtra;
        return $this;
    }
}