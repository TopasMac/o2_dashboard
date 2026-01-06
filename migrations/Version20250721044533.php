<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250721044533 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP unit_name
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD CONSTRAINT FK_AD5760E4F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_AD5760E4F8BD700D ON unit_document (unit_id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP FOREIGN KEY FK_AD5760E4F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_AD5760E4F8BD700D ON unit_document
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD unit_name VARCHAR(255) NOT NULL
        SQL);
    }
}
