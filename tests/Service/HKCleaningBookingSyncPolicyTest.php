<?php

namespace App\Tests\Service;

use App\Entity\HKCleanings;
use App\Service\HKCleaningBookingSyncPolicy;
use PHPUnit\Framework\TestCase;

final class HKCleaningBookingSyncPolicyTest extends TestCase
{
    private HKCleaningBookingSyncPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new HKCleaningBookingSyncPolicy();
    }

    public function testNewBookingDrivenCleaningStartsPending(): void
    {
        self::assertSame(HKCleanings::STATUS_PENDING, $this->policy->statusFor(null));
    }

    public function testExistingPendingCleaningRemainsPending(): void
    {
        $cleaning = (new HKCleanings())->setStatus(HKCleanings::STATUS_PENDING);

        self::assertSame(HKCleanings::STATUS_PENDING, $this->policy->statusFor($cleaning));
    }

    public function testExistingManuallyCompletedCleaningRemainsDone(): void
    {
        $cleaning = (new HKCleanings())->setStatus(HKCleanings::STATUS_DONE);

        self::assertSame(HKCleanings::STATUS_DONE, $this->policy->statusFor($cleaning));
    }

    public function testExistingNonCompletionWorkflowStatusIsNotOverwritten(): void
    {
        $cleaning = (new HKCleanings())->setStatus(HKCleanings::STATUS_SCHEDULED);

        self::assertSame(HKCleanings::STATUS_SCHEDULED, $this->policy->statusFor($cleaning));
    }
}
