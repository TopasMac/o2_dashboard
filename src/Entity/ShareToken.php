<?php
declare(strict_types=1);

namespace App\Entity;

use App\Repository\ShareTokenRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;

#[ORM\Entity(repositoryClass: ShareTokenRepository::class)]
#[ORM\Table(name: 'share_token')]
class ShareToken
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['share:read'])]
    private ?int $id = null;

    #[ORM\Column(type: 'string', length: 64, unique: true)]
    #[Groups(['share:read'])]
    private string $token;

    #[ORM\Column(type: 'string', length: 64)]
    #[Groups(['share:read', 'share:write'])]
    private string $resourceType;

    #[ORM\Column(type: 'integer')]
    #[Groups(['share:read', 'share:write'])]
    private int $resourceId;

    #[ORM\Column(type: 'json')]
    #[Groups(['share:read', 'share:write'])]
    private array $scope = [];

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    #[Groups(['share:read', 'share:write'])]
    private bool $canEdit = true;

    #[ORM\Column(type: 'datetime_immutable')]
    #[Groups(['share:read'])]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    #[Groups(['share:read', 'share:write'])]
    private ?\DateTimeImmutable $expiresAt = null;

    #[ORM\Column(type: 'integer', options: ['default' => 1])]
    #[Groups(['share:read', 'share:write'])]
    private int $maxUses = 1;

    #[ORM\Column(type: 'integer', options: ['default' => 0])]
    #[Groups(['share:read'])]
    private int $usedCount = 0;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    #[Groups(['share:read'])]
    private ?\DateTimeImmutable $revokedAt = null;

    #[ORM\Column(type: 'string', length: 64, nullable: true)]
    #[Groups(['share:read'])]
    private ?string $createdBy = null;

    public function __construct(
        string $resourceType,
        int $resourceId,
        array $scope = [],
        bool $canEdit = true,
        ?\DateTimeImmutable $expiresAt = null,
        int $maxUses = 1,
        ?string $createdBy = null
    ) {
        $this->resourceType = $resourceType;
        $this->resourceId = $resourceId;
        $this->scope = $scope;
        $this->canEdit = $canEdit;
        $this->createdAt = new \DateTimeImmutable();
        $this->expiresAt = $expiresAt;
        $this->maxUses = $maxUses;
        $this->token = bin2hex(random_bytes(24));
        $this->createdBy = $createdBy;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getToken(): string
    {
        return $this->token;
    }

    public function getResourceType(): string
    {
        return $this->resourceType;
    }

    public function getResourceId(): int
    {
        return $this->resourceId;
    }

    public function getScope(): array
    {
        return $this->scope;
    }

    public function canEdit(): bool
    {
        return $this->canEdit;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getExpiresAt(): ?\DateTimeImmutable
    {
        return $this->expiresAt;
    }

    public function getMaxUses(): int
    {
        return $this->maxUses;
    }

    public function getUsedCount(): int
    {
        return $this->usedCount;
    }

    public function getRevokedAt(): ?\DateTimeImmutable
    {
        return $this->revokedAt;
    }

    public function getCreatedBy(): ?string
    {
        return $this->createdBy;
    }

    public function isExpired(): bool
    {
        if ($this->revokedAt !== null) return true;
        if ($this->expiresAt && $this->expiresAt < new \DateTimeImmutable()) return true;
        if ($this->usedCount >= $this->maxUses) return true;
        return false;
    }

    public function markUsed(): void
    {
        $this->usedCount++;
    }

    public function revoke(): void
    {
        $this->revokedAt = new \DateTimeImmutable();
    }
}