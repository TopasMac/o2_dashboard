<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251203222817 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE employee_task ADD maintenance_schedule_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE employee_task ADD CONSTRAINT FK_EMP_TASK_MAINT_SCHED FOREIGN KEY (maintenance_schedule_id) REFERENCES unit_maintenance_schedule (id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX IDX_EMP_TASK_MAINT_SCHED ON employee_task (maintenance_schedule_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE employee_task DROP FOREIGN KEY FK_EMP_TASK_MAINT_SCHED');
        $this->addSql('DROP INDEX IDX_EMP_TASK_MAINT_SCHED ON employee_task');
        $this->addSql('ALTER TABLE employee_task DROP maintenance_schedule_id');
    }
}
