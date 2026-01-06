<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251029235227 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_inventory_item (id INT AUTO_INCREMENT NOT NULL, session_id INT NOT NULL, area VARCHAR(100) NOT NULL, descripcion VARCHAR(255) NOT NULL, cantidad INT NOT NULL, notas LONGTEXT DEFAULT NULL, INDEX IDX_25B9A72F613FECDF (session_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_inventory_photo (id INT AUTO_INCREMENT NOT NULL, session_id INT NOT NULL, area VARCHAR(100) NOT NULL, caption VARCHAR(255) DEFAULT NULL, file_url VARCHAR(255) NOT NULL, keep TINYINT(1) DEFAULT 1 NOT NULL, INDEX IDX_455326A0613FECDF (session_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_inventory_session (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, status VARCHAR(32) DEFAULT 'draft' NOT NULL, started_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', submitted_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', notes LONGTEXT DEFAULT NULL, INDEX IDX_C4806244F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_inventory_item ADD CONSTRAINT FK_25B9A72F613FECDF FOREIGN KEY (session_id) REFERENCES unit_inventory_session (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_inventory_photo ADD CONSTRAINT FK_455326A0613FECDF FOREIGN KEY (session_id) REFERENCES unit_inventory_session (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_inventory_session ADD CONSTRAINT FK_C4806244F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
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
            ALTER TABLE unit_inventory_item DROP FOREIGN KEY FK_25B9A72F613FECDF
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_inventory_photo DROP FOREIGN KEY FK_455326A0613FECDF
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_inventory_session DROP FOREIGN KEY FK_C4806244F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_inventory_item
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_inventory_photo
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_inventory_session
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
