<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251220054903 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // unit_purchase_list: approval/review/charging metadata + list reference
        $this->addSql('ALTER TABLE unit_purchase_list ADD approved_at DATETIME DEFAULT NULL');
        $this->addSql('ALTER TABLE unit_purchase_list ADD charged_year_month VARCHAR(7) DEFAULT NULL');
        $this->addSql('ALTER TABLE unit_purchase_list ADD last_reviewed_at DATETIME DEFAULT NULL');
        $this->addSql('ALTER TABLE unit_purchase_list ADD list_reference VARCHAR(32) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit_purchase_list DROP approved_at');
        $this->addSql('ALTER TABLE unit_purchase_list DROP charged_year_month');
        $this->addSql('ALTER TABLE unit_purchase_list DROP last_reviewed_at');
        $this->addSql('ALTER TABLE unit_purchase_list DROP list_reference');
    }
}
