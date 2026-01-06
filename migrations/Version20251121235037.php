<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251121235037 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("
            CREATE TABLE employee_cash_ledger (
                id INT AUTO_INCREMENT NOT NULL,
                employee_id INT NOT NULL,
                allocated_by_id INT DEFAULT NULL,
                code VARCHAR(30) NOT NULL,
                employee_short_name VARCHAR(60) DEFAULT NULL,
                type VARCHAR(20) NOT NULL,
                amount NUMERIC(12, 2) NOT NULL,
                division VARCHAR(40) DEFAULT NULL,
                city VARCHAR(40) DEFAULT NULL,
                cost_centre VARCHAR(40) DEFAULT NULL,
                notes LONGTEXT DEFAULT NULL,
                status VARCHAR(20) NOT NULL,
                created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)',
                allocation_type VARCHAR(20) DEFAULT NULL,
                allocation_id INT DEFAULT NULL,
                allocation_code VARCHAR(50) DEFAULT NULL,
                allocated_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)',
                INDEX IDX_ECL_EMPLOYEE (employee_id),
                INDEX IDX_ECL_ALLOCATED_BY (allocated_by_id),
                UNIQUE INDEX UNIQ_ECL_CODE (code),
                PRIMARY KEY(id),
                CONSTRAINT FK_ECL_EMPLOYEE FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE RESTRICT,
                CONSTRAINT FK_ECL_ALLOCATED_BY FOREIGN KEY (allocated_by_id) REFERENCES employee (id) ON DELETE SET NULL
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB;
        ");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("DROP TABLE employee_cash_ledger;");
    }
}
