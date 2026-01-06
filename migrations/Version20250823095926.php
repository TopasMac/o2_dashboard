<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250823095926 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE owner_report_cycle (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, `year_month` VARCHAR(7) NOT NULL, report_issued_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', report_issued_by VARCHAR(100) DEFAULT NULL, report_url VARCHAR(512) DEFAULT NULL, payment_status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, payment_amount NUMERIC(12, 2) DEFAULT NULL, payment_ref VARCHAR(120) DEFAULT NULL, payment_method VARCHAR(60) DEFAULT NULL, payment_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', payment_by VARCHAR(100) DEFAULT NULL, email_status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, email_to VARCHAR(320) DEFAULT NULL, email_subject VARCHAR(200) DEFAULT NULL, email_message_id VARCHAR(200) DEFAULT NULL, email_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', email_by VARCHAR(100) DEFAULT NULL, notes LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', INDEX IDX_9E471420F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle ADD CONSTRAINT FK_9E471420F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id)
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_bms_booking_yearmonth ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_bms_city ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_bms_guest_type ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_bms_payment_method ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_bms_source ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_bms_yearmonth_unit ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX uniq_booking_month ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE `year_month` `year_month` VARCHAR(7) NOT NULL, CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle DROP FOREIGN KEY FK_9E471420F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE owner_report_cycle
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE `year_month` `year_month` CHAR(7) NOT NULL, CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_bms_booking_yearmonth ON booking_month_slice (booking_id, `year_month`)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_bms_city ON booking_month_slice (city)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_bms_guest_type ON booking_month_slice (guest_type)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_bms_payment_method ON booking_month_slice (payment_method)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_bms_source ON booking_month_slice (source)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_bms_yearmonth_unit ON booking_month_slice (`year_month`, unit_id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX uniq_booking_month ON booking_month_slice (booking_id, `year_month`)
        SQL);
    }
}
