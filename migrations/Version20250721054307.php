<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250721054307 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD transaction_id INT DEFAULT NULL, ADD document_url VARCHAR(255) DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD CONSTRAINT FK_AD5760E42FC0CB0F FOREIGN KEY (transaction_id) REFERENCES unit_transactions (id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_AD5760E42FC0CB0F ON unit_document (transaction_id)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD unit_document_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD CONSTRAINT FK_383EF8DB58581211 FOREIGN KEY (unit_document_id) REFERENCES unit_document (id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_383EF8DB58581211 ON unit_transactions (unit_document_id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP FOREIGN KEY FK_AD5760E42FC0CB0F
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_AD5760E42FC0CB0F ON unit_document
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP transaction_id, DROP document_url
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP FOREIGN KEY FK_383EF8DB58581211
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_383EF8DB58581211 ON unit_transactions
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP unit_document_id
        SQL);
    }
}
