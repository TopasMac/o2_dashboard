<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251202054932 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Align review_action schema with updated ReviewAction entity:
        //  - Add unit_id (nullable int)
        //  - Drop skip_reason, expired_at, acted_at
        $this->addSql('ALTER TABLE review_action ADD unit_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE review_action DROP skip_reason');
        $this->addSql('ALTER TABLE review_action DROP expired_at');
        $this->addSql('ALTER TABLE review_action DROP acted_at');
    }

    public function down(Schema $schema): void
    {
        // Revert to previous schema:
        //  - Remove unit_id
        //  - Recreate skip_reason, expired_at, acted_at
        $this->addSql("ALTER TABLE review_action ADD skip_reason VARCHAR(16) DEFAULT NULL");
        $this->addSql("ALTER TABLE review_action ADD expired_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)'");
        $this->addSql("ALTER TABLE review_action ADD acted_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)'");
        $this->addSql('ALTER TABLE review_action DROP unit_id');
    }
}
