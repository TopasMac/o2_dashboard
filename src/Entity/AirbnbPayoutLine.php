<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(
    name: 'airbnb_payout_line',
    indexes: [
        new ORM\Index(columns: ['reservation_code']),
        new ORM\Index(columns: ['listing_id']),
        new ORM\Index(columns: ['line_type']),
    ]
)]
#[ORM\HasLifecycleCallbacks]
class AirbnbPayoutLine
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 32, name: 'line_type')]
    private string $lineType;

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2)]
    private string $amount;

    #[ORM\Column(type: 'boolean', options: ['default' => false], name: 'is_dealt')]
    private bool $isDealt = false;

    #[ORM\Column(type: 'text', nullable: true, name: 'dealt_notes')]
    private ?string $dealtNotes = null;

    #[ORM\Column(type: 'date', nullable: true, name: 'date_start')]
    private ?\DateTimeInterface $dateStart = null;

    #[ORM\Column(type: 'date', nullable: true, name: 'date_end')]
    private ?\DateTimeInterface $dateEnd = null;

    #[ORM\Column(type: 'string', length: 64, nullable: true, name: 'listing_id')]
    private ?string $listingId = null;

    #[ORM\Column(type: 'string', length: 16, nullable: true, name: 'reservation_code')]
    private ?string $reservationCode = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true, name: 'listing_name')]
    private ?string $listingName = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'datetime', name: 'created_at')]
    private ?\DateTimeInterface $createdAt = null;

    // Lifecycle callback to set createdAt
    #[ORM\PrePersist]
    public function setCreatedAtValue(): void
    {
        if ($this->createdAt === null) {
            $this->createdAt = new \DateTimeImmutable();
        }
    }

    // Getters and Setters

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getLineType(): string
    {
        return $this->lineType;
    }

    public function setLineType(string $lineType): self
    {
        $this->lineType = $lineType;
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

    public function getDateStart(): ?\DateTimeInterface
    {
        return $this->dateStart;
    }

    public function setDateStart(?\DateTimeInterface $dateStart): self
    {
        $this->dateStart = $dateStart;
        return $this;
    }

    public function getDateEnd(): ?\DateTimeInterface
    {
        return $this->dateEnd;
    }

    public function setDateEnd(?\DateTimeInterface $dateEnd): self
    {
        $this->dateEnd = $dateEnd;
        return $this;
    }

    public function getListingId(): ?string
    {
        return $this->listingId;
    }

    public function setListingId(?string $listingId): self
    {
        $this->listingId = $listingId;
        return $this;
    }

    public function getReservationCode(): ?string
    {
        return $this->reservationCode;
    }

    public function setReservationCode(?string $reservationCode): self
    {
        $this->reservationCode = $reservationCode;
        return $this;
    }

    public function getListingName(): ?string
    {
        return $this->listingName;
    }

    public function setListingName(?string $listingName): self
    {
        $this->listingName = $listingName;
        return $this;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): self
    {
        $this->description = $description;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeInterface
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeInterface $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }
    public function isDealt(): bool
    {
        return $this->isDealt;
    }

    public function setIsDealt(bool $isDealt): self
    {
        $this->isDealt = $isDealt;
        return $this;
    }

    public function getDealtNotes(): ?string
    {
        return $this->dealtNotes;
    }

    public function setDealtNotes(?string $notes): self
    {
        $this->dealtNotes = $notes;
        return $this;
    }
}