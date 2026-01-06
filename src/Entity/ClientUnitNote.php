<?php

namespace App\Entity;

use ApiPlatform\Core\Annotation\ApiFilter; // for API Platform v2 fallback
use ApiPlatform\Core\Bridge\Doctrine\Orm\Filter\OrderFilter as LegacyOrderFilter; // v2
use ApiPlatform\Core\Bridge\Doctrine\Orm\Filter\SearchFilter as LegacySearchFilter; // v2
use ApiPlatform\Metadata\ApiFilter as ApiFilterV3; // v3
use ApiPlatform\Metadata\ApiResource; // v3
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Put;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter; // v3
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter; // v3
use App\Entity\User;
use App\State\ClientUnitNoteCreateProcessor;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/**
 * Unified notes entity to store both monthly REPORT notes and ongoing LOG notes.
 */
#[ORM\Entity]
#[ORM\Table(name: 'client_unit_note')]
#[ORM\Index(columns: ['unit_id','entry_type','note_year_month'], name: 'idx_unit_type_month')]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(),
        new Put(),
        new Delete(),
        new Post(processor: ClientUnitNoteCreateProcessor::class),
    ],
    paginationEnabled: true,
    normalizationContext: ['groups' => ['note:read']],
    denormalizationContext: ['groups' => ['note:write']],
    order: ['createdAt' => 'DESC']
)]
// API Platform v3 filters
#[ApiFilterV3(SearchFilter::class, properties: [
    'unit.id' => 'exact',
    'entryType' => 'exact',
    'yearMonth' => 'exact',
])]
#[ApiFilterV3(OrderFilter::class, properties: ['createdAt', 'updatedAt'])]
// API Platform v2 filters (kept for compatibility if project still uses v2 components somewhere)
#[ApiFilter(LegacySearchFilter::class, properties: [
    'unit.id' => 'exact',
    'entryType' => 'exact',
    'yearMonth' => 'exact',
])]
#[ApiFilter(LegacyOrderFilter::class, properties: ['createdAt', 'updatedAt'])]
class ClientUnitNote
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['note:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['note:read', 'note:write'])]
    private ?Unit $unit = null;

    /**
     * 'REPORT' | 'LOG'
     */
    #[ORM\Column(length: 16)]
    #[Assert\NotBlank]
    #[Assert\Choice(choices: ['REPORT', 'LOG'])]
    #[Groups(['note:read', 'note:write'])]
    private string $entryType = 'REPORT';

    /**
     * Required when entryType = REPORT, nullable when entryType = LOG.
     * Format: YYYY-MM
     */
    #[ORM\Column(name: 'note_year_month', type: Types::STRING, length: 7, nullable: true)]
    #[Groups(['note:read', 'note:write'])]
    private ?string $yearMonth = null;

    #[ORM\Column(name: 'note_comment', type: Types::TEXT)]
    #[Assert\NotBlank]
    #[Groups(['note:read', 'note:write'])]
    private string $comment = '';

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[Groups(['note:read'])]
    private ?User $author = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    #[Groups(['note:read'])]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    #[Groups(['note:read'])]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $this->createdAt ?? $now;
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    /**
     * Conditional validation: yearMonth required for REPORT; optional for LOG.
     */
    #[Assert\Callback]
    public function validate(ExecutionContextInterface $context): void
    {
        if ($this->entryType === 'REPORT') {
            if (!$this->yearMonth) {
                $context->buildViolation('yearMonth is required for REPORT notes.')
                    ->atPath('yearMonth')
                    ->addViolation();
            } elseif (!preg_match('/^\\d{4}-\\d{2}$/', $this->yearMonth ?? '')) {
                $context->buildViolation('yearMonth must be in YYYY-MM format.')
                    ->atPath('yearMonth')
                    ->addViolation();
            }
        }
    }

    // Getters & setters
    public function getId(): ?int { return $this->id; }

    public function getUnit(): ?Unit { return $this->unit; }
    public function setUnit(?Unit $unit): self { $this->unit = $unit; return $this; }

    public function getEntryType(): string { return $this->entryType; }
    public function setEntryType(string $entryType): self {
        $this->entryType = strtoupper($entryType);
        return $this;
    }

    public function getYearMonth(): ?string { return $this->yearMonth; }
    public function setYearMonth(?string $yearMonth): self { $this->yearMonth = $yearMonth; return $this; }

    public function getComment(): string { return $this->comment; }
    public function setComment(string $comment): self { $this->comment = $comment; return $this; }

    public function getAuthor(): ?User { return $this->author; }
    public function setAuthor(?User $author): self { $this->author = $author; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(\DateTimeImmutable $createdAt): self { $this->createdAt = $createdAt; return $this; }

    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(\DateTimeImmutable $updatedAt): self { $this->updatedAt = $updatedAt; return $this; }

    #[Groups(['note:read'])]
    public function getAuthorLabel(): ?string
    {
        if (!$this->author) {
            return null;
        }
        // Try common name accessors first, fallback to email, then id
        if (method_exists($this->author, 'getName') && $this->author->getName()) {
            return $this->author->getName();
        }
        if (method_exists($this->author, 'getFullName') && $this->author->getFullName()) {
            return $this->author->getFullName();
        }
        if (method_exists($this->author, 'getEmail') && $this->author->getEmail()) {
            return $this->author->getEmail();
        }
        if (method_exists($this->author, 'getUserIdentifier') && $this->author->getUserIdentifier()) {
            return (string) $this->author->getUserIdentifier();
        }
        if (method_exists($this->author, 'getId')) {
            return (string) $this->author->getId();
        }
        return null;
    }

    #[Groups(['note:read'])]
    public function getUnitLabel(): ?string
    {
        if (!$this->unit) {
            return null;
        }
        // Prefer common unit name accessors
        if (method_exists($this->unit, 'getUnitName') && $this->unit->getUnitName()) {
            return (string) $this->unit->getUnitName();
        }
        if (method_exists($this->unit, 'getName') && $this->unit->getName()) {
            return (string) $this->unit->getName();
        }
        if (method_exists($this->unit, 'getId')) {
            return (string) $this->unit->getId();
        }
        return null;
    }
}