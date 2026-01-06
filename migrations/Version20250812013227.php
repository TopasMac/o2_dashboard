<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250812013227 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE paid paid NUMERIC(10, 2) DEFAULT '0', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0', CHANGE allocation_target allocation_target VARCHAR(32) DEFAULT 'Unit' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE o2transactions ADD CONSTRAINT FK_FDAAC65F12469DE2 FOREIGN KEY (category_id) REFERENCES transaction_category (id) ON DELETE RESTRICT
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE transaction_category ADD allow_unit TINYINT(1) DEFAULT 1 NOT NULL, ADD allow_hk TINYINT(1) DEFAULT 0 NOT NULL, ADD allow_o2 TINYINT(1) DEFAULT 0 NOT NULL, DROP cost_center
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE allocation_target allocation_target VARCHAR(20) DEFAULT 'Unit' NOT NULL, CHANGE paid paid NUMERIC(10, 2) DEFAULT '0.00', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0.00'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE o2transactions DROP FOREIGN KEY FK_FDAAC65F12469DE2
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE transaction_category ADD cost_center VARCHAR(20) NOT NULL, DROP allow_unit, DROP allow_hk, DROP allow_o2
        SQL);
    }
}
