<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261112000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create service jobs with unit, category and optional provider references';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("CREATE TABLE service_job (
            id INT AUTO_INCREMENT NOT NULL,
            unit_id INT NOT NULL,
            category_id INT NOT NULL,
            provider_id INT DEFAULT NULL,
            scheduled_date DATE NOT NULL COMMENT '(DC2Type:date_immutable)',
            description VARCHAR(255) NOT NULL,
            status VARCHAR(16) DEFAULT 'pending' NOT NULL,
            notes LONGTEXT DEFAULT NULL,
            INDEX IDX_SERVICE_JOB_UNIT (unit_id),
            INDEX IDX_SERVICE_JOB_CATEGORY (category_id),
            INDEX IDX_SERVICE_JOB_PROVIDER (provider_id),
            CONSTRAINT FK_SERVICE_JOB_UNIT FOREIGN KEY (unit_id) REFERENCES unit (id),
            CONSTRAINT FK_SERVICE_JOB_CATEGORY FOREIGN KEY (category_id) REFERENCES transaction_category (id),
            CONSTRAINT FK_SERVICE_JOB_PROVIDER FOREIGN KEY (provider_id) REFERENCES service_providers (id),
            PRIMARY KEY (id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE service_job');
    }
}
