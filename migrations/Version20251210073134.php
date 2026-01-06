<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251210073134 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add payment_requested column to owner_report_cycle
        $this->addSql("ALTER TABLE owner_report_cycle ADD payment_requested TINYINT(1) NOT NULL DEFAULT 0");
    }

    public function down(Schema $schema): void
    {
        // Remove payment_requested column
        $this->addSql("ALTER TABLE owner_report_cycle DROP COLUMN payment_requested");
    }
}
