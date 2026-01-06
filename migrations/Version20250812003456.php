<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250812003456 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE o2transactions (id INT AUTO_INCREMENT NOT NULL, category_id INT NOT NULL, cost_centre VARCHAR(32) NOT NULL, city VARCHAR(30) NOT NULL, transaction_code VARCHAR(32) NOT NULL, date DATE NOT NULL, type VARCHAR(10) NOT NULL, description VARCHAR(255) DEFAULT NULL, amount NUMERIC(12, 2) NOT NULL, comments LONGTEXT DEFAULT NULL, created_by VARCHAR(120) DEFAULT NULL, updated_by VARCHAR(120) DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL COMMENT '(DC2Type:datetime_immutable)', INDEX IDX_FDAAC65F12469DE2 (category_id), UNIQUE INDEX uniq_o2tx_code (transaction_code), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE o2transactions ADD CONSTRAINT FK_FDAAC65F12469DE2 FOREIGN KEY (category_id) REFERENCES transaction_category (id) ON DELETE RESTRICT
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE o2transactions DROP FOREIGN KEY FK_FDAAC65F12469DE2
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE o2transactions
        SQL);
    }
}
