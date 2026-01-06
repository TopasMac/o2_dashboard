<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251108042251 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_payout CHANGE payout_date payout_date DATE DEFAULT NULL COMMENT '(DC2Type:date_immutable)', CHANGE arriving_by arriving_by DATE DEFAULT NULL COMMENT '(DC2Type:date_immutable)', CHANGE imported_at imported_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)'
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE airbnb_payout CHANGE payout_date payout_date DATE DEFAULT NULL, CHANGE arriving_by arriving_by DATE DEFAULT NULL, CHANGE imported_at imported_at DATETIME NOT NULL
        SQL);
    }
}
