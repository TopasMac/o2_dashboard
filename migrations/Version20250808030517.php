<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250808030517 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions DROP FOREIGN KEY FK_16785106F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE unit_id unit_id INT DEFAULT NULL, CHANGE paid paid NUMERIC(10, 2) DEFAULT '0', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions ADD CONSTRAINT FK_16785106F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE SET NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions DROP FOREIGN KEY FK_16785106F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE unit_id unit_id INT NOT NULL, CHANGE paid paid NUMERIC(10, 2) DEFAULT '0.00', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0.00'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions ADD CONSTRAINT FK_16785106F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON UPDATE NO ACTION ON DELETE NO ACTION
        SQL);
    }
}
