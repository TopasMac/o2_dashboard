<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251203073743 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Drop legacy indexes safely if they still exist
        $this->addSql('DROP INDEX idx_user_email ON notification_dismissal;');

        // Drop only the legacy user_email column
        $this->addSql('ALTER TABLE notification_dismissal DROP COLUMN user_email;');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE notification_dismissal ADD user_email VARCHAR(255) DEFAULT NULL;');
        $this->addSql('CREATE INDEX idx_user_email ON notification_dismissal (user_email);');
    }
}
