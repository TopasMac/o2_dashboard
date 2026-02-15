<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260215015510 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE INDEX idx_all_bookings_unit_checkout ON all_bookings (unit_id, check_out)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX idx_all_bookings_unit_checkout ON all_bookings');
    }
}
