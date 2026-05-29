<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260529045736 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Refine hk_laundry_records column names for generic laundry items and audit fields';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE weight_kg quantity NUMERIC(10, 2) NOT NULL');
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE price_per_kg_snapshot rate_snapshot NUMERIC(10, 2) DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE calculated_amount charged_amount NUMERIC(10, 2) DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_laundry_records ADD expected_amount NUMERIC(10, 2) DEFAULT NULL AFTER rate_snapshot');
        $this->addSql('UPDATE hk_laundry_records SET expected_amount = charged_amount WHERE expected_amount IS NULL');
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE provider_name provider_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_laundry_records ADD updated_by VARCHAR(120) DEFAULT NULL AFTER created_by');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hk_laundry_records DROP updated_by');
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE provider_id provider_name VARCHAR(120) DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_laundry_records DROP expected_amount');
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE charged_amount calculated_amount NUMERIC(10, 2) DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE rate_snapshot price_per_kg_snapshot NUMERIC(10, 2) DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_laundry_records CHANGE quantity weight_kg NUMERIC(10, 2) NOT NULL');
    }
}
