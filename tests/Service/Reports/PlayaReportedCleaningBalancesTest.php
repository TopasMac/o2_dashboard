<?php
namespace App\Tests\Service\Reports;

use App\Service\Reports\HKMonthlySummaryService;
use Doctrine\DBAL\DriverManager;
use PHPUnit\Framework\TestCase;

final class PlayaReportedCleaningBalancesTest extends TestCase
{
    public function testOnlyReportedNonCancelledPlayaTransactionsInMonthAndApprovedCategoriesCount(): void
    {
        $db = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
        $db->executeStatement('CREATE TABLE hk_cleanings (id INTEGER PRIMARY KEY, status TEXT, report_status TEXT)');
        $db->executeStatement('CREATE TABLE hktransactions (hk_cleaning_id INTEGER, date TEXT, city TEXT, category_id INTEGER, charged REAL, paid REAL)');
        $db->executeStatement("INSERT INTO hk_cleanings VALUES (1,'done','reported'),(2,'done','pending'),(3,'done','needs_review'),(4,'cancelled','reported')");
        $insert = function ($cleaning, $date, $city, $category, $charged, $paid) use ($db): void {
            $db->insert('hktransactions', ['hk_cleaning_id' => $cleaning, 'date' => $date, 'city' => $city, 'category_id' => $category, 'charged' => $charged, 'paid' => $paid]);
        };
        $insert(1, '2026-11-01', 'Playa del Carmen', 7, 100, 30);
        $insert(1, '2026-11-30 23:59:59', 'Playa del Carmen', 8, 50, 60);
        $insert(1, '2026-11-15', 'Playa del Carmen', 13, 25, null);
        foreach ([2, 3, 4, null] as $id) $insert($id, '2026-11-15', 'Playa del Carmen', 7, 999, 0);
        $insert(1, '2026-10-31', 'Playa del Carmen', 7, 999, 0);
        $insert(1, '2026-12-01', 'Playa del Carmen', 7, 999, 0);
        $insert(1, '2026-11-15', 'Tulum', 7, 999, 0);
        $insert(1, '2026-11-15', 'Playa del Carmen', 14, 999, 0);
        $service = new HKMonthlySummaryService($db);
        self::assertSame(['categories' => [7 => 70.0, 8 => -10.0, 13 => 25.0], 'counts' => [7 => 1, 8 => 1, 13 => 1], 'result' => 85.0], $service->getPlayaReportedCleaningBalances(2026, 11));
        self::assertSame(['categories' => [7 => 0.0, 8 => 0.0, 13 => 0.0], 'counts' => [7 => 0, 8 => 0, 13 => 0], 'result' => 0.0], $service->getPlayaReportedCleaningBalances(2027, 1));
    }
}
