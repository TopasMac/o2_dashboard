<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251215060524 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // HKCleanings: rename assignment fields
        $this->addSql('ALTER TABLE hk_cleanings CHANGE hk_worker_id assigned_to_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_cleanings CHANGE notes assign_notes LONGTEXT DEFAULT NULL');

        // HKCleaningChecklist: rename notes to cleaning_notes
        $this->addSql('ALTER TABLE hk_cleaning_checklist CHANGE notes cleaning_notes LONGTEXT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // Revert HKCleaningChecklist
        $this->addSql('ALTER TABLE hk_cleaning_checklist CHANGE cleaning_notes notes LONGTEXT DEFAULT NULL');

        // Revert HKCleanings
        $this->addSql('ALTER TABLE hk_cleanings CHANGE assign_notes notes LONGTEXT DEFAULT NULL');
        $this->addSql('ALTER TABLE hk_cleanings CHANGE assigned_to_id hk_worker_id INT DEFAULT NULL');
    }
}
