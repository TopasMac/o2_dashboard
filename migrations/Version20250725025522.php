<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250725025522 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings ADD unit_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings ADD CONSTRAINT FK_EB7B6BF2F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id)
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_EB7B6BF2F8BD700D ON all_bookings (unit_id)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE client CHANGE client_code client_code VARCHAR(255) NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE client RENAME INDEX uniq_c744045519eb6921 TO UNIQ_C7440455A689F3FA
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP FOREIGN KEY FK_383EF8DB58581211
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD CONSTRAINT FK_383EF8DB58581211 FOREIGN KEY (unit_document_id) REFERENCES unit_document (id) ON DELETE CASCADE
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings DROP FOREIGN KEY FK_EB7B6BF2F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_EB7B6BF2F8BD700D ON all_bookings
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings DROP unit_id
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE client CHANGE client_code client_code VARCHAR(255) DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE client RENAME INDEX uniq_c7440455a689f3fa TO UNIQ_C744045519EB6921
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP FOREIGN KEY FK_383EF8DB58581211
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD CONSTRAINT FK_383EF8DB58581211 FOREIGN KEY (unit_document_id) REFERENCES unit_document (id) ON UPDATE NO ACTION ON DELETE NO ACTION
        SQL);
    }
}
