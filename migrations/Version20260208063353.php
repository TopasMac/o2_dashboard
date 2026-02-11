<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260208063353 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // 1) Remove duplicates, keep the oldest row per hk_cleaning_id
        $this->addSql("
            DELETE r1 FROM hk_cleanings_reconcile r1
            INNER JOIN hk_cleanings_reconcile r2
              ON r1.hk_cleaning_id = r2.hk_cleaning_id
             AND r1.id > r2.id
        ");

        // 2) Add unique constraint on hk_cleaning_id
        $this->addSql("
            ALTER TABLE hk_cleanings_reconcile
            ADD CONSTRAINT uniq_hk_cleaning UNIQUE (hk_cleaning_id)
        ");
    }

    public function down(Schema $schema): void
    {
        // Remove unique constraint on hk_cleaning_id
        $this->addSql("
            ALTER TABLE hk_cleanings_reconcile
            DROP INDEX uniq_hk_cleaning
        ");
    }
}
