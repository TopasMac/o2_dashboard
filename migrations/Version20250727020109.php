<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250727020109 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE meter_reading (id INT AUTO_INCREMENT NOT NULL, booking_id INT NOT NULL, type VARCHAR(20) NOT NULL, reading_date DATETIME NOT NULL, value DOUBLE PRECISION NOT NULL, allowed_per_day DOUBLE PRECISION NOT NULL, price_per_extra DOUBLE PRECISION NOT NULL, INDEX IDX_814A20F93301C60 (booking_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE meter_reading ADD CONSTRAINT FK_814A20F93301C60 FOREIGN KEY (booking_id) REFERENCES all_bookings (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP FOREIGN KEY FK_AD5760E42FC0CB0F
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD CONSTRAINT FK_AD5760E42FC0CB0F FOREIGN KEY (transaction_id) REFERENCES unit_transactions (id) ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP FOREIGN KEY FK_383EF8DB58581211
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_383EF8DB58581211 ON unit_transactions
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP unit_document_id
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE meter_reading DROP FOREIGN KEY FK_814A20F93301C60
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE meter_reading
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document DROP FOREIGN KEY FK_AD5760E42FC0CB0F
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_document ADD CONSTRAINT FK_AD5760E42FC0CB0F FOREIGN KEY (transaction_id) REFERENCES unit_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD unit_document_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD CONSTRAINT FK_383EF8DB58581211 FOREIGN KEY (unit_document_id) REFERENCES unit_document (id) ON UPDATE NO ACTION ON DELETE CASCADE
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_383EF8DB58581211 ON unit_transactions (unit_document_id)
        SQL);
    }
}
