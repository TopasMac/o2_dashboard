<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251219053111 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE purchase_catalog_item (
            id INT AUTO_INCREMENT NOT NULL,
            sku VARCHAR(64) DEFAULT NULL,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(120) DEFAULT NULL,
            is_always_needed TINYINT(1) NOT NULL DEFAULT 0,
            unit_type VARCHAR(50) DEFAULT NULL,
            per_bed_qty INT DEFAULT NULL,
            per_guest_qty INT DEFAULT NULL,
            min_qty INT DEFAULT NULL,
            default_qty INT DEFAULT NULL,
            purchase_source VARCHAR(120) DEFAULT NULL,
            purchase_url LONGTEXT DEFAULT NULL,
            cost NUMERIC(10, 2) DEFAULT NULL,
            sell_price NUMERIC(10, 2) DEFAULT NULL,
            notes LONGTEXT DEFAULT NULL,
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE purchase_catalog_item');
    }
}
