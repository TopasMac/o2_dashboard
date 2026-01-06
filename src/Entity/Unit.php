<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Doctrine\DBAL\Types\Types;
use Doctrine\Common\Collections\Collection;
use Doctrine\Common\Collections\ArrayCollection;
use App\Entity\Client;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Serializer\Annotation\MaxDepth;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use Symfony\Component\Validator\Constraints as Assert;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Doctrine\Orm\Filter\BooleanFilter;

#[ApiResource(
    operations: [
        new \ApiPlatform\Metadata\GetCollection(normalizationContext: ['groups' => ['unit:list']]),
        new \ApiPlatform\Metadata\Get(normalizationContext: ['groups' => ['unit:item', 'unit:read']]),
        new \ApiPlatform\Metadata\Put(),
        new \ApiPlatform\Metadata\Delete(),
    ],
    normalizationContext: ['groups' => ['unit:read']],
    denormalizationContext: ['groups' => ['unit:write']]
)]
#[ApiFilter(BooleanFilter::class, properties: ['hoa', 'cfe', 'internet', 'water'])]
#[ApiFilter(SearchFilter::class, properties: [
    'city' => 'ipartial',
    'status' => 'exact',
    'paymentType' => 'ipartial',
    'unitName' => 'ipartial',
    'type' => 'ipartial',
    'listingName' => 'ipartial',
    'hostType' => 'ipartial',
])]
#[ApiFilter(OrderFilter::class, properties: ['unitName', 'city', 'status', 'paymentType', 'type', 'listingName', 'hostType'], arguments: ['orderParameterName' => 'order'])]
#[ORM\Entity]
class Unit
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    #[Groups(['unit:list', 'unit:read', 'unit:write', 'hktransactions:read'])]
    private int $id;

    #[ORM\Column(name: 'unit_name', type: 'string', unique: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write', 'unit_transaction:read', 'hktransactions:read'])]
    private ?string $unitName = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write', 'hktransactions:read'])]
    private ?string $city = null;

    // Indicates who handles payments: 'OWNERS2' or 'CLIENT' (or empty)
    #[ORM\Column(name: 'payment_type', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    #[Assert\Choice(choices: ['OWNERS2', 'CLIENT', ''], message: 'Choose either "OWNERS2", "CLIENT", or leave it empty.')]
    private ?string $paymentType = null;

    #[ORM\Column(name: 'listing_name', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $listingName = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $status = null;

    #[ORM\Column(name: 'cc_email', type: 'string', length: 320, nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $ccEmail = null;

    // --- UNUSED FIELDS (kept for compatibility with Edit Unit and future use) ---
    #[ORM\ManyToOne(targetEntity: \App\Entity\Condo::class)]
    #[Groups(['unit:read'])]
    #[ORM\JoinColumn(name: "condo_id", referencedColumnName: "id", nullable: true, onDelete: "SET NULL")]
    private ?\App\Entity\Condo $condo = null;

    #[ORM\ManyToOne(targetEntity: Client::class, inversedBy: 'units')]
    #[MaxDepth(1)]
    #[ORM\JoinColumn(name: 'client_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?Client $client = null;

    #[ORM\Column(type: 'date', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?\DateTimeInterface $dateStarted = null;

    #[ORM\Column(type: 'date', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?\DateTimeInterface $dateEnded = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $type = null;

    #[ORM\Column(name: 'condo_id', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $condoId = null;

    #[ORM\Column(name: 'unit_number', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $unitNumber = null;

    #[ORM\Column(name: 'unit_floor', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $unitFloor = null;

    #[ORM\Column(name: 'access_type', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $accessType = null;

    #[ORM\Column(name: 'access_code', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $accessCode = null;

    #[ORM\Column(name: 'backup_lockbox', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $backupLockbox = null;

    #[ORM\Column(name: 'wifi_name', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $wifiName = null;

    #[ORM\Column(name: 'wifi_password', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $wifiPassword = null;

    #[ORM\Column(type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $parking = null;

    #[ORM\Column(name: 'pax', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $pax = null;

    #[ORM\Column(name: 'baths', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $baths = null;

    #[ORM\Column(name: 'beds', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $beds = null;

    #[ORM\Column(name: 'bed_config', type: 'json', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?array $bedConfig = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $notes = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $seoShortDescription = null;

    #[ORM\Column(name: 'cleaning_fee', type: 'float', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?float $cleaningFee = null;

    #[ORM\Column(name: 'linens_fee', type: 'float', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?float $linensFee = null;

    #[ORM\Column(name: 'host_type', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $hostType = null;

    #[ORM\Column(name: 'airbnb_email', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $airbnbEmail = null;

    #[ORM\Column(name: 'airbnb_pass', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $airbnbPass = null;

    #[ORM\Column(name: 'airbnb_id', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $airbnbId = null;

    #[ORM\Column(name: 'airbnb_ical', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $airbnbIcal = null;

    #[ORM\Column(name: 'private_ical_enabled', type: 'boolean', options: ['default' => false])]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private bool $privateIcalEnabled = false;

    #[ORM\Column(name: 'ical_export_token', type: 'string', length: 64, nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $icalExportToken = null;

    #[ORM\Column(type: 'boolean', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?bool $cfe = null;

    #[ORM\Column(name: 'cfe_reference', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $cfeReference = null;

    #[ORM\Column(name: 'cfe_name', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $cfeName = null;

    #[ORM\Column(name: 'cfe_period', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $cfePeriod = null;

    #[ORM\Column(name: 'cfe_payment_day', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $cfePaymentDay = null;

    #[ORM\Column(name: 'cfe_starting_month', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $cfeStartingMonth = null;

    #[ORM\Column(type: 'boolean', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?bool $internet = null;

    #[ORM\Column(name: 'internet_isp', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $internetIsp = null;

    #[ORM\Column(name: 'internet_reference', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $internetReference = null;

    #[ORM\Column(name: 'internet_cost', type: 'float', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?float $internetCost = null;

    #[ORM\Column(name: 'internet_deadline', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $internetDeadline = null;

    #[ORM\Column(type: 'boolean', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?bool $water = null;

    #[ORM\Column(name: 'water_reference', type: 'string', nullable: true)]
    #[Groups(['unit:read', 'unit:write'])]
    private ?string $waterReference = null;

    #[ORM\Column(name: 'water_deadline', type: 'integer', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?int $waterDeadline = null;

    #[ORM\Column(type: 'boolean', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?bool $hoa = null;

    #[ORM\Column(name: 'hoa_amount', type: 'float', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?float $hoaAmount = null;

    #[Groups(['unit:read', 'unit:write', 'unit_transaction:read', 'hktransactions:read'])]
    public function getUnitName(): ?string
    {
        return $this->unitName;
    }

    /**
     * Alias for getUnitName(), returns the unitName as the unitId.
     */
    public function getUnitId(): ?string
    {
        return $this->unitName;
    }

    /**
     * Convenience method to allow getting the unitName via __toString or custom display.
     */
    public function __toString(): string
    {
        return $this->unitName;
    }

    public function setUnitName(string $unitName): self
    {
        $this->unitName = $unitName;
        return $this;
    }

    #[Groups(['unit:list', 'unit:read', 'hktransactions:read'])]
    public function getCity(): ?string
    {
        return $this->city;
    }

    public function setCity(?string $city): self
    {
        $this->city = $city;
        return $this;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function getPaymentType(): ?string
    {
        return $this->paymentType;
    }

    public function setPaymentType(?string $paymentType): self
    {
        $this->paymentType = $paymentType;
        return $this;
    }


    public function getListingName(): ?string
    {
        return $this->listingName;
    }

    public function setListingName(?string $listingName): self
    {
        $this->listingName = $listingName ? strtoupper($listingName) : null;
        return $this;
    }


    public function getStatus(): ?string
    {
        return $this->status;
    }

    public function setStatus(?string $status): self
    {
        $this->status = $status;
        return $this;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function getCcEmail(): ?string
    {
        return $this->ccEmail;
    }

    public function setCcEmail(?string $ccEmail): self
    {
        $this->ccEmail = $ccEmail ? trim($ccEmail) : null;
        return $this;
    }

    public function getClient(): ?Client
    {
        return $this->client;
    }

    public function getClientId(): ?int
    {
        return $this->client?->getId();
    }

    public function setClient(?Client $client): self
    {
        $this->client = $client;
        return $this;
    }

    public function setDateStarted(?\DateTimeInterface $dateStarted): self
    {
        $this->dateStarted = $dateStarted;
        return $this;
    }

    public function setDateEnded(?\DateTimeInterface $dateEnded): self
    {
        $this->dateEnded = $dateEnded;
        return $this;
    }

    public function setType(?string $type): self
    {
        $this->type = $type;
        return $this;
    }

    public function setCondoId(?int $condoId): self
    {
        $this->condoId = $condoId;
        return $this;
    }

    public function setUnitNumber(?string $unitNumber): self
    {
        $this->unitNumber = $unitNumber;
        return $this;
    }

    public function setUnitFloor(?string $unitFloor): self
    {
        $this->unitFloor = $unitFloor;
        return $this;
    }

    public function setAccessType(?string $accessType): self
    {
        $this->accessType = $accessType;
        return $this;
    }

    public function setAccessCode(?string $accessCode): self
    {
        $this->accessCode = $accessCode;
        return $this;
    }

    public function setBackupLockbox(?string $backupLockbox): self
    {
        $this->backupLockbox = $backupLockbox;
        return $this;
    }


    public function setWifiName(?string $wifiName): self
    {
        $this->wifiName = $wifiName;
        return $this;
    }

    public function setWifiPassword(?string $wifiPassword): self
    {
        $this->wifiPassword = $wifiPassword;
        return $this;
    }

    public function setParking(?string $parking): self
    {
        $this->parking = $parking;
        return $this;
    }

    public function setPax(?int $pax): self
    {
        $this->pax = $pax;
        return $this;
    }

    public function setBaths(?int $baths): self
    {
        $this->baths = $baths;
        return $this;
    }

    public function setBeds(?int $beds): self
    {
        $this->beds = $beds;
        return $this;
    }

    public function getBedConfig(): ?array
    {
        return $this->bedConfig;
    }

    public function setBedConfig(?array $bedConfig): self
    {
        // Accept null or an array of items like: [{"type":"king","count":1}, ...]
        $this->bedConfig = $bedConfig;
        return $this;
    }

    /**
     * Convenience: total beds computed from bed_config (falls back to `beds` when bed_config is empty).
     */
    #[Groups(['unit:read'])]
    public function getBedConfigTotalBeds(): ?int
    {
        if (empty($this->bedConfig) || !is_array($this->bedConfig)) {
            return $this->beds;
        }

        $total = 0;
        foreach ($this->bedConfig as $row) {
            if (!is_array($row)) {
                continue;
            }
            $count = $row['count'] ?? null;
            if (is_numeric($count)) {
                $total += (int) $count;
            }
        }

        return $total > 0 ? $total : $this->beds;
    }


    public function setNotes(?string $notes): self
    {
        $this->notes = $notes;
        return $this;
    }

    // (setAirbnbName method retained above, duplicate removed)

    public function setCleaningFee(?float $cleaningFee): self
    {
        $this->cleaningFee = $cleaningFee;
        return $this;
    }

    public function setLinensFee(?float $linensFee): self
    {
        $this->linensFee = $linensFee;
        return $this;
    }
    
    public function setHostType(?string $hostType): self
    {
        $this->hostType = $hostType;
        return $this;
    }

    public function setAirbnbEmail(?string $airbnbEmail): self
    {
        $this->airbnbEmail = $airbnbEmail;
        return $this;
    }

    public function setAirbnbPass(?string $airbnbPass): self
    {
        $this->airbnbPass = $airbnbPass;
        return $this;
    }

    public function setAirbnbIcal(?string $airbnbIcal): self
    {
        $this->airbnbIcal = $airbnbIcal;
        return $this;
    }


    public function setCfe(?bool $cfe): self
    {
        $this->cfe = $cfe;
        return $this;
    }

    public function setCfeReference(?string $cfeReference): self
    {
        $this->cfeReference = $cfeReference;
        return $this;
    }

    public function setCfeName(?string $cfeName): self
    {
        $this->cfeName = $cfeName;
        return $this;
    }

    public function setCfePeriod(?string $cfePeriod): self
    {
        $this->cfePeriod = $cfePeriod;
        return $this;
    }

    public function setInternet(?bool $internet): self
    {
        $this->internet = $internet;
        return $this;
    }

    public function setInternetIsp(?string $internetIsp): self
    {
        $this->internetIsp = $internetIsp;
        return $this;
    }

    public function setInternetReference(?string $internetReference): self
    {
        $this->internetReference = $internetReference;
        return $this;
    }

    public function setInternetCost(?float $internetCost): self
    {
        $this->internetCost = $internetCost;
        return $this;
    }

    public function setInternetDeadline(?int $internetDeadline): self
    {
        $this->internetDeadline = $internetDeadline;
        return $this;
    }

    public function setWater(?bool $water): self
    {
        $this->water = $water;
        return $this;
    }

    public function setWaterReference(?string $waterReference): self
    {
        $this->waterReference = $waterReference;
        return $this;
    }

    public function setWaterDeadline(?int $waterDeadline): self
    {
        $this->waterDeadline = $waterDeadline;
        return $this;
    }

    public function setHoa(?bool $hoa): self
    {
        $this->hoa = $hoa;
        return $this;
    }

    public function setHoaAmount(?float $hoaAmount): self
    {
        $this->hoaAmount = $hoaAmount;
        return $this;
    }


    #[ORM\OneToMany(mappedBy: 'unit', targetEntity: UnitMedia::class, cascade: ['persist'], orphanRemoval: true)]
    #[Groups(['unit:read'])]
    private Collection $unitMedia;

    public function __construct()
    {
        $this->unitMedia = new ArrayCollection();
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getDateStarted(): ?\DateTimeInterface
    {
        return $this->dateStarted;
    }

    public function getDateEnded(): ?\DateTimeInterface
    {
        return $this->dateEnded;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function getType(): ?string
    {
        return $this->type;
    }

    public function getCondoId(): ?int
    {
        return $this->condoId;
    }

    public function getUnitNumber(): ?string
    {
        return $this->unitNumber;
    }

    public function getUnitFloor(): ?string
    {
        return $this->unitFloor;
    }

    public function getAccessType(): ?string
    {
        return $this->accessType;
    }

    public function getAccessCode(): ?string
    {
        return $this->accessCode;
    }

    public function getBackupLockbox(): ?string
    {
        return $this->backupLockbox;
    }


    public function getWifiName(): ?string
    {
        return $this->wifiName;
    }

    public function getWifiPassword(): ?string
    {
        return $this->wifiPassword;
    }

    public function getParking(): ?string
    {
        return $this->parking;
    }

    public function getPax(): ?int
    {
        return $this->pax;
    }

    public function getBaths(): ?int
    {
        return $this->baths;
    }

    public function getBeds(): ?int
    {
        return $this->beds;
    }


    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function getCleaningFee(): ?float
    {
        return $this->cleaningFee;
    }

    public function getLinensFee(): ?float
    {
        return $this->linensFee;
    }

    public function getHostType(): ?string
    {
        return $this->hostType;
    }

    public function getAirbnbEmail(): ?string
    {
        return $this->airbnbEmail;
    }

    public function getAirbnbPass(): ?string
    {
        return $this->airbnbPass;
    }

    public function getAirbnbIcal(): ?string
    {
        return $this->airbnbIcal;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function isPrivateIcalEnabled(): bool
    {
        return $this->privateIcalEnabled;
    }

    public function setPrivateIcalEnabled(bool $enabled): self
    {
        $this->privateIcalEnabled = $enabled;
        return $this;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function getIcalExportToken(): ?string
    {
        return $this->icalExportToken;
    }

    public function setIcalExportToken(?string $token): self
    {
        $this->icalExportToken = $token ? trim($token) : null;
        return $this;
    }


    public function getCfe(): ?bool
    {
        return $this->cfe;
    }

    public function getCfeReference(): ?string
    {
        return $this->cfeReference;
    }

    public function getCfeName(): ?string
    {
        return $this->cfeName;
    }

    public function getCfePeriod(): ?string
    {
        return $this->cfePeriod;
    }

    public function getCfePaymentDay(): ?int
    {
        return $this->cfePaymentDay;
    }

    public function setCfePaymentDay(?int $cfePaymentDay): self
    {
        $this->cfePaymentDay = $cfePaymentDay;
        return $this;
    }

    public function getCfeStartingMonth(): ?int
    {
        return $this->cfeStartingMonth;
    }

    public function setCfeStartingMonth(?int $cfeStartingMonth): self
    {
        $this->cfeStartingMonth = $cfeStartingMonth;
        return $this;
    }

    public function getInternet(): ?bool
    {
        return $this->internet;
    }

    public function getInternetIsp(): ?string
    {
        return $this->internetIsp;
    }

    public function getInternetReference(): ?string
    {
        return $this->internetReference;
    }

    public function getInternetCost(): ?float
    {
        return $this->internetCost;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function getInternetDeadline(): ?int
    {
        return $this->internetDeadline;
    }

    public function getWater(): ?bool
    {
        return $this->water;
    }

    public function getWaterReference(): ?string
    {
        return $this->waterReference;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function getWaterDeadline(): ?int
    {
        return $this->waterDeadline;
    }

    public function getHoa(): ?bool
    {
        return $this->hoa;
    }

    public function getHoaAmount(): ?float
    {
        return $this->hoaAmount;
    }

    #[Groups(['unit:list', 'unit:read'])]
    public function getCondoName(): ?string
    {
        return $this->condoId ? $this->condo?->getName() : null;
    }

    #[Groups(['unit:read'])]
    public function getCondoBuildingCode(): ?string
    {
        return $this->condoId ? $this->condo?->getBuildingCode() : null;
    }

    #[Groups(['unit:read'])]
    public function getCondoGoogleMaps(): ?string
    {
        return $this->condoId ? $this->condo?->getGoogleMaps() : null;
    }

    #[Groups(['unit:read'])]
    public function getCondoHoaBank(): ?string
    {
        return $this->condo?->getHoaBank();
    }

    #[Groups(['unit:read'])]
    public function getCondoHoaAccountName(): ?string
    {
        return $this->condo?->getHoaAccountName();
    }

    #[Groups(['unit:read'])]
    public function getCondoHoaEmail(): ?string
    {
        return $this->condo?->getHoaEmail();
    }
    
    #[Groups(['unit:read'])]
    public function getCondo(): ?\App\Entity\Condo
    {
        return $this->condo;
    }

    #[Groups(['unit:read'])]
    public function getHoaAccountNr(): ?string
    {
        return $this->condo?->getHoaAccountNr();
    }

    public function getAirbnbId(): ?string
    {
        return $this->airbnbId;
    }

    public function setAirbnbId(?string $airbnbId): self
    {
        $this->airbnbId = $airbnbId;
        return $this;
    }

    #[ORM\Column(name: 'airbnb_pay_route', type: 'string', nullable: true)]
    #[Groups(['unit:list', 'unit:read', 'unit:write'])]
    private ?string $airbnbPayRoute = null;

    public function getAirbnbPayRoute(): ?string
    {
        return $this->airbnbPayRoute;
    }

    public function setAirbnbPayRoute(?string $airbnbPayRoute): self
    {
        $this->airbnbPayRoute = $airbnbPayRoute;
        return $this;
    }
    public function getSeoShortDescription(): ?string
    {
        return $this->seoShortDescription;
    }

    public function setSeoShortDescription(?string $seoShortDescription): self
    {
        $this->seoShortDescription = $seoShortDescription;
        return $this;
    }
    /** @return Collection<int, UnitMedia> */
    public function getUnitMedia(): Collection
    {
        return $this->unitMedia;
    }

    public function addUnitMedia(UnitMedia $media): self
    {
        if (!$this->unitMedia->contains($media)) {
            $this->unitMedia[] = $media;
            $media->setUnit($this);
        }
        return $this;
    }

    public function removeUnitMedia(UnitMedia $media): self
    {
        if ($this->unitMedia->removeElement($media)) {
            if ($media->getUnit() === $this) {
                $media->setUnit(null);
            }
        }
        return $this;
    }
}