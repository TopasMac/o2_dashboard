<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250719213925 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions ADD transaction_code VARCHAR(20) DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_383EF8DB95560E39 ON unit_transactions (transaction_code)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions RENAME INDEX fk_transaction_category TO IDX_383EF8DB12469DE2
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_383EF8DB95560E39 ON unit_transactions
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions DROP transaction_code
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_transactions RENAME INDEX idx_383ef8db12469de2 TO fk_transaction_category
        SQL);
    }
}
