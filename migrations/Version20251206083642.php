<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251206083642 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // Add notes column
        $this->addSql("ALTER TABLE santander_entry ADD notes LONGTEXT DEFAULT NULL");

        // Add unique fingerprint index
        $this->addSql("CREATE UNIQUE INDEX uniq_santander_fingerprint ON santander_entry (fecha_on, concept, deposito, account_last4)");
    }

    public function down(Schema $schema): void
    {
        // Drop notes column
        $this->addSql("ALTER TABLE santander_entry DROP notes");

        // Drop unique fingerprint index
        $this->addSql("DROP INDEX uniq_santander_fingerprint ON santander_entry");
    }
}
