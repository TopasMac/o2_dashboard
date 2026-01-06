<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251219054521 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE unit_purchase_list_line (
            id INT AUTO_INCREMENT NOT NULL,
            purchase_list_id INT NOT NULL,
            catalog_item_id INT DEFAULT NULL,
            description LONGTEXT NOT NULL,
            qty INT NOT NULL,
            unit_cost NUMERIC(12, 2) DEFAULT NULL,
            unit_sell_price NUMERIC(12, 2) DEFAULT NULL,
            purchase_source VARCHAR(120) DEFAULT NULL,
            purchase_url LONGTEXT DEFAULT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            INDEX idx_upll_list (purchase_list_id),
            INDEX idx_upll_catalog (catalog_item_id),
            PRIMARY KEY(id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');

        $this->addSql('ALTER TABLE unit_purchase_list_line ADD CONSTRAINT FK_UPLL_LIST FOREIGN KEY (purchase_list_id) REFERENCES unit_purchase_list (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE unit_purchase_list_line ADD CONSTRAINT FK_UPLL_CATALOG FOREIGN KEY (catalog_item_id) REFERENCES purchase_catalog_item (id) ON DELETE SET NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE unit_purchase_list_line DROP FOREIGN KEY FK_UPLL_LIST');
        $this->addSql('ALTER TABLE unit_purchase_list_line DROP FOREIGN KEY FK_UPLL_CATALOG');
        $this->addSql('DROP TABLE unit_purchase_list_line');
    }
}
