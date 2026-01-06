<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250708203252 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE condo ADD hoa_bank VARCHAR(100) DEFAULT NULL, ADD hoa_account_name VARCHAR(100) DEFAULT NULL, ADD hoa_account_nr VARCHAR(100) DEFAULT NULL, ADD hoa_email VARCHAR(100) DEFAULT NULL, ADD hoa_due_day INT DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit DROP hoa_bank, DROP hoa_account_name, DROP hoa_account_nr, DROP hoa_email
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE condo DROP hoa_bank, DROP hoa_account_name, DROP hoa_account_nr, DROP hoa_email, DROP hoa_due_day
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit ADD hoa_bank VARCHAR(255) DEFAULT NULL, ADD hoa_account_name VARCHAR(255) DEFAULT NULL, ADD hoa_account_nr VARCHAR(255) DEFAULT NULL, ADD hoa_email VARCHAR(255) DEFAULT NULL
        SQL);
    }
}
