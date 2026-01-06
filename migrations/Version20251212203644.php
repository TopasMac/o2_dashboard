<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251212203644 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add date_ended to unit table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit ADD date_ended DATE DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit DROP date_ended');
    }
}
