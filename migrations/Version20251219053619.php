<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251219053619 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE unit_purchase_list (
            id INT AUTO_INCREMENT NOT NULL,
            unit_id INT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT \'draft\',
            created_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            sent_at DATETIME DEFAULT NULL COMMENT \'(DC2Type:datetime_immutable)\',
            notes LONGTEXT DEFAULT NULL,
            total_cost NUMERIC(12, 2) DEFAULT NULL,
            total_sell_price NUMERIC(12, 2) DEFAULT NULL,
            INDEX idx_unit_purchase_list_unit (unit_id),
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');

        $this->addSql('ALTER TABLE unit_purchase_list ADD CONSTRAINT FK_UNIT_PURCHASE_LIST_UNIT FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit_purchase_list DROP FOREIGN KEY FK_UNIT_PURCHASE_LIST_UNIT');
        $this->addSql('DROP TABLE unit_purchase_list');
    }
}
