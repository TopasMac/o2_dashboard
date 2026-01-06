<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250624014223 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE client (id INT AUTO_INCREMENT NOT NULL, client_id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, nationality VARCHAR(255) DEFAULT NULL, dob DATE DEFAULT NULL, phone VARCHAR(255) DEFAULT NULL, email VARCHAR(255) DEFAULT NULL, bank_name VARCHAR(255) DEFAULT NULL, bank_owner VARCHAR(255) DEFAULT NULL, bank_account VARCHAR(255) DEFAULT NULL, contract VARCHAR(255) DEFAULT NULL, contract_date DATE DEFAULT NULL, comments LONGTEXT DEFAULT NULL, UNIQUE INDEX UNIQ_C744045519EB6921 (client_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE client
        SQL);
    }
}
