<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260205080718 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add report_status to track reconciliation/reporting state (separate from cleaning workflow status)
        // Values used in app: pending | reported | needs_review
        $this->addSql("ALTER TABLE hk_cleanings ADD report_status VARCHAR(16) NOT NULL DEFAULT 'pending'");

        // Backfill: for Playa del Carmen, if the cleaning is already done, consider it reported
        // (Tulum remains pending by default)
        $this->addSql(
            "UPDATE hk_cleanings \n"
            . "SET report_status = 'reported' \n"
            . "WHERE LOWER(COALESCE(city, '')) LIKE 'playa%' \n"
            . "  AND LOWER(COALESCE(status, '')) = 'done'"
        );
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hk_cleanings DROP report_status');
    }
}
