<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'hk_cleanings_reconcile', uniqueConstraints: [new ORM\UniqueConstraint(name: 'uniq_hk_cleaning', columns: ['hk_cleaning_id'])])]
#[ORM\HasLifecycleCallbacks]
class HKCleaningsReconcile
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    /**
     * City of the report line (for now typically "Tulum").
     */
    #[ORM\Column(type: 'string', length: 64)]
    private string $city = 'Tulum';

    /**
     * Report month in YYYY-MM format (e.g. "2026-01").
     */
    #[ORM\Column(name: 'report_month', type: 'string', length: 7)]
    private string $reportMonth;

    /**
     * Unit (FK to unit table).
     */
    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Unit $unit = null;

    /**
     * Linked cleaning row (FK to hk_cleanings).
     * This is the stable anchor for reconciliation (1 reconcile row per cleaning).
     */
    #[ORM\ManyToOne(targetEntity: HKCleanings::class)]
    #[ORM\JoinColumn(name: 'hk_cleaning_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?HKCleanings $hkCleaning = null;

    /**
     * Date of the service/cleaning (matches checkout date for comparisons).
     */
    #[ORM\Column(name: 'service_date', type: 'date_immutable')]
    private \DateTimeImmutable $serviceDate;

    /**
     * Expected cleaning cost (our expected/forecasted cost).
     */
    #[ORM\Column(name: 'cleaning_cost', type: 'decimal', precision: 10, scale: 2)]
    private string $cleaningCost = '0.00';

    /**
     * How much the housekeeper actually charged for the cleaning (real/invoiced).
     */
    #[ORM\Column(name: 'real_cleaning_cost', type: 'decimal', precision: 10, scale: 2)]
    private string $realCleaningCost = '0.00';

    /**
     * Laundry cost (reported by HK). Default 0.
     */
    #[ORM\Column(name: 'laundry_cost', type: 'decimal', precision: 10, scale: 2)]
    private string $laundryCost = '0.00';

    /**
     * Optional notes (free text).
     */
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(name: 'created_at', type: 'datetime_immutable')]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(name: 'updated_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable('now', new \DateTimeZone('America/Cancun'));
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now', new \DateTimeZone('America/Cancun'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCity(): string
    {
        return $this->city;
    }

    public function setCity(string $city): self
    {
        $this->city = $city;
        return $this;
    }

    public function getReportMonth(): string
    {
        return $this->reportMonth;
    }

    /**
     * @throws \InvalidArgumentException when month is not YYYY-MM
     */
    public function setReportMonth(string $reportMonth): self
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $reportMonth)) {
            throw new \InvalidArgumentException('reportMonth must be in YYYY-MM format.');
        }
        $this->reportMonth = $reportMonth;
        return $this;
    }

    public function getUnit(): ?Unit
    {
        return $this->unit;
    }

    public function setUnit(?Unit $unit): self
    {
        $this->unit = $unit;
        return $this;
    }

    public function getHkCleaning(): ?HKCleanings
    {
        return $this->hkCleaning;
    }

    public function setHkCleaning(?HKCleanings $hkCleaning): self
    {
        $this->hkCleaning = $hkCleaning;
        return $this;
    }

    public function getServiceDate(): \DateTimeImmutable
    {
        return $this->serviceDate;
    }

    public function setServiceDate(\DateTimeImmutable $serviceDate): self
    {
        $this->serviceDate = $serviceDate;
        return $this;
    }

    /**
     * Stored as string because Doctrine decimal maps to string.
     */
    public function getCleaningCost(): string
    {
        return $this->cleaningCost;
    }

    public function setCleaningCost(string $cleaningCost): self
    {
        $this->cleaningCost = $cleaningCost;
        return $this;
    }

    /**
     * Stored as string because Doctrine decimal maps to string.
     */
    public function getRealCleaningCost(): string
    {
        return $this->realCleaningCost;
    }

    public function setRealCleaningCost(string $realCleaningCost): self
    {
        $this->realCleaningCost = $realCleaningCost;
        return $this;
    }

    /**
     * Stored as string because Doctrine decimal maps to string.
     */
    public function getLaundryCost(): string
    {
        return $this->laundryCost;
    }

    public function setLaundryCost(string $laundryCost): self
    {
        $this->laundryCost = $laundryCost;
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

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * Convenience: real cleaning + laundry as a numeric string with 2 decimals.
     */
    public function getTotalCost(): string
    {
        $clean = (float) $this->realCleaningCost;
        $laundry = (float) $this->laundryCost;
        return number_format($clean + $laundry, 2, '.', '');
    }
}
