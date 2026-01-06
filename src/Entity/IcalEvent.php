<?php

namespace App\Entity;

use App\Repository\IcalEventRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: IcalEventRepository::class)]
#[ORM\Table(
    name: 'ical_events',
    uniqueConstraints: [new ORM\UniqueConstraint(name: 'UNIQ_ICAL_UNIT_UID', columns: ['unit_id', 'uid'])]
)]
#[ORM\Index(name: 'IDX_ICAL_UID', columns: ['uid'])]
#[ORM\Index(name: 'IDX_ICAL_DATES', columns: ['dtstart', 'dtend'])]
class IcalEvent
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: 'unit_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    // Airbnb sometimes provides a UID; not guaranteed
    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $uid = null;

    // DTSTART is the check-in (inclusive)
    #[ORM\Column(type: 'datetime')]
    private \DateTimeInterface $dtstart;

    // DTEND is exclusive in iCal → checkout date
    #[ORM\Column(type: 'datetime')]
    private \DateTimeInterface $dtend;

    #[ORM\Column(type: 'string', length: 32, nullable: true)]
    private ?string $status = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $summary = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(name: 'event_type', type: 'string', length: 20, nullable: true)]
    private ?string $eventType = null;

    #[ORM\Column(name: 'is_block', type: 'boolean', options: ['default' => false])]
    private bool $isBlock = false;

    public function getEventType(): ?string
    {
        return $this->eventType;
    }

    public function setEventType(?string $eventType): self
    {
        $this->eventType = $eventType;
        return $this;
    }

    public function isBlock(): bool
    {
        return $this->isBlock;
    }

    public function setIsBlock(bool $isBlock): self
    {
        $this->isBlock = $isBlock;
        return $this;
    }

    #[ORM\Column(name: 'reservation_url', type: 'string', length: 1024, nullable: true)]
    private ?string $reservationUrl = null;

    #[ORM\Column(name: 'reservation_code', type: 'string', length: 32, nullable: true)]
    private ?string $reservationCode = null;

    // Optional book-keeping for change detection
    #[ORM\Column(name: 'source_hash', type: 'string', length: 64, nullable: true)]
    private ?string $sourceHash = null;

    #[ORM\Column(name: 'source_etag', type: 'string', length: 128, nullable: true)]
    private ?string $sourceEtag = null;

    #[ORM\Column(name: 'last_seen_at', type: 'datetime')]
    private \DateTimeInterface $lastSeenAt;

    #[ORM\Column(name: 'created_at', type: 'datetime')]
    private \DateTimeInterface $createdAt;

    #[ORM\Column(name: 'updated_at', type: 'datetime')]
    private \DateTimeInterface $updatedAt;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    public function setUnit(Unit $unit): self
    {
        $this->unit = $unit;
        return $this;
    }

    public function getUid(): ?string
    {
        return $this->uid;
    }

    public function setUid(?string $uid): self
    {
        $this->uid = $uid;
        return $this;
    }

    public function getDtstart(): \DateTimeInterface
    {
        return $this->dtstart;
    }

    public function setDtstart(\DateTimeInterface $dtstart): self
    {
        $this->dtstart = $dtstart;
        return $this;
    }

    public function getDtend(): \DateTimeInterface
    {
        return $this->dtend;
    }

    public function setDtend(\DateTimeInterface $dtend): self
    {
        $this->dtend = $dtend;
        return $this;
    }

    public function getStatus(): ?string
    {
        return $this->status;
    }

    public function setStatus(?string $status): self
    {
        $this->status = $status;
        return $this;
    }

    public function getSummary(): ?string
    {
        return $this->summary;
    }

    public function setSummary(?string $summary): self
    {
        $this->summary = $summary;
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

    public function getReservationUrl(): ?string
    {
        return $this->reservationUrl;
    }

    public function setReservationUrl(?string $reservationUrl): self
    {
        $this->reservationUrl = $reservationUrl;
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

    public function getSourceHash(): ?string
    {
        return $this->sourceHash;
    }

    public function setSourceHash(?string $sourceHash): self
    {
        $this->sourceHash = $sourceHash;
        return $this;
    }

    public function getSourceEtag(): ?string
    {
        return $this->sourceEtag;
    }

    public function setSourceEtag(?string $sourceEtag): self
    {
        $this->sourceEtag = $sourceEtag;
        return $this;
    }

    public function getLastSeenAt(): \DateTimeInterface
    {
        return $this->lastSeenAt;
    }

    public function setLastSeenAt(\DateTimeInterface $lastSeenAt): self
    {
        $this->lastSeenAt = $lastSeenAt;
        return $this;
    }

    public function getCreatedAt(): \DateTimeInterface
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeInterface $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): \DateTimeInterface
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(\DateTimeInterface $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }
}