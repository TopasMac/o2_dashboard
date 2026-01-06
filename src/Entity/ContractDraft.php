<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'contract_draft')]
#[ORM\HasLifecycleCallbacks]
#[ApiResource] // remove if you don't want API Platform auto-CRUD yet
class ContractDraft
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    // DRAFT | FINAL
    #[ORM\Column(length: 10, options: ['default' => 'DRAFT'])]
    private string $status = 'DRAFT';

    // en | es
    #[ORM\Column(length: 5, options: ['default' => 'en'])]
    private string $defaultLocale = 'en';

    // Free text (negotiation context)
    #[ORM\Column(length: 180)]
    private string $clientName;

    // Provisional label to help you identify the unit during negotiation
    #[ORM\Column(length: 180)]
    private string $unitName;

    // Notes you keep during negotiation
    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    // Structured “normal fields” (ownerName, address, payoutDay, commission, currency, etc.)
    #[ORM\Column(type: Types::JSON)]
    private array $fields = [];

    // Per-draft overrides for EN only: { key: text }
    #[ORM\Column(type: Types::JSON, nullable: true)]
    private ?array $overridesEn = null;

    // Per-draft overrides for ES only: { key: text }
    #[ORM\Column(type: Types::JSON, nullable: true)]
    private ?array $overridesEs = null;

    #[ORM\Column(type: Types::INTEGER, options: ['default' => 1])]
    private int $version = 1;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_MUTABLE)]
    private \DateTime $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable('now');
        $this->updatedAt = new \DateTime('now');
    }

    #[ORM\PreUpdate]
    public function touch(): void
    {
        $this->updatedAt = new \DateTime('now');
    }

    // ==== getters/setters ====
    public function getId(): ?int { return $this->id; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): self { $this->status = $status; return $this; }

    public function getDefaultLocale(): string { return $this->defaultLocale; }
    public function setDefaultLocale(string $defaultLocale): self { $this->defaultLocale = $defaultLocale; return $this; }

    public function getClientName(): string { return $this->clientName; }
    public function setClientName(string $clientName): self { $this->clientName = $clientName; return $this; }

    public function getUnitName(): string { return $this->unitName; }
    public function setUnitName(string $unitName): self { $this->unitName = $unitName; return $this; }

    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $notes): self { $this->notes = $notes; return $this; }

    public function getFields(): array { return $this->fields; }
    public function setFields(array $fields): self { $this->fields = $fields; return $this; }

    public function getOverridesEn(): ?array { return $this->overridesEn; }
    public function setOverridesEn(?array $overridesEn): self { $this->overridesEn = $overridesEn; return $this; }

    public function getOverridesEs(): ?array { return $this->overridesEs; }
    public function setOverridesEs(?array $overridesEs): self { $this->overridesEs = $overridesEs; return $this; }

    public function getVersion(): int { return $this->version; }
    public function setVersion(int $version): self { $this->version = $version; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(\DateTimeImmutable $createdAt): self { $this->createdAt = $createdAt; return $this; }

    public function getUpdatedAt(): \DateTime { return $this->updatedAt; }
    public function setUpdatedAt(\DateTime $updatedAt): self { $this->updatedAt = $updatedAt; return $this; }
}