<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use DateTimeImmutable;

#[ORM\Entity(repositoryClass: \App\Repository\UnitMaintenanceScheduleRepository::class)]
#[ORM\Table(name: 'unit_maintenance_schedule')]
#[ORM\HasLifecycleCallbacks]
class UnitMaintenanceSchedule
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: 'unit_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    #[ORM\Column(name: 'task_code', type: 'string', length: 100)]
    private string $taskCode;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $label = null;

    #[ORM\Column(name: 'frequency_weeks', type: 'smallint', nullable: true)]
    private ?int $frequencyWeeks = null;

    #[ORM\Column(name: 'frequency_months', type: 'smallint', nullable: true)]
    private ?int $frequencyMonths = null;

    #[ORM\Column(name: 'last_done_at', type: 'datetime_immutable', nullable: true)]
    private ?DateTimeImmutable $lastDoneAt = null;

    #[ORM\Column(name: 'next_due_at', type: 'datetime_immutable', nullable: true)]
    private ?DateTimeImmutable $nextDueAt = null;

    #[ORM\Column(name: 'is_enabled', type: 'boolean', options: ['default' => true])]
    private bool $isEnabled = true;

    #[ORM\Column(name: 'created_at', type: 'datetime_immutable')]
    private DateTimeImmutable $createdAt;

    #[ORM\Column(name: 'updated_at', type: 'datetime_immutable')]
    private DateTimeImmutable $updatedAt;

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new DateTimeImmutable();
        if (!isset($this->createdAt)) {
            $this->createdAt = $now;
        }
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new DateTimeImmutable();
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

    public function getTaskCode(): string
    {
        return $this->taskCode;
    }

    public function setTaskCode(string $taskCode): self
    {
        $this->taskCode = $taskCode;
        return $this;
    }

    public function getLabel(): ?string
    {
        return $this->label;
    }

    public function setLabel(?string $label): self
    {
        $this->label = $label;
        return $this;
    }

    public function getFrequencyWeeks(): ?int
    {
        return $this->frequencyWeeks;
    }

    public function setFrequencyWeeks(?int $frequencyWeeks): self
    {
        $this->frequencyWeeks = $frequencyWeeks;
        return $this;
    }

    public function getFrequencyMonths(): ?int
    {
        return $this->frequencyMonths;
    }

    public function setFrequencyMonths(?int $frequencyMonths): self
    {
        $this->frequencyMonths = $frequencyMonths;
        return $this;
    }

    public function getLastDoneAt(): ?DateTimeImmutable
    {
        return $this->lastDoneAt;
    }

    public function setLastDoneAt(?DateTimeImmutable $lastDoneAt): self
    {
        $this->lastDoneAt = $lastDoneAt;
        return $this;
    }

    public function getNextDueAt(): ?DateTimeImmutable
    {
        return $this->nextDueAt;
    }

    public function setNextDueAt(?DateTimeImmutable $nextDueAt): self
    {
        $this->nextDueAt = $nextDueAt;
        return $this;
    }

    public function isEnabled(): bool
    {
        return $this->isEnabled;
    }

    public function setIsEnabled(bool $isEnabled): self
    {
        $this->isEnabled = $isEnabled;
        return $this;
    }

    public function getCreatedAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(DateTimeImmutable $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }
}