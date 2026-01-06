<?php

namespace App\Entity;

use App\Repository\SantanderEntryRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: SantanderEntryRepository::class)]
#[ORM\Table(name: 'santander_entry', uniqueConstraints: [
    new ORM\UniqueConstraint(name: 'uniq_santander_fingerprint', columns: ['fecha_on', 'concept', 'deposito', 'account_last4'])
])]
class SantanderEntry
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /**
     * Last 4 (or few) digits of the Santander account number, e.g. "2825".
     */
    #[ORM\Column(length: 16)]
    private ?string $accountLast4 = null;

    /**
     * Operation date (FECHA).
     */
    #[ORM\Column(type: 'date')]
    private ?\DateTimeInterface $fechaOn = null;

    /**
     * Operation time (HORA), nullable.
     */
    #[ORM\Column(type: 'time', nullable: true)]
    private ?\DateTimeInterface $hora = null;

    /**
     * Raw concept/description from the statement (CONCEPTO).
     */
    #[ORM\Column(type: 'string', length: 255)]
    private ?string $concept = null;

    /**
     * Retiro (debit) amount from the statement, if present.
     * Stored as string to preserve decimal precision.
     */
    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $retiro = null;

    /**
     * Deposito (credit) amount from the statement, if present.
     * Stored as string to preserve decimal precision.
     */
    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $deposito = null;

    /**
     * Currency (MONEDA), e.g. "MXN".
     */
    #[ORM\Column(type: 'string', length: 8, nullable: true)]
    private ?string $moneda = null;

    /**
     * Simple flag to indicate that this entry has been reviewed/handled
     * in the Santander view (for non-Airbnb payments, etc.).
     */
    #[ORM\Column(type: 'boolean')]
    private bool $checked = false;

    #[ORM\Column(type: 'datetime_immutable')]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    /**
     * Optional: original file name of the imported Santander statement.
     */
    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $sourceFileName = null;

    /**
     * Free-form notes added from the UI (e.g. classification or reconciliation notes).
     */
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getAccountLast4(): ?string
    {
        return $this->accountLast4;
    }

    public function setAccountLast4(?string $accountLast4): self
    {
        $this->accountLast4 = $accountLast4;

        return $this;
    }

    public function getFechaOn(): ?\DateTimeInterface
    {
        return $this->fechaOn;
    }

    public function setFechaOn(?\DateTimeInterface $fechaOn): self
    {
        $this->fechaOn = $fechaOn;

        return $this;
    }

    public function getHora(): ?\DateTimeInterface
    {
        return $this->hora;
    }

    public function setHora(?\DateTimeInterface $hora): self
    {
        $this->hora = $hora;

        return $this;
    }

    public function getConcept(): ?string
    {
        return $this->concept;
    }

    public function setConcept(?string $concept): self
    {
        $this->concept = $concept;

        return $this;
    }

    public function getRetiro(): ?string
    {
        return $this->retiro;
    }

    public function setRetiro(?string $retiro): self
    {
        $this->retiro = $retiro;

        return $this;
    }

    public function getDeposito(): ?string
    {
        return $this->deposito;
    }

    public function setDeposito(?string $deposito): self
    {
        $this->deposito = $deposito;

        return $this;
    }

    public function getMoneda(): ?string
    {
        return $this->moneda;
    }

    public function setMoneda(?string $moneda): self
    {
        $this->moneda = $moneda;

        return $this;
    }

    public function isChecked(): bool
    {
        return $this->checked;
    }

    public function setChecked(bool $checked): self
    {
        $this->checked = $checked;

        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;

        return $this;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?\DateTimeImmutable $updatedAt): self
    {
        $this->updatedAt = $updatedAt;

        return $this;
    }

    public function getSourceFileName(): ?string
    {
        return $this->sourceFileName;
    }

    public function setSourceFileName(?string $sourceFileName): self
    {
        $this->sourceFileName = $sourceFileName;

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
}
