<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250725214833 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings DROP FOREIGN KEY FK_EB7B6BF2F8BD700D
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_EB7B6BF2F8BD700D ON all_bookings
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings ADD CONSTRAINT FK_EB7B6BF2F8BD700D FOREIGN KEY (unit_id) REFERENCES unit (id) ON UPDATE NO ACTION ON DELETE NO ACTION
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_EB7B6BF2F8BD700D ON all_bookings (unit_id)
        SQL);
    }
}
