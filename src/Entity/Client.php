<?php

namespace App\Entity;

use App\Repository\ClientRepository;
use ApiPlatform\Metadata\ApiResource;
use Doctrine\ORM\Mapping as ORM;
use Doctrine\ORM\Event\LifecycleEventArgs;
use Doctrine\ORM\Mapping\PrePersist;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use App\Entity\Unit;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Serializer\Annotation\SerializedName;
use Symfony\Component\Serializer\Annotation\MaxDepth;

#[ORM\HasLifecycleCallbacks]
#[ORM\Entity(repositoryClass: ClientRepository::class)]
#[ApiResource(
    normalizationContext: ['groups' => ['client:read'], 'skip_null_values' => false],
    denormalizationContext: ['groups' => ['client:write']]
)]
class Client
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['client:read'])]
    private int $id;

    #[ORM\Column(name: "client_code", type: 'string', unique: true)]
    #[Groups(['client:read'])]
    private ?string $clientCode = null;

    #[ORM\Column(type: 'string')]
    #[Groups(['client:read', 'client:write'])]
    private string $name;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $nationality = null;

    #[ORM\Column(type: 'date', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?\DateTimeInterface $dob = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $phone = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $email = null;

    #[ORM\Column(type: 'string', length: 320, nullable: true, name: 'cc_email')]
    #[Groups(['client:read', 'client:write'])]
    private ?string $ccEmail = null;

    #[ORM\Column(type: 'string', length: 5, nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $language = null; // ISO code: "es", "en", etc.

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $bankName = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $bankOwner = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $bankAccount = null;


    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['client:read', 'client:write'])]
    private ?string $comments = null;

    #[ORM\Column(type: 'date', nullable: true, name: "starting_date")]
    #[Groups(['client:read', 'client:write'])]
    private ?\DateTimeInterface $startingDate = null;

    #[ORM\OneToMany(mappedBy: 'client', targetEntity: Unit::class)]
    #[MaxDepth(1)]
    private Collection $units;

    public function __construct()
    {
        $this->units = new ArrayCollection();

        if (empty($this->clientCode)) {
            $random = strtoupper(bin2hex(random_bytes(3)));
            $this->clientCode = 'O2C' . substr($random, 0, 6);
        }
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getClientCode(): ?string
    {
        return $this->clientCode;
    }

    public function setClientCode(string $clientCode): self
    {
        $this->clientCode = $clientCode;
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

    public function getNationality(): ?string
    {
        return $this->nationality;
    }

    public function setNationality(?string $nationality): self
    {
        $this->nationality = $nationality;
        return $this;
    }

    public function getDob(): ?\DateTimeInterface
    {
        return $this->dob;
    }

    public function setDob(?\DateTimeInterface $dob): self
    {
        if ($dob) {
            $dob = \DateTime::createFromFormat('Y-m-d', $dob->format('Y-m-d'), new \DateTimeZone('UTC'));
        }
        $this->dob = $dob;
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

    public function getCcEmail(): ?string
    {
        return $this->ccEmail;
    }

    public function setCcEmail(?string $ccEmail): self
    {
        $this->ccEmail = $ccEmail ? trim($ccEmail) : null;
        return $this;
    }

    public function getLanguage(): ?string
    {
        return $this->language;
    }

    public function setLanguage(?string $language): self
    {
        @error_log('Client::setLanguage incoming=' . var_export($language, true));
        // normalize to lowercase short code (e.g., "es", "en")
        $this->language = $language ? strtolower(trim($language)) : null;
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

    public function getBankOwner(): ?string
    {
        return $this->bankOwner;
    }

    public function setBankOwner(?string $bankOwner): self
    {
        $this->bankOwner = $bankOwner;
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


    public function getComments(): ?string
    {
        return $this->comments;
    }

    public function setComments(?string $comments): self
    {
        $this->comments = $comments;
        return $this;
    }

    public function getStartingDate(): ?\DateTimeInterface
    {
        return $this->startingDate;
    }

    public function setStartingDate(?\DateTimeInterface $startingDate): self
    {
        if ($startingDate) {
            $startingDate = \DateTime::createFromFormat('Y-m-d', $startingDate->format('Y-m-d'), new \DateTimeZone('UTC'));
        }
        $this->startingDate = $startingDate;
        return $this;
    }

    public function getUnits(): Collection
    {
        return $this->units;
    }

    public function addUnit(Unit $unit): self
    {
        if (!$this->units->contains($unit)) {
            $this->units[] = $unit;
            $unit->setClient($this);
        }

        return $this;
    }

    public function removeUnit(Unit $unit): self
    {
        if ($this->units->removeElement($unit)) {
            // set the owning side to null (unless already changed)
            if ($unit->getClient() === $this) {
                $unit->setClient(null);
            }
        }

        return $this;
    }
    
    #[PrePersist]
    public function generateClientCode(): void
    {
        if ($this->clientCode === null || $this->clientCode === '') {
            $random = strtoupper(bin2hex(random_bytes(3)));
            $this->clientCode = 'O2C' . substr($random, 0, 6);
        }
    }
}