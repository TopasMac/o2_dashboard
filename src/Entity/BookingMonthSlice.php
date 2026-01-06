<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use App\Controller\Api\BookingMonthSliceProvider;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;

#[ORM\Entity]
#[ORM\Table(name: 'booking_month_slice')]
#[ApiResource(
    paginationItemsPerPage: 100,
    paginationMaximumItemsPerPage: 200,
    paginationEnabled: true,
    normalizationContext: ['groups' => ['booking_month_slice:read']],
    denormalizationContext: ['groups' => ['booking_month_slice:write']],
    provider: BookingMonthSliceProvider::class
)]
#[ApiFilter(SearchFilter::class, properties: [
    'yearMonth'      => 'exact',
    'unitId'         => 'exact',
    'bookingId'      => 'exact',
    'city'           => 'partial',
    'source'         => 'exact',
    'paymentMethod'  => 'exact',
    'guestType'      => 'exact',
])]
#[ApiFilter(OrderFilter::class, properties: [
    'yearMonth', 'unitId', 'bookingId'
], arguments: ['orderParameterName' => 'order'])]
class BookingMonthSlice
{
    /** Normalize money to string with 2 decimals (nullable version). */
    private function normalizeMoneyNullable($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        return number_format((float) $value, 2, '.', '');
    }

    /** Normalize money to string with 2 decimals (non-nullable version). */
    private function normalizeMoneyNotNull($value): string
    {
        if ($value === null || $value === '') {
            $value = 0;
        }
        return number_format((float) $value, 2, '.', '');
    }

    // =====================
    // Keys / Identity
    // =====================

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'bigint')]
    #[Groups(['booking_month_slice:read'])]
    private ?int $id = null;

    #[ORM\Column(type: 'bigint')]
    #[Groups(['booking_month_slice:read'])]
    private int $bookingId; // FK → all_bookings.id

    #[ORM\Column(type: 'bigint')]
    #[Groups(['booking_month_slice:read'])]
    private int $unitId; // FK (logical)

    #[ORM\Column(type: 'string', length: 64)]
    #[Groups(['booking_month_slice:read'])]
    private string $city; // copied from all_bookings for fast filtering

    #[ORM\Column(type: 'string', length: 32)]
    #[Groups(['booking_month_slice:read'])]
    private string $source; // Airbnb / Private / etc.

    #[ORM\Column(type: 'string', length: 32)]
    #[Groups(['booking_month_slice:read'])]
    private string $paymentMethod; // O2Pay / OwnersPay / etc.

    #[ORM\Column(type: 'string', length: 32, nullable: true)]
    #[Groups(['booking_month_slice:read'])]
    private ?string $guestType = null; // Regular / Owner / etc.

    #[ORM\Column(type: 'string', length: 7)]
    #[Groups(['booking_month_slice:read'])]
    private string $yearMonth; // YYYY-MM

    #[ORM\Column(type: 'date')]
    #[Groups(['booking_month_slice:read'])]
    private \DateTimeInterface $monthStartDate;

    #[ORM\Column(type: 'date')]
    #[Groups(['booking_month_slice:read'])]
    private \DateTimeInterface $monthEndDate;

    // =====================
    // Metrics
    // =====================

    #[ORM\Column(type: 'integer')]
    #[Groups(['booking_month_slice:read'])]
    private int $nightsTotal = 0;

    #[ORM\Column(type: 'integer')]
    #[Groups(['booking_month_slice:read'])]
    private int $nightsInMonth = 0;

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $roomFeeInMonth = '0.00';

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $payoutInMonth = '0.00';

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $taxInMonth = '0.00';

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $netPayoutInMonth = '0.00';

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $cleaningFeeInMonth = '0.00';

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $commissionBaseInMonth = '0.00';

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $o2CommissionInMonth = '0.00';

    #[ORM\Column(type: 'decimal', precision: 12, scale: 2, options: ['default' => 0])]
    #[Groups(['booking_month_slice:read'])]
    private string $ownerPayoutInMonth = '0.00';

    // =====================
    // Getters
    // =====================
    public function getId(): ?int { return $this->id; }
    public function getBookingId(): int { return $this->bookingId; }
    public function getUnitId(): int { return $this->unitId; }
    public function getCity(): string { return $this->city; }
    public function getSource(): string { return $this->source; }
    public function getPaymentMethod(): string { return $this->paymentMethod; }
    public function getGuestType(): ?string { return $this->guestType; }
    public function getYearMonth(): string { return $this->yearMonth; }
    public function getMonthStartDate(): \DateTimeInterface { return $this->monthStartDate; }
    public function getMonthEndDate(): \DateTimeInterface { return $this->monthEndDate; }
    public function getNightsTotal(): int { return $this->nightsTotal; }
    public function getNightsInMonth(): int { return $this->nightsInMonth; }
    public function getRoomFeeInMonth(): string { return $this->roomFeeInMonth; }
    public function getPayoutInMonth(): string { return $this->payoutInMonth; }
    public function getTaxInMonth(): string { return $this->taxInMonth; }
    public function getNetPayoutInMonth(): string { return $this->netPayoutInMonth; }
    public function getCleaningFeeInMonth(): string { return $this->cleaningFeeInMonth; }
    public function getCommissionBaseInMonth(): string { return $this->commissionBaseInMonth; }
    public function getO2CommissionInMonth(): string { return $this->o2CommissionInMonth; }
    public function getOwnerPayoutInMonth(): string { return $this->ownerPayoutInMonth; }

    // =====================
    // Setters
    // =====================
    public function setBookingId(int $bookingId): self { $this->bookingId = $bookingId; return $this; }
    public function setUnitId(int $unitId): self { $this->unitId = $unitId; return $this; }
    public function setCity(string $city): self { $this->city = $city; return $this; }
    public function setSource(string $source): self { $this->source = $source; return $this; }
    public function setPaymentMethod(string $paymentMethod): self { $this->paymentMethod = $paymentMethod; return $this; }
    public function setGuestType(?string $guestType): self { $this->guestType = $guestType; return $this; }
    public function setYearMonth(string $yearMonth): self { $this->yearMonth = $yearMonth; return $this; }
    public function setMonthStartDate(\DateTimeInterface $d): self { $this->monthStartDate = $d; return $this; }
    public function setMonthEndDate(\DateTimeInterface $d): self { $this->monthEndDate = $d; return $this; }
    public function setNightsTotal(int $n): self { $this->nightsTotal = $n; return $this; }
    public function setNightsInMonth(int $n): self { $this->nightsInMonth = $n; return $this; }

    public function setRoomFeeInMonth($v): self { $this->roomFeeInMonth = $this->normalizeMoneyNotNull($v); return $this; }
    public function setPayoutInMonth($v): self { $this->payoutInMonth = $this->normalizeMoneyNotNull($v); return $this; }
    public function setTaxInMonth($v): self { $this->taxInMonth = $this->normalizeMoneyNotNull($v); return $this; }
    public function setNetPayoutInMonth($v): self { $this->netPayoutInMonth = $this->normalizeMoneyNotNull($v); return $this; }
    public function setCleaningFeeInMonth($v): self { $this->cleaningFeeInMonth = $this->normalizeMoneyNotNull($v); return $this; }
    public function setCommissionBaseInMonth($v): self { $this->commissionBaseInMonth = $this->normalizeMoneyNotNull($v); return $this; }
    public function setO2CommissionInMonth($v): self { $this->o2CommissionInMonth = $this->normalizeMoneyNotNull($v); return $this; }
    public function setOwnerPayoutInMonth($v): self { $this->ownerPayoutInMonth = $this->normalizeMoneyNotNull($v); return $this; }
}