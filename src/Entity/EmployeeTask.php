<?php

namespace App\Entity;

use App\Repository\EmployeeTaskRepository;
use Doctrine\ORM\Mapping as ORM;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use App\Entity\Employee;
use App\Entity\Unit;
use App\Entity\EmployeeTaskComment;
use App\Entity\UnitDocumentAttachment;
use App\Entity\UnitMaintenanceSchedule;

#[ORM\Entity(repositoryClass: EmployeeTaskRepository::class)]
#[ORM\Table(name: 'employee_task')]
class EmployeeTask
{
    public const STATUS_OPEN = 'open';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_NEEDS_HELP = 'needs_help';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_REVIEWED = 'reviewed';
    public const STATUS_ARCHIVED = 'archived';

    public const PRIORITY_LOW = 'low';
    public const PRIORITY_NORMAL = 'normal';
    public const PRIORITY_HIGH = 'high';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // Employee the task is assigned to
    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: false)]
    private ?Employee $employee = null;

    // Task creator/admin/manager
    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: true)]
    private ?Employee $createdBy = null;

    // Last employee/admin who updated the task
    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: true)]
    private ?Employee $updatedBy = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: true)]
    private ?Unit $unit = null;

    // Optional link to a recurring unit maintenance schedule row, when this task
    // was auto-generated as part of preventive maintenance.
    #[ORM\ManyToOne(targetEntity: UnitMaintenanceSchedule::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?UnitMaintenanceSchedule $maintenanceSchedule = null;

    #[ORM\Column(type: 'string', length: 255)]
    private string $title;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'string', length: 50)]
    private string $status = self::STATUS_OPEN;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $oldStatus = null;

    #[ORM\Column(type: 'string', length: 20)]
    private string $priority = self::PRIORITY_NORMAL;

    #[ORM\Column(type: 'datetime')]
    private \DateTimeInterface $createdAt;

    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $updatedAt = null;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $dueDate = null;

    /**
     * @var Collection<int, EmployeeTaskComment>
     */
    #[ORM\OneToMany(
        mappedBy: 'task',
        targetEntity: EmployeeTaskComment::class,
        cascade: ['persist', 'remove'],
        orphanRemoval: true
    )]
    private Collection $comments;

    /**
     * @var Collection<int, UnitDocumentAttachment>
     */
    #[ORM\OneToMany(
        mappedBy: 'employeeTask',
        targetEntity: UnitDocumentAttachment::class,
        cascade: ['persist'],
        orphanRemoval: false
    )]
    private Collection $attachments;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->priority = self::PRIORITY_NORMAL;
        $this->status = self::STATUS_OPEN;
        $this->comments = new ArrayCollection();
        $this->attachments = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmployee(): ?Employee
    {
        return $this->employee;
    }

    public function setEmployee(?Employee $employee): self
    {
        $this->employee = $employee;
        return $this;
    }

    public function getCreatedBy(): ?Employee
    {
        return $this->createdBy;
    }

    public function setCreatedBy(?Employee $createdBy): self
    {
        $this->createdBy = $createdBy;
        return $this;
    }

    public function getUpdatedBy(): ?Employee
    {
        return $this->updatedBy;
    }

    public function setUpdatedBy(?Employee $updatedBy): self
    {
        $this->updatedBy = $updatedBy;
        return $this;
    }

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    public function setUnit(?Unit $unit): self
    {
        $this->unit = $unit;
        return $this;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function setTitle(string $title): self
    {
        $this->title = $title;
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

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function setNotes(?string $notes): self
    {
        $this->notes = $notes;
        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): self
    {
        $this->status = $status;
        return $this;
    }

    public function getOldStatus(): ?string
    {
        return $this->oldStatus;
    }

    public function setOldStatus(?string $oldStatus): self
    {
        $this->oldStatus = $oldStatus;
        return $this;
    }

    public function getPriority(): string
    {
        return $this->priority;
    }

    public function setPriority(string $priority): self
    {
        $this->priority = $priority;
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

    public function getUpdatedAt(): ?\DateTimeInterface
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?\DateTimeInterface $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }

    public function getDueDate(): ?\DateTimeInterface
    {
        return $this->dueDate;
    }

    public function setDueDate(?\DateTimeInterface $dueDate): self
    {
        $this->dueDate = $dueDate;
        return $this;
    }

    /**
     * @return Collection<int, EmployeeTaskComment>
     */
    public function getComments(): Collection
    {
        return $this->comments;
    }

    public function addComment(EmployeeTaskComment $comment): self
    {
        if (!$this->comments->contains($comment)) {
            $this->comments[] = $comment;
            $comment->setTask($this);
        }

        return $this;
    }

    public function removeComment(EmployeeTaskComment $comment): self
    {
        if ($this->comments->removeElement($comment)) {
            // set the owning side to null (unless already changed)
            if ($comment->getTask() === $this) {
                $comment->setTask(null);
            }
        }

        return $this;
    }

    /**
     * @return Collection<int, UnitDocumentAttachment>
     */
    public function getAttachments(): Collection
    {
        return $this->attachments;
    }

    public function addAttachment(UnitDocumentAttachment $attachment): self
    {
        if (!$this->attachments->contains($attachment)) {
            $this->attachments[] = $attachment;
            if (method_exists($attachment, 'setEmployeeTask')) {
                $attachment->setEmployeeTask($this);
            }
        }

        return $this;
    }

    public function removeAttachment(UnitDocumentAttachment $attachment): self
    {
        if ($this->attachments->removeElement($attachment)) {
            if (method_exists($attachment, 'getEmployeeTask') && $attachment->getEmployeeTask() === $this) {
                $attachment->setEmployeeTask(null);
            }
        }

        return $this;
    }
    public function getMaintenanceSchedule(): ?UnitMaintenanceSchedule
    {
        return $this->maintenanceSchedule;
    }

    public function setMaintenanceSchedule(?UnitMaintenanceSchedule $maintenanceSchedule): self
    {
        $this->maintenanceSchedule = $maintenanceSchedule;
        return $this;
    }
}
