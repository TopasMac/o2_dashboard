<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251121225925 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs

        $this->addSql('ALTER TABLE employee_financial_ledger DROP FOREIGN KEY FK_EFL_TRANSACTION_CATEGORY');
        $this->addSql('ALTER TABLE employee_financial_ledger DROP COLUMN transaction_category_id');
        $this->addSql('ALTER TABLE employee_financial_ledger DROP COLUMN allocation_label');
        $this->addSql('ALTER TABLE employee_financial_ledger DROP COLUMN description');
        $this->addSql('ALTER TABLE employee_financial_ledger DROP COLUMN unit_id');
        $this->addSql('ALTER TABLE employee_financial_ledger DROP COLUMN unit_name');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs

        $this->addSql("ALTER TABLE employee_financial_ledger ADD transaction_category_id INT DEFAULT NULL");
        $this->addSql("ALTER TABLE employee_financial_ledger ADD allocation_label VARCHAR(255) DEFAULT NULL");
        $this->addSql("ALTER TABLE employee_financial_ledger ADD description VARCHAR(180) DEFAULT NULL");
        $this->addSql("ALTER TABLE employee_financial_ledger ADD unit_id INT DEFAULT NULL");
        $this->addSql("ALTER TABLE employee_financial_ledger ADD unit_name VARCHAR(120) DEFAULT NULL");
        $this->addSql("ALTER TABLE employee_financial_ledger ADD CONSTRAINT FK_EFL_TRANSACTION_CATEGORY FOREIGN KEY (transaction_category_id) REFERENCES transaction_category (id) ON DELETE SET NULL");
    }
}
