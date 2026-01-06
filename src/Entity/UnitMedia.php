<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Delete;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Doctrine\DBAL\Types\Types;

#[ORM\Entity]
#[ORM\Table(name: 'unit_media')]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    normalizationContext: ['groups' => ['unitMedia:read']],
    denormalizationContext: ['groups' => ['unitMedia:write']],
    operations: [
        new Get(),
        new GetCollection(),
        new Post(),
        new Patch(),
        new Delete(),
    ]
)]
class UnitMedia
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    #[Groups(['unitMedia:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private ?Unit $unit = null;

    #[ORM\Column(type: Types::STRING, length: 255)]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private string $s3Key;

    #[ORM\Column(type: Types::STRING, length: 512)]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private string $url;

    #[ORM\Column(type: Types::STRING, length: 255, nullable: true)]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private ?string $caption = null;

    // Per-photo SEO/ALT text (for Wix and search engines)
    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private ?string $seoDescription = null;

    // Spanish (ES) localized fields
    #[ORM\Column(type: Types::STRING, length: 255, nullable: true)]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private ?string $captionEs = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private ?string $seoDescriptionEs = null;

    #[ORM\Column(type: Types::JSON, options: ['jsonb' => true], nullable: true)]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private ?array $tags = [];

    #[ORM\Column(type: Types::BOOLEAN, options: ['default' => false])]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private bool $isPublished = false;

    #[ORM\Column(type: Types::BOOLEAN, options: ['default' => false])]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private bool $isCover = false;

    #[ORM\Column(type: Types::INTEGER, options: ['default' => 0])]
    #[Groups(['unitMedia:read','unitMedia:write'])]
    private int $sortOrder = 0;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    #[Groups(['unitMedia:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: Types::DATETIME_MUTABLE)]
    #[Groups(['unitMedia:read'])]
    private ?\DateTime $updatedAt = null;

    // === Lifecycle ===
    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = \DateTime::createFromImmutable($now);

        // Ensure boolean defaults are explicitly set for new records
        $this->isPublished = $this->isPublished ?? false;
        $this->isCover = $this->isCover ?? false;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTime();
    }

    // === Getters/Setters ===
    public function getId(): ?int { return $this->id; }

    public function getUnit(): ?Unit { return $this->unit; }
    public function setUnit(?Unit $unit): self { $this->unit = $unit; return $this; }

    public function getS3Key(): string { return $this->s3Key; }
    public function setS3Key(string $s3Key): self { $this->s3Key = $s3Key; return $this; }

    public function getUrl(): string { return $this->url; }
    public function setUrl(string $url): self { $this->url = $url; return $this; }

    public function getCaption(): ?string { return $this->caption; }
    public function setCaption(?string $caption): self { $this->caption = $caption; return $this; }

    public function getSeoDescription(): ?string { return $this->seoDescription; }
    public function setSeoDescription(?string $seoDescription): self { $this->seoDescription = $seoDescription; return $this; }

    public function getCaptionEs(): ?string { return $this->captionEs; }
    public function setCaptionEs(?string $captionEs): self { $this->captionEs = $captionEs; return $this; }

    public function getSeoDescriptionEs(): ?string { return $this->seoDescriptionEs; }
    public function setSeoDescriptionEs(?string $seoDescriptionEs): self { $this->seoDescriptionEs = $seoDescriptionEs; return $this; }

    public function getTags(): array { return $this->tags ?? []; }
    public function setTags(?array $tags): self { $this->tags = $tags ?? []; return $this; }

    #[Groups(['unitMedia:read'])]
    public function isPublished(): bool { return $this->isPublished; }
    #[Groups(['unitMedia:write'])]
    public function setIsPublished(bool $isPublished): self { $this->isPublished = $isPublished; return $this; }

    #[Groups(['unitMedia:read'])]
    public function isCover(): bool { return $this->isCover; }
    #[Groups(['unitMedia:write'])]
    public function setIsCover(bool $isCover): self { $this->isCover = $isCover; return $this; }

    public function getSortOrder(): int { return $this->sortOrder; }
    public function setSortOrder(int $sortOrder): self { $this->sortOrder = $sortOrder; return $this; }

    public function getCreatedAt(): ?\DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(\DateTimeImmutable $createdAt): self { $this->createdAt = $createdAt; return $this; }

    public function getUpdatedAt(): ?\DateTime { return $this->updatedAt; }
    public function setUpdatedAt(\DateTime $updatedAt): self { $this->updatedAt = $updatedAt; return $this; }

    #[Groups(['unitMedia:read'])]
    public function getUnitName(): ?string { return $this->getUnit()?->getUnitName(); }

    #[Groups(['unitMedia:read'])]
    public function getCity(): ?string { return $this->getUnit()?->getCity(); }
}