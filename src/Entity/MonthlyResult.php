<?php

namespace App\Entity;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;

#[ORM\Entity(readOnly: true)]
#[ORM\Table(name: "v_monthly_results")]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection()
    ],
    normalizationContext: ['groups' => ['monthly:read']],
    paginationClientEnabled: true,
    paginationItemsPerPage: 50
)]
#[ApiFilter(SearchFilter::class, properties: [
    'yearMonth' => 'exact',
    'city' => 'exact',
    'unitId' => 'exact',
    'paymentType' => 'exact',
    'source' => 'exact'
])]
#[ApiFilter(OrderFilter::class, properties: [
    'yearMonth',
    'city',
    'unitName',
    'commission',
    'o2Total',
    'clientIncome'
], arguments: ['orderParameterName' => 'order'])]
class MonthlyResult
{
    #[ORM\Id]
    #[ORM\Column(name: "monthly_id", type: "string", length: 255)]
    #[Groups(['monthly:read'])]
    private string $monthlyId;

    #[ORM\Column(name: "year_month", type: "string", length: 7)]
    #[Groups(['monthly:read'])]
    private string $yearMonth;

    #[ORM\Column(name: "unit_id", type: "integer")]
    #[Groups(['monthly:read'])]
    private int $unitId;

    #[ORM\Column(name: "unit_name", type: "string", length: 255)]
    #[Groups(['monthly:read'])]
    private string $unitName;

    #[ORM\Column(name: "city", type: "string", length: 100, nullable: true)]
    #[Groups(['monthly:read'])]
    private ?string $city = null;

    #[ORM\Column(name: "source", type: "string", length: 100, nullable: true)]
    #[Groups(['monthly:read'])]
    private ?string $source = null;

    #[ORM\Column(name: "payment_type", type: "string", length: 50)]
    #[Groups(['monthly:read'])]
    private string $paymentType;

    #[ORM\Column(name: "nights", type: "integer")]
    #[Groups(['monthly:read'])]
    private int $nights;

    #[ORM\Column(name: "room_fee", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $roomFee;

    #[ORM\Column(name: "payout", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $payout;

    #[ORM\Column(name: "tax_amount", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $taxAmount;

    #[ORM\Column(name: "net_payout", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $netPayout;

    #[ORM\Column(name: "cleaning_fee", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $cleaningFee;

    #[ORM\Column(name: "commission", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $commission;

    #[ORM\Column(name: "o2_total", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $o2Total;

    #[ORM\Column(name: "client_income", type: "decimal", precision: 12, scale: 2)]
    #[Groups(['monthly:read'])]
    private string $clientIncome;

    // Getters only (read-only view)
    public function getMonthlyId(): string { return $this->monthlyId; }
    public function getYearMonth(): string { return $this->yearMonth; }
    public function getUnitId(): int { return $this->unitId; }
    public function getUnitName(): string { return $this->unitName; }
    public function getCity(): ?string { return $this->city; }
    public function getSource(): ?string { return $this->source; }
    public function getPaymentType(): string { return $this->paymentType; }
    public function getNights(): int { return $this->nights; }
    public function getRoomFee(): string { return $this->roomFee; }
    public function getPayout(): string { return $this->payout; }
    public function getTaxAmount(): string { return $this->taxAmount; }
    public function getNetPayout(): string { return $this->netPayout; }
    public function getCleaningFee(): string { return $this->cleaningFee; }
    public function getCommission(): string { return $this->commission; }
    public function getO2Total(): string { return $this->o2Total; }
    public function getClientIncome(): string { return $this->clientIncome; }
}