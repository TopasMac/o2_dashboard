<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250624012530 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE unit (id INT AUTO_INCREMENT NOT NULL, unit_id VARCHAR(255) NOT NULL, status VARCHAR(255) DEFAULT NULL, client_id INT DEFAULT NULL, date_started DATE DEFAULT NULL, type VARCHAR(255) DEFAULT NULL, city VARCHAR(255) DEFAULT NULL, condo_id INT DEFAULT NULL, unit_number VARCHAR(255) DEFAULT NULL, unit_floor VARCHAR(255) DEFAULT NULL, access_type VARCHAR(255) DEFAULT NULL, access_code VARCHAR(255) DEFAULT NULL, backup_lockbox VARCHAR(255) DEFAULT NULL, building_code VARCHAR(255) DEFAULT NULL, wifi_name VARCHAR(255) DEFAULT NULL, wifi_password VARCHAR(255) DEFAULT NULL, parking VARCHAR(255) DEFAULT NULL, google_maps VARCHAR(255) DEFAULT NULL, notes LONGTEXT DEFAULT NULL, airbnb_name VARCHAR(255) DEFAULT NULL, cleaning_fee DOUBLE PRECISION DEFAULT NULL, host_type VARCHAR(255) DEFAULT NULL, airbnb_email VARCHAR(255) DEFAULT NULL, airbnb_pass VARCHAR(255) DEFAULT NULL, payment_type VARCHAR(255) DEFAULT NULL, cfe TINYINT(1) DEFAULT NULL, cfe_reference VARCHAR(255) DEFAULT NULL, cfe_name VARCHAR(255) DEFAULT NULL, cfe_period VARCHAR(255) DEFAULT NULL, internet TINYINT(1) DEFAULT NULL, internet_isp VARCHAR(255) DEFAULT NULL, internet_reference VARCHAR(255) DEFAULT NULL, internet_cost DOUBLE PRECISION DEFAULT NULL, internet_deadline VARCHAR(255) DEFAULT NULL, water TINYINT(1) DEFAULT NULL, water_reference VARCHAR(255) DEFAULT NULL, water_deadline VARCHAR(255) DEFAULT NULL, hoa TINYINT(1) DEFAULT NULL, hoa_amount DOUBLE PRECISION DEFAULT NULL, hoa_bank VARCHAR(255) DEFAULT NULL, hoa_account_name VARCHAR(255) DEFAULT NULL, hoa_account_nr VARCHAR(255) DEFAULT NULL, hoa_email VARCHAR(255) DEFAULT NULL, UNIQUE INDEX UNIQ_DCBB0C53F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE unit
        SQL);
    }
}
