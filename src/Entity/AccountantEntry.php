<?php

declare(strict_types=1);

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'accountant_entry',
    uniqueConstraints: [new ORM\UniqueConstraint(name: 'uniq_row_hash', columns: ['row_hash'])],
    indexes: [
        new ORM\Index(name: 'idx_group_key', columns: ['group_key']),
        new ORM\Index(name: 'idx_is_active', columns: ['is_active']),
        new ORM\Index(name: 'idx_superseded_at', columns: ['superseded_at'])
    ]
)]
class AccountantEntry
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: AccountantImport::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private AccountantImport $import;

    // --- Dates & raw source ---
    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $fechaOn;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $fechaRaw = null;

    // --- Categorization ---
    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $tipoMovimiento = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $tipoPago = null;

    #[ORM\Column(type: 'string', length: 512, nullable: true)]
    private ?string $concepto = null;

    // --- Money ---
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $deposito = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $comision = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $montoDisponible = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $montoContable = null;

    // --- Hashing/identity ---
    #[ORM\Column(type: 'string', length: 64)]
    private string $rowHash;

    #[ORM\Column(type: 'string', length: 64)]
    private string $groupKey;

    // --- Smart replace lifecycle ---
    #[ORM\Column(type: 'boolean')]
    private bool $isActive = true;

    #[ORM\Column(type: 'string', length: 64, nullable: true)]
    private ?string $supersededByRowHash = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $supersededAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $changeSummary = null;

    // --- Import source metadata ---
    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $sourceRowNumber = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $sourceFileName = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $sourceSheetName = null;

    // --- User notes ---
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    // --- Bank reconciliation metadata ---
    // When this entry was reconciled/checked in Bank Recon
    #[ORM\Column(name: 'recon_checked_at', type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $reconCheckedAt = null;

    // User ID who performed the reconciliation (nullable for now)
    #[ORM\Column(name: 'recon_checked_by', type: 'integer', nullable: true)]
    private ?int $reconCheckedBy = null;

    // Matched airbnb_payout ID (for auditing/back-links)
    #[ORM\Column(name: 'recon_payout_id', type: 'integer', nullable: true)]
    private ?int $reconPayoutId = null;

    // ---------------- Getters / Setters ----------------
    public function getId(): ?int { return $this->id; }

    public function getImport(): AccountantImport { return $this->import; }
    public function setImport(AccountantImport $import): self { $this->import = $import; return $this; }

    public function getFechaOn(): \DateTimeImmutable { return $this->fechaOn; }
    public function setFechaOn(\DateTimeImmutable $fechaOn): self { $this->fechaOn = $fechaOn; return $this; }

    public function getFechaRaw(): ?string { return $this->fechaRaw; }
    public function setFechaRaw(?string $fechaRaw): self { $this->fechaRaw = $fechaRaw; return $this; }

    public function getTipoMovimiento(): ?string { return $this->tipoMovimiento; }
    public function setTipoMovimiento(?string $tipoMovimiento): self { $this->tipoMovimiento = $tipoMovimiento; return $this; }

    public function getTipoPago(): ?string { return $this->tipoPago; }
    public function setTipoPago(?string $tipoPago): self { $this->tipoPago = $tipoPago; return $this; }

    public function getConcepto(): ?string { return $this->concepto; }
    public function setConcepto(?string $concepto): self { $this->concepto = $concepto; return $this; }

    public function getDeposito(): ?string { return $this->deposito; }
    public function setDeposito(?string $deposito): self { $this->deposito = $deposito; return $this; }

    public function getComision(): ?string { return $this->comision; }
    public function setComision(?string $comision): self { $this->comision = $comision; return $this; }

    public function getMontoDisponible(): ?string { return $this->montoDisponible; }
    public function setMontoDisponible(?string $montoDisponible): self { $this->montoDisponible = $montoDisponible; return $this; }

    public function getRowHash(): string { return $this->rowHash; }
    public function setRowHash(string $rowHash): self { $this->rowHash = $rowHash; return $this; }

    public function getGroupKey(): string { return $this->groupKey; }
    public function setGroupKey(string $groupKey): self { $this->groupKey = $groupKey; return $this; }

    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $isActive): self { $this->isActive = $isActive; return $this; }

    public function getSupersededByRowHash(): ?string { return $this->supersededByRowHash; }
    public function setSupersededByRowHash(?string $supersededByRowHash): self { $this->supersededByRowHash = $supersededByRowHash; return $this; }

    public function getSupersededAt(): ?\DateTimeImmutable { return $this->supersededAt; }
    public function setSupersededAt(?\DateTimeImmutable $supersededAt): self { $this->supersededAt = $supersededAt; return $this; }

    public function getChangeSummary(): ?string { return $this->changeSummary; }
    public function setChangeSummary(?string $changeSummary): self { $this->changeSummary = $changeSummary; return $this; }

    public function getSourceRowNumber(): ?int { return $this->sourceRowNumber; }
    public function setSourceRowNumber(?int $sourceRowNumber): self { $this->sourceRowNumber = $sourceRowNumber; return $this; }

    public function getSourceFileName(): ?string { return $this->sourceFileName; }
    public function setSourceFileName(?string $sourceFileName): self { $this->sourceFileName = $sourceFileName; return $this; }

    public function getSourceSheetName(): ?string { return $this->sourceSheetName; }
    public function setSourceSheetName(?string $sourceSheetName): self { $this->sourceSheetName = $sourceSheetName; return $this; }

    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $notes): self { $this->notes = $notes; return $this; }

    public function getMontoContable(): ?string { return $this->montoContable; }
    public function setMontoContable(?string $montoContable): self { $this->montoContable = $montoContable; return $this; }

    public function getReconCheckedAt(): ?\DateTimeInterface { return $this->reconCheckedAt; }
    public function setReconCheckedAt(?\DateTimeInterface $dt): self { $this->reconCheckedAt = $dt; return $this; }

    public function getReconCheckedBy(): ?int { return $this->reconCheckedBy; }
    public function setReconCheckedBy(?int $userId): self { $this->reconCheckedBy = $userId; return $this; }

    public function getReconPayoutId(): ?int { return $this->reconPayoutId; }
    public function setReconPayoutId(?int $payoutId): self { $this->reconPayoutId = $payoutId; return $this; }
}