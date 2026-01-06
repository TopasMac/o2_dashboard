<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251127072757 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE employee_task ADD old_status VARCHAR(50) DEFAULT NULL");
        $this->addSql("UPDATE employee_task SET old_status = status WHERE id IN (1,2)");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE employee_task DROP old_status");
    }
}
