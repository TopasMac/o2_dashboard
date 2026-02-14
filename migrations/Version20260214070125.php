<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260214070125 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add hk_cleaning_id to hk_cleanings_recon_notes and remove test rows 2,4,5';
    }

    public function up(Schema $schema): void
    {
        // Add nullable hk_cleaning_id column
        $this->addSql('ALTER TABLE hk_cleanings_recon_notes ADD hk_cleaning_id INT DEFAULT NULL');

        // Add index for performance
        $this->addSql('CREATE INDEX idx_hk_recon_note_items_hk_cleaning ON hk_cleanings_recon_notes (hk_cleaning_id)');

        // Remove existing test rows
        $this->addSql('DELETE FROM hk_cleanings_recon_notes WHERE id IN (2, 4, 5)');
    }

    public function down(Schema $schema): void
    {
        // Drop index
        $this->addSql('DROP INDEX idx_hk_recon_note_items_hk_cleaning ON hk_cleanings_recon_notes');

        // Drop column
        $this->addSql('ALTER TABLE hk_cleanings_recon_notes DROP hk_cleaning_id');

        // NOTE: deleted rows are not restored in down()
    }
}
