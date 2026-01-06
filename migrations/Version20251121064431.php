<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251121064431 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Column employee_id already exists in employee_financial_ledger.
        // This migration is kept as a no-op so that Doctrine's migration
        // history stays in sync without attempting to modify the schema again.
    }

    public function down(Schema $schema): void
    {
        // This migration is a no-op; no schema changes to revert.
    }
}
