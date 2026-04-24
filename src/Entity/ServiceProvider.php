<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'service_providers')]
#[ORM\UniqueConstraint(name: 'UNIQ_SERVICE_PROVIDERS_PROVIDER_ID', columns: ['provider_id'])]
#[ORM\HasLifecycleCallbacks]
class ServiceProvider
{
    public const AREA_PLAYA = 'Playa';
    public const AREA_TULUM = 'Tulum';
    public const AREA_BOTH  = 'Both';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(name: 'provider_id', type: 'string', length: 20, unique: true)]
    private string $providerId;

    #[ORM\Column(type: 'string', length: 120)]
    private string $name;

    #[ORM\Column(type: 'string', length: 60)]
    private string $occupation;

    #[ORM\Column(type: 'string', length: 10)]
    private string $area;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $whatsapp = null;

    #[ORM\Column(type: 'string', length: 120, nullable: true)]
    private ?string $email = null;

    #[ORM\Column(type: 'string', length: 80, nullable: true)]
    private ?string $bankName = null;

    #[ORM\Column(type: 'string', length: 120, nullable: true)]
    private ?string $accountHolder = null;

    #[ORM\Column(type: 'string', length: 25, nullable: true)]
    private ?string $clabe = null;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $accountNumber = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastJobAt = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        // Keep providerId generation outside the entity for now (service / controller).
        // We still set timestamps safely.
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;

        // Sensible defaults
        $this->area = self::AREA_BOTH;
        $this->occupation = '';
        $this->name = '';
        $this->providerId = '';
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable();

        if (!isset($this->createdAt)) {
            $this->createdAt = $now;
        }

        $this->updatedAt = $now;

        // Ensure default if not set
        if (empty($this->area)) {
            $this->area = self::AREA_BOTH;
        }

        if ($this->isActive !== false) {
            $this->isActive = true;
        }
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public static function getAreaChoices(): array
    {
        return [
            self::AREA_PLAYA,
            self::AREA_TULUM,
            self::AREA_BOTH,
        ];
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getProviderId(): string
    {
        return $this->providerId;
    }

    public function setProviderId(string $providerId): self
    {
        $this->providerId = $providerId;

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

    public function getOccupation(): string
    {
        return $this->occupation;
    }

    public function setOccupation(string $occupation): self
    {
        $this->occupation = $occupation;

        return $this;
    }

    public function getArea(): string
    {
        return $this->area;
    }

    public function setArea(string $area): self
    {
        // Soft-validate (don’t throw to avoid breaking API unexpectedly)
        if (!in_array($area, self::getAreaChoices(), true)) {
            $area = self::AREA_BOTH;
        }

        $this->area = $area;

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

    public function getWhatsapp(): ?string
    {
        return $this->whatsapp;
    }

    public function setWhatsapp(?string $whatsapp): self
    {
        $this->whatsapp = $whatsapp;

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

    public function getBankName(): ?string
    {
        return $this->bankName;
    }

    public function setBankName(?string $bankName): self
    {
        $this->bankName = $bankName;

        return $this;
    }

    public function getAccountHolder(): ?string
    {
        return $this->accountHolder;
    }

    public function setAccountHolder(?string $accountHolder): self
    {
        $this->accountHolder = $accountHolder;

        return $this;
    }

    public function getClabe(): ?string
    {
        return $this->clabe;
    }

    public function setClabe(?string $clabe): self
    {
        $this->clabe = $clabe;

        return $this;
    }

    public function getAccountNumber(): ?string
    {
        return $this->accountNumber;
    }

    public function setAccountNumber(?string $accountNumber): self
    {
        $this->accountNumber = $accountNumber;

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

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $isActive): self
    {
        $this->isActive = $isActive;

        return $this;
    }

    public function getLastJobAt(): ?\DateTimeImmutable
    {
        return $this->lastJobAt;
    }

    public function setLastJobAt(?\DateTimeImmutable $lastJobAt): self
    {
        $this->lastJobAt = $lastJobAt;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(\DateTimeImmutable $updatedAt): self
    {
        $this->updatedAt = $updatedAt;

        return $this;
    }
}