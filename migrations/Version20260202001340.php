<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260202001340 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("
            ALTER TABLE hk_cleanings
            ADD source VARCHAR(32) DEFAULT NULL,
            ADD laundry_cost DECIMAL(10,2) DEFAULT NULL
        ");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("
            ALTER TABLE hk_cleanings
            DROP source,
            DROP laundry_cost
        ");
    }
}
