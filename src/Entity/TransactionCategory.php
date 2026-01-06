<?php

namespace App\Entity;

use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

use Doctrine\ORM\Mapping as ORM;
use ApiPlatform\Metadata\ApiResource;

#[ORM\Entity]
#[ApiResource(
    normalizationContext: ['groups' => ['unit_transaction:read', 'o2tx:read']],
    security: "is_granted('IS_AUTHENTICATED_FULLY')"
)]
class TransactionCategory
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['unit_transaction:read', 'hktransactions:read', 'o2tx:read'])]
    private ?int $id = null;

    #[ORM\Column(length: 100)]
    #[Groups(['unit_transaction:read', 'hktransactions:read', 'o2tx:read'])]
    private ?string $name = null;

    #[ORM\Column(length: 20)]
    #[Assert\Choice(choices: ['Ingreso', 'Gasto', 'Both'], message: 'Type must be either Ingreso, Gasto, or Both.')]
    #[Groups(['unit_transaction:read', 'hktransactions:read', 'o2tx:read'])]
    private ?string $type = null;


    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    #[Groups(['unit_transaction:read', 'hktransactions:read', 'o2tx:read'])]
    private bool $allowUnit = true;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    #[Groups(['unit_transaction:read', 'hktransactions:read', 'o2tx:read'])]
    private bool $allowHk = false;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    #[Groups(['unit_transaction:read', 'hktransactions:read', 'o2tx:read'])]
    private bool $allowO2 = false;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(string $name): self
    {
        $this->name = $name;
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


    public function isAllowUnit(): bool
    {
        return $this->allowUnit;
    }

    public function setAllowUnit(bool $allowUnit): self
    {
        $this->allowUnit = $allowUnit;
        return $this;
    }

    public function isAllowHk(): bool
    {
        return $this->allowHk;
    }

    public function setAllowHk(bool $allowHk): self
    {
        $this->allowHk = $allowHk;
        return $this;
    }

    public function isAllowO2(): bool
    {
        return $this->allowO2;
    }

    public function setAllowO2(bool $allowO2): self
    {
        $this->allowO2 = $allowO2;
        return $this;
    }
}