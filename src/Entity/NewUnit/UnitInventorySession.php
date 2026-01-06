<?php
declare(strict_types=1);

namespace App\Entity\NewUnit;

use App\Entity\Unit;
use App\Repository\NewUnit\UnitInventorySessionRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;

#[ORM\Entity(repositoryClass: UnitInventorySessionRepository::class)]
#[ORM\Table(name: 'unit_inventory_session')]
class UnitInventorySession
{
    #[Groups(['unitInventory:read'])]
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'string', length: 32, options: ['default' => 'collecting'])]
    private string $status = 'collecting'; // collecting | submitted | ready | sent | signed

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $startedAt = null;

    #[Groups(['unitInventory:read'])]
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $submittedAt = null;

    #[Groups(['unitInventory:read'])]
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $invIssuedAt = null;

    #[Groups(['unitInventory:read'])]
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $photoIssuedAt = null;

    #[Groups(['unitInventory:read'])]
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $sentAt = null;

    #[Groups(['unitInventory:read'])]
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $signedAt = null;

    #[Groups(['unitInventory:read', 'unitInventory:write'])]
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    /** 
     * Items typed list (Area, Descripcion, Cantidad, Notas)
     */
    #[Groups(['unitInventory:read'])]
    #[ORM\OneToMany(mappedBy: 'session', targetEntity: UnitInventoryItem::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $items;

    /**
     * Photos with captions (Area, caption, file_url, keep)
     */
    #[Groups(['unitInventory:read'])]
    #[ORM\OneToMany(mappedBy: 'session', targetEntity: UnitInventoryPhoto::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $photos;

    public function __construct()
    {
        $this->items  = new ArrayCollection();
        $this->photos = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    public function setUnit(Unit $unit): self
    {
        $this->unit = $unit;
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

    public function getStartedAt(): ?\DateTimeImmutable
    {
        return $this->startedAt;
    }

    public function setStartedAt(?\DateTimeImmutable $startedAt): self
    {
        $this->startedAt = $startedAt;
        return $this;
    }

    public function getSubmittedAt(): ?\DateTimeImmutable
    {
        return $this->submittedAt;
    }

    public function setSubmittedAt(?\DateTimeImmutable $submittedAt): self
    {
        $this->submittedAt = $submittedAt;
        return $this;
    }

    public function getInvIssuedAt(): ?\DateTimeImmutable
    {
        return $this->invIssuedAt;
    }

    public function setInvIssuedAt(?\DateTimeImmutable $invIssuedAt): self
    {
        $this->invIssuedAt = $invIssuedAt;
        return $this;
    }

    public function getPhotoIssuedAt(): ?\DateTimeImmutable
    {
        return $this->photoIssuedAt;
    }

    public function setPhotoIssuedAt(?\DateTimeImmutable $photoIssuedAt): self
    {
        $this->photoIssuedAt = $photoIssuedAt;
        return $this;
    }

    public function getSentAt(): ?\DateTimeImmutable
    {
        return $this->sentAt;
    }

    public function setSentAt(?\DateTimeImmutable $sentAt): self
    {
        $this->sentAt = $sentAt;
        return $this;
    }

    public function getSignedAt(): ?\DateTimeImmutable
    {
        return $this->signedAt;
    }

    public function setSignedAt(?\DateTimeImmutable $signedAt): self
    {
        $this->signedAt = $signedAt;
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

    /** @return Collection<int, UnitInventoryItem> */
    public function getItems(): Collection
    {
        return $this->items;
    }

    public function addItem(UnitInventoryItem $item): self
    {
        if (!$this->items->contains($item)) {
            $this->items->add($item);
            $item->setSession($this);
        }
        return $this;
    }

    public function removeItem(UnitInventoryItem $item): self
    {
        if ($this->items->removeElement($item)) {
            if ($item->getSession() === $this) {
                $item->setSession(null);
            }
        }
        return $this;
    }

    /** @return Collection<int, UnitInventoryPhoto> */
    public function getPhotos(): Collection
    {
        return $this->photos;
    }

    public function addPhoto(UnitInventoryPhoto $photo): self
    {
        if (!$this->photos->contains($photo)) {
            $this->photos->add($photo);
            $photo->setSession($this);
        }
        return $this;
    }

    public function removePhoto(UnitInventoryPhoto $photo): self
    {
        if ($this->photos->removeElement($photo)) {
            if ($photo->getSession() === $this) {
                $photo->setSession(null);
            }
        }
        return $this;
    }
}