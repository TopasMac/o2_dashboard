<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Delete;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;
use Doctrine\DBAL\Types\Types;

#[ORM\Entity]
#[ORM\Table(name: 'o2transactions')]
#[ORM\UniqueConstraint(name: 'uniq_o2tx_code', columns: ['transaction_code'])]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    normalizationContext: ['groups' => ['o2tx:read']],
    denormalizationContext: ['groups' => ['o2tx:write']],
    operations: [new Get(), new GetCollection(), new Post(), new Patch(), new Delete()]
)]
class O2Transactions
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    #[Groups(['o2tx:read'])]
    private ?int $id = null;

    /**
     * Owners2 cost centre scope. Allowed values: Owners2, Owners2_Playa, Owners2_Tulum
     */
    #[ORM\Column(type: Types::STRING, length: 32)]
    #[Assert\Choice(choices: ['Owners2','Owners2_Playa','Owners2_Tulum','Housekeepers'])]
    #[Groups(['o2tx:read','o2tx:write'])]
    private string $costCentre = 'Owners2';

    /**
     * City is derived from costCentre. We store it and refresh via lifecycle callbacks so DB/UI never drift.
     */
    #[ORM\Column(type: Types::STRING, length: 30)]
    #[Groups(['o2tx:read'])]
    private string $city = 'General';

    /** Unique code like O2ABC123 */
    #[ORM\Column(name: 'transaction_code', type: Types::STRING, length: 32, unique: true)]
    #[Assert\NotBlank]
    #[Groups(['o2tx:read','o2tx:write'])]
    private string $transactionCode;

    #[ORM\Column(type: Types::DATE_MUTABLE)]
    #[Assert\NotNull]
    #[Groups(['o2tx:read','o2tx:write'])]
    private \DateTimeInterface $date;

    /** Category from transaction_category */
    #[ORM\ManyToOne(targetEntity: TransactionCategory::class)]
    #[ORM\JoinColumn(name: 'category_id', referencedColumnName: 'id', nullable: false, onDelete: 'RESTRICT')]
    #[Assert\NotNull]
    #[Groups(['o2tx:read','o2tx:write'])]
    private ?TransactionCategory $category = null;

    /** Direction of the transaction: Ingreso (income) or Gasto (expense) */
    #[ORM\Column(type: Types::STRING, length: 10)]
    #[Assert\Choice(choices: ['Ingreso','Gasto'])]
    #[Groups(['o2tx:read','o2tx:write'])]
    private string $type; // 'Ingreso' | 'Gasto'

    #[ORM\Column(type: Types::STRING, length: 255, nullable: true)]
    #[Groups(['o2tx:read','o2tx:write'])]
    private ?string $description = null;

    /** Always store as positive. Reporting can sign by type if needed. */
    #[ORM\Column(type: Types::DECIMAL, precision: 12, scale: 2)]
    #[Assert\Positive]
    #[Groups(['o2tx:read','o2tx:write'])]
    private string $amount; // Doctrine stores DECIMAL as string

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['o2tx:read','o2tx:write'])]
    private ?string $comments = null;

    #[ORM\Column(type: Types::BOOLEAN, options: ['default' => false])]
    #[Groups(['o2tx:read','o2tx:write'])]
    private bool $private = false;

    #[ORM\Column(type: Types::STRING, length: 120, nullable: true)]
    #[Groups(['o2tx:read','o2tx:write'])]
    private ?string $createdBy = null;

    #[ORM\Column(type: Types::STRING, length: 120, nullable: true)]
    #[Groups(['o2tx:read','o2tx:write'])]
    private ?string $updatedBy = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    #[Groups(['o2tx:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    #[Groups(['o2tx:read'])]
    private ?\DateTimeImmutable $updatedAt = null;

    // ---------- Lifecycle ----------

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $this->syncCityFromCostCentre();
        $now = new \DateTimeImmutable();
        if (!$this->createdAt) {
            $this->createdAt = \DateTimeImmutable::createFromFormat('Y-m-d', $now->format('Y-m-d')) ?: $now;
        }
        $this->updatedAt = null;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->syncCityFromCostCentre();
    }

    private function syncCityFromCostCentre(): void
    {
        $this->city = match ($this->costCentre) {
            'Owners2_Playa' => 'Playa del Carmen',
            'Owners2_Tulum' => 'Tulum',
            'Housekeepers' => 'General',
            default => 'General',
        };
    }

    // ---------- Getters / Setters ----------

    public function getId(): ?int { return $this->id; }

    public function getCostCentre(): string { return $this->costCentre; }
    public function setCostCentre(string $costCentre): self
    {
        $this->costCentre = $costCentre;
        // keep city in sync at runtime too
        $this->syncCityFromCostCentre();
        return $this;
    }

    public function getCity(): string { return $this->city; }
    // No setCity(): city is derived

    public function getTransactionCode(): string { return $this->transactionCode; }
    public function setTransactionCode(string $transactionCode): self
    {
        $this->transactionCode = $transactionCode;
        return $this;
    }

    public function getDate(): \DateTimeInterface { return $this->date; }
    public function setDate(\DateTimeInterface $date): self { $this->date = $date; return $this; }

    public function getCategory(): ?TransactionCategory { return $this->category; }
    public function setCategory(?TransactionCategory $category): self { $this->category = $category; return $this; }

    public function getType(): string { return $this->type; }
    public function setType(string $type): self { $this->type = $type; return $this; }

    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $description): self { $this->description = $description; return $this; }

    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $amount): self { $this->amount = $amount; return $this; }

    public function getComments(): ?string { return $this->comments; }
    public function setComments(?string $comments): self { $this->comments = $comments; return $this; }

    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $createdBy): self { $this->createdBy = $createdBy; return $this; }

    public function getUpdatedBy(): ?string { return $this->updatedBy; }
    public function setUpdatedBy(?string $updatedBy): self { $this->updatedBy = $updatedBy; return $this; }

    public function getCreatedAt(): ?\DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(?\DateTimeImmutable $createdAt): self { $this->createdAt = $createdAt; return $this; }

    public function getUpdatedAt(): ?\DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeImmutable $updatedAt): self { $this->updatedAt = $updatedAt; return $this; }

    public function isPrivate(): bool { return $this->private; }
    public function setPrivate(bool $private): self { $this->private = $private; return $this; }

    #[Groups(['o2tx:read'])]
    public function getDocumentUrl(): ?string
    {
        // Build a deterministic S3 URL for the (single) document attached to this O2 transaction
        // Pattern: o2transactions/{costCentreSlug}/{categoryId}/{TYPE}_{YYYYMMDD}_tx{ID}.pdf
        if (!$this->id || !$this->date || !$this->category) {
            return null; // insufficient info
        }
        $bucket = $_ENV['AWS_S3_BUCKET'] ?? getenv('AWS_S3_BUCKET') ?: 'owners2-unit-documents';
        $region = $_ENV['AWS_S3_REGION'] ?? getenv('AWS_S3_REGION') ?: 'us-east-2';

        $centreSlug = self::slugify((string)$this->costCentre);
        $categoryId = $this->category?->getId();
        if (!$categoryId) {
            return null;
        }
        $type = strtoupper($this->type ?: 'DOC');
        $date = $this->date instanceof \DateTimeInterface ? $this->date->format('Ymd') : null;
        if (!$date) {
            return null;
        }
        $key = sprintf(
            'o2transactions/%s/%s/%s_%s_tx%s.pdf',
            $centreSlug,
            $categoryId,
            $type,
            $date,
            $this->id
        );
        return sprintf('https://%s.s3.%s.amazonaws.com/%s', $bucket, $region, $key);
    }

    private static function slugify(string $value): string
    {
        $v = iconv('UTF-8', 'ASCII//TRANSLIT', $value);
        $v = strtolower($v ?? $value);
        $v = preg_replace('/[^a-z0-9]+/i', '_', $v);
        $v = trim($v, '_');
        return $v === '' ? 'owners2' : $v;
    }
}
