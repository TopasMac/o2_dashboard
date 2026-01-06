<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'purchase_catalog_item')]
class PurchaseCatalogItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id = null;

    #[ORM\Column(type: Types::STRING, length: 64, nullable: true)]
    private ?string $sku = null;

    #[ORM\Column(type: Types::STRING, length: 255)]
    private string $name;

    #[ORM\Column(type: Types::STRING, length: 120, nullable: true)]
    private ?string $category = null;

    #[ORM\Column(name: 'is_always_needed', type: Types::BOOLEAN, options: ['default' => false])]
    private bool $isAlwaysNeeded = false;

    #[ORM\Column(name: 'unit_type', type: Types::STRING, length: 50, nullable: true)]
    private ?string $unitType = null;

    #[ORM\Column(name: 'qty_basis', type: Types::STRING, length: 20, nullable: true)]
    private ?string $qtyBasis = null; // unit | guest | bath | bed | pillow

    #[ORM\Column(name: 'qty_per_basis', type: Types::INTEGER, nullable: true)]
    private ?int $qtyPerBasis = null;

    #[ORM\Column(name: 'qty_per_bed_by_size', type: Types::JSON, nullable: true)]
    private ?array $qtyPerBedBySize = null; // e.g. ['king'=>2,'queen'=>2,'single'=>1]

    #[ORM\Column(name: 'per_bed_qty', type: Types::INTEGER, nullable: true)]
    private ?int $perBedQty = null;

    #[ORM\Column(name: 'per_guest_qty', type: Types::INTEGER, nullable: true)]
    private ?int $perGuestQty = null;

    #[ORM\Column(name: 'per_bath_qty', type: Types::INTEGER, nullable: true)]
    private ?int $perBathQty = null;

    #[ORM\Column(name: 'bed_size', type: Types::STRING, length: 20, nullable: true)]
    private ?string $bedSize = null; // king | queen | single | sofa | null

    #[ORM\Column(name: 'min_qty', type: Types::INTEGER, nullable: true)]
    private ?int $minQty = null;

    #[ORM\Column(name: 'default_qty', type: Types::INTEGER, nullable: true)]
    private ?int $defaultQty = null;

    #[ORM\Column(name: 'purchase_source', type: Types::STRING, length: 120, nullable: true)]
    private ?string $purchaseSource = null;

    #[ORM\Column(name: 'purchase_url', type: Types::TEXT, nullable: true)]
    private ?string $purchaseUrl = null;

    // Use string for DECIMAL to avoid float precision issues
    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2, nullable: true)]
    private ?string $cost = null;

    #[ORM\Column(name: 'sell_price', type: Types::DECIMAL, precision: 10, scale: 2, nullable: true)]
    private ?string $sellPrice = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSku(): ?string
    {
        return $this->sku;
    }

    public function setSku(?string $sku): self
    {
        $this->sku = $sku;
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

    public function getCategory(): ?string
    {
        return $this->category;
    }

    public function setCategory(?string $category): self
    {
        $this->category = $category;
        return $this;
    }

    public function isAlwaysNeeded(): bool
    {
        return $this->isAlwaysNeeded;
    }

    public function setIsAlwaysNeeded(bool $isAlwaysNeeded): self
    {
        $this->isAlwaysNeeded = $isAlwaysNeeded;
        return $this;
    }

    public function getUnitType(): ?string
    {
        return $this->unitType;
    }

    public function setUnitType(?string $unitType): self
    {
        $this->unitType = $unitType;
        return $this;
    }

    public function getQtyBasis(): ?string
    {
        return $this->qtyBasis;
    }

    public function setQtyBasis(?string $qtyBasis): self
    {
        $this->qtyBasis = $qtyBasis;
        return $this;
    }

    public function getQtyPerBasis(): ?int
    {
        return $this->qtyPerBasis;
    }

    public function setQtyPerBasis(?int $qtyPerBasis): self
    {
        $this->qtyPerBasis = $qtyPerBasis;
        return $this;
    }

    public function getQtyPerBedBySize(): ?array
    {
        return $this->qtyPerBedBySize;
    }

    public function setQtyPerBedBySize(?array $qtyPerBedBySize): self
    {
        $this->qtyPerBedBySize = $qtyPerBedBySize;
        return $this;
    }

    public function getPerBedQty(): ?int
    {
        return $this->perBedQty;
    }

    public function setPerBedQty(?int $perBedQty): self
    {
        $this->perBedQty = $perBedQty;
        return $this;
    }

    public function getPerGuestQty(): ?int
    {
        return $this->perGuestQty;
    }

    public function setPerGuestQty(?int $perGuestQty): self
    {
        $this->perGuestQty = $perGuestQty;
        return $this;
    }

    public function getPerBathQty(): ?int
    {
        return $this->perBathQty;
    }

    public function setPerBathQty(?int $perBathQty): self
    {
        $this->perBathQty = $perBathQty;
        return $this;
    }

    public function getBedSize(): ?string
    {
        return $this->bedSize;
    }

    public function setBedSize(?string $bedSize): self
    {
        $this->bedSize = $bedSize;
        return $this;
    }

    public function getMinQty(): ?int
    {
        return $this->minQty;
    }

    public function setMinQty(?int $minQty): self
    {
        $this->minQty = $minQty;
        return $this;
    }

    public function getDefaultQty(): ?int
    {
        return $this->defaultQty;
    }

    public function setDefaultQty(?int $defaultQty): self
    {
        $this->defaultQty = $defaultQty;
        return $this;
    }

    public function getPurchaseSource(): ?string
    {
        return $this->purchaseSource;
    }

    public function setPurchaseSource(?string $purchaseSource): self
    {
        $this->purchaseSource = $purchaseSource;
        return $this;
    }

    public function getPurchaseUrl(): ?string
    {
        return $this->purchaseUrl;
    }

    public function setPurchaseUrl(?string $purchaseUrl): self
    {
        $this->purchaseUrl = $purchaseUrl;
        return $this;
    }

    public function getCost(): ?string
    {
        return $this->cost;
    }

    public function setCost(?string $cost): self
    {
        $this->cost = $cost;
        return $this;
    }

    public function getSellPrice(): ?string
    {
        return $this->sellPrice;
    }

    public function setSellPrice(?string $sellPrice): self
    {
        $this->sellPrice = $sellPrice;
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
}