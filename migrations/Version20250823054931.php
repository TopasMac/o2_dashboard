<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250823054931 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            SET @cnt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_month_slice' AND INDEX_NAME = 'uniq_booking_month');
            SET @sql = IF(@cnt>0, 'DROP INDEX `uniq_booking_month` ON `booking_month_slice`', 'SELECT 1');
            PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
        SQL);
        $this->addSql(<<<'SQL'
            SET @cnt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_month_slice' AND INDEX_NAME = 'idx_bms_yearmonth_unit');
            SET @sql = IF(@cnt>0, 'DROP INDEX `idx_bms_yearmonth_unit` ON `booking_month_slice`', 'SELECT 1');
            PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
        SQL);
        $this->addSql(<<<'SQL'
            SET @cnt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_month_slice' AND INDEX_NAME = 'idx_bms_booking_yearmonth');
            SET @sql = IF(@cnt>0, 'DROP INDEX `idx_bms_booking_yearmonth` ON `booking_month_slice`', 'SELECT 1');
            PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
        SQL);
        $this->addSql(<<<'SQL'
            SET @cnt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_month_slice' AND INDEX_NAME = 'idx_bms_city');
            SET @sql = IF(@cnt>0, 'DROP INDEX `idx_bms_city` ON `booking_month_slice`', 'SELECT 1');
            PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
        SQL);
        $this->addSql(<<<'SQL'
            SET @cnt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_month_slice' AND INDEX_NAME = 'idx_bms_source');
            SET @sql = IF(@cnt>0, 'DROP INDEX `idx_bms_source` ON `booking_month_slice`', 'SELECT 1');
            PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
        SQL);
        $this->addSql(<<<'SQL'
            SET @cnt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_month_slice' AND INDEX_NAME = 'idx_bms_payment_method');
            SET @sql = IF(@cnt>0, 'DROP INDEX `idx_bms_payment_method` ON `booking_month_slice`', 'SELECT 1');
            PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
        SQL);
        $this->addSql(<<<'SQL'
            SET @cnt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_month_slice' AND INDEX_NAME = 'idx_bms_guest_type');
            SET @sql = IF(@cnt>0, 'DROP INDEX `idx_bms_guest_type` ON `booking_month_slice`', 'SELECT 1');
            PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE `booking_month_slice`
              DROP COLUMN `commission_base_in_month`,
              CHANGE `year_month` `year_month` CHAR(7) NOT NULL,
              CHANGE `room_fee_in_month` `room_fee_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              CHANGE `payout_in_month` `payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              CHANGE `tax_in_month` `tax_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              CHANGE `net_payout_in_month` `net_payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              CHANGE `cleaning_fee_in_month` `cleaning_fee_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              CHANGE `o2_commission_in_month` `o2_commission_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              CHANGE `owner_payout_in_month` `owner_payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX `uniq_booking_month` ON `booking_month_slice` (`booking_id`, `year_month`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_yearmonth_unit` ON `booking_month_slice` (`year_month`, `unit_id`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_booking_yearmonth` ON `booking_month_slice` (`booking_id`, `year_month`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_city` ON `booking_month_slice` (`city`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_source` ON `booking_month_slice` (`source`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_payment_method` ON `booking_month_slice` (`payment_method`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_guest_type` ON `booking_month_slice` (`guest_type`)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE `booking_month_slice` ADD `commission_base_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                CHANGE `year_month` `year_month` CHAR(7) NOT NULL,
                CHANGE `room_fee_in_month` `room_fee_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                CHANGE `payout_in_month` `payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                CHANGE `tax_in_month` `tax_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                CHANGE `net_payout_in_month` `net_payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                CHANGE `cleaning_fee_in_month` `cleaning_fee_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                CHANGE `o2_commission_in_month` `o2_commission_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                CHANGE `owner_payout_in_month` `owner_payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX `uniq_booking_month` ON `booking_month_slice` (`booking_id`, `year_month`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_yearmonth_unit` ON `booking_month_slice` (`year_month`, `unit_id`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_booking_yearmonth` ON `booking_month_slice` (`booking_id`, `year_month`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_city` ON `booking_month_slice` (`city`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_source` ON `booking_month_slice` (`source`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_payment_method` ON `booking_month_slice` (`payment_method`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX `idx_bms_guest_type` ON `booking_month_slice` (`guest_type`)
        SQL);
    }
}
