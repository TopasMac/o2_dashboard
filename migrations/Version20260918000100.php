<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260918000100 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Allow large numeric internet payment references';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit MODIFY internet_pago BIGINT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit MODIFY internet_pago INT DEFAULT NULL');
    }
}