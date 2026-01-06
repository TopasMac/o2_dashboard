<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250801055419 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE hktransactions (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, transaction_code VARCHAR(20) NOT NULL, date DATE NOT NULL, category_id INT NOT NULL, cost_centre VARCHAR(50) NOT NULL, description LONGTEXT DEFAULT NULL, paid NUMERIC(10, 2) NOT NULL, charged NUMERIC(10, 2) NOT NULL, UNIQUE INDEX UNIQ_1678510695560E39 (transaction_code), INDEX IDX_16785106F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions ADD CONSTRAINT FK_16785106F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions DROP FOREIGN KEY FK_16785106F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE hktransactions
        SQL);
    }
}
