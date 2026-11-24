<?php
namespace App\Tests\Service\Reports;

use App\Service\Reports\CleaningFeeReportPolicy;
use Doctrine\DBAL\DriverManager;
use PHPUnit\Framework\TestCase;

final class CancelledCleaningFeeTest extends TestCase
{
    public function testCancellationWaivesFeesAndRefundsProratedOwnerDeductionsWithoutEditingBookings(): void
    {
        $db = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
        $db->executeStatement('CREATE TABLE unit (id INTEGER PRIMARY KEY, payment_type TEXT)');
        $db->executeStatement('CREATE TABLE all_bookings (id INTEGER PRIMARY KEY, unit_id INTEGER, cleaning_fee REAL, confirmation_code TEXT, reservation_code TEXT, payment_method TEXT, guest_type TEXT)');
        $db->executeStatement('CREATE TABLE hk_cleanings (id INTEGER PRIMARY KEY, booking_id INTEGER, unit_id INTEGER, reservation_code TEXT, cleaning_type TEXT, status TEXT)');
        $db->executeStatement('CREATE TABLE hk_cleanings_reconcile (hk_cleaning_id INTEGER)');
        $db->executeStatement('CREATE TABLE booking_month_slice (booking_id INTEGER, unit_id INTEGER, nights_total INTEGER, nights_in_month INTEGER, cleaning_fee_in_month REAL, owner_payout_in_month REAL, source TEXT)');
        $db->executeStatement("INSERT INTO unit VALUES (1, 'Owners2'), (2, 'Client')");
        $db->executeStatement("INSERT INTO all_bookings VALUES (1,1,100,'REF1',NULL,'cash','guest'), (2,2,100,'REF2',NULL,'cash','guest'), (3,1,100,'REF3',NULL,'cash','guest'), (4,1,100,'REF4',NULL,'cash','guest'), (5,1,100,'REF5',NULL,'no_pay','owner'), (6,1,100,'REF6',NULL,'no_pay','owner')");
        $db->executeStatement("INSERT INTO hk_cleanings VALUES (1,1,1,NULL,'checkout','cancelled'), (2,2,2,NULL,'checkout','cancelled'), (3,3,1,NULL,'midstay','cancelled'), (4,NULL,1,'REF4','checkout','cancelled'), (5,5,1,NULL,'owner','cancelled'), (6,6,1,NULL,'checkout','cancelled'), (7,6,1,NULL,'owner','done')");
        $db->executeStatement("INSERT INTO booking_month_slice VALUES (1,1,3,1,0,200,'Airbnb'), (1,1,3,2,100,400,'Airbnb'), (2,2,3,3,100,0,'Airbnb'), (3,1,3,3,100,600,'Airbnb'), (4,1,3,3,100,600,'Private'), (5,1,0,0,0,-100,'Private'), (6,1,0,0,0,-100,'Private')");
        $fee = CleaningFeeReportPolicy::cleaningFeeSql('s');
        $payout = CleaningFeeReportPolicy::ownerPayoutSql('s');
        $rows = $db->fetchAllAssociative("SELECT $fee AS fee, $payout AS payout FROM booking_month_slice s");
        self::assertSame([0.,0.,0.,100.,0.,0.,0.], array_map(static fn($r) => (float)$r['fee'], $rows));
        self::assertSame([233.33,466.67,0.,600.,700.,0.,-100.], array_map(static fn($r) => (float)$r['payout'], $rows));
        self::assertSame(100., (float)$db->fetchOne('SELECT cleaning_fee FROM all_bookings WHERE id = 1'));
        // Reopened reconciled work stays waived until it is performed again.
        $db->executeStatement("UPDATE hk_cleanings SET status = 'pending' WHERE id = 1");
        $db->executeStatement('INSERT INTO hk_cleanings_reconcile VALUES (1)');
        self::assertSame(0., (float)$db->fetchOne("SELECT SUM($fee) FROM booking_month_slice s WHERE booking_id = 1"));
        $db->executeStatement("UPDATE hk_cleanings SET status = 'done' WHERE id = 1");
        self::assertSame(100., (float)$db->fetchOne("SELECT SUM($fee) FROM booking_month_slice s WHERE booking_id = 1"));
    }
}
