<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250801025112 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit ADD cfe_payment_day INT DEFAULT NULL, ADD cfe_starting_month INT DEFAULT NULL, CHANGE internet_deadline internet_deadline INT DEFAULT NULL, CHANGE water_deadline water_deadline INT DEFAULT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit DROP cfe_payment_day, DROP cfe_starting_month, CHANGE internet_deadline internet_deadline VARCHAR(255) DEFAULT NULL, CHANGE water_deadline water_deadline VARCHAR(255) DEFAULT NULL
        SQL);
    }
}
