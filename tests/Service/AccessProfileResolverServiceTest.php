<?php

namespace App\Tests\Service;

use App\Entity\Employee;
use App\Service\AccessProfileResolverService;
use PHPUnit\Framework\TestCase;

final class AccessProfileResolverServiceTest extends TestCase
{
    public function testCleanerReceivesOnlyTheMobileCleaningsPermission(): void
    {
        $employee = (new Employee())
            ->setArea('Cleaner')
            ->setDivision('Housekeepers')
            ->setCity('Playa del Carmen');

        $permissions = (new AccessProfileResolverService())->resolve(
            $employee,
            ['ROLE_EMPLOYEE'],
        );

        self::assertContains('mobile.cleanings.view', $permissions);
        self::assertContains('city.playa', $permissions);
        self::assertNotContains('mobile.calendar.view', $permissions);
        self::assertNotContains('access.all', $permissions);
    }
}
