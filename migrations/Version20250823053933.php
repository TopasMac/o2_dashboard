<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250823053933 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE `booking_month_slice` (
              `id` BIGINT AUTO_INCREMENT NOT NULL,
              `booking_id` BIGINT NOT NULL,
              `unit_id` BIGINT NOT NULL,
              `city` VARCHAR(64) NOT NULL,
              `source` VARCHAR(32) NOT NULL,
              `payment_method` VARCHAR(32) NOT NULL,
              `guest_type` VARCHAR(32) DEFAULT NULL,
              `year_month` CHAR(7) NOT NULL,
              `month_start_date` DATE NOT NULL,
              `month_end_date` DATE NOT NULL,
              `nights_total` INT NOT NULL,
              `nights_in_month` INT NOT NULL,
              `room_fee_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `tax_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `net_payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `cleaning_fee_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `commission_base_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `o2_commission_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `owner_payout_in_month` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              PRIMARY KEY(`id`),
              UNIQUE KEY `uniq_booking_month` (`booking_id`, `year_month`),
              KEY `idx_bms_yearmonth_unit` (`year_month`, `unit_id`),
              KEY `idx_bms_booking_yearmonth` (`booking_id`, `year_month`),
              KEY `idx_bms_city` (`city`),
              KEY `idx_bms_source` (`source`),
              KEY `idx_bms_payment_method` (`payment_method`),
              KEY `idx_bms_guest_type` (`guest_type`)
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE booking_month_slice
        SQL);
    }
}
