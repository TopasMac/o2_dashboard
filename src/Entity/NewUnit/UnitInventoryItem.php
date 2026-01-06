<?php
declare(strict_types=1);

namespace App\Entity\NewUnit;

use App\Repository\NewUnit\UnitInventoryItemRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;

#[ORM\Entity(repositoryClass: UnitInventoryItemRepository::class)]
#[ORM\Table(name: 'unit_inventory_item')]
class UnitInventoryItem
{
    #[Groups(['unitInventory:read'])]
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\ManyToOne(targetEntity: UnitInventorySession::class, inversedBy: 'items')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?UnitInventorySession $session = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'string', length: 100)]
    private string $area;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'string', length: 255)]
    private string $descripcion;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'integer')]
    private int $cantidad = 1;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notas = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSession(): ?UnitInventorySession
    {
        return $this->session;
    }

    public function setSession(?UnitInventorySession $session): self
    {
        $this->session = $session;
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

    public function getDescripcion(): string
    {
        return $this->descripcion;
    }

    public function setDescripcion(string $descripcion): self
    {
        $this->descripcion = $descripcion;
        return $this;
    }

    public function getCantidad(): int
    {
        return $this->cantidad;
    }

    public function setCantidad(int $cantidad): self
    {
        $this->cantidad = $cantidad;
        return $this;
    }

    public function getNotas(): ?string
    {
        return $this->notas;
    }

    public function setNotas(?string $notas): self
    {
        $this->notas = $notas;
        return $this;
    }
}
