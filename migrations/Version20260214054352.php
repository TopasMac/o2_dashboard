<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260214054352 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Drop and recreate table structure (test data only)
        $this->addSql('DROP TABLE IF EXISTS hk_cleanings_recon_notes');

        // Create new checklist-style note items table
        $this->addSql('CREATE TABLE hk_cleanings_recon_notes (
            id INT AUTO_INCREMENT NOT NULL,
            city VARCHAR(40) NOT NULL,
            month VARCHAR(7) NOT NULL,
            item_text LONGTEXT NOT NULL,
            status VARCHAR(12) NOT NULL,
            resolution LONGTEXT DEFAULT NULL,
            resolved_at DATETIME DEFAULT NULL,
            resolved_by_user_id INT DEFAULT NULL,
            created_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            updated_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            INDEX idx_hk_recon_note_items_city_month (city, month),
            INDEX idx_hk_recon_note_items_status (status),
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
    }

    public function down(Schema $schema): void
    {
        // Recreate old table structure (minimal version)
        $this->addSql('CREATE TABLE hk_cleanings_recon_notes (
            id INT AUTO_INCREMENT NOT NULL,
            city VARCHAR(40) NOT NULL,
            month VARCHAR(7) NOT NULL,
            notes LONGTEXT DEFAULT NULL,
            updated_by_user_id INT DEFAULT NULL,
            updated_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            created_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            UNIQUE INDEX uniq_hk_recon_notes_city_month (city, month),
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');

        $this->addSql('DROP TABLE IF EXISTS hk_cleanings_recon_notes');
    }
}
