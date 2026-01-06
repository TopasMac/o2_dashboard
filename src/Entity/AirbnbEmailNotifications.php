<?php

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use App\Repository\AirbnbEmailNotificationsRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: AirbnbEmailNotificationsRepository::class)]
#[ORM\Table(name: 'airbnb_email_notifications')]
#[ORM\Index(columns: ['recipient_email'], name: 'idx_airbnb_notif_recipient')]
#[ORM\Index(columns: ['received_at'], name: 'idx_airbnb_notif_received_at')]
#[ApiResource(
    normalizationContext: ['groups' => ['airbnb_email_notification:read']],
    denormalizationContext: ['groups' => ['airbnb_email_notification:write']]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'recipientEmail' => 'partial',
    'guestName' => 'partial',
    'unitName' => 'partial',
    'subject' => 'partial',
    'category' => 'partial',
])]
#[ApiFilter(DateFilter::class, properties: ['receivedAt'])]
#[ApiFilter(OrderFilter::class, properties: ['receivedAt' => 'DESC', 'id' => 'DESC'])]
class AirbnbEmailNotifications
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['airbnb_email_notification:read'])]
    private ?int $id = null;

    #[ORM\Column(name: 'subject', type: 'string', length: 255, nullable: true)]
    #[Groups(['airbnb_email_notification:read', 'airbnb_email_notification:write'])]
    private ?string $subject = null;

    #[ORM\Column(name: 'guest_name', type: 'string', length: 255, nullable: true)]
    #[Groups(['airbnb_email_notification:read', 'airbnb_email_notification:write'])]
    private ?string $guestName = null;

    // Listing / Unit name referenced in the email
    #[ORM\Column(name: 'unit_name', type: 'string', length: 255, nullable: true)]
    #[Groups(['airbnb_email_notification:read', 'airbnb_email_notification:write'])]
    private ?string $unitName = null;

    // Deep link to the Airbnb reservation, as found in the email body
    #[ORM\Column(name: 'airbnb_link', type: 'string', length: 512, nullable: true)]
    #[Groups(['airbnb_email_notification:read', 'airbnb_email_notification:write'])]
    private ?string $airbnbLink = null;

    // Optional category/type of notification (e.g., "low_review", "reservation_update")
    #[ORM\Column(name: 'category', type: 'string', length: 255, nullable: true)]
    #[Groups(['airbnb_email_notification:read', 'airbnb_email_notification:write'])]
    private ?string $category = null;

    // The mailbox that received this email (e.g., admin@owners2.com)
    #[ORM\Column(name: 'recipient_email', type: 'string', length: 255, nullable: true)]
    #[Assert\Email]
    #[Groups(['airbnb_email_notification:read', 'airbnb_email_notification:write'])]
    private ?string $recipientEmail = null;

    // When our system recorded the email
    #[ORM\Column(name: 'received_at', type: 'datetime_immutable', nullable: true)]
    #[Groups(['airbnb_email_notification:read'])]
    private ?\DateTimeImmutable $receivedAt = null;

    // (Optional) external message id to deduplicate entries
    #[ORM\Column(name: 'message_id', type: 'string', length: 255, nullable: true, unique: true)]
    #[Groups(['airbnb_email_notification:read', 'airbnb_email_notification:write'])]
    private ?string $messageId = null;

    public function __construct()
    {
        // Default to now if not provided, but field is nullable to allow external systems to override or omit.
        $this->receivedAt = new \DateTimeImmutable('now');
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSubject(): ?string
    {
        return $this->subject;
    }

    public function setSubject(?string $subject): self
    {
        $this->subject = $subject;
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

    public function getUnitName(): ?string
    {
        return $this->unitName;
    }

    public function setUnitName(?string $unitName): self
    {
        $this->unitName = $unitName;
        return $this;
    }

    public function getAirbnbLink(): ?string
    {
        return $this->airbnbLink;
    }

    public function setAirbnbLink(?string $airbnbLink): self
    {
        $this->airbnbLink = $airbnbLink;
        return $this;
    }

    public function getCategory(): ?string
    {
        return $this->category;
    }

    public function setCategory(?string $category): self
    {
        $this->category = $category;
        return $this;
    }

    public function getRecipientEmail(): ?string
    {
        return $this->recipientEmail;
    }

    public function setRecipientEmail(?string $recipientEmail): self
    {
        $this->recipientEmail = $recipientEmail;
        return $this;
    }

    public function getReceivedAt(): ?\DateTimeImmutable
    {
        return $this->receivedAt;
    }

    public function setReceivedAt(?\DateTimeImmutable $receivedAt): self
    {
        $this->receivedAt = $receivedAt;
        return $this;
    }

    public function getMessageId(): ?string
    {
        return $this->messageId;
    }

    public function setMessageId(?string $messageId): self
    {
        $this->messageId = $messageId;
        return $this;
    }
}