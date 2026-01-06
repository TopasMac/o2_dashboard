<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Add a nullable employee_id foreign key column on user -> employee.
 *
 * This keeps the User entity mapping in sync with the database schema.
 */
final class Version20251121065137 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add employee_id column and FK from user to employee (nullable, ON DELETE SET NULL).';
    }

    public function up(Schema $schema): void
    {
        // Add the employee_id column on user (nullable so existing rows are valid)
        $this->addSql('ALTER TABLE `user` ADD employee_id INT DEFAULT NULL');

        // Create an index for lookups/filtering by employee
        $this->addSql('CREATE INDEX IDX_USER_EMPLOYEE_ID ON `user` (employee_id)');

        // Add the foreign key constraint to employee(id)
        $this->addSql('ALTER TABLE `user` ADD CONSTRAINT FK_USER_EMPLOYEE FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE SET NULL');
    }

    public function down(Schema $schema): void
    {
        // Drop the foreign key, then index, then column (reverse order of up)
        $this->addSql('ALTER TABLE `user` DROP FOREIGN KEY FK_USER_EMPLOYEE');
        $this->addSql('DROP INDEX IDX_USER_EMPLOYEE_ID ON `user`');
        $this->addSql('ALTER TABLE `user` DROP COLUMN employee_id');
    }
}
