<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260918000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add nullable numeric internet payment reference to units';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit ADD internet_pago INT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit DROP internet_pago');
    }
}