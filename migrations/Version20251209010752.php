<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251209010752 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs

        $this->addSql("CREATE TABLE hk_cleaning_checklist (id INT AUTO_INCREMENT NOT NULL, cleaning_id INT NOT NULL, cleaner_id INT NOT NULL, submitted_at DATETIME NOT NULL, checklist_data JSON NOT NULL, checklist_version VARCHAR(20) NOT NULL, notes LONGTEXT DEFAULT NULL, has_issues TINYINT(1) NOT NULL, INDEX IDX_CHECKLIST_CLEANER (cleaner_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB;");
        $this->addSql("ALTER TABLE hk_cleaning_checklist ADD CONSTRAINT FK_CHECKLIST_CLEANER FOREIGN KEY (cleaner_id) REFERENCES employee (id);");
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs

        $this->addSql("DROP TABLE hk_cleaning_checklist;");
    }
}
