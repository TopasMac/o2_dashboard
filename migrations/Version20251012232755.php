<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251012232755 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE employee_financial_ledger (id INT AUTO_INCREMENT NOT NULL, employee_id INT NOT NULL, employee_shortname VARCHAR(120) DEFAULT NULL, type VARCHAR(20) NOT NULL, amount NUMERIC(12, 2) NOT NULL, period_start DATE DEFAULT NULL COMMENT '(DC2Type:date_immutable)', period_end DATE DEFAULT NULL COMMENT '(DC2Type:date_immutable)', division VARCHAR(40) DEFAULT NULL, city VARCHAR(40) DEFAULT NULL, cost_centre VARCHAR(40) DEFAULT NULL, notes LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', INDEX idx_efl_employee (employee_id), INDEX idx_efl_division (division), INDEX idx_efl_city (city), INDEX idx_efl_period_start (period_start), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE employee_financial_ledger ADD CONSTRAINT FK_BA30C64A8C03F15C FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE RESTRICT
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE employee CHANGE bank_holder bank_holder VARCHAR(120) DEFAULT NULL, CHANGE bank_name bank_name VARCHAR(120) DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle DROP FOREIGN KEY FK_9E4714201496FE46
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle ADD CONSTRAINT FK_9E4714201496FE46 FOREIGN KEY (last_email_event_id) REFERENCES email_event (id) ON DELETE SET NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle RENAME INDEX fk_9e4714201496fe46 TO IDX_9E4714201496FE46
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE employee_financial_ledger DROP FOREIGN KEY FK_BA30C64A8C03F15C
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE employee_financial_ledger
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE employee CHANGE bank_holder bank_holder VARCHAR(100) DEFAULT NULL, CHANGE bank_name bank_name VARCHAR(100) DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle DROP FOREIGN KEY FK_9E4714201496FE46
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle ADD CONSTRAINT FK_9E4714201496FE46 FOREIGN KEY (last_email_event_id) REFERENCES email_event (id) ON UPDATE CASCADE ON DELETE SET NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE owner_report_cycle RENAME INDEX idx_9e4714201496fe46 TO FK_9E4714201496FE46
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
