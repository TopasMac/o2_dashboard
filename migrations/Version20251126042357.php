<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20251126042357 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create employee_task, employee_task_comment, employee_task_attachment tables';
    }

    public function up(Schema $schema): void
    {
        // employee_task
        $task = $schema->createTable('employee_task');
        $task->addColumn('id', 'integer', ['autoincrement' => true]);
        $task->addColumn('employee_id', 'integer');
        $task->addColumn('created_by_id', 'integer', ['notnull' => false]);
        $task->addColumn('unit_id', 'integer', ['notnull' => false]);
        $task->addColumn('title', 'string', ['length' => 255]);
        $task->addColumn('description', 'text', ['notnull' => false]);
        $task->addColumn('status', 'string', ['length' => 50]);
        $task->addColumn('priority', 'string', ['length' => 20]);
        $task->addColumn('created_at', 'datetime');
        $task->addColumn('updated_at', 'datetime', ['notnull' => false]);
        $task->addColumn('due_date', 'date', ['notnull' => false]);

        $task->setPrimaryKey(['id']);
        $task->addForeignKeyConstraint('employee', ['employee_id'], ['id'], ['onDelete' => 'CASCADE']);
        $task->addForeignKeyConstraint('employee', ['created_by_id'], ['id'], ['onDelete' => 'SET NULL']);
        $task->addForeignKeyConstraint('unit', ['unit_id'], ['id'], ['onDelete' => 'SET NULL']);

        // employee_task_comment
        $comment = $schema->createTable('employee_task_comment');
        $comment->addColumn('id', 'integer', ['autoincrement' => true]);
        $comment->addColumn('task_id', 'integer');
        $comment->addColumn('author_id', 'integer', ['notnull' => false]);
        $comment->addColumn('content', 'text');
        $comment->addColumn('created_at', 'datetime');

        $comment->setPrimaryKey(['id']);
        $comment->addForeignKeyConstraint('employee_task', ['task_id'], ['id'], ['onDelete' => 'CASCADE']);
        $comment->addForeignKeyConstraint('employee', ['author_id'], ['id'], ['onDelete' => 'SET NULL']);

        // employee_task_attachment
        $att = $schema->createTable('employee_task_attachment');
        $att->addColumn('id', 'integer', ['autoincrement' => true]);
        $att->addColumn('task_id', 'integer');
        $att->addColumn('uploaded_by_id', 'integer', ['notnull' => false]);
        $att->addColumn('path', 'string', ['length' => 255]);
        $att->addColumn('original_name', 'string', ['length' => 255]);
        $att->addColumn('mime_type', 'string', ['length' => 150, 'notnull' => false]);
        $att->addColumn('size', 'integer', ['notnull' => false]);
        $att->addColumn('created_at', 'datetime');

        $att->setPrimaryKey(['id']);
        $att->addForeignKeyConstraint('employee_task', ['task_id'], ['id'], ['onDelete' => 'CASCADE']);
        $att->addForeignKeyConstraint('employee', ['uploaded_by_id'], ['id'], ['onDelete' => 'SET NULL']);
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('employee_task_attachment');
        $schema->dropTable('employee_task_comment');
        $schema->dropTable('employee_task');
    }
}
