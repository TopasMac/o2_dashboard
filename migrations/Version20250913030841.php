<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250913030841 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE email_event (id INT AUTO_INCREMENT NOT NULL, unit_id INT DEFAULT NULL, client_id INT DEFAULT NULL, category VARCHAR(50) NOT NULL, `year_month` VARCHAR(7) DEFAULT NULL, to_email LONGTEXT NOT NULL, cc_email LONGTEXT DEFAULT NULL, subject LONGTEXT DEFAULT NULL, template VARCHAR(120) DEFAULT NULL, payload_json JSON DEFAULT NULL, status VARCHAR(20) NOT NULL, message_id VARCHAR(190) DEFAULT NULL, error LONGTEXT DEFAULT NULL, sent_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', created_by VARCHAR(120) DEFAULT NULL, attachment_count INT DEFAULT 0 NOT NULL, attachments_json JSON DEFAULT NULL, INDEX IDX_A6E34B28F8BD700D (unit_id), INDEX IDX_A6E34B2819EB6921 (client_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE email_event ADD CONSTRAINT FK_A6E34B28F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE SET NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE email_event ADD CONSTRAINT FK_A6E34B2819EB6921 FOREIGN KEY (client_id) REFERENCES client (id) ON DELETE SET NULL
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX uniq_booking_month ON booking_month_slice
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
            ALTER TABLE email_event DROP FOREIGN KEY FK_A6E34B28F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE email_event DROP FOREIGN KEY FK_A6E34B2819EB6921
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE email_event
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX uniq_booking_month ON booking_month_slice (booking_id, `year_month`)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
