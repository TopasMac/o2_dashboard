<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250628012652 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit ADD CONSTRAINT FK_DCBB0C5319EB6921 FOREIGN KEY (client_id) REFERENCES client (id) ON DELETE SET NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_DCBB0C5319EB6921 ON unit (client_id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit DROP FOREIGN KEY FK_DCBB0C5319EB6921
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_DCBB0C5319EB6921 ON unit
        SQL);
    }
}
