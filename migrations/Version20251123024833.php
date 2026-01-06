<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251123024833 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE unit_document_attachment ADD employee_cash_ledger_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE unit_document_attachment ADD CONSTRAINT FK_UDA_EMPLOYEE_CASH FOREIGN KEY (employee_cash_ledger_id) REFERENCES employee_cash_ledger (id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX IDX_UDA_EMPLOYEE_CASH ON unit_document_attachment (employee_cash_ledger_id)');

    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE unit_document_attachment DROP FOREIGN KEY FK_UDA_EMPLOYEE_CASH');
        $this->addSql('DROP INDEX IDX_UDA_EMPLOYEE_CASH ON unit_document_attachment');
        $this->addSql('ALTER TABLE unit_document_attachment DROP employee_cash_ledger_id');

    }
}
