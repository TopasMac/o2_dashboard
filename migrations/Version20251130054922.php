<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251130054922 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add employee_task_id column to unit_document_attachment
        $this->addSql('ALTER TABLE unit_document_attachment ADD employee_task_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE unit_document_attachment ADD CONSTRAINT FK_UDATTACH_EMPLOYEETASK FOREIGN KEY (employee_task_id) REFERENCES employee_task (id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX IDX_UDATTACH_EMPLOYEETASK ON unit_document_attachment (employee_task_id)');
    }

    public function down(Schema $schema): void
    {
        // Remove employee_task_id column and foreign key
        $this->addSql('ALTER TABLE unit_document_attachment DROP FOREIGN KEY FK_UDATTACH_EMPLOYEETASK');
        $this->addSql('DROP INDEX IDX_UDATTACH_EMPLOYEETASK ON unit_document_attachment');
        $this->addSql('ALTER TABLE unit_document_attachment DROP employee_task_id');
    }
}
