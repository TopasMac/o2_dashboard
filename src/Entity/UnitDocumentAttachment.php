<?php

namespace App\Entity;

use DateTimeImmutable;
use Doctrine\ORM\Mapping as ORM;
use App\Entity\Unit;
use App\Entity\UnitBalanceLedger;
use App\Entity\O2Transactions;
use App\Entity\HKTransactions;
use App\Entity\UnitTransactions;
use App\Entity\EmployeeCashLedger;
use App\Entity\EmployeeTask;

#[ORM\Entity]
#[ORM\Table(name: 'unit_document_attachment')]
#[ORM\Index(name: 'idx_uda_target', columns: ['target_type', 'target_id'])]
#[ORM\Index(name: 'idx_uda_document', columns: ['document_id'])]
#[ORM\HasLifecycleCallbacks]
class UnitDocumentAttachment
{
    /**
     * Map of API/DB target_type → Doctrine entity FQCN.
     * Keep target_type keys in snake_case for SQL friendliness.
     */
    public const TARGET_TYPES = [
        'hk_transactions'       => HKTransactions::class,
        'o2_transactions'       => O2Transactions::class,
        'unit'                  => Unit::class,
        'unit_balance_ledger'   => UnitBalanceLedger::class,
        'unit_transactions'     => UnitTransactions::class,
        'employee_cash_ledger'  => EmployeeCashLedger::class,
        'employee_task'         => EmployeeTask::class,
    ];

    /**
     * Return the list of allowed target_type strings.
     * @return string[]
     */
    public static function allowedTargetTypes(): array
    {
        return array_keys(self::TARGET_TYPES);
    }

    /**
     * Resolve a target_type (snake_case) to the entity FQCN, or null if unknown.
     */
    public static function resolveEntityClass(string $targetType): ?string
    {
        return self::TARGET_TYPES[$targetType] ?? null;
    }
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // Important: do not set inversedBy here unless UnitDocument has the matching property
    #[ORM\ManyToOne(targetEntity: UnitDocument::class)]
    #[ORM\JoinColumn(name: 'document_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?UnitDocument $document = null;

    // E.g. 'o2_transactions', 'unit_transactions', 'hk_transactions', 'unit_balance_ledger', 'bookings'
    #[ORM\Column(name: 'target_type', type: 'string', length: 50)]
    private string $targetType;

    #[ORM\Column(name: 'target_id', type: 'integer')]
    private int $targetId;

    // Optional categorization within the parent (e.g. 'invoice', 'payment-proof', 'report')
    #[ORM\Column(name: 'category', type: 'string', length: 50, nullable: true)]
    private ?string $category = null;

    #[ORM\ManyToOne(targetEntity: EmployeeCashLedger::class, inversedBy: 'attachments')]
    #[ORM\JoinColumn(name: 'employee_cash_ledger_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?EmployeeCashLedger $employeeCashLedger = null;

    #[ORM\ManyToOne(targetEntity: EmployeeTask::class, inversedBy: 'attachments')]
    #[ORM\JoinColumn(name: 'employee_task_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?EmployeeTask $employeeTask = null;


    #[ORM\Column(name: 'created_at', type: 'datetime_immutable')]
    private DateTimeImmutable $createdAt;

    #[ORM\Column(name: 'updated_at', type: 'datetime_immutable')]
    private DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $now = new DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new DateTimeImmutable();
        $this->createdAt = $this->createdAt ?? $now;
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getDocument(): ?UnitDocument
    {
        return $this->document;
    }

    public function setDocument(UnitDocument $document): self
    {
        $this->document = $document;
        return $this;
    }

    public function getTargetType(): string
    {
        return $this->targetType;
    }

    public function setTargetType(string $targetType): self
    {
        $this->targetType = $targetType;
        return $this;
    }

    public function getTargetId(): int
    {
        return $this->targetId;
    }

    public function setTargetId(int $targetId): self
    {
        $this->targetId = $targetId;
        return $this;
    }

    public function getCategory(): ?string
    {
        return $this->category;
    }

    public function setCategory(?string $category): self
    {
        $this->category = $category;
        return $this;
    }



    public function getEmployeeCashLedger(): ?EmployeeCashLedger
    {
        return $this->employeeCashLedger;
    }

    public function setEmployeeCashLedger(?EmployeeCashLedger $employeeCashLedger): self
    {
        $this->employeeCashLedger = $employeeCashLedger;
        return $this;
    }

    public function getEmployeeTask(): ?EmployeeTask
    {
        return $this->employeeTask;
    }

    public function setEmployeeTask(?EmployeeTask $employeeTask): self
    {
        $this->employeeTask = $employeeTask;
        return $this;
    }

    public function getCreatedAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(DateTimeImmutable $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }
}