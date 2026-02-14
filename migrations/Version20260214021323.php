<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260214021323 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE employee_financial_ledger ADD applied_salary_ledger_id INT DEFAULT NULL");
        $this->addSql("CREATE INDEX idx_efl_applied_salary ON employee_financial_ledger (applied_salary_ledger_id)");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("DROP INDEX idx_efl_applied_salary ON employee_financial_ledger");
        $this->addSql("ALTER TABLE employee_financial_ledger DROP applied_salary_ledger_id");
    }
}
