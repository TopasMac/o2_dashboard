<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\NumericFilter;
use ApiPlatform\Metadata\ApiFilter;

use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Serializer\Annotation\MaxDepth;

use App\Repository\CondoRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ApiResource(
    normalizationContext: ['groups' => ['condo:read', 'condo:list']],
    denormalizationContext: ['groups' => ['condo:write']]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'condoName' => 'partial',
    'city' => 'partial',
    'hoaBank' => 'partial',
    'hoaAccountName' => 'partial',
    'hoaEmail' => 'partial'
])]
#[ApiFilter(NumericFilter::class, properties: ['hoaDueDay'])]
#[ApiFilter(OrderFilter::class, properties: ['condoName', 'city', 'hoaDueDay'], arguments: ['orderParameterName' => 'order'])]
#[ORM\Entity(repositoryClass: CondoRepository::class)]
class Condo
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['condo:list', 'condo:read'])]
    private int $id;

    #[ORM\Column(type: 'string', length: 50, unique: true)]
    #[Groups(['condo:list', 'condo:read', 'condo:write', 'unit:read', 'unit:list'])]
    private string $condoName;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    #[Groups(['condo:list', 'condo:read', 'condo:write'])]
    private ?string $city = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    #[Groups(['condo:read', 'condo:write'])]
    private ?string $doorCode = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['condo:read', 'condo:write'])]
    private ?string $notes = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    #[Groups(['condo:read', 'condo:write'])]
    private ?string $googleMaps = null;

    #[ORM\Column(name: 'hoa_bank', type: 'string', length: 100, nullable: true)]
    #[Groups(['condo:list', 'condo:read', 'condo:write', 'unit:read', 'unit:list'])]
    private ?string $hoaBank = null;

    #[ORM\Column(name: 'hoa_account_name', type: 'string', length: 100, nullable: true)]
    #[Groups(['condo:list', 'condo:read', 'condo:write', 'unit:read', 'unit:list'])]
    private ?string $hoaAccountName = null;

    #[ORM\Column(name: 'hoa_account_nr', type: 'string', length: 100, nullable: true)]
    #[Groups(['condo:list', 'condo:read', 'condo:write', 'unit:read', 'unit:list'])]
    private ?string $hoaAccountNr = null;

    #[ORM\Column(name: 'hoa_email', type: 'string', length: 100, nullable: true)]
    #[Groups(['condo:list', 'condo:read', 'condo:write', 'unit:read', 'unit:list'])]
    private ?string $hoaEmail = null;

    #[ORM\Column(name: 'hoa_due_day', type: 'integer', nullable: true)]
    #[Groups(['condo:list', 'condo:read', 'condo:write', 'unit:list'])]
    private ?int $hoaDueDay = 8;

    #[ORM\OneToMany(mappedBy: 'condo', targetEntity: CondoContact::class, cascade: ['persist', 'remove'])]
    #[MaxDepth(1)]
    #[Groups(['condo:read'])]
    private Collection $contacts;

    public function __construct()
    {
        $this->contacts = new ArrayCollection();
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getCondoName(): string
    {
        return $this->condoName;
    }

    public function setCondoName(string $condoName): self
    {
        $this->condoName = $condoName;
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

    public function getDoorCode(): ?string
    {
        return $this->doorCode;
    }

    public function setDoorCode(?string $doorCode): self
    {
        $this->doorCode = $doorCode;
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

    public function getGoogleMaps(): ?string
    {
        return $this->googleMaps;
    }

    public function setGoogleMaps(?string $googleMaps): self
    {
        $this->googleMaps = $googleMaps;
        return $this;
    }

    /**
     * @return Collection<int, CondoContact>
     */
    public function getContacts(): Collection
    {
        return $this->contacts;
    }

    public function addContact(CondoContact $contact): self
    {
        if (!$this->contacts->contains($contact)) {
            $this->contacts[] = $contact;
            $contact->setCondo($this);
        }

        return $this;
    }

    public function removeContact(CondoContact $contact): self
    {
        if ($this->contacts->removeElement($contact)) {
            if ($contact->getCondo() === $this) {
                $contact->setCondo(null);
            }
        }

        return $this;
    }

    public function getHoaBank(): ?string
    {
        return $this->hoaBank;
    }

    public function setHoaBank(?string $hoaBank): self
    {
        $this->hoaBank = $hoaBank;
        return $this;
    }

    public function getHoaAccountName(): ?string
    {
        return $this->hoaAccountName;
    }

    public function setHoaAccountName(?string $hoaAccountName): self
    {
        $this->hoaAccountName = $hoaAccountName;
        return $this;
    }

    public function getHoaAccountNr(): ?string
    {
        return $this->hoaAccountNr;
    }

    public function setHoaAccountNr(?string $hoaAccountNr): self
    {
        $this->hoaAccountNr = $hoaAccountNr;
        return $this;
    }

    public function getHoaEmail(): ?string
    {
        return $this->hoaEmail;
    }

    public function setHoaEmail(?string $hoaEmail): self
    {
        $this->hoaEmail = $hoaEmail;
        return $this;
    }

    public function getHoaDueDay(): ?int
    {
        return $this->hoaDueDay;
    }

    public function setHoaDueDay(?int $hoaDueDay): self
    {
        $this->hoaDueDay = $hoaDueDay;
        return $this;
    }
    public function getName(): ?string
    {
        return $this->condoName;
    }

    public function getBuildingCode(): ?string
    {
        return $this->getDoorCode();
    }

    public function getGoogleMapsLink(): ?string
    {
        return $this->getGoogleMaps();
    }
}