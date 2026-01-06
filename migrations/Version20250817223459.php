<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;
use Doctrine\Migrations\Exception\IrreversibleMigration;

final class Version20250817223459 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Drop legacy share_token table and adjust hktransactions defaults';
    }

    public function up(Schema $schema): void
    {
        // Drop the old table if it still exists
        $this->addSql('DROP TABLE IF EXISTS share_token');

        // Keep the hktransactions changes (align with entity mapping choice)
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions 
              CHANGE paid paid NUMERIC(10, 2) DEFAULT '0',
              CHANGE charged charged NUMERIC(10, 2) DEFAULT '0'
        SQL);
    }

    public function down(Schema $schema): void
    {
        // Revert hktransactions default change (only if you really want a reversible down)
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions 
              CHANGE paid paid NUMERIC(10, 2) DEFAULT '0.00',
              CHANGE charged charged NUMERIC(10, 2) DEFAULT '0.00'
        SQL);

        // Do not restore share_token table
        throw new IrreversibleMigration('share_token table removal is irreversible.');
    }
}