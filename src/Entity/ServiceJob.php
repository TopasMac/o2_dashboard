<?php

declare(strict_types=1);

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'service_job')]
class ServiceJob
{
    public const BILL_TO_CLIENT = 'CLIENT';
    public const BILL_TO_OWNERS2 = 'OWNERS2';

    public const PENDING = 'pending';
    public const DONE = 'done';
    public const CANCELLED = 'cancelled';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private Unit $unit;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private TransactionCategory $category;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $scheduledDate;

    #[ORM\Column(length: 255)]
    private string $description;

    #[ORM\ManyToOne]
    private ?ServiceProvider $provider = null;

    #[ORM\Column(length: 16, options: ['default' => self::PENDING])]
    private string $status = self::PENDING;

    #[ORM\Column(length: 16, options: ['default' => self::BILL_TO_CLIENT])]
    private string $billTo = self::BILL_TO_CLIENT;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    public function __construct(
        Unit $unit,
        TransactionCategory $category,
        \DateTimeImmutable $scheduledDate,
        string $description,
        ?ServiceProvider $provider = null,
        ?string $notes = null,
    ) {
        $this->schedule($unit, $category, $scheduledDate, $description, $provider, $notes);
    }

    public function schedule(
        Unit $unit,
        TransactionCategory $category,
        \DateTimeImmutable $scheduledDate,
        string $description,
        ?ServiceProvider $provider,
        ?string $notes,
    ): void {
        $this->unit = $unit;
        $this->category = $category;
        $this->scheduledDate = $scheduledDate;
        $this->description = $description;
        $this->provider = $provider;
        $this->notes = $notes;
    }

    public function setStatus(string $status): void
    {
        if (!in_array($status, [self::PENDING, self::DONE, self::CANCELLED], true)) {
            throw new \InvalidArgumentException('Choose a valid status.');
        }

        $this->status = $status;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUnit(): Unit
    {
        return $this->unit;
    }

    public function getCategory(): TransactionCategory
    {
        return $this->category;
    }

    public function getScheduledDate(): \DateTimeImmutable
    {
        return $this->scheduledDate;
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function getProvider(): ?ServiceProvider
    {
        return $this->provider;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getBillTo(): string
    {
        return $this->billTo;
    }

    public function setBillTo(string $billTo): void
    {
        if (!in_array($billTo, [self::BILL_TO_CLIENT, self::BILL_TO_OWNERS2], true)) {
            throw new \InvalidArgumentException('Choose Client or Owners2 for Bill To.');
        }

        $this->billTo = $billTo;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
    }
}
