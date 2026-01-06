<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250706023305 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import DROP FOREIGN KEY FK_C2DA3231D2BDB5
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE parsed_airbnb_email
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_C2DA3231D2BDB5 ON airbnb_email_import
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import DROP parsed_booking_id
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE parsed_airbnb_email (id INT AUTO_INCREMENT NOT NULL, booking_date DATE NOT NULL, confirmation_code VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, guest_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, listing_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, guests INT DEFAULT NULL, check_in DATE NOT NULL, check_out DATE NOT NULL, payout DOUBLE PRECISION DEFAULT NULL, cleaning_fee DOUBLE PRECISION DEFAULT NULL, room_fee DOUBLE PRECISION DEFAULT NULL, source VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB COMMENT = '' 
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import ADD parsed_booking_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import ADD CONSTRAINT FK_C2DA3231D2BDB5 FOREIGN KEY (parsed_booking_id) REFERENCES parsed_airbnb_email (id) ON UPDATE NO ACTION ON DELETE NO ACTION
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_C2DA3231D2BDB5 ON airbnb_email_import (parsed_booking_id)
        SQL);
    }
}
