<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Metadata\ApiFilter;
use App\Repository\SocialPostChannelRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: SocialPostChannelRepository::class)]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    normalizationContext: ['groups' => ['social_channel.read']],
    denormalizationContext: ['groups' => ['social_channel.write']],
    operations: [
        new GetCollection(),
        new Post(),
        new Get(),
        new Patch(),
        new Delete(),
    ]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'platform' => 'exact',
    'status' => 'exact',
    'post' => 'exact',
    'channelType' => 'exact',
    'objective' => 'exact',
])]
#[ApiFilter(OrderFilter::class, properties: [
    'dateScheduled' => 'DESC',
    'updatedAt' => 'DESC',
    'startAt' => 'DESC',
    'endAt' => 'DESC',
])]
#[ApiFilter(DateFilter::class, properties: [
    'dateScheduled',
    'createdAt',
    'updatedAt',
    'startAt',
    'endAt',
])]
class SocialPostChannel
{
    public const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn'];
    public const STATUSES  = ['Draft', 'Scheduled', 'Published'];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['social_channel.read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'channels')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    #[Assert\NotNull]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?SocialPost $post = null;

    #[ORM\Column(length: 40)]
    #[Assert\NotBlank]
    #[Assert\Choice(choices: self::PLATFORMS)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $platform = 'Instagram';

    // Date or DateTime; using datetime for precise scheduling.
    #[ORM\Column(type: 'datetime')]
    #[Assert\NotBlank]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?\DateTimeInterface $dateScheduled = null;

    #[ORM\Column(length: 30)]
    #[Assert\Choice(choices: self::STATUSES)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private string $status = 'Draft';

    // Platform post id or URL after publishing
    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $platformPostId = null;

    #[ORM\Column(type: 'boolean')]
    #[Groups(['social_channel.read','social_channel.write'])]
    private bool $isPaid = false;

    // Channel type: Organic vs Paid (replaces isPaid going forward)
    #[ORM\Column(length: 20)]
    #[Assert\Choice(choices: ['Organic','Paid'])]
    #[Groups(['social_channel.read','social_channel.write'])]
    private string $channelType = 'Organic';

    // For Paid campaigns: start/end range (Organic uses dateScheduled)
    #[ORM\Column(type: 'datetime', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?\DateTimeInterface $startAt = null;

    #[ORM\Column(type: 'datetime', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?\DateTimeInterface $endAt = null;

    // Campaign metadata / planning
    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $budget = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $dailyBudget = null;

    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $objective = null;

    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $campaignId = null;

    // UTM parameters for attribution
    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $utmSource = null;

    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $utmMedium = null;

    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $utmCampaign = null;

    // Metrics (all nullable)
    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $reach = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $impressions = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $clicks = null;

    #[ORM\Column(type: 'float', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?float $ctr = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $likes = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $comments = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $shares = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $saves = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?int $leads = null;

    // Spend; use decimal for money to avoid float precision issues
    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $spent = null; // keep as string per Doctrine decimal best practice

    #[ORM\Column(type: 'float', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?float $cpc = null;

    #[ORM\Column(type: 'float', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?float $cpl = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['social_channel.read','social_channel.write'])]
    private ?string $notes = null;

    #[ORM\Column(type: 'datetime')]
    #[Groups(['social_channel.read'])]
    private ?\DateTimeInterface $createdAt = null;

    #[ORM\Column(type: 'datetime')]
    #[Groups(['social_channel.read'])]
    private ?\DateTimeInterface $updatedAt = null;

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable('now');
        $this->createdAt = $now;
        $this->updatedAt = $now;
        if (!$this->status) {
            $this->status = 'Draft';
        }
        $this->isPaid = ($this->channelType === 'Paid');
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now');
        $this->isPaid = ($this->channelType === 'Paid');
    }

    // Getters / Setters

    public function getId(): ?int { return $this->id; }

    public function getPost(): ?SocialPost { return $this->post; }
    public function setPost(?SocialPost $post): self { $this->post = $post; return $this; }

    public function getPlatform(): ?string { return $this->platform; }
    public function setPlatform(?string $platform): self { $this->platform = $platform; return $this; }

    public function getDateScheduled(): ?\DateTimeInterface { return $this->dateScheduled; }
    public function setDateScheduled(?\DateTimeInterface $dateScheduled): self { $this->dateScheduled = $dateScheduled; return $this; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): self { $this->status = $status; return $this; }

    public function getPlatformPostId(): ?string { return $this->platformPostId; }
    public function setPlatformPostId(?string $platformPostId): self { $this->platformPostId = $platformPostId; return $this; }

    public function isPaid(): bool { return $this->isPaid; }
    public function setIsPaid(bool $isPaid): self { $this->isPaid = $isPaid; return $this; }

    public function getUtmSource(): ?string { return $this->utmSource; }
    public function setUtmSource(?string $utmSource): self { $this->utmSource = $utmSource; return $this; }

    public function getUtmMedium(): ?string { return $this->utmMedium; }
    public function setUtmMedium(?string $utmMedium): self { $this->utmMedium = $utmMedium; return $this; }

    public function getUtmCampaign(): ?string { return $this->utmCampaign; }
    public function setUtmCampaign(?string $utmCampaign): self { $this->utmCampaign = $utmCampaign; return $this; }

    public function getReach(): ?int { return $this->reach; }
    public function setReach(?int $reach): self { $this->reach = $reach; return $this; }

    public function getImpressions(): ?int { return $this->impressions; }
    public function setImpressions(?int $impressions): self { $this->impressions = $impressions; return $this; }

    public function getClicks(): ?int { return $this->clicks; }
    public function setClicks(?int $clicks): self { $this->clicks = $clicks; return $this; }

    public function getCtr(): ?float { return $this->ctr; }
    public function setCtr(?float $ctr): self { $this->ctr = $ctr; return $this; }

    public function getLikes(): ?int { return $this->likes; }
    public function setLikes(?int $likes): self { $this->likes = $likes; return $this; }

    public function getComments(): ?int { return $this->comments; }
    public function setComments(?int $comments): self { $this->comments = $comments; return $this; }

    public function getShares(): ?int { return $this->shares; }
    public function setShares(?int $shares): self { $this->shares = $shares; return $this; }

    public function getSaves(): ?int { return $this->saves; }
    public function setSaves(?int $saves): self { $this->saves = $saves; return $this; }

    public function getLeads(): ?int { return $this->leads; }
    public function setLeads(?int $leads): self { $this->leads = $leads; return $this; }

    public function getSpent(): ?string { return $this->spent; }
    public function setSpent(?string $spent): self { $this->spent = $spent; return $this; }

    public function getCpc(): ?float { return $this->cpc; }
    public function setCpc(?float $cpc): self { $this->cpc = $cpc; return $this; }

    public function getCpl(): ?float { return $this->cpl; }
    public function setCpl(?float $cpl): self { $this->cpl = $cpl; return $this; }

    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $notes): self { $this->notes = $notes; return $this; }

    public function getCreatedAt(): ?\DateTimeInterface { return $this->createdAt; }
    public function setCreatedAt(?\DateTimeInterface $createdAt): self { $this->createdAt = $createdAt; return $this; }

    public function getUpdatedAt(): ?\DateTimeInterface { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeInterface $updatedAt): self { $this->updatedAt = $updatedAt; return $this; }
    public function getChannelType(): string { return $this->channelType; }
    public function setChannelType(string $channelType): self { $this->channelType = $channelType; return $this; }

    public function getStartAt(): ?\DateTimeInterface { return $this->startAt; }
    public function setStartAt(?\DateTimeInterface $startAt): self { $this->startAt = $startAt; return $this; }

    public function getEndAt(): ?\DateTimeInterface { return $this->endAt; }
    public function setEndAt(?\DateTimeInterface $endAt): self { $this->endAt = $endAt; return $this; }

    public function getBudget(): ?string { return $this->budget; }
    public function setBudget(?string $budget): self { $this->budget = $budget; return $this; }

    public function getDailyBudget(): ?string { return $this->dailyBudget; }
    public function setDailyBudget(?string $dailyBudget): self { $this->dailyBudget = $dailyBudget; return $this; }

    public function getObjective(): ?string { return $this->objective; }
    public function setObjective(?string $objective): self { $this->objective = $objective; return $this; }

    public function getCampaignId(): ?string { return $this->campaignId; }
    public function setCampaignId(?string $campaignId): self { $this->campaignId = $campaignId; return $this; }
}