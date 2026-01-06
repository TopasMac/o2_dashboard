<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250625013028 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE parsed_airbnb_email (id INT AUTO_INCREMENT NOT NULL, booking_date DATE NOT NULL, confirmation_code VARCHAR(255) NOT NULL, guest_name VARCHAR(255) NOT NULL, listing_name VARCHAR(255) NOT NULL, unit_id VARCHAR(255) DEFAULT NULL, guests INT DEFAULT NULL, check_in DATE NOT NULL, check_out DATE NOT NULL, payout DOUBLE PRECISION DEFAULT NULL, cleaning_fee DOUBLE PRECISION DEFAULT NULL, room_fee DOUBLE PRECISION DEFAULT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE parsed_airbnb_email
        SQL);
    }
}
