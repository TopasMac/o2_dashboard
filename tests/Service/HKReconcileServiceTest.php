<?php

namespace App\Tests\Service;

use App\Entity\HKCleanings;
use App\Entity\Unit;
use App\Service\HKReconcileService;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Query;
use Doctrine\ORM\QueryBuilder;
use PHPUnit\Framework\TestCase;

final class HKReconcileServiceTest extends TestCase
{
    public function testMonthViewUsesReservationFeeForCheckoutCharges(): void
    {
        $unit = (new Unit())->setCleaningFee(1050.0);
        (new \ReflectionProperty(Unit::class, 'id'))->setValue($unit, 1);
        $unit->setUnitName('IT_001')->setCity('Playa del Carmen');
        $checkout = (new HKCleanings())
            ->setUnit($unit)
            ->setCity('Playa del Carmen')
            ->setCheckoutDate(new \DateTimeImmutable('2026-11-05'))
            ->setCleaningType(HKCleanings::TYPE_CHECKOUT)
            ->setReportStatus(HKCleanings::REPORT_STATUS_REPORTED)
            ->setCleaningCost('250.00')
            ->setLaundryCost('50.00')
            ->setO2CollectedFee('900.00');

        $cleanings = [
            (clone $checkout)->setBookingId(1),
            (clone $checkout)->setBookingId(2),
            (clone $checkout)->setBookingId(3),
            (clone $checkout)->setBookingId(4)->setO2CollectedFee(null),
            (clone $checkout)->setBookingId(1)->setCleaningType(HKCleanings::TYPE_OWNER),
            (clone $checkout)->setBookingId(null),
            (clone $checkout)->setBookingId(5)->setBillTo(HKCleanings::BILL_TO_OWNERS2),
            (clone $checkout)->setBookingId(5)
                ->setCleaningType(HKCleanings::TYPE_OWNER)
                ->setBillTo(HKCleanings::BILL_TO_CLIENT)
                ->setO2CollectedFee('950.00')
                ->setCleaningCost('0.00')
                ->setLaundryCost('0.00'),
        ];

        $connection = $this->createMock(Connection::class);
        $connection->method('fetchAllAssociative')->willReturn([]);
        $connection->method('fetchAllAssociativeIndexed')->willReturn([
            1 => ['cleaning_fee' => '1200.00', 'guest_type' => 'guest'],
            2 => ['cleaning_fee' => '0.00', 'guest_type' => 'guest'],
            3 => ['cleaning_fee' => null, 'guest_type' => 'guest'],
            5 => ['cleaning_fee' => '0.00', 'guest_type' => 'Owner'],
        ]);

        $query = $this->createMock(Query::class);
        $query->method('getResult')->willReturn($cleanings);
        $em = $this->createMock(EntityManagerInterface::class);
        $builder = $this->getMockBuilder(QueryBuilder::class)
            ->setConstructorArgs([$em])
            ->onlyMethods(['getQuery'])
            ->getMock();
        $builder->method('getQuery')->willReturn($query);
        $em->method('getConnection')->willReturn($connection);
        $em->method('createQueryBuilder')->willReturn($builder);

        $view = (new HKReconcileService($em))->getMonthView('2026-11', 'Playa del Carmen');

        self::assertSame([1, 2, 3, 4, 1, null, 5], array_column($view['rows'], 'booking_id'));
        self::assertSame(HKCleanings::BILL_TO_CLIENT, $view['rows'][6]['bill_to']);
        self::assertSame(['1200.00', '0.00', '900.00', '1050.00', '900.00', '900.00', '950.00'], array_column($view['rows'], 'charged_cost'));
        self::assertSame([...array_fill(0, 6, '300.00'), '0.00'], array_column($view['rows'], 'total_cost'));
        self::assertSame(['900.00', '-300.00', '600.00', '750.00', '600.00', '600.00', '950.00'], array_column($view['rows'], 'diff'));
        self::assertSame('5900.00', $view['totals']['charged']);
        self::assertSame('4100.00', $view['totals']['diff']);
    }
}
