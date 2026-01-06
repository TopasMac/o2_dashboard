<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251209011331 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs

        $this->addSql("CREATE TABLE hk_cleaning_checklist_files (id INT AUTO_INCREMENT NOT NULL, checklist_id INT NOT NULL, path VARCHAR(255) NOT NULL, filename VARCHAR(255) DEFAULT NULL, mime_type VARCHAR(100) DEFAULT NULL, size INT DEFAULT NULL, uploaded_at DATETIME NOT NULL, INDEX IDX_CHECKLIST_FILE_PARENT (checklist_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB;");
        $this->addSql("ALTER TABLE hk_cleaning_checklist_files ADD CONSTRAINT FK_CHECKLIST_FILE_PARENT FOREIGN KEY (checklist_id) REFERENCES hk_cleaning_checklist (id) ON DELETE CASCADE;");
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs

        $this->addSql("DROP TABLE hk_cleaning_checklist_files;");
    }
}
