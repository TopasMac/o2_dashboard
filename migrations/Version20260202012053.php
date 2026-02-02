<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260202012053 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add bill_to field to hk_cleanings to attribute who pays for a cleaning (OWNERS2/GUEST)';
    }

    public function up(Schema $schema): void
    {
        // Add billing attribution to hk_cleanings
        // Default: OWNERS2 is billed for all cleanings (including checkout and owner stays).
        // Only midstay cleanings may be billed directly to the guest.
        // Safety: any remaining/unknown types stay as OWNERS2.

        $this->addSql("ALTER TABLE `hk_cleanings` ADD `bill_to` VARCHAR(16) NOT NULL DEFAULT 'OWNERS2'");

        // Backfill: default rule is OWNERS2 (Owners2 collects and pays HK), including checkout and owner stays.
        $this->addSql("UPDATE `hk_cleanings` SET `bill_to` = 'OWNERS2' WHERE LOWER(COALESCE(`cleaning_type`, '')) IN ('checkout','check_out','check-out','owner','owner_stay','ownerstay')");

        // Midstay cleanings may be charged directly to the guest.
        $this->addSql("UPDATE `hk_cleanings` SET `bill_to` = 'GUEST' WHERE LOWER(COALESCE(`cleaning_type`, '')) IN ('midstay','mid_stay','mid-stay')");

        // Safety: any remaining/unknown types stay as OWNERS2.
        $this->addSql("UPDATE `hk_cleanings` SET `bill_to` = 'OWNERS2' WHERE `bill_to` IS NULL OR `bill_to` = ''");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE `hk_cleanings` DROP COLUMN `bill_to`');
    }
}
