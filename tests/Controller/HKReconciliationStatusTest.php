<?php
namespace App\Tests\Controller;

use App\Controller\Api\HKCleaningsReconcileController;
use App\Entity\HKCleanings;
use App\Service\HKCleaningCancellation;
use App\Service\HKCleaningManager;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\HttpFoundation\Request;

final class HKReconciliationStatusTest extends TestCase
{
    public function testReopeningPendingPreservesCostsAndDoesNotCreateAccountingEntries(): void
    {
        $hk = (new HKCleanings())->setStatus('cancelled')->setReportStatus('reported')->setCleaningCost('300.00');
        [$controller, $em, $cancellation, $manager] = $this->dependencies($hk);
        $manager->expects(self::never())->method('completeCleaning');
        $cancellation->expects(self::never())->method('setCancelled');
        $response = $controller->changeStatus(42, new Request(content: '{"status":"pending"}'), $em, $cancellation, $manager);
        self::assertSame(200, $response->getStatusCode());
        self::assertSame('pending', $hk->getStatus());
        self::assertSame('pending', $hk->getReportStatus());
        self::assertSame('300.00', $hk->getCleaningCost());
    }

    public function testReportingCancelledWorkExplicitlyCompletesIt(): void
    {
        $hk = (new HKCleanings())->setStatus('cancelled')->setReportStatus('pending');
        [$controller, $em, $cancellation, $manager] = $this->dependencies($hk);
        $manager->expects(self::once())->method('completeCleaning')->with($hk)->willReturnCallback(function ($cleaning) {
            self::assertSame('reported', $cleaning->getReportStatus());
            $cleaning->setStatus('done');
            return [];
        });
        $controller->changeStatus(42, new Request(content: '{"status":"reported"}'), $em, $cancellation, $manager);
        self::assertSame('done', $hk->getStatus());
    }

    public function testStaleReopeningCannotOverwriteAChangedCleaning(): void
    {
        [$controller, $em, $cancellation, $manager] = $this->dependencies((new HKCleanings())->setStatus('done'));
        $manager->expects(self::never())->method('completeCleaning');
        $em->expects(self::never())->method('wrapInTransaction');
        self::assertSame(409, $controller->changeStatus(42, new Request(content: '{"status":"pending"}'), $em, $cancellation, $manager)->getStatusCode());
    }

    private function dependencies(HKCleanings $hk): array
    {
        $em = $this->createMock(EntityManagerInterface::class);
        $repo = $this->createMock(EntityRepository::class);
        $repo->method('find')->willReturn($hk);
        $em->method('getRepository')->willReturn($repo);
        $em->method('wrapInTransaction')->willReturnCallback(static fn ($callback) => $callback());
        $controller = new HKCleaningsReconcileController();
        $controller->setContainer(new ContainerBuilder());
        return [$controller, $em, $this->createMock(HKCleaningCancellation::class), $this->createMock(HKCleaningManager::class)];
    }
}
