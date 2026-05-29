<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260529050811 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add nullable provider_id to hk_laundry_rates';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hk_laundry_rates ADD provider_id INT DEFAULT NULL AFTER provider_name');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE hk_laundry_rates DROP provider_id');
    }
}
