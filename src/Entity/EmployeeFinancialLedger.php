<?php
namespace App\Entity;

use App\Entity\Employee;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'employee_financial_ledger')]
#[ORM\Index(columns: ['employee_id'], name: 'idx_efl_employee')]
#[ORM\Index(columns: ['division'], name: 'idx_efl_division')]
#[ORM\Index(columns: ['city'], name: 'idx_efl_city')]
#[ORM\Index(columns: ['applied_salary_ledger_id'], name: 'idx_efl_applied_salary')]
class EmployeeFinancialLedger
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 16, unique: true)]
    private ?string $code = null;

    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(name: 'employee_id', referencedColumnName: 'id', nullable: false, onDelete: 'RESTRICT')]
    private ?Employee $employee = null;

    // Snapshot of employee short name at time of record creation (not a FK)
    #[ORM\Column(name: 'employee_shortname', type: 'string', length: 120, nullable: true)]
    private ?string $employeeShortName = null;

    // Enum-like string: salary, bonus, advance, deduction
    #[ORM\Column(type: 'string', length: 20)]
    private string $type;

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2)]
    private string $amount = '0.00';

    #[ORM\Column(name: 'period_start', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $periodStart = null;

    #[ORM\Column(name: 'period_end', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $periodEnd = null;

    // Business date (e.g., advance granted date / salary payment date)
    #[ORM\Column(name: 'entry_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $entryDate = null;

    // Division: Owners2, Housekeepers
    #[ORM\Column(type: 'string', length: 40, nullable: true)]
    private ?string $division = null;

    // City: Playa del Carmen, Tulum, General
    #[ORM\Column(type: 'string', length: 40, nullable: true)]
    private ?string $city = null;

    // Area: auto-filled from employee record
    #[ORM\Column(type: 'string', length: 80, nullable: true)]
    private ?string $area = null;

    // Cost Centre: O2_General, O2_Playa, O2_Tulum, HK_General, HK_Playa, HK_Tulum
    #[ORM\Column(name: 'cost_centre', type: 'string', length: 40, nullable: true)]
    private ?string $costCentre = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    // If this is a deduction installment, this links to the salary ledger row that applied it.
    #[ORM\Column(name: 'applied_salary_ledger_id', type: 'integer', nullable: true)]
    private ?int $appliedSalaryLedgerId = null;

    #[ORM\Column(name: 'created_at', type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmployee(): ?Employee
    {
        return $this->employee;
    }

    public function setEmployee(Employee $employee): self
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

    public function getType(): string
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

    public function getPeriodStart(): ?\DateTimeImmutable
    {
        return $this->periodStart;
    }

    public function setPeriodStart(?\DateTimeImmutable $periodStart): self
    {
        $this->periodStart = $periodStart;
        return $this;
    }

    public function getPeriodEnd(): ?\DateTimeImmutable
    {
        return $this->periodEnd;
    }

    public function setPeriodEnd(?\DateTimeImmutable $periodEnd): self
    {
        $this->periodEnd = $periodEnd;
        return $this;
    }

    public function getEntryDate(): ?\DateTimeImmutable
    {
        return $this->entryDate;
    }

    public function setEntryDate(?\DateTimeImmutable $entryDate): self
    {
        $this->entryDate = $entryDate;
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

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
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

    public function getArea(): ?string
    {
        return $this->area;
    }

    public function setArea(?string $area): self
    {
        $this->area = $area;
        return $this;
    }

    public function getAppliedSalaryLedgerId(): ?int
    {
        return $this->appliedSalaryLedgerId;
    }

    public function setAppliedSalaryLedgerId(?int $appliedSalaryLedgerId): self
    {
        $this->appliedSalaryLedgerId = $appliedSalaryLedgerId;
        return $this;
    }
}