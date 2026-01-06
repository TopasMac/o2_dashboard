<?php

namespace App\Entity\Payouts;

use App\Repository\AirbnbPayoutItemRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AirbnbPayoutItemRepository::class)]
#[ORM\Table(name: 'airbnb_payout_item')]
#[ORM\Index(name: 'idx_airbnb_item_confirmation', columns: ['confirmation_code'])]
#[ORM\Index(name: 'idx_airbnb_item_listing', columns: ['listing'])]
class AirbnbPayoutItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: AirbnbPayout::class, inversedBy: 'items')]
    #[ORM\JoinColumn(name: 'payout_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?AirbnbPayout $payout = null;

    // Airbnb reservation confirmation code (HM..., HN...) — null for non-reservation lines
    #[ORM\Column(name: 'confirmation_code', type: 'string', length: 32, nullable: true)]
    private ?string $confirmationCode = null;

    // Listing title from CSV (can be mapped to internal unit via a lookup later)
    #[ORM\Column(name: 'listing', type: 'string', length: 255, nullable: true)]
    private ?string $listing = null;

    #[ORM\Column(name: 'guest_name', type: 'string', length: 255, nullable: true)]
    private ?string $guestName = null;

    #[ORM\Column(name: 'start_date', type: 'date', nullable: true)]
    private ?\DateTimeInterface $startDate = null;

    #[ORM\Column(name: 'end_date', type: 'date', nullable: true)]
    private ?\DateTimeInterface $endDate = null;

    // Nights column from CSV (optional, useful for checks)
    #[ORM\Column(name: 'nights', type: 'integer', nullable: true)]
    private ?int $nights = null;

    // Line amounts (all nullable to support tax/adjustment rows)
    #[ORM\Column(name: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $amount = null;

    #[ORM\Column(name: 'gross_earnings', type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $grossEarnings = null;

    #[ORM\Column(name: 'cleaning_fee', type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $cleaningFee = null;

    #[ORM\Column(name: 'service_fee', type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $serviceFee = null;

    #[ORM\Column(name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $taxAmount = null; // e.g., Host Remitted Tax

    // Currency per line (usually same as payout, but kept for safety)
    #[ORM\Column(name: 'currency', type: 'string', length: 10, nullable: true)]
    private ?string $currency = null;

    // Line type from CSV: Reservation / Host Remitted Tax / Adjustment / etc.
    #[ORM\Column(name: 'line_type', type: 'string', length: 50, nullable: true)]
    private ?string $lineType = null;

    // Imported at timestamp for auditing
    #[ORM\Column(name: 'imported_at', type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $importedAt = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getPayout(): ?AirbnbPayout
    {
        return $this->payout;
    }

    public function setPayout(?AirbnbPayout $payout): self
    {
        $this->payout = $payout;
        return $this;
    }

    public function getConfirmationCode(): ?string
    {
        return $this->confirmationCode;
    }

    public function setConfirmationCode(?string $confirmationCode): self
    {
        $this->confirmationCode = $confirmationCode;
        return $this;
    }

    public function getListing(): ?string
    {
        return $this->listing;
    }

    public function setListing(?string $listing): self
    {
        $this->listing = $listing;
        return $this;
    }

    public function getGuestName(): ?string
    {
        return $this->guestName;
    }

    public function setGuestName(?string $guestName): self
    {
        $this->guestName = $guestName;
        return $this;
    }

    public function getStartDate(): ?\DateTimeInterface
    {
        return $this->startDate;
    }

    public function setStartDate(?\DateTimeInterface $startDate): self
    {
        $this->startDate = $startDate;
        return $this;
    }

    public function getEndDate(): ?\DateTimeInterface
    {
        return $this->endDate;
    }

    public function setEndDate(?\DateTimeInterface $endDate): self
    {
        $this->endDate = $endDate;
        return $this;
    }

    public function getNights(): ?int
    {
        return $this->nights;
    }

    public function setNights(?int $nights): self
    {
        $this->nights = $nights;
        return $this;
    }

    public function getAmount(): ?string
    {
        return $this->amount;
    }

    public function setAmount(?string $amount): self
    {
        $this->amount = $amount;
        return $this;
    }

    public function getGrossEarnings(): ?string
    {
        return $this->grossEarnings;
    }

    public function setGrossEarnings(?string $grossEarnings): self
    {
        $this->grossEarnings = $grossEarnings;
        return $this;
    }

    public function getCleaningFee(): ?string
    {
        return $this->cleaningFee;
    }

    public function setCleaningFee(?string $cleaningFee): self
    {
        $this->cleaningFee = $cleaningFee;
        return $this;
    }

    public function getServiceFee(): ?string
    {
        return $this->serviceFee;
    }

    public function setServiceFee(?string $serviceFee): self
    {
        $this->serviceFee = $serviceFee;
        return $this;
    }

    public function getTaxAmount(): ?string
    {
        return $this->taxAmount;
    }

    public function setTaxAmount(?string $taxAmount): self
    {
        $this->taxAmount = $taxAmount;
        return $this;
    }

    public function getCurrency(): ?string
    {
        return $this->currency;
    }

    public function setCurrency(?string $currency): self
    {
        $this->currency = $currency;
        return $this;
    }

    public function getLineType(): ?string
    {
        return $this->lineType;
    }

    public function setLineType(?string $lineType): self
    {
        $this->lineType = $lineType;
        return $this;
    }

    public function getImportedAt(): ?\DateTimeInterface
    {
        return $this->importedAt;
    }

    public function setImportedAt(?\DateTimeInterface $importedAt): self
    {
        $this->importedAt = $importedAt;
        return $this;
    }
}
