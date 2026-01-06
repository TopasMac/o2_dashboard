<?php

namespace App\Entity;

use App\Entity\Employee;
use Doctrine\ORM\Mapping as ORM;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use App\Entity\UnitDocumentAttachment;

#[ORM\Entity]
#[ORM\Table(name: 'employee_cash_ledger')]
class EmployeeCashLedger
{
    public const TYPE_CASH_ADVANCE  = 'CashAdvance';
    public const TYPE_GUEST_PAYMENT = 'GuestPayment';
    public const TYPE_CASH_RETURN   = 'CashReturn';
    public const TYPE_EXPENSE       = 'Expense';
    public const TYPE_OTHER         = 'Other';

    public const STATUS_PENDING   = 'Pending';   // user submitted it
    public const STATUS_APPROVED  = 'Approved';  // admin reviewed / confirmed
    public const STATUS_ALLOCATED = 'Allocated'; // linked to O2/HK/Unit transaction
    public const STATUS_REJECTED  = 'Rejected';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 30, unique: true)]
    private string $code;

    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'RESTRICT')]
    private ?Employee $employee = null;

    #[ORM\Column(type: 'string', length: 60, nullable: true)]
    private ?string $employeeShortName = null;

    #[ORM\Column(type: 'string', length: 20)]
    private string $type;

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2)]
    private string $amount = '0.00';

    #[ORM\Column(type: 'string', length: 40, nullable: true)]
    private ?string $division = null;

    #[ORM\Column(type: 'string', length: 40, nullable: true)]
    private ?string $city = null;

    #[ORM\Column(type: 'string', length: 40, nullable: true)]
    private ?string $costCentre = null;


    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    // Admin/reviewer comment (e.g., rejection reason). Kept separate from employee-submitted notes.
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $adminComment = null;

    #[ORM\Column(type: 'string', length: 20)]
    private string $status = self::STATUS_PENDING;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'date_immutable')]
    private ?\DateTimeImmutable $date = null;

    // Allocation link
    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $allocationType = null; // O2, HK, Unit

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $allocationId = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $allocationCode = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $allocatedAt = null;

    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Employee $allocatedBy = null;

    #[ORM\OneToMany(mappedBy: 'employeeCashLedger', targetEntity: UnitDocumentAttachment::class, cascade: ['remove'])]
    private Collection $attachments;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $this->date = $this->createdAt;
        $this->status = self::STATUS_PENDING;
        $this->attachments = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCode(): ?string
    {
        return $this->code;
    }

    public function setCode(string $code): self
    {
        $this->code = $code;
        return $this;
    }

    public function getEmployee(): ?Employee
    {
        return $this->employee;
    }

    public function setEmployee(?Employee $employee): self
    {
        $this->employee = $employee;
        return $this;
    }

    public function getEmployeeShortName(): ?string
    {
        return $this->employeeShortName;
    }

    public function setEmployeeShortName(?string $employeeShortName): self
    {
        $this->employeeShortName = $employeeShortName;
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

    public function getAmount(): string
    {
        return $this->amount;
    }

    public function setAmount(string $amount): self
    {
        $this->amount = $amount;
        return $this;
    }

    public function getDivision(): ?string
    {
        return $this->division;
    }

    public function setDivision(?string $division): self
    {
        $this->division = $division;
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

    public function getCostCentre(): ?string
    {
        return $this->costCentre;
    }

    public function setCostCentre(?string $costCentre): self
    {
        $this->costCentre = $costCentre;
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

    public function getAdminComment(): ?string
    {
        return $this->adminComment;
    }

    public function setAdminComment(?string $adminComment): self
    {
        $this->adminComment = $adminComment;
        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): self
    {
        $this->status = $status;
        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
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

    public function getAllocationType(): ?string
    {
        return $this->allocationType;
    }

    public function setAllocationType(?string $allocationType): self
    {
        $this->allocationType = $allocationType;
        return $this;
    }

    public function getAllocationId(): ?int
    {
        return $this->allocationId;
    }

    public function setAllocationId(?int $allocationId): self
    {
        $this->allocationId = $allocationId;
        return $this;
    }

    public function getAllocationCode(): ?string
    {
        return $this->allocationCode;
    }

    public function setAllocationCode(?string $allocationCode): self
    {
        $this->allocationCode = $allocationCode;
        return $this;
    }

    public function getAllocatedAt(): ?\DateTimeImmutable
    {
        return $this->allocatedAt;
    }

    public function setAllocatedAt(?\DateTimeImmutable $allocatedAt): self
    {
        $this->allocatedAt = $allocatedAt;
        return $this;
    }

    public function getAllocatedBy(): ?Employee
    {
        return $this->allocatedBy;
    }

    public function setAllocatedBy(?Employee $allocatedBy): self
    {
        $this->allocatedBy = $allocatedBy;
        return $this;
    }

    public function getAttachments(): Collection
    {
        return $this->attachments;
    }

    public function addAttachment(UnitDocumentAttachment $attachment): self
    {
        if (!$this->attachments->contains($attachment)) {
            $this->attachments->add($attachment);
            if (method_exists($attachment, 'setEmployeeCashLedger')) {
                $attachment->setEmployeeCashLedger($this);
            }
        }

        return $this;
    }

    public function removeAttachment(UnitDocumentAttachment $attachment): self
    {
        if ($this->attachments->removeElement($attachment)) {
            if (method_exists($attachment, 'getEmployeeCashLedger') && $attachment->getEmployeeCashLedger() === $this) {
                $attachment->setEmployeeCashLedger(null);
            }
        }

        return $this;
    }
}