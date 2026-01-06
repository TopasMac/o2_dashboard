<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250703015806 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings ADD status VARCHAR(50) DEFAULT NULL, ADD commission_percent DOUBLE PRECISION NOT NULL, ADD commission_value DOUBLE PRECISION NOT NULL, DROP o2_commission_percent, DROP o2_commission_value
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE all_bookings ADD o2_commission_percent DOUBLE PRECISION NOT NULL, ADD o2_commission_value DOUBLE PRECISION NOT NULL, DROP status, DROP commission_percent, DROP commission_value
        SQL);
    }
}
