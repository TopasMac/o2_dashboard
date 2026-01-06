<?php

namespace App\Entity;

use Symfony\Component\Serializer\Annotation\Groups;
use App\Entity\UnitTransactions;
use App\Entity\HKTransactions;
use App\Entity\UnitBalanceLedger;
use App\Entity\O2Transactions;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Patch;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Filesystem\Filesystem;
use Doctrine\ORM\Mapping\HasLifecycleCallbacks;
use Doctrine\ORM\Mapping\PostRemove;
use Symfony\Component\HttpFoundation\RequestStack;

#[ApiResource(
    operations: [
        new \ApiPlatform\Metadata\Get(),
        new \ApiPlatform\Metadata\GetCollection(),
        new \ApiPlatform\Metadata\Post(),
        new \ApiPlatform\Metadata\Patch(),
        new \ApiPlatform\Metadata\Put(),
        new \ApiPlatform\Metadata\Delete()
    ],
    normalizationContext: ['groups' => ['unit_document:read']],
    denormalizationContext: ['groups' => ['unit_document:write']]
)]

#[HasLifecycleCallbacks]
#[ORM\Entity]
#[ORM\Table(
    uniqueConstraints: [
        new ORM\UniqueConstraint(name: "uniq_ledger_category", columns: ["ledger_id", "category"])
    ]
)]
class UnitDocument
{
    private static ?RequestStack $requestStack = null;

    public static function setRequestStack(RequestStack $rs): void
    {
        self::$requestStack = $rs;
    }

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: "unit_id", referencedColumnName: "id", nullable: true)]
    #[Groups(['unit_document:read'])]
    private ?Unit $unit = null;

    #[ORM\Column(type: 'string', length: 100)]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private string $category;

    #[ORM\Column(type: 'string', length: 255)]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private string $filename;

    #[ORM\Column(type: 'string', length: 500)]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private string $s3Url;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private ?string $label = null;

    #[ORM\Column(type: 'datetime')]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private \DateTimeInterface $uploadedAt;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private ?string $uploadedBy = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    private ?string $documentUrl = null;

    #[ORM\ManyToOne(targetEntity: UnitTransactions::class, inversedBy: "unitDocuments", cascade: ["persist"])]
    #[ORM\JoinColumn(name: "transaction_id", referencedColumnName: "id", nullable: true, onDelete: "CASCADE")]
    #[Groups(['unit_transaction:read', 'unit_document:read', 'unit_document:write'])]
    #[\Symfony\Component\Serializer\Annotation\MaxDepth(1)]
    private ?UnitTransactions $transaction = null;

    #[ORM\ManyToOne(targetEntity: HKTransactions::class, inversedBy: "unitDocuments", cascade: ["persist"])]
    #[ORM\JoinColumn(name: "hk_transaction_id", referencedColumnName: "id", nullable: true, onDelete: "CASCADE")]
    #[Groups(['unit_document:read', 'unit_document:write'])]
    #[\Symfony\Component\Serializer\Annotation\MaxDepth(1)]
    private ?HKTransactions $hkTransaction = null;

    #[ORM\ManyToOne(targetEntity: UnitBalanceLedger::class, inversedBy: 'documents', cascade: ['persist'])]
    #[ORM\JoinColumn(name: 'ledger_id', referencedColumnName: 'id', nullable: true, onDelete: 'CASCADE')]
    #[Groups(['unit_document:read', 'unit_document:write'])]
    private ?UnitBalanceLedger $ledger = null;

    #[ORM\ManyToOne(targetEntity: O2Transactions::class, cascade: ['persist'])]
    #[ORM\JoinColumn(name: 'o2_transaction_id', referencedColumnName: 'id', nullable: true, onDelete: 'CASCADE')]
    #[Groups(['unit_document:read', 'unit_document:write'])]
    private ?O2Transactions $o2Transaction = null;

    public function __construct()
    {
        // Ensure typed properties are initialized before lifecycle callbacks
        $this->uploadedAt = new \DateTimeImmutable();
        if ($this->uploadedBy === null) {
            $this->uploadedBy = 'system';
        }
    }

    public function getId(): ?int
    {
        return $this->id;
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

    public function getCategory(): string
    {
        return $this->category;
    }

    public function setCategory(string $category): self
    {
        $this->category = $category;
        return $this;
    }

    public function getFilename(): string
    {
        return $this->filename;
    }

    public function setFilename(string $filename): self
    {
        $this->filename = $filename;
        return $this;
    }

    public function getS3Url(): string
    {
        return $this->s3Url;
    }

    public function setS3Url(string $s3Url): self
    {
        $this->s3Url = $s3Url;
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

    public function getUploadedAt(): \DateTimeInterface
    {
        return $this->uploadedAt;
    }

    public function setUploadedAt(\DateTimeInterface $uploadedAt): self
    {
        $this->uploadedAt = $uploadedAt;
        return $this;
    }

    public function getUploadedBy(): ?string
    {
        return $this->uploadedBy;
    }

    public function setUploadedBy(?string $uploadedBy): self
    {
        $this->uploadedBy = $uploadedBy;
        return $this;
    }

    public function getDocumentUrl(): ?string
    {
        return $this->documentUrl;
    }

    public function setDocumentUrl(?string $documentUrl): self
    {
        $this->documentUrl = $documentUrl;
        return $this;
    }

    public function getTransaction(): ?UnitTransactions
    {
        return $this->transaction;
    }

    public function setTransaction(?UnitTransactions $transaction): self
    {
        $this->transaction = $transaction;
        return $this;
    }

    public function getHkTransaction(): ?HKTransactions
    {
        return $this->hkTransaction;
    }

    public function setHkTransaction(?HKTransactions $hkTransaction): self
    {
        $this->hkTransaction = $hkTransaction;
        return $this;
    }
    public function getLedger(): ?UnitBalanceLedger
    {
        return $this->ledger;
    }

    public function setLedger(?UnitBalanceLedger $ledger): self
    {
        $this->ledger = $ledger;
        return $this;
    }
    #[PostRemove]
    public function deleteFileFromDisk(): void
    {
        $filesystem = new Filesystem();
        $projectDir = __DIR__ . '/../../..';
        $path = $projectDir . '/public' . $this->getDocumentUrl();
        if ($this->getDocumentUrl() && file_exists($path)) {
            error_log("Deleting file from disk after entity removal: " . $path);
            unlink($path);
        } else {
            error_log("PostRemove: File not found at: " . $path);
        }
    }

    #[Groups(['unit_transaction:read', 'unit_document:read', 'hktransactions:read'])]
    public function getPublicUrl(): ?string
    {
        // Prefer canonical S3 URL; fall back to legacy documentUrl
        $url = $this->getS3Url() ?: $this->getDocumentUrl();
        if (!$url) {
            return null;
        }
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }
        // Legacy local relative path support
        if (self::$requestStack && ($req = self::$requestStack->getCurrentRequest())) {
            return $req->getSchemeAndHttpHost() . $url;
        }
        return $url;
    }

    #[ORM\PrePersist]
    public function _autoOnCreate(): void
    {
        if (!$this->uploadedAt) { $this->uploadedAt = new \DateTimeImmutable(); }
        if (!$this->uploadedBy) { $this->uploadedBy = 'system'; }
    }

    public function getO2Transaction(): ?O2Transactions
    {
        return $this->o2Transaction;
    }

    public function setO2Transaction(?O2Transactions $o2Transaction): self
    {
        $this->o2Transaction = $o2Transaction;
        return $this;
    }
}