<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260226023307 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create service_providers table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE service_providers (
            id INT AUTO_INCREMENT NOT NULL,
            provider_id VARCHAR(20) NOT NULL,
            name VARCHAR(120) NOT NULL,
            occupation VARCHAR(60) NOT NULL,
            area VARCHAR(10) NOT NULL,
            phone VARCHAR(30) DEFAULT NULL,
            whatsapp VARCHAR(30) DEFAULT NULL,
            email VARCHAR(120) DEFAULT NULL,
            bank_name VARCHAR(80) DEFAULT NULL,
            account_holder VARCHAR(120) DEFAULT NULL,
            clabe VARCHAR(25) DEFAULT NULL,
            account_number VARCHAR(30) DEFAULT NULL,
            notes LONGTEXT DEFAULT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            last_job_at DATETIME DEFAULT NULL COMMENT "(DC2Type:datetime_immutable)",
            created_at DATETIME NOT NULL COMMENT "(DC2Type:datetime_immutable)",
            updated_at DATETIME NOT NULL COMMENT "(DC2Type:datetime_immutable)",
            UNIQUE INDEX UNIQ_SERVICE_PROVIDERS_PROVIDER_ID (provider_id),
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE service_providers');
    }
}
