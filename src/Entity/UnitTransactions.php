<?php

namespace App\Entity;
use App\Entity\UnitDocument;
use App\Entity\EmailEvent;

use ApiPlatform\Metadata\ApiResource;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Serializer\Annotation\SerializedName;

use App\Repository\UnitTransactionsRepository;
use App\Entity\TransactionCategory;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\MaxDepth;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;

#[ApiResource(
    operations: [
        new \ApiPlatform\Metadata\Get(),
        new \ApiPlatform\Metadata\GetCollection(),
        new \ApiPlatform\Metadata\Post(),
        new \ApiPlatform\Metadata\Delete(),
        new \ApiPlatform\Metadata\Patch()
    ],
    normalizationContext: ['groups' => ['unit_transaction:read']]
)]
#[ORM\Entity(repositoryClass: UnitTransactionsRepository::class)]
#[ORM\HasLifecycleCallbacks]
class UnitTransactions
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['unit_transaction:read'])]
    private ?int $id = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false)]
    #[MaxDepth(1)]
    private ?Unit $unit = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    private ?\DateTimeImmutable $date = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $description = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2)]
    private ?string $amount = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $comments = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\Column(length: 255)]
    private ?string $type = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\Column(length: 255)]
    private ?string $costCenter = null;

    #[Groups(['unit_transaction:read'])]
    #[ORM\Column(type: 'string', length: 20, unique: true, nullable: true)]
    private ?string $transactionCode = null;

    // This is not persisted to the database; it's for form display purposes
    #[Groups(['unit_transaction:read'])]
    private ?string $unitName = null;

    #[ORM\ManyToOne(targetEntity: TransactionCategory::class)]
    #[ORM\JoinColumn(name: 'category_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    #[Groups(['unit_transaction:read'])]
    private ?TransactionCategory $category = null;

    #[ORM\OneToMany(
        mappedBy: 'transaction',
        targetEntity: UnitDocument::class,
        cascade: ['persist', 'remove'],
        orphanRemoval: true
    )]
    #[Groups(['unit_transaction:read'])]
    /** @var Collection<int, UnitDocument> */
    private Collection $unitDocuments;

    #[ORM\ManyToOne(targetEntity: EmailEvent::class)]
    #[ORM\JoinColumn(name: 'email_event_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?EmailEvent $emailEvent = null;

    public function __construct()
    {
        $this->unitDocuments = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    #[Groups(['unit_transaction:read'])]
    #[SerializedName('unitName')]
    public function getUnitNameSerialized(): ?string
    {
        // Use getUnitName() if available, otherwise fallback to getUnitId()
        // Adjust as needed based on actual Unit entity implementation
        return $this->unit?->getUnitName();
    }

    public function setUnit(?Unit $unit): self
    {
        $this->unit = $unit;
        return $this;
    }

    public function getDate(): ?\DateTimeImmutable
    {
        return $this->date;
    }

    public function setDate(?\DateTimeImmutable $date): self
    {
        $this->date = $date;
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

    public function getAmount(): ?string
    {
        return $this->amount;
    }

    public function setAmount(string $amount): self
    {
        $this->amount = $amount;
        return $this;
    }

    public function getComments(): ?string
    {
        return $this->comments;
    }

    public function setComments(?string $comments): self
    {
        $this->comments = $comments;
        return $this;
    }

    public function getType(): ?string
    {
        return $this->type;
    }

    public function setType(string $type): self
    {
        $this->type = $type;
        return $this;
    }

    public function getCostCenter(): ?string
    {
        return $this->costCenter;
    }

    public function setCostCenter(string $costCenter): self
    {
        $this->costCenter = $costCenter;
        return $this;
    }

    public function getUnitName(): ?string
    {
        return $this->unitName;
    }

    public function setUnitName(?string $unitName): self
    {
        $this->unitName = $unitName;
        return $this;
    }

    public function getCategory(): ?TransactionCategory
    {
        return $this->category;
    }

    public function getCategoryName(): ?string
    {
        return $this->category?->getName();
    }

    public function setCategory(?TransactionCategory $category): self
    {
        $this->category = $category;
        return $this;
    }

    #[Groups(['unit_transaction:read'])]
    public function getTransactionCode(): ?string
    {
        return $this->transactionCode;
    }

    public function setTransactionCode(?string $transactionCode): self
    {
        $this->transactionCode = $transactionCode;
        return $this;
    }
    #[ORM\PrePersist]
    public function generateTransactionCode(): void
    {
        if (!$this->transactionCode) {
            $this->transactionCode = 'O2T' . str_pad(random_int(1, 99999), 5, '0', STR_PAD_LEFT);
        }
    }
    /** @return Collection<int, UnitDocument> */
    public function getUnitDocuments(): Collection
    {
        return $this->unitDocuments;
    }

    public function addUnitDocument(UnitDocument $unitDocument): self
    {
        if (!$this->unitDocuments->contains($unitDocument)) {
            $this->unitDocuments[] = $unitDocument;
            $unitDocument->setTransaction($this);
        }

        return $this;
    }

    public function removeUnitDocument(UnitDocument $unitDocument): self
    {
        if ($this->unitDocuments->removeElement($unitDocument)) {
            // Set the owning side to null (unless already changed)
            if ($unitDocument->getTransaction() === $this) {
                $unitDocument->setTransaction(null);
            }
        }

        return $this;
    }

    #[Groups(['unit_transaction:read', 'unit_document:read'])]
    #[SerializedName('documentUrl')]
    public function getDocumentUrl(): ?string
    {
        if (!$this->unitDocuments || $this->unitDocuments->isEmpty()) {
            return null;
        }
        $first = $this->unitDocuments->first();
        if (!$first) return null;
        // Prefer S3 URL if available; fallback to legacy documentUrl accessor if it exists
        return method_exists($first, 'getS3Url') && $first->getS3Url()
            ? $first->getS3Url()
            : (method_exists($first, 'getDocumentUrl') ? $first->getDocumentUrl() : null);
    }

    #[Groups(['unit_transaction:read'])]
    #[SerializedName('emailEventId')]
    public function getEmailEventId(): ?int
    {
        return $this->emailEvent?->getId();
    }

    public function getEmailEvent(): ?EmailEvent
    {
        return $this->emailEvent;
    }

    public function setEmailEvent(?EmailEvent $emailEvent): self
    {
        $this->emailEvent = $emailEvent;
        return $this;
    }
}