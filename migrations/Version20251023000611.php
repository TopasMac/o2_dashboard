<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251023000611 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_media (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, s3_key VARCHAR(255) NOT NULL, url VARCHAR(512) NOT NULL, caption VARCHAR(255) DEFAULT NULL, seo_description LONGTEXT DEFAULT NULL, tags JSON DEFAULT NULL, is_published TINYINT(1) NOT NULL, is_cover TINYINT(1) NOT NULL, sort_order INT DEFAULT 0 NOT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME NOT NULL, INDEX IDX_E11EDF07F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_media ADD CONSTRAINT FK_E11EDF07F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit ADD seo_short_description LONGTEXT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_media DROP FOREIGN KEY FK_E11EDF07F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_media
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit DROP seo_short_description
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
