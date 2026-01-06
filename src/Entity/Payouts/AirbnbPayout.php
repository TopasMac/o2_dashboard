<?php

namespace App\Entity\Payouts;

use App\Repository\AirbnbPayoutRepository;
use App\Entity\Payouts\AirbnbPayoutItem;
use Doctrine\ORM\Mapping as ORM;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;

#[ORM\Entity(repositoryClass: AirbnbPayoutRepository::class)]
#[ORM\Table(name: 'airbnb_payout')]
#[ORM\UniqueConstraint(name: 'uniq_airbnb_payout_reference_code', columns: ['reference_code'])]
class AirbnbPayout
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // Airbnb batch reference (Reference code / Reference ID) — unique per payout
    #[ORM\Column(name: 'reference_code', type: 'string', length: 255, unique: true)]
    private ?string $referenceCode = null;

    // Date Airbnb initiated the payout
    #[ORM\Column(name: 'payout_date', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $payoutDate = null;

    // Expected arrival date ("Arriving by")
    #[ORM\Column(name: 'arriving_by', type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $arrivingBy = null;

    // Total paid out for the batch (as per Airbnb CSV)
    #[ORM\Column(name: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: true)]
    private ?string $amount = null;

    #[ORM\Column(name: 'currency', type: 'string', length: 10, nullable: true)]
    private ?string $currency = null;

    // Payment method e.g. "Payoneer – Espiral MXN", "Direct Deposit – Santander MXN"
    #[ORM\Column(name: 'payout_method', type: 'string', length: 255, nullable: true)]
    private ?string $payoutMethod = null;

    // Destination details e.g. nickname/last digits
    #[ORM\Column(name: 'payout_destination', type: 'string', length: 255, nullable: true)]
    private ?string $payoutDestination = null;

    // Raw CSV "Details" text (e.g., "Transfer to NAME, Savings 8258 (MXN)")
    #[ORM\Column(name: 'payout_details', type: 'string', length: 255, nullable: true)]
    private ?string $payoutDetails = null;

    // Optional notes / adjustments text
    #[ORM\Column(name: 'notes', type: 'text', nullable: true)]
    private ?string $notes = null;

    // --- Bank reconciliation metadata ---
    // When this payout was reconciled/checked in Bank Recon
    #[ORM\Column(name: 'recon_checked_at', type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $reconCheckedAt = null;

    // User ID who performed the reconciliation (nullable for now)
    #[ORM\Column(name: 'recon_checked_by', type: 'integer', nullable: true)]
    private ?int $reconCheckedBy = null;

    // Matched accountant_entry ID (for auditing/back-links)
    #[ORM\Column(name: 'recon_accountant_entry_id', type: 'integer', nullable: true)]
    private ?int $reconAccountantEntryId = null;

    // When this payout was imported into the system
    #[ORM\Column(name: 'imported_at', type: 'datetime_immutable')]
    private ?\DateTimeImmutable $importedAt = null;

    // Relation to items (reservations, taxes, adjustments) — to be populated by the importer
    #[ORM\OneToMany(mappedBy: 'payout', targetEntity: AirbnbPayoutItem::class, cascade: ['persist'], orphanRemoval: false)]
    private Collection $items;

    public function __construct()
    {
        $this->items = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getReferenceCode(): ?string
    {
        return $this->referenceCode;
    }

    public function setReferenceCode(?string $referenceCode): self
    {
        $this->referenceCode = $referenceCode;
        return $this;
    }

    public function getPayoutDate(): ?\DateTimeImmutable
    {
        return $this->payoutDate;
    }

    public function setPayoutDate(?\DateTimeImmutable $payoutDate): self
    {
        $this->payoutDate = $payoutDate;
        return $this;
    }

    public function getArrivingBy(): ?\DateTimeImmutable
    {
        return $this->arrivingBy;
    }

    public function setArrivingBy(?\DateTimeImmutable $arrivingBy): self
    {
        $this->arrivingBy = $arrivingBy;
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

    public function getCurrency(): ?string
    {
        return $this->currency;
    }

    public function setCurrency(?string $currency): self
    {
        $this->currency = $currency;
        return $this;
    }

    public function getPayoutMethod(): ?string
    {
        return $this->payoutMethod;
    }

    public function setPayoutMethod(?string $payoutMethod): self
    {
        $this->payoutMethod = $payoutMethod;
        return $this;
    }

    public function getPayoutDestination(): ?string
    {
        return $this->payoutDestination;
    }

    public function setPayoutDestination(?string $payoutDestination): self
    {
        $this->payoutDestination = $payoutDestination;
        return $this;
    }

    public function getPayoutDetails(): ?string
    {
        return $this->payoutDetails;
    }

    public function setPayoutDetails(?string $payoutDetails): self
    {
        $this->payoutDetails = $payoutDetails;
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

    public function getImportedAt(): ?\DateTimeImmutable
    {
        return $this->importedAt;
    }

    public function setImportedAt(\DateTimeImmutable $importedAt): self
    {
        $this->importedAt = $importedAt;
        return $this;
    }

    /** @return Collection<int, AirbnbPayoutItem> */
    public function getItems(): Collection
    {
        return $this->items;
    }

    public function addItem(AirbnbPayoutItem $item): self
    {
        if (!$this->items->contains($item)) {
            $this->items->add($item);
            $item->setPayout($this);
        }
        return $this;
    }

    public function removeItem(AirbnbPayoutItem $item): self
    {
        if ($this->items->removeElement($item)) {
            if (method_exists($item, 'getPayout') && $item->getPayout() === $this) {
                $item->setPayout(null);
            }
        }
        return $this;
    }
    public function getReconCheckedAt(): ?\DateTimeInterface
    {
        return $this->reconCheckedAt;
    }

    public function setReconCheckedAt(?\DateTimeInterface $dt): self
    {
        $this->reconCheckedAt = $dt;
        return $this;
    }

    public function getReconCheckedBy(): ?int
    {
        return $this->reconCheckedBy;
    }

    public function setReconCheckedBy(?int $userId): self
    {
        $this->reconCheckedBy = $userId;
        return $this;
    }

    public function getReconAccountantEntryId(): ?int
    {
        return $this->reconAccountantEntryId;
    }

    public function setReconAccountantEntryId(?int $entryId): self
    {
        $this->reconAccountantEntryId = $entryId;
        return $this;
    }
}