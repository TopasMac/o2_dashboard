<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20251104_AddHoldFieldsToAllBookings extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add hold-related fields to all_bookings: hold_expires_at, hold_policy, original_code, confirmed_at, plus index on hold_expires_at.';
    }

    public function up(Schema $schema): void
    {
        // Add columns (nullable) + index for sweeper lookups
        $this->addSql("
            ALTER TABLE all_bookings
                ADD hold_expires_at DATETIME DEFAULT NULL,
                ADD hold_policy VARCHAR(10) DEFAULT NULL,
                ADD original_code VARCHAR(32) DEFAULT NULL,
                ADD confirmed_at DATETIME DEFAULT NULL
        ");

        // Helpful index for the auto-cancel job
        $this->addSql("CREATE INDEX IDX_ALLBOOKINGS_HOLD_EXPIRES_AT ON all_bookings (hold_expires_at)");
    }

    public function down(Schema $schema): void
    {
        // Drop index then columns
        $this->addSql("DROP INDEX IDX_ALLBOOKINGS_HOLD_EXPIRES_AT ON all_bookings");

        $this->addSql("
            ALTER TABLE all_bookings
                DROP hold_expires_at,
                DROP hold_policy,
                DROP original_code,
                DROP confirmed_at
        ");
    }
}