<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251219065433 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add per_bath_qty and bed_size to purchase_catalog_item
        $this->addSql("ALTER TABLE purchase_catalog_item ADD per_bath_qty INT DEFAULT NULL");
        $this->addSql("ALTER TABLE purchase_catalog_item ADD bed_size VARCHAR(20) DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        // Rollback per_bath_qty and bed_size
        $this->addSql("ALTER TABLE purchase_catalog_item DROP per_bath_qty");
        $this->addSql("ALTER TABLE purchase_catalog_item DROP bed_size");
    }
}
