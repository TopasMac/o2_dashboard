<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250717224357 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE condo DROP client_id
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit RENAME INDEX uniq_dcbb0c53f8bd700d TO UNIQ_DCBB0C53D2E59F5C
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE condo ADD client_id INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit RENAME INDEX uniq_dcbb0c53d2e59f5c TO UNIQ_DCBB0C53F8BD700D
        SQL);
    }
}
