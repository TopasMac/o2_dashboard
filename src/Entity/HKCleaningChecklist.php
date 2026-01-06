<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use App\Repository\HKCleaningChecklistRepository;

#[ORM\Entity(repositoryClass: HKCleaningChecklistRepository::class)]
#[ORM\Table(name: 'hk_cleaning_checklist')]
#[ORM\HasLifecycleCallbacks]
class HKCleaningChecklist
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    /**
     * ID of the cleaning record in the HK cleanings table.
     * We keep this as an integer for now to avoid coupling to a specific
     * entity name; it can be upgraded to a proper relation later.
     */
    #[ORM\Column(type: 'integer')]
    private ?int $cleaningId = null;

    /**
     * Cleaner (employee) who submitted the checklist.
     */
    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: false)]
    private ?Employee $cleaner = null;

    /**
     * When the checklist was submitted.
     */
    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $submittedAt = null;

    /**
     * When the checklist was last updated (admin or cleaner edits).
     */
    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $updatedAt = null;

    /**
     * JSON payload with the checklist items and their states.
     */
    #[ORM\Column(type: 'json')]
    private array $checklistData = [];

    /**
     * Optional version tag for the checklist template (e.g. "v1").
     */
    #[ORM\Column(type: 'string', length: 20)]
    private string $checklistVersion = 'v1';

    /**
     * Free-text notes left by the cleaner.
     */
    #[ORM\Column(name: 'cleaning_notes', type: 'text', nullable: true)]
    private ?string $cleaningNotes = null;

    /**
     * True if any issue was found (notes present or any item flagged as issue).
     */
    #[ORM\Column(type: 'boolean')]
    private bool $hasIssues = false;

    // -------------------- Getters / Setters --------------------

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCleaningId(): ?int
    {
        return $this->cleaningId;
    }

    public function setCleaningId(int $cleaningId): self
    {
        $this->cleaningId = $cleaningId;

        return $this;
    }

    public function getCleaner(): ?Employee
    {
        return $this->cleaner;
    }

    public function setCleaner(?Employee $cleaner): self
    {
        $this->cleaner = $cleaner;

        return $this;
    }

    public function getSubmittedAt(): ?\DateTimeInterface
    {
        return $this->submittedAt;
    }

    public function setSubmittedAt(\DateTimeInterface $submittedAt): self
    {
        $this->submittedAt = $submittedAt;

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

    public function getChecklistData(): array
    {
        return $this->checklistData;
    }

    public function setChecklistData(array $checklistData): self
    {
        $this->checklistData = $checklistData;

        return $this;
    }

    public function getChecklistVersion(): string
    {
        return $this->checklistVersion;
    }

    public function setChecklistVersion(string $checklistVersion): self
    {
        $this->checklistVersion = $checklistVersion;

        return $this;
    }

    public function getCleaningNotes(): ?string
    {
        return $this->cleaningNotes;
    }

    public function setCleaningNotes(?string $cleaningNotes): self
    {
        $this->cleaningNotes = $cleaningNotes;

        return $this;
    }

    public function hasIssues(): bool
    {
        return $this->hasIssues;
    }

    public function setHasIssues(bool $hasIssues): self
    {
        $this->hasIssues = $hasIssues;

        return $this;
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        if ($this->updatedAt === null) {
            $this->updatedAt = new \DateTimeImmutable();
        }
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }
}
