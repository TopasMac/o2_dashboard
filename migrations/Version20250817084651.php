<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Stub to satisfy an executed migration that was lost during a reset.
 * Do not remove unless you also remove the corresponding row from doctrine_migration_versions.
 */
final class Version20250817084651 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Stub: re-created to match an already executed migration (no-op).';
    }

    public function up(Schema $schema): void
    {
        // no-op: the real changes were already applied before this file was lost
    }

    public function down(Schema $schema): void
    {
        // no-op: irreversible without the original logic
    }
}