<?php

namespace App\Entity;

use App\Repository\EmployeeTaskCommentRepository;
use Doctrine\ORM\Mapping as ORM;
use App\Entity\EmployeeTask;
use App\Entity\Employee;

#[ORM\Entity(repositoryClass: EmployeeTaskCommentRepository::class)]
#[ORM\Table(name: 'employee_task_comment')]
class EmployeeTaskComment
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    // Parent task
    #[ORM\ManyToOne(targetEntity: EmployeeTask::class, inversedBy: 'comments')]
    #[ORM\JoinColumn(nullable: false, onDelete: "CASCADE")]
    private ?EmployeeTask $task = null;

    // Who wrote the comment (employee or admin)
    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(nullable: true)]
    private ?Employee $author = null;

    #[ORM\Column(type: 'text')]
    private string $content;

    #[ORM\Column(type: 'datetime')]
    private \DateTimeInterface $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getTask(): ?EmployeeTask
    {
        return $this->task;
    }

    public function setTask(?EmployeeTask $task): self
    {
        $this->task = $task;
        return $this;
    }

    public function getAuthor(): ?Employee
    {
        return $this->author;
    }

    public function setAuthor(?Employee $author): self
    {
        $this->author = $author;
        return $this;
    }

    public function getContent(): string
    {
        return $this->content;
    }

    public function setContent(string $content): self
    {
        $this->content = $content;
        return $this;
    }

    public function getCreatedAt(): \DateTimeInterface
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeInterface $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }
}
