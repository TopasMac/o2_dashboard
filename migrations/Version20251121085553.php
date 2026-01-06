<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251121085553 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql("ALTER TABLE employee_financial_ledger ADD unit_id INT DEFAULT NULL");
        $this->addSql("ALTER TABLE employee_financial_ledger ADD unit_name VARCHAR(255) DEFAULT NULL");
        $this->addSql("CREATE INDEX IDX_EFL_UNIT_ID ON employee_financial_ledger (unit_id)");
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql("DROP INDEX IDX_EFL_UNIT_ID ON employee_financial_ledger");
        $this->addSql("ALTER TABLE employee_financial_ledger DROP unit_id");
        $this->addSql("ALTER TABLE employee_financial_ledger DROP unit_name");
    }
}
