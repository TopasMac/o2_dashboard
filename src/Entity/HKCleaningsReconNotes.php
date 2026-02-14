<?php
namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: \App\Repository\HKCleaningsReconNotesRepository::class)]
#[ORM\Table(name: 'hk_cleanings_recon_notes')]
#[ORM\Index(columns: ['city', 'month'], name: 'idx_hk_recon_note_items_city_month')]
#[ORM\Index(columns: ['status'], name: 'idx_hk_recon_note_items_status')]
#[ORM\Index(columns: ['hk_cleaning_id'], name: 'idx_hk_recon_note_items_hk_cleaning')]
class HKCleaningsReconNotes
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // City: Playa del Carmen, Tulum
    #[ORM\Column(type: 'string', length: 40)]
    private string $city;

    // Month key in YYYY-MM format
    #[ORM\Column(type: 'string', length: 7)]
    private string $month;

    // Optional link to a specific HK cleaning row (row-level notes)
    // NULL means this is a month-level note.
    #[ORM\Column(name: 'hk_cleaning_id', type: 'integer', nullable: true)]
    private ?int $hkCleaningId = null;

    // Main bullet text (issue / topic)
    #[ORM\Column(name: 'item_text', type: 'text')]
    private string $itemText;

    // Status: open | done
    #[ORM\Column(type: 'string', length: 12)]
    private string $status = 'open';

    // Optional resolution / follow-up notes after discussing with HK
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $resolution = null;

    #[ORM\Column(name: 'resolved_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $resolvedAt = null;

    // Optional: track the user id who last resolved/updated (kept as scalar to avoid FK complexity)
    #[ORM\Column(name: 'resolved_by_user_id', type: 'integer', nullable: true)]
    private ?int $resolvedByUserId = null;

    #[ORM\Column(name: 'updated_at', type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    #[ORM\Column(name: 'created_at', type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $now = new \DateTimeImmutable('now');
        $this->createdAt = $now;
        $this->updatedAt = $now;
        $this->itemText = '';
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

    public function getMonth(): string
    {
        return $this->month;
    }

    public function setMonth(string $month): self
    {
        $this->month = $month;
        return $this;
    }

    public function getHkCleaningId(): ?int
    {
        return $this->hkCleaningId;
    }

    public function setHkCleaningId(?int $hkCleaningId): self
    {
        $this->hkCleaningId = $hkCleaningId;
        return $this;
    }

    public function isRowNote(): bool
    {
        return $this->hkCleaningId !== null;
    }

    public function getItemText(): string
    {
        return $this->itemText;
    }

    public function setItemText(string $itemText): self
    {
        $this->itemText = $itemText;
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

    public function isDone(): bool
    {
        return strtolower($this->status) === 'done';
    }

    public function getResolution(): ?string
    {
        return $this->resolution;
    }

    public function setResolution(?string $resolution): self
    {
        $this->resolution = $resolution;
        return $this;
    }

    public function getResolvedAt(): ?\DateTimeImmutable
    {
        return $this->resolvedAt;
    }

    public function setResolvedAt(?\DateTimeImmutable $resolvedAt): self
    {
        $this->resolvedAt = $resolvedAt;
        return $this;
    }

    public function getResolvedByUserId(): ?int
    {
        return $this->resolvedByUserId;
    }

    public function setResolvedByUserId(?int $resolvedByUserId): self
    {
        $this->resolvedByUserId = $resolvedByUserId;
        return $this;
    }

    public function touchUpdatedAt(): self
    {
        $this->updatedAt = new \DateTimeImmutable('now');
        return $this;
    }

    public function markDone(?int $resolvedByUserId = null): self
    {
        $this->status = 'done';
        $this->resolvedAt = new \DateTimeImmutable('now');
        if ($resolvedByUserId !== null) {
            $this->resolvedByUserId = $resolvedByUserId;
        }
        $this->touchUpdatedAt();
        return $this;
    }

    public function markOpen(): self
    {
        $this->status = 'open';
        $this->resolvedAt = null;
        $this->resolvedByUserId = null;
        $this->touchUpdatedAt();
        return $this;
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

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

}