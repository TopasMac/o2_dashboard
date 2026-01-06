<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250624213242 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE condo (id INT AUTO_INCREMENT NOT NULL, condo_id VARCHAR(50) NOT NULL, city VARCHAR(100) DEFAULT NULL, door_code VARCHAR(100) DEFAULT NULL, notes LONGTEXT DEFAULT NULL, UNIQUE INDEX UNIQ_E5202995E2B100ED (condo_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE condo_contact (id INT AUTO_INCREMENT NOT NULL, condo_id INT NOT NULL, name VARCHAR(50) DEFAULT NULL, role VARCHAR(50) NOT NULL, phone VARCHAR(100) NOT NULL, email VARCHAR(100) DEFAULT NULL, notes LONGTEXT DEFAULT NULL, INDEX IDX_E2F78C06E2B100ED (condo_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact ADD CONSTRAINT FK_E2F78C06E2B100ED FOREIGN KEY (condo_id) REFERENCES condo (id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact DROP FOREIGN KEY FK_E2F78C06E2B100ED
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE condo
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE condo_contact
        SQL);
    }
}
