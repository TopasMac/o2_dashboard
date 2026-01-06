<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250808220824 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE paid paid NUMERIC(10, 2) DEFAULT '0', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD hk_transaction_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD CONSTRAINT FK_AD5760E41BEADA70 FOREIGN KEY (hk_transaction_id) REFERENCES hktransactions (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_AD5760E41BEADA70 ON unit_document (hk_transaction_id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE paid paid NUMERIC(10, 2) DEFAULT '0.00', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0.00'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP FOREIGN KEY FK_AD5760E41BEADA70
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_AD5760E41BEADA70 ON unit_document
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP hk_transaction_id
        SQL);
    }
}
