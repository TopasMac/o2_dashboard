<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250820041653 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP INDEX uniq_booking_month ON booking_month_slice
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice ADD segment_id VARCHAR(20) DEFAULT NULL, ADD payment_type VARCHAR(20) DEFAULT NULL, ADD payment_method VARCHAR(20) DEFAULT NULL, ADD segment_start DATE DEFAULT NULL, ADD segment_end DATE DEFAULT NULL, ADD nights_in_segment INT DEFAULT NULL, ADD total_nights_booking INT DEFAULT NULL, ADD prorate_factor NUMERIC(14, 4) DEFAULT NULL, ADD room_fee_segment NUMERIC(12, 2) DEFAULT NULL, ADD payout_segment NUMERIC(12, 2) DEFAULT NULL, ADD tax_amount_segment NUMERIC(12, 2) DEFAULT NULL, ADD net_payout_segment NUMERIC(12, 2) DEFAULT NULL, ADD cleaning_fee_segment NUMERIC(12, 2) DEFAULT NULL, ADD commission_segment NUMERIC(12, 2) DEFAULT NULL, ADD client_income_segment NUMERIC(12, 2) DEFAULT NULL, ADD o2_total_segment NUMERIC(12, 2) DEFAULT NULL, CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice DROP segment_id, DROP payment_type, DROP payment_method, DROP segment_start, DROP segment_end, DROP nights_in_segment, DROP total_nights_booking, DROP prorate_factor, DROP room_fee_segment, DROP payout_segment, DROP tax_amount_segment, DROP net_payout_segment, DROP cleaning_fee_segment, DROP commission_segment, DROP client_income_segment, DROP o2_total_segment, CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX uniq_booking_month ON booking_month_slice (booking_id, `year_month`)
        SQL);
    }
}
