<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250906085058 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add nullable category column to airbnb_email_notifications and relax NOT NULL constraints on subject, recipient_email, received_at.';
    }

    public function up(Schema $schema): void
    {
        // Make category nullable and relax constraints on existing columns
        $this->addSql(<<<'SQL'
ALTER TABLE airbnb_email_notifications
    ADD category VARCHAR(255) DEFAULT NULL,
    MODIFY subject VARCHAR(255) DEFAULT NULL,
    MODIFY recipient_email VARCHAR(255) DEFAULT NULL,
    MODIFY received_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)'
SQL);
    }

    public function down(Schema $schema): void
    {
        // Revert: drop category and restore NOT NULL constraints
        $this->addSql(<<<'SQL'
ALTER TABLE airbnb_email_notifications
    DROP COLUMN category,
    MODIFY subject VARCHAR(255) NOT NULL,
    MODIFY recipient_email VARCHAR(255) NOT NULL,
    MODIFY received_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)'
SQL);
    }
}
