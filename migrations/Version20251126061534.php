<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251126061534 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE employee_task ADD updated_by_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE employee_task ADD CONSTRAINT FK_EMPLOYEE_TASK_UPDATED_BY FOREIGN KEY (updated_by_id) REFERENCES employee (id) ON DELETE SET NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE employee_task DROP FOREIGN KEY FK_EMPLOYEE_TASK_UPDATED_BY');
        $this->addSql('ALTER TABLE employee_task DROP COLUMN updated_by_id');
    }
}
