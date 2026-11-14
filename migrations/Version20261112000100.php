<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261112000100 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Record who is billed for each service job, defaulting to Client';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE service_job ADD bill_to VARCHAR(16) DEFAULT 'CLIENT' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE service_job DROP bill_to');
    }
}
