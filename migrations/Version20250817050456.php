<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250817050456 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql("DROP VIEW IF EXISTS v_monthly_results");
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS v_monthly_results (monthly_id VARCHAR(255) NOT NULL, `year_month` VARCHAR(7) NOT NULL, unit_id INT NOT NULL, unit_name VARCHAR(255) NOT NULL, city VARCHAR(100) DEFAULT NULL, source VARCHAR(100) DEFAULT NULL, payment_type VARCHAR(50) NOT NULL, nights INT NOT NULL, room_fee NUMERIC(12, 2) NOT NULL, payout NUMERIC(12, 2) NOT NULL, tax_amount NUMERIC(12, 2) NOT NULL, net_payout NUMERIC(12, 2) NOT NULL, cleaning_fee NUMERIC(12, 2) NOT NULL, commission NUMERIC(12, 2) NOT NULL, o2_total NUMERIC(12, 2) NOT NULL, client_income NUMERIC(12, 2) NOT NULL, PRIMARY KEY(monthly_id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact ADD department VARCHAR(64) NOT NULL, ADD position INT DEFAULT NULL, DROP role, CHANGE name name VARCHAR(128) DEFAULT NULL, CHANGE phone phone VARCHAR(32) DEFAULT NULL, CHANGE email email VARCHAR(180) DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE paid paid NUMERIC(10, 2) DEFAULT '0', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0'
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE IF EXISTS v_monthly_results
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact ADD role VARCHAR(50) NOT NULL, DROP department, DROP position, CHANGE name name VARCHAR(50) DEFAULT NULL, CHANGE phone phone VARCHAR(100) NOT NULL, CHANGE email email VARCHAR(100) DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE paid paid NUMERIC(10, 2) DEFAULT '0.00', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0.00'
        SQL);
    }
}
