<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260529031900 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE hk_laundry_rates (
            id INT AUTO_INCREMENT NOT NULL,
            city VARCHAR(50) NOT NULL,
            provider_name VARCHAR(120) DEFAULT NULL,
            item_type VARCHAR(50) NOT NULL,
            unit_price NUMERIC(10, 2) NOT NULL,
            effective_from DATE NOT NULL,
            effective_to DATE DEFAULT NULL,
            is_active TINYINT(1) NOT NULL,
            notes LONGTEXT DEFAULT NULL,
            created_at DATETIME NOT NULL COMMENT "(DC2Type:datetime_immutable)",
            updated_at DATETIME NOT NULL COMMENT "(DC2Type:datetime_immutable)",
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');

        $this->addSql('CREATE TABLE hk_laundry_records (
            id INT AUTO_INCREMENT NOT NULL,
            unit_id INT NOT NULL,
            rate_id INT DEFAULT NULL,
            laundry_date DATE NOT NULL,
            weight_kg NUMERIC(10, 2) NOT NULL,
            price_per_kg_snapshot NUMERIC(10, 2) DEFAULT NULL,
            calculated_amount NUMERIC(10, 2) DEFAULT NULL,
            provider_name VARCHAR(120) DEFAULT NULL,
            notes LONGTEXT DEFAULT NULL,
            created_by VARCHAR(120) DEFAULT NULL,
            created_at DATETIME NOT NULL COMMENT "(DC2Type:datetime_immutable)",
            updated_at DATETIME NOT NULL COMMENT "(DC2Type:datetime_immutable)",
            INDEX IDX_HK_LAUNDRY_RECORDS_UNIT (unit_id),
            INDEX IDX_HK_LAUNDRY_RECORDS_RATE (rate_id),
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');

        $this->addSql('ALTER TABLE hk_laundry_records ADD CONSTRAINT FK_HK_LAUNDRY_RECORDS_UNIT FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE RESTRICT');
        $this->addSql('ALTER TABLE hk_laundry_records ADD CONSTRAINT FK_HK_LAUNDRY_RECORDS_RATE FOREIGN KEY (rate_id) REFERENCES hk_laundry_rates (id) ON DELETE SET NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hk_laundry_records DROP FOREIGN KEY FK_HK_LAUNDRY_RECORDS_UNIT');
        $this->addSql('ALTER TABLE hk_laundry_records DROP FOREIGN KEY FK_HK_LAUNDRY_RECORDS_RATE');
        $this->addSql('DROP TABLE hk_laundry_records');
        $this->addSql('DROP TABLE hk_laundry_rates');
    }
}
