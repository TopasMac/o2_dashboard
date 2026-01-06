<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251108021953 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE airbnb_payout (id INT AUTO_INCREMENT NOT NULL, reference_code VARCHAR(255) NOT NULL, payout_date DATE DEFAULT NULL, arriving_by DATE DEFAULT NULL, amount NUMERIC(12, 2) DEFAULT NULL, currency VARCHAR(10) DEFAULT NULL, payout_method VARCHAR(255) DEFAULT NULL, payout_destination VARCHAR(255) DEFAULT NULL, notes LONGTEXT DEFAULT NULL, imported_at DATETIME NOT NULL, UNIQUE INDEX uniq_airbnb_payout_reference_code (reference_code), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE airbnb_payout_item (id INT AUTO_INCREMENT NOT NULL, payout_id INT NOT NULL, confirmation_code VARCHAR(32) DEFAULT NULL, listing VARCHAR(255) DEFAULT NULL, guest_name VARCHAR(255) DEFAULT NULL, start_date DATE DEFAULT NULL, end_date DATE DEFAULT NULL, nights INT DEFAULT NULL, amount NUMERIC(12, 2) DEFAULT NULL, gross_earnings NUMERIC(12, 2) DEFAULT NULL, cleaning_fee NUMERIC(12, 2) DEFAULT NULL, service_fee NUMERIC(12, 2) DEFAULT NULL, tax_amount NUMERIC(12, 2) DEFAULT NULL, currency VARCHAR(10) DEFAULT NULL, line_type VARCHAR(50) DEFAULT NULL, imported_at DATETIME DEFAULT NULL, INDEX IDX_979A9881C6D61B7F (payout_id), INDEX idx_airbnb_item_confirmation (confirmation_code), INDEX idx_airbnb_item_listing (listing), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_payout_item ADD CONSTRAINT FK_979A9881C6D61B7F FOREIGN KEY (payout_id) REFERENCES airbnb_payout (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_ALLBOOKINGS_HOLD_EXPIRES_AT ON all_bookings
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings CHANGE hold_expires_at hold_expires_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', CHANGE confirmed_at confirmed_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_payout_item DROP FOREIGN KEY FK_979A9881C6D61B7F
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE airbnb_payout
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE airbnb_payout_item
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings CHANGE hold_expires_at hold_expires_at DATETIME DEFAULT NULL, CHANGE confirmed_at confirmed_at DATETIME DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_ALLBOOKINGS_HOLD_EXPIRES_AT ON all_bookings (hold_expires_at)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
