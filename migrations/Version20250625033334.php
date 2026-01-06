<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250625033334 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import ADD parsed_booking_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import ADD CONSTRAINT FK_C2DA3231D2BDB5 FOREIGN KEY (parsed_booking_id) REFERENCES parsed_airbnb_email (id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_C2DA3231D2BDB5 ON airbnb_email_import (parsed_booking_id)
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX config_id ON booking_config
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import DROP FOREIGN KEY FK_C2DA3231D2BDB5
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_C2DA3231D2BDB5 ON airbnb_email_import
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_email_import DROP parsed_booking_id
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX config_id ON booking_config (config_id)
        SQL);
    }
}
