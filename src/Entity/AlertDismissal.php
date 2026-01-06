<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use Doctrine\ORM\Mapping as ORM;
use App\Entity\User;

#[ORM\Entity]
#[ORM\Table(name: 'alert_dismissal', uniqueConstraints: [
    new ORM\UniqueConstraint(name: 'uniq_dismissal_user_category_token', columns: ['dismissed_by_id', 'category', 'token']),
])]
#[ApiResource(operations: [
    new GetCollection(),
    new Post(),
])]
#[ApiFilter(SearchFilter::class, properties: [
    'token' => 'exact',
    'category' => 'exact',
])]
class AlertDismissal
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 64)]
    private string $category = 'alert';

    #[ORM\Column(type: 'string', length: 255)]
    private string $token;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $dismissedAt;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false)]
    private ?User $dismissedBy = null;

    public function __construct()
    {
        $this->dismissedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getToken(): string
    {
        return $this->token;
    }

    public function setToken(string $token): self
    {
        $this->token = $token;
        return $this;
    }

    public function getDismissedAt(): \DateTimeImmutable
    {
        return $this->dismissedAt;
    }

    public function setDismissedAt(\DateTimeImmutable $dismissedAt): self
    {
        $this->dismissedAt = $dismissedAt;
        return $this;
    }

    public function getCategory(): string
    {
        return $this->category;
    }

    public function setCategory(string $category): self
    {
        $this->category = $category;
        return $this;
    }

    public function getDismissedBy(): ?User
    {
        return $this->dismissedBy;
    }

    public function setDismissedBy(?User $dismissedBy): self
    {
        $this->dismissedBy = $dismissedBy;
        return $this;
    }
}