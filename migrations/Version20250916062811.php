<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250916062811 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE contract_draft (id INT AUTO_INCREMENT NOT NULL, status VARCHAR(10) DEFAULT 'DRAFT' NOT NULL, default_locale VARCHAR(5) DEFAULT 'en' NOT NULL, client_name VARCHAR(180) NOT NULL, unit_name VARCHAR(180) NOT NULL, notes LONGTEXT DEFAULT NULL, fields JSON NOT NULL, overrides_en JSON DEFAULT NULL, overrides_es JSON DEFAULT NULL, version INT DEFAULT 1 NOT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_unit_month ON owner_report_cycle
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX idx_unit_month_entry ON unit_balance_ledger
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE contract_draft
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_unit_month ON owner_report_cycle (unit_id, report_month)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX idx_unit_month_entry ON unit_balance_ledger (unit_id, yearmonth, entry_type)
        SQL);
    }
}
