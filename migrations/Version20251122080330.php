<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251122080330 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        // 1) Add column as nullable so existing rows don't break
        $this->addSql("ALTER TABLE employee_cash_ledger ADD date DATE DEFAULT NULL");

        // 2) Backfill from created_at for all existing rows
        $this->addSql("UPDATE employee_cash_ledger SET date = DATE(created_at) WHERE date IS NULL");

        // 3) Now enforce NOT NULL
        $this->addSql("ALTER TABLE employee_cash_ledger MODIFY date DATE NOT NULL");
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql("ALTER TABLE employee_cash_ledger DROP date");
    }
}
