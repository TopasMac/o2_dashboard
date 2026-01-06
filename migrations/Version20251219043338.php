<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251219043338 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add bed_config JSON column to units
        $this->addSql("ALTER TABLE unit ADD bed_config JSON DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        // Remove bed_config JSON column from units
        $this->addSql("ALTER TABLE unit DROP bed_config");
    }
}
