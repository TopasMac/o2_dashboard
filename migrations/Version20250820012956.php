<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250820012956 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE booking_month_slice (id BIGINT AUTO_INCREMENT NOT NULL, booking_id BIGINT NOT NULL, confirmation_code VARCHAR(64) DEFAULT NULL, `year_month` VARCHAR(7) NOT NULL, unit_id BIGINT NOT NULL, client_id BIGINT DEFAULT NULL, city VARCHAR(64) DEFAULT NULL, condo VARCHAR(128) DEFAULT NULL, listing_name VARCHAR(255) DEFAULT NULL, source VARCHAR(20) DEFAULT NULL, management_type VARCHAR(20) DEFAULT NULL, check_in DATE NOT NULL, check_out DATE NOT NULL, month_start_date DATE NOT NULL, month_end_date DATE NOT NULL, nights_total INT NOT NULL, nights_in_month INT NOT NULL, room_fee_total NUMERIC(12, 2) DEFAULT NULL, payout_total NUMERIC(12, 2) DEFAULT NULL, tax_total NUMERIC(12, 2) DEFAULT NULL, cleaning_fee_total NUMERIC(12, 2) DEFAULT NULL, room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, notes VARCHAR(255) DEFAULT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
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
