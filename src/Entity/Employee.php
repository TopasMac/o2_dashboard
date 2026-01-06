<?php

namespace App\Entity;

use App\Repository\EmployeeRepository;
use Doctrine\ORM\Mapping as ORM;
use App\Entity\User;

#[ORM\Entity(repositoryClass: EmployeeRepository::class)]
class Employee
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 20, unique: true)]
    private string $employeeCode;

    #[ORM\Column(type: 'string', length: 100)]
    private string $name;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $shortName = null;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(type: 'string', length: 120, unique: true, nullable: true)]
    private ?string $email = null;

    #[ORM\Column(type: 'string', length: 30)]
    private string $division; // Owners2, Housekeepers

    #[ORM\Column(type: 'string', length: 30)]
    private string $area; // Admin, Supervisor, Cleaning

    #[ORM\Column(type: 'string', length: 50)]
    private string $city; // General, Playa del Carmen, Tulum, etc.

    #[ORM\Column(type: 'date')]
    private \DateTimeInterface $dateStarted;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $dateEnded = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    private string $initialSalary;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    private string $currentSalary;

    #[ORM\Column(name: 'bank_holder', type: 'string', length: 120, nullable: true)]
    private ?string $bankHolder = null;

    #[ORM\Column(name: 'bank_name', type: 'string', length: 120, nullable: true)]
    private ?string $bankName = null;

    #[ORM\Column(name: 'bank_account', type: 'string', length: 50, nullable: true)]
    private ?string $bankAccount = null;

    #[ORM\Column(type: 'string', length: 20, options: ['default' => 'Active'])]
    private string $status = 'Active'; // Active, OnLeave, Terminated

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $platformEnabled = false; // Whether this employee can log into the platform

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\OneToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', unique: true, nullable: true)]
    private ?User $user = null;

    public function __construct()
    {
        // Safe defaults to prevent uninitialized typed property access
        $this->employeeCode = '';
        $this->name = '';
        $this->division = '';
        $this->area = '';
        $this->city = '';
        $this->dateStarted = new \DateTimeImmutable('today');
        $this->initialSalary = '0.00';
        $this->currentSalary = '0.00';
        // $this->status already defaults to 'Active' via property declaration
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmployeeCode(): string
    {
        return $this->employeeCode;
    }

    public function setEmployeeCode(string $code): self
    {
        $this->employeeCode = $code;
        return $this;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): self
    {
        $this->name = $name;
        return $this;
    }

    public function getShortName(): ?string
    {
        return $this->shortName;
    }

    public function setShortName(?string $shortName): self
    {
        $this->shortName = $shortName;
        return $this;
    }

    public function getPhone(): ?string
    {
        return $this->phone;
    }

    public function setPhone(?string $phone): self
    {
        $this->phone = $phone;
        return $this;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setEmail(?string $email): self
    {
        $this->email = $email;

        // Keep linked User email in sync so login uses the latest employee email
        if ($this->user !== null && $email !== null && $email !== '') {
            $normalized = strtolower(trim($email));
            $this->user->setEmail($normalized);
        }

        return $this;
    }

    public function getDivision(): string
    {
        return $this->division;
    }

    public function setDivision(string $division): self
    {
        $this->division = $division;
        return $this;
    }

    public function getArea(): string
    {
        return $this->area;
    }

    public function setArea(string $area): self
    {
        $this->area = $area;
        return $this;
    }

    public function getCity(): string
    {
        return $this->city;
    }

    public function setCity(string $city): self
    {
        $this->city = $city;
        return $this;
    }

    public function getDateStarted(): \DateTimeInterface
    {
        return $this->dateStarted;
    }

    public function setDateStarted(\DateTimeInterface $dateStarted): self
    {
        $this->dateStarted = $dateStarted;
        return $this;
    }

    public function getDateEnded(): ?\DateTimeInterface
    {
        return $this->dateEnded;
    }

    public function setDateEnded(?\DateTimeInterface $dateEnded): self
    {
        $this->dateEnded = $dateEnded;
        return $this;
    }

    public function getInitialSalary(): string
    {
        return $this->initialSalary;
    }

    public function setInitialSalary(string $initialSalary): self
    {
        $this->initialSalary = $initialSalary;
        return $this;
    }

    public function getCurrentSalary(): string
    {
        return $this->currentSalary;
    }

    public function setCurrentSalary(string $currentSalary): self
    {
        $this->currentSalary = $currentSalary;
        return $this;
    }

    public function getBankHolder(): ?string
    {
        return $this->bankHolder;
    }

    public function setBankHolder(?string $bankHolder): self
    {
        $this->bankHolder = $bankHolder;
        return $this;
    }

    public function getBankName(): ?string
    {
        return $this->bankName;
    }

    public function setBankName(?string $bankName): self
    {
        $this->bankName = $bankName;
        return $this;
    }

    public function getBankAccount(): ?string
    {
        return $this->bankAccount;
    }

    public function setBankAccount(?string $bankAccount): self
    {
        $this->bankAccount = $bankAccount;
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

    public function isPlatformEnabled(): bool
    {
        return $this->platformEnabled;
    }

    public function setPlatformEnabled(bool $platformEnabled): self
    {
        $this->platformEnabled = $platformEnabled;
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

    public function getUser(): ?User
    {
        return $this->user;
    }

    public function setUser(?User $user): self
    {
        $this->user = $user;
        return $this;
    }
}