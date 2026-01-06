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
use App\Repository\SocialPostRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: SocialPostRepository::class)]
#[ORM\HasLifecycleCallbacks]
#[ApiResource(
    normalizationContext: ['groups' => ['social.read']],
    denormalizationContext: ['groups' => ['social.write']],
    operations: [
        new GetCollection(),
        new Post(),
        new Get(),
        new Patch(),
        new Delete(),
    ]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'title' => 'partial',
    'theme' => 'partial',
    'channels.status' => 'exact',
    'channels.platform' => 'exact',
])]
#[ApiFilter(OrderFilter::class, properties: [
    'createdAt' => 'DESC',
    'updatedAt' => 'DESC',
    'channels.dateScheduled' => 'DESC',
])]
#[ApiFilter(DateFilter::class, properties: [
    'createdAt',
    'updatedAt',
    'channels.dateScheduled',
])]
class SocialPost
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['social.read', 'social_channel.read'])]
    private ?int $id = null;

    #[ORM\Column(length: 180)]
    #[Assert\NotBlank]
    #[Groups(['social.read','social.write','social_channel.read'])]
    private ?string $title = null;

    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['social.read','social.write','social_channel.read'])]
    private ?string $theme = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['social.read','social.write'])]
    private ?string $caption = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['social.read','social.write'])]
    private ?string $hashtags = null;

    // Relative path or full URL (local or S3). Upload handling will be added later.
    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['social.read','social.write'])]
    private ?string $imagePath = null;

    #[ORM\Column(type: 'datetime')]
    #[Groups(['social.read'])]
    private ?\DateTimeInterface $createdAt = null;

    #[ORM\Column(type: 'datetime')]
    #[Groups(['social.read'])]
    private ?\DateTimeInterface $updatedAt = null;

    #[ORM\OneToMany(mappedBy: 'post', targetEntity: SocialPostChannel::class, cascade: ['persist','remove'], orphanRemoval: true)]
    #[Groups(['social.read'])]
    private Collection $channels;

    public function __construct()
    {
        $this->channels = new ArrayCollection();
    }

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $now = new \DateTimeImmutable('now');
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now');
    }

    // Getters / Setters

    public function getId(): ?int { return $this->id; }

    public function getTitle(): ?string { return $this->title; }
    public function setTitle(?string $title): self { $this->title = $title; return $this; }

    public function getTheme(): ?string { return $this->theme; }
    public function setTheme(?string $theme): self { $this->theme = $theme; return $this; }

    public function getCaption(): ?string { return $this->caption; }
    public function setCaption(?string $caption): self { $this->caption = $caption; return $this; }

    public function getHashtags(): ?string { return $this->hashtags; }
    public function setHashtags(?string $hashtags): self { $this->hashtags = $hashtags; return $this; }

    public function getImagePath(): ?string { return $this->imagePath; }
    public function setImagePath(?string $imagePath): self { $this->imagePath = $imagePath; return $this; }

    public function getCreatedAt(): ?\DateTimeInterface { return $this->createdAt; }
    public function setCreatedAt(?\DateTimeInterface $dt): self { $this->createdAt = $dt; return $this; }

    public function getUpdatedAt(): ?\DateTimeInterface { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeInterface $dt): self { $this->updatedAt = $dt; return $this; }

    /**
     * @return Collection<int, SocialPostChannel>
     */
    public function getChannels(): Collection
    {
        return $this->channels;
    }

    public function addChannel(SocialPostChannel $channel): self
    {
        if (!$this->channels->contains($channel)) {
            $this->channels->add($channel);
            $channel->setPost($this);
        }
        return $this;
    }

    public function removeChannel(SocialPostChannel $channel): self
    {
        if ($this->channels->removeElement($channel)) {
            if ($channel->getPost() === $this) {
                $channel->setPost(null);
            }
        }
        return $this;
    }
}