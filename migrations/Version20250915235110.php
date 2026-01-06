<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250915235110 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add composite indexes for owner_report_cycle and unit_balance_ledger';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        
        // Conditionally create composite index on owner_report_cycle (unit_id, report_month)
        $sm = $this->connection->createSchemaManager();
        $orcIndexes = $sm->listTableIndexes('owner_report_cycle');
        $hasIdxUnitMonth = false;
        foreach ($orcIndexes as $idx) {
            if (strtolower($idx->getName()) === 'idx_unit_month') { $hasIdxUnitMonth = true; break; }
        }
        if (!$hasIdxUnitMonth) {
            // MySQL-compatible syntax
            $this->addSql('CREATE INDEX idx_unit_month ON owner_report_cycle (unit_id, report_month)');
        }
        
        // Conditionally create composite index on unit_balance_ledger (unit_id, yearmonth, entry_type)
        $ublIndexes = $sm->listTableIndexes('unit_balance_ledger');
        $hasIdxUnitMonthEntry = false;
        foreach ($ublIndexes as $idx) {
            if (strtolower($idx->getName()) === 'idx_unit_month_entry') { $hasIdxUnitMonthEntry = true; break; }
        }
        if (!$hasIdxUnitMonthEntry) {
            $this->addSql('CREATE INDEX idx_unit_month_entry ON unit_balance_ledger (unit_id, yearmonth, entry_type)');
        }
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        
        // Conditionally drop indexes (MySQL syntax requires ON <table>)
        $sm = $this->connection->createSchemaManager();
        $orcIndexes = $sm->listTableIndexes('owner_report_cycle');
        foreach ($orcIndexes as $idx) {
            if (strtolower($idx->getName()) === 'idx_unit_month') {
                $this->addSql('DROP INDEX idx_unit_month ON owner_report_cycle');
                break;
            }
        }
        $ublIndexes = $sm->listTableIndexes('unit_balance_ledger');
        foreach ($ublIndexes as $idx) {
            if (strtolower($idx->getName()) === 'idx_unit_month_entry') {
                $this->addSql('DROP INDEX idx_unit_month_entry ON unit_balance_ledger');
                break;
            }
        }
    }
}
