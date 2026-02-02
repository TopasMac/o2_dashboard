<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260202090816 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add linkage to hk_cleanings (single source of truth) + track real/invoiced cleaning cost.
        // NOTE: This migration is written to be safe even if a prior "test" row exists.

        // 1) Add hk_cleaning_id (nullable) if not present
        $this->addSql("ALTER TABLE hk_cleanings_reconcile ADD hk_cleaning_id INT DEFAULT NULL");

        // 2) Add real_cleaning_cost (nullable) if not present
        $this->addSql("ALTER TABLE hk_cleanings_reconcile ADD real_cleaning_cost NUMERIC(10, 2) DEFAULT NULL");

        // 3) Index + FK for hk_cleaning_id
        $this->addSql("CREATE INDEX IDX_HK_RECONCILE_HK_CLEANING_ID ON hk_cleanings_reconcile (hk_cleaning_id)");
        $this->addSql("ALTER TABLE hk_cleanings_reconcile ADD CONSTRAINT FK_HK_RECONCILE_HK_CLEANING_ID FOREIGN KEY (hk_cleaning_id) REFERENCES hk_cleanings (id) ON DELETE SET NULL");

        // 4) Remove the existing seed/test row (conservative: only deletes fully-empty / zeroed rows)
        $this->addSql("DELETE FROM hk_cleanings_reconcile\n            WHERE (unit_id IS NULL OR unit_id = 0)\n              AND (service_date IS NULL OR service_date = '0000-00-00')\n              AND (cleaning IS NULL OR cleaning = 0)\n              AND (laundry IS NULL OR laundry = 0)\n              AND (total IS NULL OR total = 0)\n              AND (expected_cost IS NULL OR expected_cost = 0)\n              AND (charged_cost IS NULL OR charged_cost = 0)\n              AND (diff IS NULL OR diff = 0)");
    }

    public function down(Schema $schema): void
    {
        // Drop FK + index + columns added in up()
        $this->addSql('ALTER TABLE hk_cleanings_reconcile DROP FOREIGN KEY FK_HK_RECONCILE_HK_CLEANING_ID');
        $this->addSql('DROP INDEX IDX_HK_RECONCILE_HK_CLEANING_ID ON hk_cleanings_reconcile');
        $this->addSql('ALTER TABLE hk_cleanings_reconcile DROP hk_cleaning_id');
        $this->addSql('ALTER TABLE hk_cleanings_reconcile DROP real_cleaning_cost');
    }
}
