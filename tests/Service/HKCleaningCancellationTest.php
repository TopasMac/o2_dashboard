<?php

namespace App\Tests\Service;

use App\Entity\HKCleanings;
use App\Service\HKCleaningCancellation;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;

final class HKCleaningCancellationTest extends TestCase
{
    public function testCancellationDeletesAllLinkedTransactionsAndPreservesDetails(): void
    {
        $hk = (new HKCleanings())->setStatus('done')->setReportStatus('reported')->setCleaningCost('300.00')->setAssignNotes('Keep me');
        (new \ReflectionProperty(HKCleanings::class, 'id'))->setValue($hk, 42);
        $db = $this->createMock(Connection::class);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getConnection')->willReturn($db);
        $db->expects(self::once())->method('beginTransaction');
        $db->expects(self::once())->method('executeStatement')->with('DELETE FROM hktransactions WHERE hk_cleaning_id = :id', ['id' => 42]);
        $db->expects(self::once())->method('commit');
        $em->expects(self::once())->method('flush');
        (new HKCleaningCancellation($em))->setCancelled($hk);
        self::assertSame('cancelled', $hk->getStatus());
        self::assertSame('reported', $hk->getReportStatus());
        self::assertSame('300.00', $hk->getCleaningCost());
        self::assertSame('Keep me', $hk->getAssignNotes());
    }

    public function testFailureRollsBackAndRestoresStatus(): void
    {
        $hk = (new HKCleanings())->setStatus('done');
        $db = $this->createMock(Connection::class);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getConnection')->willReturn($db);
        $db->method('executeStatement')->willThrowException(new \RuntimeException('Deletion failed'));
        $db->expects(self::once())->method('rollBack');
        $db->expects(self::never())->method('commit');
        $em->expects(self::never())->method('flush');
        try {
            (new HKCleaningCancellation($em))->setCancelled($hk);
            self::fail('Must not swallow deletion failure');
        } catch (\RuntimeException $e) {
            self::assertSame('Deletion failed', $e->getMessage());
            self::assertSame('done', $hk->getStatus());
        }
    }
    public function testDatabaseRollbackKeepsTransactionsWhenStatusPersistenceFails(): void
    {
        $db = \Doctrine\DBAL\DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
        $db->executeStatement('CREATE TABLE hktransactions (id INTEGER PRIMARY KEY, hk_cleaning_id INTEGER)');
        $db->executeStatement('INSERT INTO hktransactions VALUES (1, 42), (2, 42), (3, 99)');
        $hk = (new HKCleanings())->setStatus('done');
        (new \ReflectionProperty(HKCleanings::class, 'id'))->setValue($hk, 42);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getConnection')->willReturn($db);
        $em->method('flush')->willThrowException(new \RuntimeException('Status persistence failed'));
        try {
            (new HKCleaningCancellation($em))->setCancelled($hk);
            self::fail('Expected persistence error');
        } catch (\RuntimeException $e) {
            self::assertSame('Status persistence failed', $e->getMessage());
        }
        self::assertSame(3, (int) $db->fetchOne('SELECT COUNT(*) FROM hktransactions'));
        self::assertSame('done', $hk->getStatus());
        self::assertFalse($db->isTransactionActive());
    }

    public function testDatabaseCancellationDeletesDuplicatesButNotOtherCleaningTransactions(): void
    {
        $db = \Doctrine\DBAL\DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
        $db->executeStatement('CREATE TABLE hktransactions (id INTEGER PRIMARY KEY, hk_cleaning_id INTEGER)');
        $db->executeStatement('CREATE TABLE hk_cleanings (id INTEGER PRIMARY KEY, status TEXT)');
        $db->executeStatement("INSERT INTO hk_cleanings VALUES (42, 'done')");
        $db->executeStatement('INSERT INTO hktransactions VALUES (1, 42), (2, 42), (3, 99)');
        $hk = (new HKCleanings())->setStatus('done');
        (new \ReflectionProperty(HKCleanings::class, 'id'))->setValue($hk, 42);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getConnection')->willReturn($db);
        $em->method('flush')->willReturnCallback(static function () use ($db, $hk): void {
            $db->update('hk_cleanings', ['status' => $hk->getStatus()], ['id' => 42]);
        });
        (new HKCleaningCancellation($em))->setCancelled($hk);
        self::assertSame([99], array_map('intval', $db->fetchFirstColumn('SELECT hk_cleaning_id FROM hktransactions')));
        self::assertSame('cancelled', $db->fetchOne('SELECT status FROM hk_cleanings WHERE id = 42'));
    }

    public function testReopeningRetainsASnapshotWithoutClearingStoredDetails(): void
    {
        $hk = (new HKCleanings())->setStatus('cancelled')->setUnit(new \App\Entity\Unit())
            ->setCity('Playa del Carmen')->setCheckoutDate(new \DateTimeImmutable('2026-11-23'))
            ->setCleaningCost('300.00')->setLaundryCost('50.00');
        $db = $this->createMock(Connection::class);
        $db->method('fetchOne')->willReturn(false);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getConnection')->willReturn($db);
        $em->expects(self::once())->method('persist')->with(self::callback(static function ($snapshot) use ($hk): bool {
            self::assertSame($hk, $snapshot->getHkCleaning());
            self::assertSame('2026-11', $snapshot->getReportMonth());
            self::assertSame('300.00', $snapshot->getCleaningCost());
            self::assertSame('350.00', $snapshot->getRealCleaningCost());
            return true;
        }));
        $em->expects(self::never())->method('flush');
        (new HKCleaningCancellation($em))->retainSnapshot($hk);
    }

    public function testReopeningDoesNotOverwriteAnExistingSnapshotOrItsNotes(): void
    {
        $hk = (new HKCleanings())->setUnit(new \App\Entity\Unit());
        $db = $this->createMock(Connection::class);
        $db->method('fetchOne')->willReturn(1);
        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getConnection')->willReturn($db);
        $em->expects(self::never())->method('persist');
        (new HKCleaningCancellation($em))->retainSnapshot($hk);
    }

}
