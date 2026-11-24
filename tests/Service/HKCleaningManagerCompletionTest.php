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


    public function testBookingSynchronizationPreservesCancelledCleaningDetails(): void
    {
        $unit = (new \App\Entity\Unit())->setCity('Tulum');
        (new \ReflectionProperty(\App\Entity\Unit::class, 'id'))->setValue($unit, 1);
        $cleaning = (new HKCleanings())->setUnit($unit)->setStatus('cancelled')->setAssignNotes('Keep manual notes');
        $booking = (new \App\Entity\AllBookings())->setUnitId(1)->setCheckOut(new \DateTimeImmutable('2026-11-23'))
            ->setGuestType('airbnb_guest')->setStatus('Past');
        $units = $this->createMock(\Doctrine\ORM\EntityRepository::class);
        $units->method('find')->willReturn($unit);
        $cleanings = $this->createMock(\Doctrine\ORM\EntityRepository::class);
        $cleanings->method('findOneBy')->willReturn($cleaning);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getRepository')->willReturnCallback(static fn ($class) => $class === \App\Entity\Unit::class ? $units : $cleanings);
        $em->method('getConnection')->willReturn($this->createMock(Connection::class));
        $em->expects(self::never())->method('flush');
        $manager = $this->getMockBuilder(HKCleaningManager::class)->setConstructorArgs([
            $em, $this->createMock(HKCleaningRateResolver::class), $this->createMock(DocumentUploadService::class), new HKCleaningBookingSyncPolicy(),
        ])->onlyMethods(['bulkCreate', 'deleteTransactionForCleaning'])->getMock();
        $manager->expects(self::never())->method('bulkCreate');
        $manager->expects(self::once())->method('deleteTransactionForCleaning')->with($cleaning);
        $manager->syncCheckoutCleaningForBooking($booking);
        self::assertSame('cancelled', $cleaning->getStatus());
        self::assertSame('Keep manual notes', $cleaning->getAssignNotes());
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
