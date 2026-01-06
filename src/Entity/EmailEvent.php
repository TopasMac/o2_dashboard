<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'email_event')]
#[ORM\Index(columns: ['unit_id', 'year_month', 'category'])]
#[ORM\Index(columns: ['sent_at'])]
#[ORM\Index(columns: ['to_email'])]
class EmailEvent
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // e.g., REPORT, HOA_PROOF, MISC
    #[ORM\Column(type: 'string', length: 50)]
    private string $category;

    // Optional relations to help querying by unit/client
    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(name: 'unit_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?Unit $unit = null;

    #[ORM\ManyToOne(targetEntity: Client::class)]
    #[ORM\JoinColumn(name: 'client_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?Client $client = null;

    // YYYY-MM for report grouping
    #[ORM\Column(name: 'year_month', type: 'string', length: 7, nullable: true)]
    private ?string $yearMonth = null;

    #[ORM\Column(name: 'to_email', type: 'string', length: 320)]
    private string $toEmail;

    #[ORM\Column(name: 'cc_email', type: 'string', length: 320, nullable: true)]
    private ?string $ccEmail = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $subject = null;

    // SENT, FAILED
    #[ORM\Column(type: 'string', length: 20, options: ['default' => 'QUEUED'])]
    private string $status = 'QUEUED';

    #[ORM\Column(name: 'message_id', type: 'string', length: 190, nullable: true)]
    private ?string $messageId = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $error = null;

    #[ORM\Column(name: 'sent_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $sentAt = null;

    // Optional: who initiated the send (username/user id)
    #[ORM\Column(name: 'created_by', type: 'string', length: 120, nullable: true)]
    private ?string $createdBy = null;

    #[ORM\Column(name: 'attachment_count', type: 'integer', options: ['default' => 0])]
    private int $attachmentCount = 0;

    #[ORM\Column(name: 'attachments_json', type: 'json', nullable: true)]
    private ?array $attachmentsJson = null;

    public function __construct()
    {
        $this->status = 'QUEUED';
    }

    public function getId(): ?int { return $this->id; }

    public function getCategory(): string { return $this->category; }
    public function setCategory(string $category): self { $this->category = $category; return $this; }

    public function getUnit(): ?Unit { return $this->unit; }
    public function setUnit(?Unit $unit): self { $this->unit = $unit; return $this; }

    public function getClient(): ?Client { return $this->client; }
    public function setClient(?Client $client): self { $this->client = $client; return $this; }

    public function getYearMonth(): ?string { return $this->yearMonth; }
    public function setYearMonth(?string $yearMonth): self { $this->yearMonth = $yearMonth; return $this; }

    public function getToEmail(): string { return $this->toEmail; }
    public function setToEmail(string $toEmail): self { $this->toEmail = $toEmail; return $this; }

    public function getCcEmail(): ?string { return $this->ccEmail; }
    public function setCcEmail(?string $ccEmail): self { $this->ccEmail = $ccEmail; return $this; }

    public function getSubject(): ?string { return $this->subject; }
    public function setSubject(?string $subject): self { $this->subject = $subject; return $this; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): self { $this->status = $status; return $this; }

    public function getMessageId(): ?string { return $this->messageId; }
    public function setMessageId(?string $messageId): self { $this->messageId = $messageId; return $this; }

    public function getError(): ?string { return $this->error; }
    public function setError(?string $error): self { $this->error = $error; return $this; }

    public function getSentAt(): ?\DateTimeImmutable { return $this->sentAt; }
    public function setSentAt(?\DateTimeImmutable $sentAt): self { $this->sentAt = $sentAt; return $this; }

    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $createdBy): self { $this->createdBy = $createdBy; return $this; }

    public function getAttachmentCount(): int { return $this->attachmentCount; }
    public function setAttachmentCount(int $attachmentCount): self { $this->attachmentCount = $attachmentCount; return $this; }

    public function getAttachmentsJson(): ?array { return $this->attachmentsJson; }
    public function setAttachmentsJson(?array $attachmentsJson): self { $this->attachmentsJson = $attachmentsJson; return $this; }
}