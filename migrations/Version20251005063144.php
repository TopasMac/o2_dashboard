<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251005063144 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    private function orcHasForeignKey(): bool
    {
        $sm = $this->connection->createSchemaManager();
        foreach ($sm->listTableForeignKeys('owner_report_cycle') as $fk) {
            if ($fk->getName() === 'FK_ORC_EMAIL_EVENT') { return true; }
            // Some platforms rename FKs; also check by local columns + foreign table
            if (in_array('email_event_id', $fk->getLocalColumns(), true) && $fk->getForeignTableName() === 'email_event') {
                return true;
            }
        }
        return false;
    }

    private function emailEventHasColumn(string $name): bool
    {
        $sm = $this->connection->createSchemaManager();
        $table = $sm->introspectTable('email_event');
        return $table->hasColumn($name);
    }

    private function emailEventHasIndex(string $name): bool
    {
        $sm = $this->connection->createSchemaManager();
        $table = $sm->introspectTable('email_event');
        foreach ($table->getIndexes() as $idx) {
            if ($idx->getName() === $name) { return true; }
        }
        return false;
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);

        // email_event alterations (guarded)
        // Drop template/payload_json if present
        if ($this->emailEventHasColumn('template')) {
            $this->addSql("ALTER TABLE email_event DROP template");
        }
        if ($this->emailEventHasColumn('payload_json')) {
            $this->addSql("ALTER TABLE email_event DROP payload_json");
        }
        // Narrow text fields and adjust defaults/nullability (safe even if already set)
        $this->addSql("ALTER TABLE email_event 
            MODIFY to_email VARCHAR(320) NOT NULL,
            MODIFY cc_email VARCHAR(320) DEFAULT NULL,
            MODIFY subject VARCHAR(200) DEFAULT NULL,
            MODIFY status VARCHAR(20) DEFAULT 'QUEUED' NOT NULL,
            MODIFY sent_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)'
        ");
        // Create indexes if missing
        if (!$this->emailEventHasIndex('IDX_A6E34B28F8BD700D2DD83ED164C19C1')) {
            $this->addSql("CREATE INDEX IDX_A6E34B28F8BD700D2DD83ED164C19C1 ON email_event (unit_id, `year_month`, category)");
        }
        if (!$this->emailEventHasIndex('IDX_A6E34B2896E4F388')) {
            $this->addSql("CREATE INDEX IDX_A6E34B2896E4F388 ON email_event (sent_at)");
        }
        if (!$this->emailEventHasIndex('IDX_A6E34B28ECAE4D44')) {
            $this->addSql("CREATE INDEX IDX_A6E34B28ECAE4D44 ON email_event (to_email)");
        }

        // owner_report_cycle: add email_event_id + index + FK (guarded)
        $sm = $this->connection->createSchemaManager();
        $table = $sm->introspectTable('owner_report_cycle');

        if (!$table->hasColumn('email_event_id')) {
            $this->addSql("ALTER TABLE owner_report_cycle ADD email_event_id INT DEFAULT NULL");
        }

        $hasIdx = false;
        foreach ($table->getIndexes() as $idx) {
            if ($idx->getName() === 'IDX_ORC_EMAIL_EVENT') { $hasIdx = true; break; }
        }
        if (!$hasIdx) {
            $this->addSql("CREATE INDEX IDX_ORC_EMAIL_EVENT ON owner_report_cycle (email_event_id)");
        }

        if (!$this->orcHasForeignKey()) {
            $this->addSql(<<<'SQL'
                ALTER TABLE owner_report_cycle 
                    ADD CONSTRAINT FK_ORC_EMAIL_EVENT FOREIGN KEY (email_event_id) 
                    REFERENCES email_event (id) ON DELETE SET NULL
            SQL);
        }

        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);

        // email_event: drop indexes if exist
        if ($this->emailEventHasIndex('IDX_A6E34B28F8BD700D2DD83ED164C19C1')) {
            $this->addSql("DROP INDEX IDX_A6E34B28F8BD700D2DD83ED164C19C1 ON email_event");
        }
        if ($this->emailEventHasIndex('IDX_A6E34B2896E4F388')) {
            $this->addSql("DROP INDEX IDX_A6E34B2896E4F388 ON email_event");
        }
        if ($this->emailEventHasIndex('IDX_A6E34B28ECAE4D44')) {
            $this->addSql("DROP INDEX IDX_A6E34B28ECAE4D44 ON email_event");
        }
        // Restore columns if absent
        if (!$this->emailEventHasColumn('template')) {
            $this->addSql("ALTER TABLE email_event ADD template VARCHAR(120) DEFAULT NULL");
        }
        if (!$this->emailEventHasColumn('payload_json')) {
            $this->addSql("ALTER TABLE email_event ADD payload_json JSON DEFAULT NULL");
        }
        // Re-widen fields (safe)
        $this->addSql("ALTER TABLE email_event 
            MODIFY to_email LONGTEXT NOT NULL,
            MODIFY cc_email LONGTEXT DEFAULT NULL,
            MODIFY subject LONGTEXT DEFAULT NULL,
            MODIFY status VARCHAR(20) NOT NULL,
            MODIFY sent_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)'
        ");

        // owner_report_cycle: drop FK + index + column if they exist
        if ($this->orcHasForeignKey()) {
            $this->addSql("ALTER TABLE owner_report_cycle DROP FOREIGN KEY FK_ORC_EMAIL_EVENT");
        }
        $sm = $this->connection->createSchemaManager();
        $table = $sm->introspectTable('owner_report_cycle');
        $hasIdx = false;
        foreach ($table->getIndexes() as $idx) {
            if ($idx->getName() === 'IDX_ORC_EMAIL_EVENT') { $hasIdx = true; break; }
        }
        if ($hasIdx) {
            $this->addSql("DROP INDEX IDX_ORC_EMAIL_EVENT ON owner_report_cycle");
        }
        if ($table->hasColumn('email_event_id')) {
            $this->addSql("ALTER TABLE owner_report_cycle DROP email_event_id");
        }

        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
