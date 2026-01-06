<?php

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'user')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 180, unique: true)]
    private string $email;

    #[ORM\Column(type: 'json')]
    private array $roles = [];

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isEnabled = true;

    #[ORM\Column(type: 'string')]
    private string $password;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $name = null;

    #[ORM\Column(type: 'string', length: 120, nullable: true)]
    private ?string $plainPassword = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function setEmail(string $email): self
    {
        $this->email = strtolower($email);

        return $this;
    }

    public function getUserIdentifier(): string
    {
        return $this->email;
    }

    public function getRoles(): array
    {
        $roles = $this->roles;
        // guarantee every user at least has ROLE_USER
        $roles[] = 'ROLE_USER';

        return array_unique($roles);
    }

    public function setRoles(array $roles): self
    {
        $this->roles = $roles;

        return $this;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function setPassword(string $password): self
    {
        $this->password = $password;

        return $this;
    }

    public function eraseCredentials(): void
    {
        // If you store temporary, sensitive data on the user, clear it here
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(?string $name): self
    {
        $this->name = $name;

        return $this;
    }

    public function getPlainPassword(): ?string
    {
        return $this->plainPassword;
    }

    public function setPlainPassword(?string $plainPassword): self
    {
        $this->plainPassword = $plainPassword;

        return $this;
    }

    #[ORM\OneToOne(targetEntity: \App\Entity\Employee::class, inversedBy: "user")]
    #[ORM\JoinColumn(name: "employee_id", referencedColumnName: "id", nullable: true, onDelete: "SET NULL")]
    private ?\App\Entity\Employee $employee = null;

    public function getEmployee(): ?\App\Entity\Employee
    {
        return $this->employee;
    }

    public function setEmployee(?\App\Entity\Employee $employee): self
    {
        $this->employee = $employee;
        return $this;
    }

    /**
     * Convenience helper: does this user have the given role?
     */
    public function hasRole(string $role): bool
    {
        return \in_array($role, $this->getRoles(), true);
    }

    /**
     * High-level role helpers aligned with Owners2 access model.
     *
     * ROLE_ADMIN   – full access
     * ROLE_MANAGER – office / management
     * ROLE_EMPLOYEE – any employee who can log in (supervisors, cleaners, etc.)
     * ROLE_CLIENT  – owners
     */
    public function isAdmin(): bool
    {
        return $this->hasRole('ROLE_ADMIN');
    }

    public function isManager(): bool
    {
        return $this->hasRole('ROLE_MANAGER');
    }

    public function isEmployee(): bool
    {
        return $this->hasRole('ROLE_EMPLOYEE');
    }

    public function isClient(): bool
    {
        return $this->hasRole('ROLE_CLIENT');
    }

    public function isEnabled(): bool
    {
        return $this->isEnabled;
    }

    public function setIsEnabled(bool $isEnabled): self
    {
        $this->isEnabled = $isEnabled;

        return $this;
    }
}