<?php

namespace App\Tests\Service;

use App\Entity\Unit;
use App\Service\DashboardAlertsService;
use App\Service\ServicesPaymentStatusService;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use PHPUnit\Framework\TestCase;

final class DashboardAlertsServiceTest extends TestCase
{
    public function testUpcomingInternetAlertIncludesMobilePaymentDetails(): void
    {
        $today = new \DateTimeImmutable('today');
        $todayDay = (int) $today->format('j');
        $deadline = min($todayDay + 7, (int) $today->format('t'));
        $currentYearMonth = $today->format('Y-m');

        $unit = $this->createMock(Unit::class);
        $unit->method('getId')->willReturn(42);
        $unit->method('getUnitName')->willReturn('Casa Prueba');
        $unit->method('getCity')->willReturn('Playa del Carmen');
        $unit->method('getStatus')->willReturn('Active');
        $unit->method('getInternetReference')->willReturn('REF-123');
        $unit->method('getInternetPago')->willReturn('123456789012');
        $unit->method('getInternetIsp')->willReturn('Proveedor');
        $unit->method('getInternetCost')->willReturn(899.50);

        $repository = $this->createMock(EntityRepository::class);
        $repository->method('findAll')->willReturn([$unit]);

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->method('getRepository')
            ->with(Unit::class)
            ->willReturn($repository);

        $paymentStatus = $this->createMock(ServicesPaymentStatusService::class);
        $paymentStatus->method('getStatusForUnitYearMonth')
            ->willReturnCallback(static function (Unit $statusUnit, string $yearMonth) use ($unit, $currentYearMonth, $deadline): array {
                self::assertSame($unit, $statusUnit);

                if ($yearMonth !== $currentYearMonth) {
                    return [
                        'expected' => [],
                        'missing' => [],
                        'valueWarnings' => [],
                        'paidTotalsThisMonth' => [],
                        'paidTransactionIdsThisMonth' => [],
                    ];
                }

                return [
                    'expected' => [
                        'Internet' => true,
                        'internetDeadline' => $deadline,
                        'internetOverdueThisMonth' => false,
                    ],
                    'missing' => ['Internet'],
                    'valueWarnings' => [],
                    'paidTotalsThisMonth' => [],
                    'paidTransactionIdsThisMonth' => [],
                ];
            });

        $service = new DashboardAlertsService($entityManager, $paymentStatus);
        $method = (new \ReflectionClass($service))->getMethod('buildServicePaymentAlerts');
        $method->setAccessible(true);

        $alerts = $method->invoke($service);

        self::assertCount(1, $alerts);
        self::assertSame('service-payment-due-soon', $alerts[0]['type']);
        self::assertSame($deadline, $alerts[0]['deadline']);
        self::assertSame('REF-123', $alerts[0]['serviceReference']);
        self::assertSame('123456789012', $alerts[0]['paymentReference']);
        self::assertSame('Proveedor', $alerts[0]['serviceProvider']);
        self::assertSame(899.50, $alerts[0]['amount']);
    }
}
