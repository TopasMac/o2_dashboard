<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260215013054 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hk_cleanings_recon_notes ADD unit_id INT DEFAULT NULL');
        $this->addSql('CREATE INDEX idx_hk_recon_note_items_unit ON hk_cleanings_recon_notes (unit_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX idx_hk_recon_note_items_unit ON hk_cleanings_recon_notes');
        $this->addSql('ALTER TABLE hk_cleanings_recon_notes DROP unit_id');
    }
}
