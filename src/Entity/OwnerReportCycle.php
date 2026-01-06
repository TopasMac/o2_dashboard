<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use Doctrine\ORM\Mapping as ORM;
use Doctrine\ORM\Mapping\UniqueConstraint;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use App\Entity\EmailEvent;

#[ORM\Entity]
#[ApiResource(operations: [
    new GetCollection(),
    new Post(),
    new Get(),
    new Patch(),
])]
#[ApiFilter(SearchFilter::class, properties: [
    "yearMonth" => "exact",
    "unit" => "exact",
])]
#[ORM\Table(name: "owner_report_cycle", uniqueConstraints: [new UniqueConstraint(name: "uniq_unit_yearmonth", columns: ["unit_id", "report_month"])])]
#[ORM\HasLifecycleCallbacks]
class OwnerReportCycle
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: "integer")]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: "unit_id", referencedColumnName: "id", nullable: false)]
    private ?Unit $unit = null;

    #[ORM\Column(name: "report_month", type: "string", length: 7)]
    private string $yearMonth;

    #[ORM\Column(name: "report_issued_at", type: "datetime_immutable", nullable: true)]
    private ?\DateTimeImmutable $reportIssuedAt = null;

    #[ORM\Column(name: "report_issued_by", type: "string", length: 100, nullable: true)]
    private ?string $reportIssuedBy = null;

    #[ORM\Column(name: "report_url", type: "string", length: 512, nullable: true)]
    private ?string $reportUrl = null;

    #[ORM\Column(name: "payment_status", type: "string", length: 20, options: ["default" => "PENDING"])]
    private string $paymentStatus = 'PENDING';

    #[ORM\Column(name: "payment_requested", type: "boolean", options: ["default" => false])]
    private bool $paymentRequested = false;

    #[ORM\Column(name: "payment_amount", type: "decimal", precision: 12, scale: 2, nullable: true)]
    private ?string $paymentAmount = null;

    #[ORM\Column(name: "payment_ref", type: "string", length: 120, nullable: true)]
    private ?string $paymentRef = null;

    #[ORM\Column(name: "payment_method", type: "string", length: 60, nullable: true)]
    private ?string $paymentMethod = null;

    #[ORM\Column(name: "payment_at", type: "datetime_immutable", nullable: true)]
    private ?\DateTimeImmutable $paymentAt = null;

    #[ORM\Column(name: "payment_by", type: "string", length: 100, nullable: true)]
    private ?string $paymentBy = null;

    #[ORM\Column(name: "email_status", type: "string", length: 20, options: ["default" => "PENDING"])]
    private string $emailStatus = 'PENDING';

    #[ORM\Column(name: "email_message_id", type: "string", length: 200, nullable: true)]
    private ?string $emailMessageId = null;

    #[ORM\Column(name: "email_at", type: "datetime_immutable", nullable: true)]
    private ?\DateTimeImmutable $emailAt = null;

    #[ORM\ManyToOne(targetEntity: EmailEvent::class)]
    #[ORM\JoinColumn(name: "last_email_event_id", referencedColumnName: "id", nullable: true, onDelete: "SET NULL")]
    private ?EmailEvent $lastEmailEvent = null;

    #[ORM\Column(name: "email_count", type: "integer", options: ["default" => 0])]
    private int $emailCount = 0;

    #[ORM\Column(name: "notes", type: "text", nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(name: "created_at", type: "datetime_immutable")]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(name: "updated_at", type: "datetime_immutable")]
    private ?\DateTimeImmutable $updatedAt = null;

    // Getters and Setters

    public function getId(): ?int
    {
        return $this->id;
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

    public function getYearMonth(): string
    {
        return $this->yearMonth;
    }

    public function setYearMonth(string $yearMonth): self
    {
        $this->yearMonth = $yearMonth;
        return $this;
    }

    public function getReportIssuedAt(): ?\DateTimeImmutable
    {
        return $this->reportIssuedAt;
    }

    public function setReportIssuedAt(?\DateTimeImmutable $reportIssuedAt): self
    {
        $this->reportIssuedAt = $reportIssuedAt;
        return $this;
    }

    public function getReportIssuedBy(): ?string
    {
        return $this->reportIssuedBy;
    }

    public function setReportIssuedBy(?string $reportIssuedBy): self
    {
        $this->reportIssuedBy = $reportIssuedBy;
        return $this;
    }

    public function getReportUrl(): ?string
    {
        return $this->reportUrl;
    }

    public function setReportUrl(?string $reportUrl): self
    {
        $this->reportUrl = $reportUrl;
        return $this;
    }

    public function getPaymentStatus(): string
    {
        return $this->paymentStatus;
    }

    public function setPaymentStatus(string $paymentStatus): self
    {
        $this->paymentStatus = $paymentStatus;
        return $this;
    }

    public function isPaymentRequested(): bool
    {
        return $this->paymentRequested;
    }

    public function getPaymentRequested(): bool
    {
        return $this->paymentRequested;
    }

    public function setPaymentRequested(bool $paymentRequested): self
    {
        $this->paymentRequested = $paymentRequested;
        return $this;
    }

    public function getPaymentAmount(): ?string
    {
        return $this->paymentAmount;
    }

    public function setPaymentAmount(?string $paymentAmount): self
    {
        $this->paymentAmount = $paymentAmount;
        return $this;
    }

    public function getPaymentRef(): ?string
    {
        return $this->paymentRef;
    }

    public function setPaymentRef(?string $paymentRef): self
    {
        $this->paymentRef = $paymentRef;
        return $this;
    }

    public function getPaymentMethod(): ?string
    {
        return $this->paymentMethod;
    }

    public function setPaymentMethod(?string $paymentMethod): self
    {
        $this->paymentMethod = $paymentMethod;
        return $this;
    }

    public function getPaymentAt(): ?\DateTimeImmutable
    {
        return $this->paymentAt;
    }

    public function setPaymentAt(?\DateTimeImmutable $paymentAt): self
    {
        $this->paymentAt = $paymentAt;
        return $this;
    }

    public function getPaymentBy(): ?string
    {
        return $this->paymentBy;
    }

    public function setPaymentBy(?string $paymentBy): self
    {
        $this->paymentBy = $paymentBy;
        return $this;
    }

    public function getEmailStatus(): string
    {
        return $this->emailStatus;
    }

    public function setEmailStatus(string $emailStatus): self
    {
        $this->emailStatus = $emailStatus;
        return $this;
    }

    public function getEmailMessageId(): ?string
    {
        return $this->emailMessageId;
    }

    public function setEmailMessageId(?string $emailMessageId): self
    {
        $this->emailMessageId = $emailMessageId;
        return $this;
    }

    public function getEmailAt(): ?\DateTimeImmutable
    {
        return $this->emailAt;
    }

    public function setEmailAt(?\DateTimeImmutable $emailAt): self
    {
        $this->emailAt = $emailAt;
        return $this;
    }

    public function getLastEmailEvent(): ?EmailEvent
    {
        return $this->lastEmailEvent;
    }

    public function setLastEmailEvent(?EmailEvent $event): self
    {
        $this->lastEmailEvent = $event;
        return $this;
    }

    public function getEmailCount(): int
    {
        return $this->emailCount;
    }

    public function setEmailCount(int $count): self
    {
        $this->emailCount = $count;
        return $this;
    }

    public function incrementEmailCount(int $by = 1): self
    {
        $this->emailCount += $by;
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

    public function setCreatedAt(\DateTimeImmutable $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(\DateTimeImmutable $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }
}