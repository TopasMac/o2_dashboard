<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251206063851 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE santander_entry (
            id INT AUTO_INCREMENT NOT NULL,
            account_last4 VARCHAR(16) NOT NULL,
            fecha_on DATE NOT NULL,
            hora TIME DEFAULT NULL,
            concept VARCHAR(255) NOT NULL,
            retiro NUMERIC(12, 2) DEFAULT NULL,
            deposito NUMERIC(12, 2) DEFAULT NULL,
            moneda VARCHAR(8) DEFAULT NULL,
            checked TINYINT(1) NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME DEFAULT NULL,
            source_file_name VARCHAR(255) DEFAULT NULL,
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE santander_entry');
    }
}
