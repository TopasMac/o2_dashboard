<?php

namespace App\Tests\Service;

use App\Entity\Employee;
use App\Entity\HKCleanings;
use App\Service\Document\DocumentUploadService;
use App\Service\HKCleaningBookingSyncPolicy;
use App\Service\HKCleaningManager;
use App\Service\HKCleaningRateResolver;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;

final class HKCleaningManagerCompletionTest extends TestCase
{
    public function testExplicitCompletionRecordsActorTimeAndDoneStatus(): void
    {
        $cleaning = (new HKCleanings())->setStatus(HKCleanings::STATUS_PENDING);
        $cleaner = new Employee();

        $manager = $this->managerExpectingCompletionPersistence($cleaning);
        $manager->expects(self::once())
            ->method('markDoneAndCreateTransaction')
            ->with($cleaning)
            ->willReturn(['transactionSuppressed' => true]);

        $result = $manager->completeCleaning($cleaning, $cleaner);

        self::assertSame(HKCleanings::STATUS_DONE, $cleaning->getStatus());
        self::assertSame($cleaner, $cleaning->getDoneByEmployee());
        self::assertInstanceOf(\DateTimeInterface::class, $cleaning->getDoneAt());
        self::assertTrue($result['transactionSuppressed']);
    }

    public function testRepeatedCompletionDoesNotOverwriteExistingAuditFields(): void
    {
        $firstCleaner = new Employee();
        $secondCleaner = new Employee();
        $completedAt = new \DateTimeImmutable('2026-09-16 10:00:00', new \DateTimeZone('America/Cancun'));
        $cleaning = (new HKCleanings())
            ->setStatus(HKCleanings::STATUS_DONE)
            ->setDoneByEmployee($firstCleaner)
            ->setDoneAt($completedAt);

        $manager = $this->managerExpectingCompletionPersistence($cleaning);
        $manager->expects(self::once())
            ->method('markDoneAndCreateTransaction')
            ->willReturn([]);

        $manager->completeCleaning($cleaning, $secondCleaner);

        self::assertSame($firstCleaner, $cleaning->getDoneByEmployee());
        self::assertSame($completedAt, $cleaning->getDoneAt());
    }

    private function managerExpectingCompletionPersistence(HKCleanings $cleaning): HKCleaningManager
    {
        $connection = $this->createMock(Connection::class);
        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->method('getConnection')->willReturn($connection);
        $entityManager->expects(self::once())->method('persist')->with($cleaning);
        $entityManager->expects(self::once())->method('flush');

        return $this->getMockBuilder(HKCleaningManager::class)
            ->setConstructorArgs([
                $entityManager,
                $this->createMock(HKCleaningRateResolver::class),
                $this->createMock(DocumentUploadService::class),
                new HKCleaningBookingSyncPolicy(),
            ])
            ->onlyMethods(['markDoneAndCreateTransaction'])
            ->getMock();
    }
}
