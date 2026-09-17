<?php

namespace App\Tests\Service;

use App\Entity\Employee;
use App\Service\CleaningCityScopeService;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

final class CleaningCityScopeServiceTest extends TestCase
{
    private CleaningCityScopeService $scope;

    protected function setUp(): void
    {
        $this->scope = new CleaningCityScopeService();
    }

    public function testPlayaCleanerCannotRequestAnotherCity(): void
    {
        $cleaner = $this->employee('Cleaner', 'Playa del Carmen');

        self::assertSame('Playa del Carmen', $this->scope->resolve($cleaner, false, 'Tulum'));
        self::assertSame('Playa del Carmen', $this->scope->resolve($cleaner, false, null));
    }

    public function testTulumCleanerIsRestrictedToTulum(): void
    {
        $cleaner = $this->employee('Cleaner', 'Tulum');

        self::assertSame('Tulum', $this->scope->resolve($cleaner, false, 'Playa del Carmen'));
    }

    public function testGeneralCleanerMayUseEitherSupportedInterfaceScope(): void
    {
        $cleaner = $this->employee('Cleaner', 'General');

        self::assertSame('Tulum', $this->scope->resolve($cleaner, false, 'Tulum'));
        self::assertNull($this->scope->resolve($cleaner, false, null));
    }

    public function testUnknownCleanerCityIsDenied(): void
    {
        $this->expectException(AccessDeniedHttpException::class);

        $this->scope->resolve($this->employee('Cleaner', 'Unknown'), false, null);
    }

    public function testOtherEmployeeAreasRemainUnaffected(): void
    {
        $manager = $this->employee('Manager', 'Playa del Carmen');

        self::assertSame('Tulum', $this->scope->resolve($manager, false, 'Tulum'));
    }

    public function testAdministratorIsNotRestrictedByEmployeeCity(): void
    {
        $cleaner = $this->employee('Cleaner', 'Playa del Carmen');

        self::assertSame('Tulum', $this->scope->resolve($cleaner, true, 'Tulum'));
    }

    public function testPlayaCleanerCannotMutateTulumCleaning(): void
    {
        $this->expectException(AccessDeniedHttpException::class);

        $this->scope->assertCleaningAccess(
            $this->employee('Cleaner', 'Playa del Carmen'),
            false,
            'Tulum',
        );
    }

    public function testCleanerCanMutateCleaningInsideTheirCityScope(): void
    {
        $this->scope->assertCleaningAccess(
            $this->employee('Cleaner', 'Playa del Carmen'),
            false,
            'Playa',
        );

        $this->scope->assertCleaningAccess(
            $this->employee('Cleaner', 'General'),
            false,
            'Tulum',
        );

        self::assertTrue(true);
    }

    private function employee(string $area, string $city): Employee
    {
        return (new Employee())
            ->setArea($area)
            ->setDivision('Housekeepers')
            ->setCity($city);
    }
}
