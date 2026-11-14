<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261113000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Link HK transactions to unique Labour and Equipment lines on Service Jobs';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hktransactions ADD service_job_id INT DEFAULT NULL, ADD allocation_line_type VARCHAR(16) DEFAULT NULL, ADD UNIQUE INDEX UNIQ_HK_SERVICE_JOB_LINE (service_job_id, allocation_line_type), ADD CONSTRAINT FK_HK_SERVICE_JOB FOREIGN KEY (service_job_id) REFERENCES service_job (id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hktransactions DROP FOREIGN KEY FK_HK_SERVICE_JOB, DROP INDEX UNIQ_HK_SERVICE_JOB_LINE, DROP COLUMN service_job_id, DROP COLUMN allocation_line_type');
    }
}
