<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260918000200 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add optional Airbnb listing link to units';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit ADD airbnb_link VARCHAR(512) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit DROP airbnb_link');
    }
}