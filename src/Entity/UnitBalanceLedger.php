<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\ApiProperty;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Put;
use ApiPlatform\Metadata\Patch;
use App\State\UnitBalanceLedgerProcessor;
use Symfony\Component\Serializer\Annotation\Groups;
use Doctrine\ORM\Mapping as ORM;
use App\Entity\UnitDocument;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Symfony\Component\Validator\Constraints as Assert;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Metadata\ApiFilter;

#[ORM\Entity]
#[ORM\HasLifecycleCallbacks]
#[ORM\Table(name: 'unit_balance_ledger',
    indexes: [
        new ORM\Index(name: 'ubl_unit_month_idx', columns: ['unit_id', 'yearmonth'])
    ],
    uniqueConstraints: [
        new ORM\UniqueConstraint(name: 'ubl_uym_type_uniq', columns: ['unit_id', 'yearmonth', 'entry_type'])
    ]
)]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection(),
        new Post(processor: UnitBalanceLedgerProcessor::class),
        new Put(processor: UnitBalanceLedgerProcessor::class),
        new Patch(processor: UnitBalanceLedgerProcessor::class),
        new Delete()
    ],
    normalizationContext: ['groups' => ['unit_balance:read']],
    denormalizationContext: ['groups' => ['unit_balance:write']]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'unit' => 'exact',
    'unit.id' => 'exact',
    'yearMonth' => 'exact',
    'entryType' => 'exact',
])]
#[ApiFilter(OrderFilter::class, properties: ['date', 'id', 'createdAt'])]
#[ApiFilter(DateFilter::class, properties: ['date'])]
/**
 * Ledger of all financial movements for a unit.
 *
 * Entry types:
 *   - Month Report: A periodic posting of revenue/expenses for a unit (usually monthly).
 *   - O2 Report Payment: Outgoing payment to the client (owner) settling a report.
 *   - Client Report Payment: Incoming payment from the client (owner) settling a report/debt.
 *   - O2 Payment: Outgoing payment to the client (owner) not tied to a specific report.
 *   - Client Payment: Incoming payment from the client (owner) not tied to a specific report.
 *
 * NOTE on partial payments:
 *   A single report posting may be followed by multiple PAYMENT_TO_CLIENT rows
 *   (e.g. when payouts are split). The BALANCE_STATEMENT logic must always
 *   include all such movements up to the statement date, so partial payments
 *   are naturally accounted for.
 */
class UnitBalanceLedger
{
    public const TYPE_MONTH_REPORT = 'Month Report';
    public const TYPE_O2_REPORT_PAYMENT = 'O2 Report Payment';
    public const TYPE_CLIENT_REPORT_PAYMENT = 'Client Report Payment';
    public const TYPE_O2_PAYMENT = 'O2 Payment';
    public const TYPE_CLIENT_PAYMENT = 'Client Payment';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['unit_balance:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    #[ApiProperty(readableLink: true, writableLink: true)]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private ?Unit $unit = null;

    #[ORM\Column(name: 'txn_date', type: 'date_immutable')]
    #[Assert\NotBlank]
    #[Assert\Type(type: \DateTimeImmutable::class)]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private ?\DateTimeImmutable $date = null;

    // e.g. "2025-08" for monthly postings; null for payments not tied to a month
    #[ORM\Column(name: 'yearmonth', type: 'string', length: 7, nullable: true)]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private ?string $yearMonth = null;

    #[ORM\Column(type: 'string', length: 32)]
    #[Assert\NotBlank]
    #[Assert\Choice(choices: [
        self::TYPE_MONTH_REPORT,
        self::TYPE_O2_REPORT_PAYMENT,
        self::TYPE_CLIENT_REPORT_PAYMENT,
        self::TYPE_O2_PAYMENT,
        self::TYPE_CLIENT_PAYMENT
    ])]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private string $entryType = self::TYPE_MONTH_REPORT;

    // Signed. Positive => we owe client. Negative => client owes us.
    #[ORM\Column(type: 'decimal', precision: 12, scale: 2)]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private $amount = '0.00';

    // Snapshot after this movement
    #[ORM\Column(type: 'decimal', precision: 12, scale: 2)]
    #[Groups(['unit_balance:read'])]
    private string $balanceAfter = '0.00';


    #[ORM\Column(type: 'string', length: 64, nullable: true)]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private ?string $paymentMethod = null;

    #[ORM\Column(type: 'string', length: 128, nullable: true)]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private ?string $reference = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['unit_balance:read', 'unit_balance:write'])]
    private ?string $note = null;


    #[ORM\Column(name: 'created_at', type: 'date_immutable')]
    #[Groups(['unit_balance:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(name: 'created_by', type: 'string', length: 120, options: ['default' => 'system'])]
    #[Groups(['unit_balance:read'])]
    private ?string $createdBy = null;

    #[ORM\OneToMany(
        mappedBy: 'ledger',
        targetEntity: UnitDocument::class,
        cascade: ['persist', 'remove'],
        orphanRemoval: true
    )]
    #[Groups(['unit_balance:read'])]
    private Collection $documents;

    public function __construct()
    {
        $this->documents = new ArrayCollection();
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

    #[Groups(['unit_balance:read'])]
    public function getUnitName(): ?string
    {
        return $this->unit ? $this->unit->getUnitName() : null;
    }

    public function getYearMonth(): ?string
    {
        return $this->yearMonth;
    }

    public function setYearMonth(?string $yearMonth): self
    {
        $this->yearMonth = $yearMonth;
        return $this;
    }

    public function getEntryType(): string
    {
        return $this->entryType;
    }

    public function setEntryType(string $entryType): self
    {
        $this->entryType = $entryType;
        return $this;
    }

    public function getAmount(): string
    {
        return $this->amount;
    }

    public function setAmount(float|string $amount): self
    {
        $this->amount = number_format((float)$amount, 2, '.', '');
        return $this;
    }

    public function getBalanceAfter(): string
    {
        return $this->balanceAfter;
    }

    public function setBalanceAfter(string $balanceAfter): self
    {
        $this->balanceAfter = $balanceAfter;
        return $this;
    }

    public function getPaymentMethod(): ?string
    {
        return $this->paymentMethod;
    }

    public function setPaymentMethod(?string $paymentMethod): self
    {
        $this->paymentMethod = $paymentMethod;
        return $this;
    }

    public function getReference(): ?string
    {
        return $this->reference;
    }

    public function setReference(?string $reference): self
    {
        $this->reference = $reference;
        return $this;
    }

    public function getNote(): ?string
    {
        return $this->note;
    }

    public function setNote(?string $note): self
    {
        $this->note = $note;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getCreatedBy(): ?string
    {
        return $this->createdBy;
    }

    public function setCreatedBy(?string $createdBy): self
    {
        $this->createdBy = trim((string)$createdBy) !== '' ? $createdBy : 'system';
        return $this;
    }
    
    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        if ($this->date && !$this->yearMonth) {
            $this->yearMonth = $this->date->format('Y-m');
        }
        if (!$this->createdAt) {
            $tz = new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'America/Cancun');
            // Using 'today' with an explicit timezone guarantees the calendar date
            // is computed in business time, not server default.
            $this->createdAt = new \DateTimeImmutable('today', $tz);
        }
        if ($this->createdBy === null || trim((string)$this->createdBy) === '') {
            $this->createdBy = 'system';
        }
    }

    /** @return Collection<int, UnitDocument> */
    public function getDocuments(): Collection
    {
        return $this->documents;
    }

    public function addDocument(UnitDocument $doc): self
    {
        if (!$this->documents->contains($doc)) {
            $this->documents->add($doc);
            $doc->setLedger($this);
        }
        return $this;
    }

    public function removeDocument(UnitDocument $doc): self
    {
        if ($this->documents->removeElement($doc)) {
            if ($doc->getLedger() === $this) {
                $doc->setLedger(null);
            }
        }
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

    /**
     * Created-at in business timezone, formatted as Y-m-d (stable for sorting)
     */
    #[Groups(['unit_balance:read'])]
    public function getCreatedAtLocal(): ?string
    {
        if (!$this->createdAt) {
            return null;
        }
        $tz = new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'America/Cancun');
        return $this->createdAt->setTimezone($tz)->format('Y-m-d');
    }

    /**
     * Display-friendly date (YYYY-MM-DD) in business timezone
     */
    #[Groups(['unit_balance:read'])]
    public function getCreatedAtDisplay(): ?string
    {
        if (!$this->createdAt) {
            return null;
        }
        $tz = new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'America/Cancun');
        return $this->createdAt->setTimezone($tz)->format('Y-m-d');
    }

    /**
     * Transaction date (ledger effective date) formatted as YYYY-MM-DD
     */
    #[Groups(['unit_balance:read'])]
    public function getDateDisplay(): ?string
    {
        if (!$this->date) {
            return null;
        }
        return $this->date->format('Y-m-d');
    }
}