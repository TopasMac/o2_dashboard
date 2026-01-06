<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20250823ChangeCreatedAtToDate extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Change o2transactions.created_at from DATETIME to DATE and normalize existing values to date-only.';
    }

    public function up(Schema $schema): void
    {
        // Safety: only run on MySQL
        $this->abortIf($this->connection->getDatabasePlatform()->getName() !== 'mysql', 'Migration can only be executed safely on MySQL.');

        // 1) Change column type to DATE (drops time portion at storage level)
        $this->addSql('ALTER TABLE o2transactions MODIFY created_at DATE NOT NULL');

        // 2) Normalize existing values (no-op if already DATE, safe to run)
        $this->addSql('UPDATE o2transactions SET created_at = DATE(created_at)');
    }

    public function down(Schema $schema): void
    {
        // Safety: only run on MySQL
        $this->abortIf($this->connection->getDatabasePlatform()->getName() !== 'mysql', 'Migration can only be executed safely on MySQL.');

        // Revert to DATETIME (time will be 00:00:00 for all existing rows)
        $this->addSql('ALTER TABLE o2transactions MODIFY created_at DATETIME NOT NULL');
    }
}