<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251121030001 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add status, transaction_category_id and allocation_label to employee_financial_ledger';
    }

    public function up(Schema $schema): void
    {
        // Add status, transaction_category_id (FK) and allocation_label to employee_financial_ledger
        $this->addSql(<<<'SQL'
            ALTER TABLE employee_financial_ledger
            ADD status VARCHAR(20) DEFAULT NULL,
            ADD transaction_category_id INT DEFAULT NULL,
            ADD allocation_label VARCHAR(255) DEFAULT NULL
        SQL);

        $this->addSql(<<<'SQL'
            ALTER TABLE employee_financial_ledger
            ADD CONSTRAINT FK_EFL_TRANSACTION_CATEGORY
                FOREIGN KEY (transaction_category_id)
                REFERENCES transaction_category (id)
                ON DELETE SET NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // Revert status, transaction_category_id and allocation_label changes on employee_financial_ledger
        $this->addSql(<<<'SQL'
            ALTER TABLE employee_financial_ledger
            DROP FOREIGN KEY FK_EFL_TRANSACTION_CATEGORY
        SQL);

        $this->addSql(<<<'SQL'
            ALTER TABLE employee_financial_ledger
            DROP COLUMN status,
            DROP COLUMN transaction_category_id,
            DROP COLUMN allocation_label
        SQL);
    }
}
