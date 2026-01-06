<?php

namespace App\Entity\OccupancyData;

use App\Entity\Unit;
use App\Entity\User;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: \App\Repository\OccupancyNoteRepository::class)]
#[ORM\Table(name: 'occupancy_note')]
#[ORM\HasLifecycleCallbacks]
class OccupancyNote
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    // Month context
    #[ORM\Column(type: 'date')]
    private ?\DateTimeInterface $period = null;

    #[ORM\Column(type: 'text')]
    private string $note;

    #[ORM\Column(type: 'boolean')]
    private bool $pinned = false;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'RESTRICT')]
    private ?User $createdBy = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onUpdate(): void
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

    public function setUnit(Unit $unit): self
    {
        $this->unit = $unit;
        return $this;
    }

    public function getPeriod(): ?\DateTimeInterface
    {
        return $this->period;
    }

    /**
     * Accepts either a DateTimeInterface or a YYYY-MM string, normalizing to first day of month.
     */
    public function setPeriod(\DateTimeInterface|string $period): self
    {
        if (is_string($period)) {
            $period = \DateTimeImmutable::createFromFormat('Y-m-d', $period . '-01') ?: new \DateTimeImmutable($period);
        }
        $this->period = $period;
        return $this;
    }

    public function getNote(): string
    {
        return $this->note;
    }

    public function setNote(string $note): self
    {
        $this->note = $note;
        return $this;
    }

    public function isPinned(): bool
    {
        return $this->pinned;
    }

    public function setPinned(bool $pinned): self
    {
        $this->pinned = $pinned;
        return $this;
    }

    public function getCreatedBy(): ?User
    {
        return $this->createdBy;
    }

    public function setCreatedBy(User $createdBy): self
    {
        $this->createdBy = $createdBy;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?\DateTimeImmutable $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }
}