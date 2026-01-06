<?php

namespace App\Entity;

use App\Repository\EmployeeTaskAttachmentRepository;
use Doctrine\ORM\Mapping as ORM;
use App\Entity\EmployeeTask;
use App\Entity\Employee;

/**
 * Attachments for employee tasks.
 *
 * Intentionally separate from UnitDocument/UnitDocumentAttachment because:
 * - Tasks may or may not be bound to a Unit.
 * - These files are more "workflow artifacts" (photos, screenshots, notes)
 *   than long‑term unit documents (contracts, HOA rules, etc.).
 * - Keeping a dedicated entity keeps the ACL and lifecycle focused on tasks.
 *
 * We can still reuse the same upload service/infra (e.g. S3, local paths),
 * by pointing the upload logic at this entity instead of duplicating storage.
 */
#[ORM\Entity(repositoryClass: EmployeeTaskAttachmentRepository::class)]
#[ORM\Table(name: 'employee_task_attachment')]
class EmployeeTaskAttachment
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // Parent task
    #[ORM\ManyToOne(targetEntity: EmployeeTask::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: "CASCADE")]
    private ?EmployeeTask $task = null;

    // Who uploaded the file (employee or admin/manager)
    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: true)]
    private ?Employee $uploadedBy = null;

    // Stored file path or URL (depending on your storage strategy)
    #[ORM\Column(type: 'string', length: 255)]
    private string $path;

    // Original filename for UI display
    #[ORM\Column(type: 'string', length: 255)]
    private string $originalName;

    #[ORM\Column(type: 'string', length: 150, nullable: true)]
    private ?string $mimeType = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $size = null;

    #[ORM\Column(type: 'datetime')]
    private \DateTimeInterface $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getTask(): ?EmployeeTask
    {
        return $this->task;
    }

    public function setTask(?EmployeeTask $task): self
    {
        $this->task = $task;
        return $this;
    }

    public function getUploadedBy(): ?Employee
    {
        return $this->uploadedBy;
    }

    public function setUploadedBy(?Employee $uploadedBy): self
    {
        $this->uploadedBy = $uploadedBy;
        return $this;
    }

    public function getPath(): string
    {
        return $this->path;
    }

    public function setPath(string $path): self
    {
        $this->path = $path;
        return $this;
    }

    public function getOriginalName(): string
    {
        return $this->originalName;
    }

    public function setOriginalName(string $originalName): self
    {
        $this->originalName = $originalName;
        return $this;
    }

    public function getMimeType(): ?string
    {
        return $this->mimeType;
    }

    public function setMimeType(?string $mimeType): self
    {
        $this->mimeType = $mimeType;
        return $this;
    }

    public function getSize(): ?int
    {
        return $this->size;
    }

    public function setSize(?int $size): self
    {
        $this->size = $size;
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
}
