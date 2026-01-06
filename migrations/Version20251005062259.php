<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251005062259 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // booking_month_slice numeric tweaks (kept from auto-gen)
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);

        // drop unused owner_report_cycle email columns
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle DROP email_to, DROP email_subject, DROP email_by
        SQL);

        // normalize email_status + email_at storage
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle 
                MODIFY email_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                MODIFY email_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)'
        SQL);

        // add proper FK to email_event(id) without altering email_message_id
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle ADD email_event_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_ORC_EMAIL_EVENT ON owner_report_cycle (email_event_id)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle 
                ADD CONSTRAINT FK_ORC_EMAIL_EVENT FOREIGN KEY (email_event_id) 
                REFERENCES email_event (id) ON DELETE SET NULL
        SQL);

        // unit_balance numeric tweak (kept from auto-gen)
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // revert unit_balance numeric tweak
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);

        // drop FK + index + column
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle DROP FOREIGN KEY FK_ORC_EMAIL_EVENT
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_ORC_EMAIL_EVENT ON owner_report_cycle
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle DROP email_event_id
        SQL);

        // revert email_status + email_at storage
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle 
                MODIFY email_status VARCHAR(20) NOT NULL,
                MODIFY email_at DATETIME DEFAULT NULL
        SQL);

        // restore removed columns
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle ADD email_to VARCHAR(320) DEFAULT NULL, ADD email_subject VARCHAR(200) DEFAULT NULL, ADD email_by VARCHAR(100) DEFAULT NULL
        SQL);

        // revert booking_month_slice numeric tweaks
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
