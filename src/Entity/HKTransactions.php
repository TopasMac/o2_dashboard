<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use App\Repository\HKTransactionsRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;
use App\Validator\Constraints as AppAssert;
use Doctrine\Common\Collections\Collection;
use Doctrine\Common\Collections\ArrayCollection;
use App\Entity\UnitDocument;
use Symfony\Component\Serializer\Annotation\MaxDepth;

#[ApiResource(
    normalizationContext: ['groups' => ['hktransactions:read']],
    denormalizationContext: ['groups' => ['hktransactions:write']]
)]
#[AppAssert\HousekeepersAllocation]
#[ORM\Entity(repositoryClass: HKTransactionsRepository::class)]
class HKTransactions
{
    public const ALLOC_CLIENT = 'Client';
    public const ALLOC_OWNERS2 = 'Owners2';
    public const ALLOC_GUEST = 'Guest';
    public const ALLOC_HOUSEKEEPERS = 'Housekeepers';

    public const ALLOCATION_TARGETS = [
        self::ALLOC_CLIENT,
        self::ALLOC_OWNERS2,
        self::ALLOC_GUEST,
        self::ALLOC_HOUSEKEEPERS,
    ];
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['hktransactions:read'])]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?string $transactionCode = null;

    #[ORM\Column(type: 'date_immutable')]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?\DateTimeImmutable $date = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?Unit $unit = null;

    // allocationTarget: who we charge (Client, Owners2, Guest, Housekeepers)
    #[ORM\Column(type: 'string', length: 32, options: ["default" => "Client"])]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    #[Assert\Choice(choices: HKTransactions::ALLOCATION_TARGETS, message: 'Invalid allocation target.')]
    private ?string $allocationTarget = self::ALLOC_CLIENT;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    #[Assert\Choice(choices: ['Playa del Carmen', 'Tulum', 'General'], message: 'City must be Playa del Carmen, Tulum, or General.')]
    private ?string $city = null;

    #[ORM\ManyToOne(targetEntity: TransactionCategory::class)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?TransactionCategory $category = null;

    // costCentre: who pays (e.g. Owners2, Client, Guest)
    #[ORM\Column(type: 'string', length: 50)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?string $costCentre = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?string $description = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?string $notes = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, options: ["default" => "0.00"], nullable: true)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?string $paid = '0.00';

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, options: ["default" => "0.00"], nullable: true)]
    #[Groups(['hktransactions:read', 'hktransactions:write'])]
    private ?string $charged = '0.00';

    #[ORM\ManyToOne(targetEntity: HKCleanings::class)]
    #[ORM\JoinColumn(name: 'hk_cleaning_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    #[Groups(['hktransactions:read','hktransactions:write'])]
    private ?HKCleanings $hkCleaning = null;

    #[ORM\OneToMany(mappedBy: 'hkTransaction', targetEntity: UnitDocument::class, fetch: 'LAZY')]
    #[Groups(['hktransactions:read'])]
    #[MaxDepth(1)]
    private Collection $unitDocuments;

    public function __construct()
    {
        $this->unitDocuments = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getTransactionCode(): ?string
    {
        return $this->transactionCode;
    }

    public function setTransactionCode(string $transactionCode): self
    {
        $this->transactionCode = $transactionCode;

        return $this;
    }

    public function generateTransactionCode(): void
    {
        $this->transactionCode = 'HK' . strtoupper(bin2hex(random_bytes(3)));
    }

    public function getDate(): ?\DateTimeImmutable
    {
        return $this->date;
    }

    public function setDate(\DateTimeImmutable $date): self
    {
        $this->date = $date;
        return $this;
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

    public function getCity(): ?string
    {
        return $this->city;
    }

    public function setCity(?string $city): self
    {
        $this->city = $city;

        return $this;
    }

    public function getCategory(): ?TransactionCategory
    {
        return $this->category;
    }

    public function setCategory(TransactionCategory $category): self
    {
        $this->category = $category;
        return $this;
    }

    public function getCostCentre(): ?string
    {
        return $this->costCentre;
    }

    public function setCostCentre(string $costCentre): self
    {
        $this->costCentre = $costCentre;

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

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function setNotes(?string $notes): self
    {
        $this->notes = $notes;
        return $this;
    }

    public function getPaid(): ?string
    {
        return $this->paid;
    }

    public function setPaid(?string $paid): self
    {
        $this->paid = $paid ?? '0.00';
        return $this;
    }

    public function getCharged(): ?string
    {
        return $this->charged;
    }

    public function setCharged(?string $charged): self
    {
        $this->charged = $charged ?? '0.00';
        return $this;
    }
    public function getAllocationTarget(): ?string
    {
        return $this->allocationTarget;
    }

    public function setAllocationTarget(string $allocationTarget): self
    {
        $this->allocationTarget = $allocationTarget;
        return $this;
    }
    /**
     * Returns an array of allocated cities for reporting convenience.
     */
    #[Groups(['hktransactions:read'])]
    public function getAllocatedCities(): array
    {
        $city = $this->getCity();
        return $city ? [$city] : [];
    }
    /**
     * Returns the unit/division label for this transaction.
     * - If a Unit exists: return the unit name
     */
    #[Groups(['hktransactions:read'])]
    public function getUnitLabel(): string
    {
        return $this->getUnit() ? ($this->getUnit()->getUnitName() ?: '') : '';
    }
    /**
     * @return Collection<int, UnitDocument>
     */
    public function getUnitDocuments(): Collection
    {
        return $this->unitDocuments;
    }
    public function getHkCleaning(): ?HKCleanings
    {
        return $this->hkCleaning;
    }

    public function setHkCleaning(?HKCleanings $hkCleaning): self
    {
        $this->hkCleaning = $hkCleaning;
        return $this;
    }
}