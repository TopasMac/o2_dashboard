<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250625005842 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE all_bookings (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, confirmation_code VARCHAR(20) NOT NULL, booking_date DATE NOT NULL, source VARCHAR(20) NOT NULL, guest_name VARCHAR(100) NOT NULL, city VARCHAR(50) NOT NULL, guests INT NOT NULL, check_in DATE NOT NULL, check_out DATE NOT NULL, days INT NOT NULL, payout DOUBLE PRECISION NOT NULL, tax_percent DOUBLE PRECISION NOT NULL, tax_amount DOUBLE PRECISION NOT NULL, net_payout DOUBLE PRECISION NOT NULL, cleaning_fee DOUBLE PRECISION DEFAULT NULL, after_cleaning DOUBLE PRECISION DEFAULT NULL, o2_commission_percent DOUBLE PRECISION NOT NULL, o2_commission_value DOUBLE PRECISION NOT NULL, client_income DOUBLE PRECISION NOT NULL, o2_total DOUBLE PRECISION NOT NULL, notes LONGTEXT DEFAULT NULL, check_in_notes LONGTEXT DEFAULT NULL, check_out_notes LONGTEXT DEFAULT NULL, INDEX IDX_EB7B6BF2F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings ADD CONSTRAINT FK_EB7B6BF2F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings DROP FOREIGN KEY FK_EB7B6BF2F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE all_bookings
        SQL);
    }
}
