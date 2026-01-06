<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251025225420 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE occupancy_action_log (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, created_by_id INT NOT NULL, period DATE NOT NULL, action_type VARCHAR(32) NOT NULL, occ_percent SMALLINT DEFAULT NULL, meta JSON DEFAULT NULL, pinned TINYINT(1) NOT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', INDEX IDX_DAF57DB6F8BD700D (unit_id), INDEX IDX_DAF57DB6B03A8386 (created_by_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE occupancy_alert_state (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, created_by_id INT NOT NULL, period DATE NOT NULL, alert_type VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL, snooze_until DATE DEFAULT NULL, reason VARCHAR(300) DEFAULT NULL, version INT NOT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', INDEX IDX_F671748DF8BD700D (unit_id), INDEX IDX_F671748DB03A8386 (created_by_id), UNIQUE INDEX uniq_alert_unit_period_type_version (unit_id, period, alert_type, version), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE occupancy_note (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, created_by_id INT NOT NULL, period DATE NOT NULL, note LONGTEXT NOT NULL, pinned TINYINT(1) NOT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)', INDEX IDX_D28B6154F8BD700D (unit_id), INDEX IDX_D28B6154B03A8386 (created_by_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_action_log ADD CONSTRAINT FK_DAF57DB6F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_action_log ADD CONSTRAINT FK_DAF57DB6B03A8386 FOREIGN KEY (created_by_id) REFERENCES user (id) ON DELETE RESTRICT
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_alert_state ADD CONSTRAINT FK_F671748DF8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_alert_state ADD CONSTRAINT FK_F671748DB03A8386 FOREIGN KEY (created_by_id) REFERENCES user (id) ON DELETE RESTRICT
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_note ADD CONSTRAINT FK_D28B6154F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_note ADD CONSTRAINT FK_D28B6154B03A8386 FOREIGN KEY (created_by_id) REFERENCES user (id) ON DELETE RESTRICT
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
            ALTER TABLE occupancy_action_log DROP FOREIGN KEY FK_DAF57DB6F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_action_log DROP FOREIGN KEY FK_DAF57DB6B03A8386
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_alert_state DROP FOREIGN KEY FK_F671748DF8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_alert_state DROP FOREIGN KEY FK_F671748DB03A8386
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_note DROP FOREIGN KEY FK_D28B6154F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE occupancy_note DROP FOREIGN KEY FK_D28B6154B03A8386
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE occupancy_action_log
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE occupancy_alert_state
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE occupancy_note
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
