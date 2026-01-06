<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250802055142 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE parsed_airbnb_email
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_6F10148224DB0683 ON booking_config
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_config CHANGE config_id config_code VARCHAR(50) NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_6F101482E7B56C68 ON booking_config (config_code)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE category_id category_id INT DEFAULT NULL, CHANGE paid paid NUMERIC(10, 2) DEFAULT '0', CHANGE charged charged NUMERIC(10, 2) DEFAULT '0'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions ADD CONSTRAINT FK_1678510612469DE2 FOREIGN KEY (category_id) REFERENCES transaction_category (id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_1678510612469DE2 ON hktransactions (category_id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE parsed_airbnb_email (id INT AUTO_INCREMENT NOT NULL, booking_date DATE NOT NULL, confirmation_code VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, guest_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, listing_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, unit_id VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, guests INT DEFAULT NULL, check_in DATE NOT NULL, check_out DATE NOT NULL, payout DOUBLE PRECISION DEFAULT NULL, cleaning_fee DOUBLE PRECISION DEFAULT NULL, room_fee DOUBLE PRECISION DEFAULT NULL, source VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB COMMENT = '' 
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_6F101482E7B56C68 ON booking_config
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_config CHANGE config_code config_id VARCHAR(50) NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_6F10148224DB0683 ON booking_config (config_id)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions DROP FOREIGN KEY FK_1678510612469DE2
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_1678510612469DE2 ON hktransactions
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE hktransactions CHANGE category_id category_id INT NOT NULL, CHANGE paid paid NUMERIC(10, 2) NOT NULL, CHANGE charged charged NUMERIC(10, 2) NOT NULL
        SQL);
    }
}
