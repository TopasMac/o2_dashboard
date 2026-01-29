<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260129053107 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('
            CREATE TABLE hk_cleanings_reconcile (
                id INT AUTO_INCREMENT NOT NULL,
                unit_id INT NOT NULL,
                city VARCHAR(64) NOT NULL,
                report_month VARCHAR(7) NOT NULL,
                service_date DATE NOT NULL,
                cleaning_cost NUMERIC(10, 2) NOT NULL,
                laundry_cost NUMERIC(10, 2) NOT NULL,
                notes LONGTEXT DEFAULT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME DEFAULT NULL,
                INDEX IDX_HK_RECONCILE_UNIT (unit_id),
                INDEX IDX_HK_RECONCILE_MONTH (report_month),
                INDEX IDX_HK_RECONCILE_CITY (city),
                PRIMARY KEY(id)
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        ');

        $this->addSql('
            ALTER TABLE hk_cleanings_reconcile
            ADD CONSTRAINT FK_HK_RECONCILE_UNIT
            FOREIGN KEY (unit_id) REFERENCES unit (id)
            ON DELETE CASCADE
        ');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE hk_cleanings_reconcile');
    }
}
