<?php

namespace App\Dto;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use Symfony\Component\Serializer\Annotation\Groups;
use App\State\ExpectedPaymentReportProvider;

/**
 * Read-only projection for Expected Payments on the Reports page.
 *
 * This DTO is intentionally generic so we can extend it later to other services
 * (Internet, Electricity, Water, etc.) without changing the client contract.
 */
#[ApiResource(
    shortName: 'ExpectedPaymentsReport',
    operations: [
        // GET /api/reports/expected-payments?service=HOA&month=9&year=2025
        new GetCollection(
            uriTemplate: '/reports/expected-payments',
            normalizationContext: ['groups' => ['expected_payments:read']],
            provider: ExpectedPaymentReportProvider::class,
        ),
    ],
    normalizationContext: ['groups' => ['expected_payments:read']],
)]
class ExpectedPaymentsReport
{
    /**
     * Requested service key, e.g. "HOA", "Internet".
     */
    #[Groups(['expected_payments:read'])]
    public ?string $service = null;

    /**
     * 1–12
     */
    #[Groups(['expected_payments:read'])]
    public ?int $month = null;

    /**
     * Four-digit year
     */
    #[Groups(['expected_payments:read'])]
    public ?int $year = null;

    /**
     * Array of row items.
     *
     * For HOA, each item contains banking fields and computed dates.
     * We keep the shape stable so the frontend table can bind to it directly.
     *
     * @var list<ExpectedPaymentsRow>
     */
    #[Groups(['expected_payments:read'])]
    public array $items = [];

    public function __construct(?string $service = null, ?int $month = null, ?int $year = null, array $items = [])
    {
        $this->service = $service;
        $this->month = $month;
        $this->year = $year;
        $this->items = $items;
    }
}