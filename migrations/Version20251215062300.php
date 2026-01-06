<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251215062300 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Allow drafts: submitted_at must be nullable
        $this->addSql('ALTER TABLE hk_cleaning_checklist CHANGE submitted_at submitted_at DATETIME DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // Revert to NOT NULL (original behavior)
        $this->addSql('ALTER TABLE hk_cleaning_checklist CHANGE submitted_at submitted_at DATETIME NOT NULL');
    }
}
