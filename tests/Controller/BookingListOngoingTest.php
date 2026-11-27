<?php

namespace App\Tests\Controller;

use App\Controller\Api\BookingsController;
use App\Repository\AllBookingsRepository;
use App\Service\BookingStatusUpdaterService;
use App\Service\HKCleaningManager;
use App\Service\MonthSliceRefresher;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Query;
use Doctrine\ORM\QueryBuilder;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\HttpFoundation\Request;

final class BookingListOngoingTest extends TestCase
{
    public function testOngoingInclusionIsOptInAndRetainsUnitAndFocusConstraints(): void
    {
        foreach ([false, true] as $include) {
            $em = $this->createMock(EntityManagerInterface::class);
            $em->expects(self::never())->method('persist');
            $em->expects(self::never())->method('flush');
            $em->method('getExpressionBuilder')->willReturn(new \Doctrine\ORM\Query\Expr());
            $query = $this->createMock(Query::class);
            $query->method('getResult')->willReturn([]);
            $qb = $this->getMockBuilder(QueryBuilder::class)->setConstructorArgs([$em])->onlyMethods(['getQuery'])->getMock();
            $qb->select('b')->from(\App\Entity\AllBookings::class, 'b');
            $qb->method('getQuery')->willReturn($query);
            $repo = $this->createMock(AllBookingsRepository::class);
            $repo->method('createQueryBuilder')->willReturn($qb);
            $controller = new BookingsController($this->createMock(MonthSliceRefresher::class), $this->createMock(HKCleaningManager::class));
            $controller->setContainer(new ContainerBuilder());
            $response = $controller->index(new Request([
                'checkInFrom' => '2026-11-01', 'checkInTo' => '2026-11-30',
                'includeOngoing' => $include ? '1' : '0', 'unitId' => 7, 'focus' => 42,
            ]), $repo, $this->createMock(BookingStatusUpdaterService::class), $em);
            self::assertSame(200, $response->getStatusCode());
            $dql = $qb->getDQL();
            self::assertStringContainsString('b.id = :focusId', $dql);
            self::assertSame(42, $qb->getParameter('focusId')->getValue());
            self::assertSame(7, $qb->getParameter('unitId')->getValue());
            if ($include) {
                self::assertStringContainsString('b.checkIn <= :ongoingLastArrived', $dql);
                self::assertStringContainsString('b.checkOut > :ongoingLastDeparted', $dql);
                self::assertStringContainsString("'expired'", $dql);
                self::assertStringContainsString("'cancelled'", $dql);
                self::assertSame(2, substr_count($dql, 'b.unitId = :unitId'));
            } else {
                self::assertStringNotContainsString('ongoingLastArrived', $dql);
                self::assertSame(1, substr_count($dql, 'b.unitId = :unitId'));
            }
        }
    }
}
