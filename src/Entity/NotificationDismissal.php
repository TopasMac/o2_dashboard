<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Post;
use App\Repository\NotificationDismissalRepository;
use Doctrine\ORM\Mapping as ORM;
use App\Entity\User;

#[ORM\Entity(repositoryClass: NotificationDismissalRepository::class)]
#[ORM\Table(name: 'notification_dismissal')]
#[ORM\UniqueConstraint(name: 'uniq_dismissal', columns: ['user_id','unit_id','alert_type','service','month_year'])]
#[ApiResource(operations: [
    new Post(),  // create a dismissal
    new Delete(), // allow undo by id (optional, can restrict with security)
])]
class NotificationDismissal
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    #[ORM\ManyToOne(targetEntity: Unit::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Unit $unit = null;

    #[ORM\Column(length: 20)]
    private string $alertType; // 'overdue', 'due_soon', 'mismatch'

    #[ORM\Column(length: 50)]
    private string $service; // HOA, Internet, Water, CFE

    #[ORM\Column(length: 7)]
    private string $monthYear; // YYYY-MM

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $dismissedAt;

    public function __construct()
    {
        $this->dismissedAt = new \DateTimeImmutable('now');
    }

    public function getId(): ?int { return $this->id; }

    public function getUser(): ?User { return $this->user; }
    public function setUser(?User $user): self { $this->user = $user; return $this; }

    public function getUnit(): ?Unit { return $this->unit; }
    public function setUnit(?Unit $unit): self { $this->unit = $unit; return $this; }

    public function getAlertType(): string { return $this->alertType; }
    public function setAlertType(string $alertType): self { $this->alertType = $alertType; return $this; }

    public function getService(): string { return $this->service; }
    public function setService(string $service): self { $this->service = $service; return $this; }

    public function getMonthYear(): string { return $this->monthYear; }
    public function setMonthYear(string $monthYear): self { $this->monthYear = $monthYear; return $this; }

    public function getDismissedAt(): \DateTimeImmutable { return $this->dismissedAt; }
    public function setDismissedAt(\DateTimeImmutable $dismissedAt): self { $this->dismissedAt = $dismissedAt; return $this; }
}