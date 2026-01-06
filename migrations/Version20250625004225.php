<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250625004225 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE private_reservation (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, booking_date DATETIME NOT NULL, booking_code VARCHAR(20) NOT NULL, guest_name VARCHAR(100) NOT NULL, city VARCHAR(50) NOT NULL, check_in DATE NOT NULL, check_out DATE NOT NULL, nr_of_guests INT NOT NULL, source VARCHAR(50) NOT NULL, payout DOUBLE PRECISION NOT NULL, cleaning_fee DOUBLE PRECISION DEFAULT NULL, UNIQUE INDEX UNIQ_8CA468606F8412D6 (booking_code), INDEX IDX_8CA46860F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE private_reservation ADD CONSTRAINT FK_8CA46860F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE private_reservation DROP FOREIGN KEY FK_8CA46860F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE private_reservation
        SQL);
    }
}
