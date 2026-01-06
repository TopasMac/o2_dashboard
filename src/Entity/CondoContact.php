<?php

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\Repository\CondoContactRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: CondoContactRepository::class)]
#[ApiResource(
    operations: [
        new Get(normalizationContext: ['groups' => ['condo_contact:read']]),
        new GetCollection(normalizationContext: ['groups' => ['condo_contact:read']]),
        new Post(denormalizationContext: ['groups' => ['condo_contact:write']], normalizationContext: ['groups' => ['condo_contact:read']]),
        new Patch(denormalizationContext: ['groups' => ['condo_contact:write']], normalizationContext: ['groups' => ['condo_contact:read']]),
        new Delete()
    ]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'condo' => 'exact',
    'department' => 'partial',
    'name' => 'partial',
    'email' => 'partial',
    'phone' => 'partial',
])]
#[ApiFilter(OrderFilter::class, properties: ['department', 'name', 'position'], arguments: ['orderParameterName' => 'order'])]
#[Assert\Expression(
    expression: "this.getEmail() !== null or this.getPhone() !== null",
    message: "Provide at least an email or a phone."
)]
class CondoContact
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['condo_contact:read'])]
    private int $id;

    #[ORM\ManyToOne(targetEntity: Condo::class, inversedBy: 'contacts')]
    #[ORM\JoinColumn(name: 'condo_name_id', referencedColumnName: 'id', nullable: false)]
    #[Groups(['condo_contact:read', 'condo_contact:write'])]
    private ?Condo $condo = null;

    #[ORM\Column(type: 'string', length: 64)]
    #[Assert\NotBlank]
    #[Groups(['condo_contact:read', 'condo_contact:write'])]
    private string $department; // e.g., Admin, Front Desk

    #[ORM\Column(type: 'string', length: 128, nullable: true)]
    #[Groups(['condo_contact:read', 'condo_contact:write'])]
    private ?string $name = null;

    #[ORM\Column(type: 'string', length: 32, nullable: true)]
    #[Groups(['condo_contact:read', 'condo_contact:write'])]
    private ?string $phone = null;

    #[ORM\Column(type: 'string', length: 180, nullable: true)]
    #[Assert\Email]
    #[Groups(['condo_contact:read', 'condo_contact:write'])]
    private ?string $email = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['condo_contact:read', 'condo_contact:write'])]
    private ?string $notes = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['condo_contact:read', 'condo_contact:write'])]
    private ?int $position = null; // manual ordering within a condo

    public function getId(): int
    {
        return $this->id;
    }

    public function getCondo(): ?Condo
    {
        return $this->condo;
    }

    public function setCondo(?Condo $condo): self
    {
        $this->condo = $condo;
        return $this;
    }

    public function getDepartment(): string
    {
        return $this->department;
    }

    public function setDepartment(string $department): self
    {
        $this->department = $department;
        return $this;
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

    public function getPosition(): ?int
    {
        return $this->position;
    }

    public function setPosition(?int $position): self
    {
        $this->position = $position;
        return $this;
    }
}