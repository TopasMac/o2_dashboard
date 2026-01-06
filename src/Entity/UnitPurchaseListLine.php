<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'unit_purchase_list_line')]
#[ORM\Index(name: 'idx_upll_list', columns: ['purchase_list_id'])]
#[ORM\Index(name: 'idx_upll_catalog', columns: ['catalog_item_id'])]
class UnitPurchaseListLine
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: UnitPurchaseList::class)]
    #[ORM\JoinColumn(name: 'purchase_list_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?UnitPurchaseList $purchaseList = null;

    #[ORM\ManyToOne(targetEntity: PurchaseCatalogItem::class)]
    #[ORM\JoinColumn(name: 'catalog_item_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?PurchaseCatalogItem $catalogItem = null;

    // Optional category for one-time (list-only) items (when no catalog item is used)
    #[ORM\Column(type: Types::STRING, length: 60, nullable: true)]
    private ?string $category = null;

    // Snapshot fields (so edits in catalog do not affect already-sent reports)
    #[ORM\Column(type: Types::TEXT)]
    private string $description;

    #[ORM\Column(type: Types::INTEGER)]
    private int $qty = 1;

    // Existing quantity already available in the unit
    #[ORM\Column(name: 'existing_qty', type: Types::INTEGER, options: ['default' => 0])]
    private int $existingQty = 0;

    #[ORM\Column(name: 'unit_cost', type: Types::DECIMAL, precision: 12, scale: 2, nullable: true)]
    private ?string $unitCost = null;

    #[ORM\Column(name: 'unit_sell_price', type: Types::DECIMAL, precision: 12, scale: 2, nullable: true)]
    private ?string $unitSellPrice = null;

    #[ORM\Column(name: 'purchase_source', type: Types::STRING, length: 120, nullable: true)]
    private ?string $purchaseSource = null;

    #[ORM\Column(name: 'purchase_url', type: Types::TEXT, nullable: true)]
    private ?string $purchaseUrl = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: Types::INTEGER, options: ['default' => 0])]
    private int $sortOrder = 0;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getPurchaseList(): ?UnitPurchaseList
    {
        return $this->purchaseList;
    }

    public function setPurchaseList(UnitPurchaseList $purchaseList): self
    {
        $this->purchaseList = $purchaseList;
        return $this;
    }

    public function getCatalogItem(): ?PurchaseCatalogItem
    {
        return $this->catalogItem;
    }

    public function setCatalogItem(?PurchaseCatalogItem $catalogItem): self
    {
        $this->catalogItem = $catalogItem;
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

    public function getDescription(): string
    {
        return $this->description;
    }

    public function setDescription(string $description): self
    {
        $this->description = $description;
        return $this;
    }

    public function getQty(): int
    {
        return $this->qty;
    }

    public function setQty(int $qty): self
    {
        $this->qty = max(0, $qty);
        return $this;
    }

    public function getExistingQty(): int
    {
        return $this->existingQty;
    }

    public function setExistingQty(int $existingQty): self
    {
        $this->existingQty = max(0, $existingQty);
        return $this;
    }

    public function getNeededQty(): int
    {
        return max(0, $this->qty - $this->existingQty);
    }

    public function getUnitCost(): ?string
    {
        return $this->unitCost;
    }

    public function setUnitCost(?string $unitCost): self
    {
        $this->unitCost = $unitCost;
        return $this;
    }

    public function getUnitSellPrice(): ?string
    {
        return $this->unitSellPrice;
    }

    public function setUnitSellPrice(?string $unitSellPrice): self
    {
        $this->unitSellPrice = $unitSellPrice;
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

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function setNotes(?string $notes): self
    {
        $this->notes = $notes;
        return $this;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }

    public function setSortOrder(int $sortOrder): self
    {
        $this->sortOrder = $sortOrder;
        return $this;
    }

    public function getLineTotalCost(): ?string
    {
        if ($this->unitCost === null) {
            return null;
        }
        return \bcmul((string) $this->unitCost, (string) $this->getNeededQty(), 2);
    }

    public function getLineTotalSellPrice(): ?string
    {
        if ($this->unitSellPrice === null) {
            return null;
        }
        return \bcmul((string) $this->unitSellPrice, (string) $this->getNeededQty(), 2);
    }
}