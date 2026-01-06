<?php

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity]
#[ORM\Table(name: 'review_action')]
#[ORM\UniqueConstraint(name: 'uniq_reservation', columns: ['reservation_id'])]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    operations: [
        new Get(normalizationContext: ['groups' => ['review:read']]),
        new GetCollection(normalizationContext: ['groups' => ['review:read']]),
        new Post(denormalizationContext: ['groups' => ['review:write']], normalizationContext: ['groups' => ['review:read']]),
        new Patch(denormalizationContext: ['groups' => ['review:write']], normalizationContext: ['groups' => ['review:read']]),
    ],
    normalizationContext: ['groups' => ['review:read']],
    denormalizationContext: ['groups' => ['review:write']]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'reservationId' => 'exact',
    'status' => 'exact',
    'source' => 'exact',
    'unitId' => 'exact',
    'unitName' => 'partial',
])]
#[ApiFilter(DateFilter::class, properties: [
    'checkoutDate',
    'createdAt',
])]
#[ApiFilter(OrderFilter::class, properties: ['createdAt' => 'DESC'])]
class ReviewAction
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['review:read'])]
    private ?int $id = null;

    /**
     * Reservation/booking id this action refers to.
     */
    #[ORM\Column(name: 'reservation_id', type: 'integer')]
    #[Assert\NotBlank]
    #[Groups(['review:read', 'review:write'])]
    private ?int $reservationId = null;

    /**
     * Final state of the review for this reservation:
     *  - "made"    → review posted
     *  - "skipped" → explicitly skipped by user
     *  - "timeout" → automatically timed out after the allowed window
     */
    #[ORM\Column(type: 'string', length: 16)]
    #[Assert\Choice(choices: ['made', 'skipped', 'timeout'])]
    #[Assert\NotBlank]
    #[Groups(['review:read', 'review:write'])]
    private string $status = 'skipped';

    /**
     * Optional convenience fields to help with analytics/queries.
     */
    #[ORM\Column(type: 'date', nullable: true)]
    #[Groups(['review:read', 'review:write'])]
    private ?\DateTimeInterface $checkoutDate = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    #[Groups(['review:read', 'review:write'])]
    private ?string $source = null; // e.g., "Airbnb"

    #[ORM\Column(name: 'unit_id', type: 'integer', nullable: true)]
    #[Groups(['review:read', 'review:write'])]
    private ?int $unitId = null;

    #[ORM\Column(type: 'string', length: 180, nullable: true)]
    #[Groups(['review:read', 'review:write'])]
    private ?string $unitName = null;

    #[ORM\Column(type: 'datetime_immutable')]
    #[Groups(['review:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: 'datetime_immutable')]
    #[Groups(['review:read'])]
    private ?\DateTimeImmutable $updatedAt = null;

    // ——— Lifecycle hooks ———
    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable('now');
        $this->createdAt = $this->createdAt ?? $now;
        $this->updatedAt = $this->updatedAt ?? $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now');
    }

    // ——— Getters/Setters ———
    public function getId(): ?int { return $this->id; }

    public function getReservationId(): ?int { return $this->reservationId; }
    public function setReservationId(int $reservationId): self { $this->reservationId = $reservationId; return $this; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): self { $this->status = $status; return $this; }

    public function getCheckoutDate(): ?\DateTimeInterface { return $this->checkoutDate; }
    public function setCheckoutDate(?\DateTimeInterface $checkoutDate): self { $this->checkoutDate = $checkoutDate; return $this; }

    public function getSource(): ?string { return $this->source; }
    public function setSource(?string $source): self { $this->source = $source; return $this; }

    public function getUnitId(): ?int
    {
        return $this->unitId;
    }

    public function setUnitId(?int $unitId): self
    {
        $this->unitId = $unitId;
        return $this;
    }

    public function getUnitName(): ?string { return $this->unitName; }
    public function setUnitName(?string $unitName): self { $this->unitName = $unitName; return $this; }

    public function getCreatedAt(): ?\DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(?\DateTimeImmutable $createdAt): self { $this->createdAt = $createdAt; return $this; }

    public function getUpdatedAt(): ?\DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeImmutable $updatedAt): self { $this->updatedAt = $updatedAt; return $this; }
}
