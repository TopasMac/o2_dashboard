<?php

namespace App\Dto;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use App\State\ClientMonthlySummaryProvider;

#[ApiResource(
    shortName: 'ClientMonthlySummary',
    operations: [
        new GetCollection(
            uriTemplate: '/client_monthly_summary',
            provider: ClientMonthlySummaryProvider::class,
            paginationEnabled: false
        )
    ]
)]
class ClientMonthlySummary
{
    public ?string $yearMonth = null;
    public ?int $clientId = null;
    public ?int $unitId = null;
    public ?string $city = null;
    public ?string $paymentType = null;

    public int $bookings = 0;
    public int $nights = 0;

    public string $avgRoomFeePerNight = '0.00';
    public string $taxTotal = '0.00';
    public string $cleaningTotal = '0.00';
    public string $commissionBaseTotal = '0.00';
    public string $o2CommissionTotal = '0.00';
    public string $ownerPayoutTotal = '0.00';
    public string $airbnbClientDebits = '0.00';
    public string $privateClientCredits = '0.00';
    public string $occupationPct = '0';
    public ?string $payoutReservasTotal = null;
    public ?string $gastosTotalClient = null;
    public ?string $abonosTotalClient = null;
    public ?string $clientNetResult = null;
    public ?string $monthlyEarnings = null;
    public ?string $closingBalance = null;
}