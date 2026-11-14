<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261113000100 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Allow multiple allocation lines per Service Job while deduplicating retries';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hktransactions ADD allocation_request_key VARCHAR(36) DEFAULT NULL, ADD UNIQUE INDEX UNIQ_HK_SERVICE_JOB_REQUEST (service_job_id, allocation_request_key)');
        $this->addSql('ALTER TABLE hktransactions DROP INDEX UNIQ_HK_SERVICE_JOB_LINE');
    }

    public function down(Schema $schema): void
    {
        $duplicateLines = $this->connection->fetchOne('SELECT 1 FROM hktransactions WHERE service_job_id IS NOT NULL GROUP BY service_job_id, allocation_line_type HAVING COUNT(*) > 1 LIMIT 1');
        $this->abortIf($duplicateLines !== false, 'Multiple allocations of the same type exist. Resolve them before restoring the previous constraint.');
        $this->addSql('ALTER TABLE hktransactions ADD UNIQUE INDEX UNIQ_HK_SERVICE_JOB_LINE (service_job_id, allocation_line_type)');
        $this->addSql('ALTER TABLE hktransactions DROP INDEX UNIQ_HK_SERVICE_JOB_REQUEST, DROP COLUMN allocation_request_key');
    }
}
