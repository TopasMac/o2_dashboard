<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20251016031436 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP TABLE accountant_entry_backup_20251015211122
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE accountant_entry_backup_20251016
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE accountant_import_backup_20251015210549
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE accountant_import_backup_20251015211118
        SQL);
        $this->addSql(<<<'SQL'
            DROP TABLE accountant_import_backup_20251016
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_3682B061AA31AD4F ON accountant_entry
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE accountant_entry DROP created_at, CHANGE source_file_name source_file_name VARCHAR(255) DEFAULT NULL, CHANGE fecha_raw fecha_raw VARCHAR(255) DEFAULT NULL, CHANGE fecha_on fecha_on DATE NOT NULL COMMENT '(DC2Type:date_immutable)', CHANGE tipo_movimiento tipo_movimiento VARCHAR(255) DEFAULT NULL, CHANGE tipo_pago tipo_pago VARCHAR(255) DEFAULT NULL, CHANGE concepto concepto VARCHAR(512) DEFAULT NULL, CHANGE deposito deposito NUMERIC(15, 2) DEFAULT NULL, CHANGE comision comision NUMERIC(15, 2) DEFAULT NULL, CHANGE monto_disponible monto_disponible NUMERIC(15, 2) DEFAULT NULL, CHANGE superseded_at superseded_at DATETIME DEFAULT NULL COMMENT '(DC2Type:datetime_immutable)'
        SQL);
        $this->addSql(<<<'SQL'
            DROP INDEX UNIQ_F7E34DC2E4DF3248 ON accountant_import
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE accountant_import ADD dry_run TINYINT(1) NOT NULL, DROP file_sha256, DROP sheet_name, DROP rows_total, DROP rows_inserted, DROP status, CHANGE file_name filename VARCHAR(255) NOT NULL, CHANGE created_at uploaded_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)'
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0' NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            CREATE TABLE accountant_entry_backup_20251015211122 (id INT DEFAULT 0 NOT NULL, import_id INT NOT NULL, source_file_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, source_sheet_name VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, source_row_number INT DEFAULT NULL, fecha_raw VARCHAR(128) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, fecha_on DATE NOT NULL, tipo_movimiento VARCHAR(128) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, tipo_pago VARCHAR(128) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, concepto LONGTEXT CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, notes LONGTEXT CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, deposito NUMERIC(12, 2) DEFAULT NULL, comision NUMERIC(12, 2) DEFAULT NULL, monto_disponible NUMERIC(12, 2) DEFAULT NULL, row_hash VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', group_key VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, is_active TINYINT(1) NOT NULL, superseded_by_row_hash VARCHAR(64) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, superseded_at DATETIME DEFAULT NULL, change_summary LONGTEXT CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_0900_ai_ci` ENGINE = InnoDB COMMENT = '' 
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE accountant_entry_backup_20251016 (id INT DEFAULT 0 NOT NULL, import_id INT NOT NULL, source_file_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, source_sheet_name VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, source_row_number INT DEFAULT NULL, fecha_raw VARCHAR(128) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, fecha_on DATE NOT NULL, tipo_movimiento VARCHAR(128) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, tipo_pago VARCHAR(128) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, concepto LONGTEXT CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, notes LONGTEXT CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, deposito NUMERIC(12, 2) DEFAULT NULL, comision NUMERIC(12, 2) DEFAULT NULL, monto_disponible NUMERIC(12, 2) DEFAULT NULL, row_hash VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', group_key VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, is_active TINYINT(1) NOT NULL, superseded_by_row_hash VARCHAR(64) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, superseded_at DATETIME DEFAULT NULL, change_summary LONGTEXT CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_0900_ai_ci` ENGINE = InnoDB COMMENT = '' 
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE accountant_import_backup_20251015210549 (id INT DEFAULT 0 NOT NULL, file_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, file_sha256 VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, sheet_name VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, rows_total INT DEFAULT NULL, rows_inserted INT DEFAULT NULL, status VARCHAR(50) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)') DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_0900_ai_ci` ENGINE = InnoDB COMMENT = '' 
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE accountant_import_backup_20251015211118 (id INT DEFAULT 0 NOT NULL, file_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, file_sha256 VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, sheet_name VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, rows_total INT DEFAULT NULL, rows_inserted INT DEFAULT NULL, status VARCHAR(50) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)') DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_0900_ai_ci` ENGINE = InnoDB COMMENT = '' 
        SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE accountant_import_backup_20251016 (id INT DEFAULT 0 NOT NULL, file_name VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, file_sha256 VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL COLLATE `utf8mb4_unicode_ci`, sheet_name VARCHAR(255) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, rows_total INT DEFAULT NULL, rows_inserted INT DEFAULT NULL, status VARCHAR(50) CHARACTER SET utf8mb4 DEFAULT NULL COLLATE `utf8mb4_unicode_ci`, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)') DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_0900_ai_ci` ENGINE = InnoDB COMMENT = '' 
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE accountant_entry ADD created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', CHANGE fecha_on fecha_on DATE NOT NULL, CHANGE fecha_raw fecha_raw VARCHAR(128) NOT NULL, CHANGE tipo_movimiento tipo_movimiento VARCHAR(128) DEFAULT NULL, CHANGE tipo_pago tipo_pago VARCHAR(128) DEFAULT NULL, CHANGE concepto concepto LONGTEXT DEFAULT NULL, CHANGE deposito deposito NUMERIC(12, 2) DEFAULT NULL, CHANGE comision comision NUMERIC(12, 2) DEFAULT NULL, CHANGE monto_disponible monto_disponible NUMERIC(12, 2) DEFAULT NULL, CHANGE superseded_at superseded_at DATETIME DEFAULT NULL, CHANGE source_file_name source_file_name VARCHAR(255) NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_3682B061AA31AD4F ON accountant_entry (row_hash)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE accountant_import ADD file_sha256 VARCHAR(64) NOT NULL, ADD sheet_name VARCHAR(255) DEFAULT NULL, ADD rows_total INT DEFAULT NULL, ADD rows_inserted INT DEFAULT NULL, ADD status VARCHAR(50) DEFAULT NULL, DROP dry_run, CHANGE filename file_name VARCHAR(255) NOT NULL, CHANGE uploaded_at created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)'
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX UNIQ_F7E34DC2E4DF3248 ON accountant_import (file_sha256)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE booking_month_slice CHANGE room_fee_in_month room_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE payout_in_month payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE tax_in_month tax_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE net_payout_in_month net_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE cleaning_fee_in_month cleaning_fee_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE commission_base_in_month commission_base_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE o2_commission_in_month o2_commission_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL, CHANGE owner_payout_in_month owner_payout_in_month NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE unit_balance CHANGE current_balance current_balance NUMERIC(12, 2) DEFAULT '0.00' NOT NULL
        SQL);
    }
}
