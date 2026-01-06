<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251220034344 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("
            ALTER TABLE unit_purchase_list_line
                ADD existing_qty INT NOT NULL DEFAULT 0,
                ADD notes LONGTEXT DEFAULT NULL
        ");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("
            ALTER TABLE unit_purchase_list_line
                DROP existing_qty,
                DROP notes
        ");
    }
}
