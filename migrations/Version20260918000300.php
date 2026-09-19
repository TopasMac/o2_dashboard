<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260918000300 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Store internet payment references as text to preserve formatting';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit MODIFY internet_pago VARCHAR(64) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit MODIFY internet_pago BIGINT DEFAULT NULL');
    }
}
