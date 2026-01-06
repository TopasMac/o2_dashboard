<?php
declare(strict_types=1);

namespace App\Entity\NewUnit;

use App\Repository\NewUnit\UnitInventoryPhotoRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;

#[ORM\Entity(repositoryClass: UnitInventoryPhotoRepository::class)]
#[ORM\Table(name: 'unit_inventory_photo')]
class UnitInventoryPhoto
{
    #[Groups(['unitInventory:read'])]
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\ManyToOne(targetEntity: UnitInventorySession::class, inversedBy: 'photos')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?UnitInventorySession $session = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'string', length: 100)]
    private string $area;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $caption = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'string', length: 255)]
    private string $fileUrl;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $keep = true;

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

    public function getCaption(): ?string
    {
        return $this->caption;
    }

    public function setCaption(?string $caption): self
    {
        $this->caption = $caption;
        return $this;
    }

    public function getFileUrl(): string
    {
        return $this->fileUrl;
    }

    public function setFileUrl(string $fileUrl): self
    {
        $this->fileUrl = $fileUrl;
        return $this;
    }

    public function isKeep(): bool
    {
        return $this->keep;
    }

    public function setKeep(bool $keep): self
    {
        $this->keep = $keep;
        return $this;
    }
}
