<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251219084453 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add flexible quantity rule fields
        $this->addSql("ALTER TABLE purchase_catalog_item ADD qty_basis VARCHAR(20) DEFAULT NULL");
        $this->addSql("ALTER TABLE purchase_catalog_item ADD qty_per_basis INT DEFAULT NULL");
        $this->addSql("ALTER TABLE purchase_catalog_item ADD qty_per_bed_by_size JSON DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        // Rollback flexible quantity rule fields
        $this->addSql("ALTER TABLE purchase_catalog_item DROP qty_basis");
        $this->addSql("ALTER TABLE purchase_catalog_item DROP qty_per_basis");
        $this->addSql("ALTER TABLE purchase_catalog_item DROP qty_per_bed_by_size");
    }
}
