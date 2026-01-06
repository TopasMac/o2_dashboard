<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251203221551 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE unit_maintenance_schedule (
            id INT AUTO_INCREMENT NOT NULL,
            unit_id INT NOT NULL,
            task_code VARCHAR(100) NOT NULL,
            label VARCHAR(255) DEFAULT NULL,
            frequency_weeks SMALLINT DEFAULT NULL,
            frequency_months SMALLINT DEFAULT NULL,
            last_done_at DATETIME DEFAULT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            next_due_at DATETIME DEFAULT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            is_enabled TINYINT(1) DEFAULT 1 NOT NULL,
            created_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            updated_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            INDEX IDX_UNIT_MAINT_SCHED_UNIT (unit_id),
            PRIMARY KEY(id),
            CONSTRAINT FK_UNIT_MAINT_SCHED_UNIT FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB;');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE unit_maintenance_schedule');
    }
}
