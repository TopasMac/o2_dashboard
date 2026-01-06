<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250718230106 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_transactions (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, date DATE NOT NULL, description VARCHAR(255) DEFAULT NULL, amount NUMERIC(10, 2) NOT NULL, comments VARCHAR(255) DEFAULT NULL, INDEX IDX_383EF8DBF8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD CONSTRAINT FK_383EF8DBF8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP FOREIGN KEY FK_383EF8DBF8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE unit_transactions
        SQL);
    }
}
