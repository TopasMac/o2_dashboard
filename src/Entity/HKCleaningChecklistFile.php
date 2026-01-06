<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'hk_cleaning_checklist_files')]
class HKCleaningChecklistFile
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    /**
     * FK → HKCleaningChecklist
     */
    #[ORM\ManyToOne(targetEntity: HKCleaningChecklist::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?HKCleaningChecklist $checklist = null;

    /**
     * Stored file path (S3 or local).
     */
    #[ORM\Column(type: 'string', length: 255)]
    private ?string $path = null;

    /**
     * Original filename.
     */
    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $filename = null;

    /**
     * Mime type (image/jpeg, etc.).
     */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $mimeType = null;

    /**
     * File size in bytes.
     */
    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $size = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $uploadedAt = null;


    // -------------------- Getters & Setters --------------------

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getChecklist(): ?HKCleaningChecklist
    {
        return $this->checklist;
    }

    public function setChecklist(HKCleaningChecklist $checklist): self
    {
        $this->checklist = $checklist;
        return $this;
    }

    public function getPath(): ?string
    {
        return $this->path;
    }

    public function setPath(?string $path): self
    {
        $this->path = $path;
        return $this;
    }

    public function getFilename(): ?string
    {
        return $this->filename;
    }

    public function setFilename(?string $filename): self
    {
        $this->filename = $filename;
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

    public function getUploadedAt(): ?\DateTimeInterface
    {
        return $this->uploadedAt;
    }

    public function setUploadedAt(\DateTimeInterface $uploadedAt): self
    {
        $this->uploadedAt = $uploadedAt;
        return $this;
    }
}
