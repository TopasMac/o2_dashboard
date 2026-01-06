<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Adjust alert_dismissal to support per-user, per-category dismissals
 * and prepare reuse for task notifications.
 */
final class Version20251128033127 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add category and dismissed_by to alert_dismissal, drop dismissed_by_email, and change unique index to (dismissed_by_id, category, token).';
    }

    public function up(Schema $schema): void
    {
        // This migration is designed for MySQL.
        $this->abortIf(
            $this->connection->getDatabasePlatform()->getName() !== 'mysql',
            'Migration can only be executed safely on \'mysql\'.'
        );

        // 1) Add new columns: category + dismissed_by_id (nullable for legacy rows).
        $this->addSql("ALTER TABLE alert_dismissal ADD category VARCHAR(64) NOT NULL DEFAULT 'alert', ADD dismissed_by_id INT DEFAULT NULL");

        // Ensure existing rows have a sensible category.
        $this->addSql("UPDATE alert_dismissal SET category = 'alert' WHERE category IS NULL OR category = ''");

        // 2) Drop any existing UNIQUE index on token (name may vary between environments).
        $dbName = $this->connection->getDatabase();
        $indexNames = $this->connection->fetchFirstColumn(
            'SELECT DISTINCT INDEX_NAME 
             FROM INFORMATION_SCHEMA.STATISTICS 
             WHERE TABLE_SCHEMA = ? 
               AND TABLE_NAME = \'alert_dismissal\' 
               AND COLUMN_NAME = \'token\' 
               AND NON_UNIQUE = 0',
            [$dbName]
        );

        foreach ($indexNames as $indexName) {
            $this->addSql(sprintf('ALTER TABLE alert_dismissal DROP INDEX `%s`', $indexName));
        }

        // 3) Add the new composite unique index (dismissed_by_id, category, token).
        $this->addSql('ALTER TABLE alert_dismissal ADD UNIQUE INDEX uniq_dismissal_user_category_token (dismissed_by_id, category, token)');

        // 4) Drop the old dismissed_by_email column (no longer used).
        $this->addSql('ALTER TABLE alert_dismissal DROP dismissed_by_email');

        // Note: we intentionally do NOT enforce NOT NULL or a foreign key on dismissed_by_id yet
        // to avoid breaking existing global dismissals. New code will always set dismissed_by_id.
    }

    public function down(Schema $schema): void
    {
        // This migration is designed for MySQL.
        $this->abortIf(
            $this->connection->getDatabasePlatform()->getName() !== 'mysql',
            'Migration can only be executed safely on \'mysql\'.'
        );

        // Recreate the old dismissed_by_email column.
        $this->addSql('ALTER TABLE alert_dismissal ADD dismissed_by_email VARCHAR(255) DEFAULT NULL');

        // Drop the composite unique index.
        $this->addSql('ALTER TABLE alert_dismissal DROP INDEX uniq_dismissal_user_category_token');

        // Drop the new columns.
        $this->addSql('ALTER TABLE alert_dismissal DROP category, DROP dismissed_by_id');

        // Recreate a UNIQUE index on token (name is arbitrary here).
        $this->addSql('ALTER TABLE alert_dismissal ADD UNIQUE INDEX uniq_alert_dismissal_token (token)');
    }
}
