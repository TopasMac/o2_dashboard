<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250718213808 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE unit_document (id INT AUTO_INCREMENT NOT NULL, unit_id INT NOT NULL, unit_name VARCHAR(255) NOT NULL, category VARCHAR(100) NOT NULL, filename VARCHAR(255) NOT NULL, s3_url VARCHAR(500) NOT NULL, label VARCHAR(255) DEFAULT NULL, uploaded_at DATETIME NOT NULL, uploaded_by VARCHAR(100) DEFAULT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo RENAME INDEX uniq_e5202995e2b100ed TO UNIQ_E5202995DC9E0780
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact DROP FOREIGN KEY FK_E2F78C06E2B100ED
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_E2F78C06E2B100ED ON condo_contact
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact CHANGE condo_name condo_name_id INT NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact ADD CONSTRAINT FK_E2F78C06DF82F6E8 FOREIGN KEY (condo_name_id) REFERENCES condo (id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_E2F78C06DF82F6E8 ON condo_contact (condo_name_id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE unit_document
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo RENAME INDEX uniq_e5202995dc9e0780 TO UNIQ_E5202995E2B100ED
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact DROP FOREIGN KEY FK_E2F78C06DF82F6E8
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_E2F78C06DF82F6E8 ON condo_contact
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact CHANGE condo_name_id condo_name INT NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE condo_contact ADD CONSTRAINT FK_E2F78C06E2B100ED FOREIGN KEY (condo_name) REFERENCES condo (id) ON UPDATE NO ACTION ON DELETE NO ACTION
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_E2F78C06E2B100ED ON condo_contact (condo_name)
        SQL);
    }
}
