<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251003230807 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_document_attachment (id INT AUTO_INCREMENT NOT NULL, document_id INT NOT NULL, target_type VARCHAR(50) NOT NULL, target_id INT NOT NULL, category VARCHAR(50) DEFAULT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', INDEX idx_uda_target (target_type, target_id), INDEX idx_uda_document (document_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document_attachment ADD CONSTRAINT FK_7B642374C33F7837 FOREIGN KEY (document_id) REFERENCES unit_document (id) ON DELETE CASCADE
        SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document_attachment DROP FOREIGN KEY FK_7B642374C33F7837
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_document_attachment
        SQL);
    }
}
