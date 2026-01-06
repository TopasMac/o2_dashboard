<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250708234621 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit DROP building_code, DROP google_maps
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit ADD CONSTRAINT FK_DCBB0C53E2B100ED FOREIGN KEY (condo_id) REFERENCES condo (id) ON DELETE SET NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE INDEX IDX_DCBB0C53E2B100ED ON unit (condo_id)
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit DROP FOREIGN KEY FK_DCBB0C53E2B100ED
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX IDX_DCBB0C53E2B100ED ON unit
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit ADD building_code VARCHAR(255) DEFAULT NULL, ADD google_maps VARCHAR(255) DEFAULT NULL
        SQL);
    }
}
