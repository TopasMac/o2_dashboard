<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250808032442 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions ADD allocation_target VARCHAR(20) DEFAULT 'Unit' NOT NULL, CHANGE paid paid NUMERIC(10, 2) DEFAULT '0', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0'
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions DROP allocation_target, CHANGE paid paid NUMERIC(10, 2) DEFAULT '0.00', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0.00'
        SQL);
    }
}
