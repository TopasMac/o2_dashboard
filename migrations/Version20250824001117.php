<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250824001117 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_balance (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL, updated_at DATE NOT NULL COMMENT '(DC2Type:date_immutable)', UNIQUE INDEX UNIQ_F8BD113CF8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_balance_ledger (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, `year_month` VARCHAR(7) DEFAULT NULL, entry_type VARCHAR(32) NOT NULL, amount NUMERIC(12, 2) NOT NULL, balance_after NUMERIC(12, 2) NOT NULL, currency VARCHAR(3) DEFAULT 'MXN' NOT NULL, payment_method VARCHAR(64) DEFAULT NULL, reference VARCHAR(128) DEFAULT NULL, note LONGTEXT DEFAULT NULL, created_at DATE NOT NULL COMMENT '(DC2Type:date_immutable)', created_by VARCHAR(120) NOT NULL, INDEX IDX_3584AFCAF8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance ADD CONSTRAINT FK_F8BD113CF8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance_ledger ADD CONSTRAINT FK_3584AFCAF8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE o2transactions CHANGE created_at created_at DATE DEFAULT CURRENT_DATE NOT NULL COMMENT '(DC2Type:date_immutable)'
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance DROP FOREIGN KEY FK_F8BD113CF8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance_ledger DROP FOREIGN KEY FK_3584AFCAF8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_balance
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_balance_ledger
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE o2transactions CHANGE created_at created_at DATE NOT NULL
        SQL);
    }
}
