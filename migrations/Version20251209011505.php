<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251209011505 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql("ALTER TABLE hk_cleanings ADD done_by_employee_id INT DEFAULT NULL, ADD done_at DATETIME DEFAULT NULL;");
        $this->addSql("ALTER TABLE hk_cleanings ADD CONSTRAINT FK_HKCLEANINGS_DONEBY FOREIGN KEY (done_by_employee_id) REFERENCES employee (id);");
        $this->addSql("CREATE INDEX IDX_HKCLEANINGS_DONEBY ON hk_cleanings (done_by_employee_id);");
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql("ALTER TABLE hk_cleanings DROP FOREIGN KEY FK_HKCLEANINGS_DONEBY;");
        $this->addSql("ALTER TABLE hk_cleanings DROP COLUMN done_by_employee_id, DROP COLUMN done_at;");
    }
}
