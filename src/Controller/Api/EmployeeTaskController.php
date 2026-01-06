<?php

namespace App\Controller\Api;

use App\Entity\EmployeeTask;
use App\Entity\EmployeeTaskComment;
use App\Entity\Employee;
use App\Repository\EmployeeTaskRepository;
use App\Repository\EmployeeTaskCommentRepository;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeTaskService;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/employee-tasks')]
class EmployeeTaskController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly EmployeeTaskRepository $taskRepository,
        private readonly EmployeeTaskCommentRepository $commentRepository,
        private readonly EmployeeRepository $employeeRepository,
        private readonly EmployeeTaskService $taskService,
    ) {
    }

    /**
     * List tasks.
     *
     * For now:
     *  - ?employeeId=X   => tasks for that employee (mobile "My tasks")
     *  - ?status=open,in_progress => optional status filter
     *  - no employeeId   => all tasks (admin/manager view)
     */
    #[Route('', name: 'employee_tasks_index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $employeeId = $request->query->getInt('employeeId', 0);
        $statusParam = $request->query->get('status');
        $statuses = [];

        if (is_string($statusParam) && $statusParam !== '') {
            $statuses = array_filter(array_map('trim', explode(',', $statusParam)));
        }

        if ($employeeId > 0) {
            $tasks = $this->taskRepository->findByEmployee($employeeId, $statuses);
        } else {
            $tasks = $this->taskRepository->findAdminFiltered([], $statuses);
        }

        $data = array_map([$this, 'serializeTask'], $tasks);

        return $this->json([
            'success' => true,
            'items' => $data,
        ]);
    }

    /**
     * Form options for creating/updating tasks.
     *
     * Returns:
     *  - units: active units (id, unitName, city)
     *  - employees: employees with a linked user (id, shortName)
     */
    #[Route('/form-options', name: 'employee_tasks_form_options', methods: ['GET'])]
    public function formOptions(): JsonResponse
    {
        $options = $this->taskService->getFormOptions();
    
        return $this->json([
            'success' => true,
            'payload' => $options,
        ]);
    }

    /**
     * Task notifications / lists for the dashboard card.
     *
     * GET /api/employee-tasks/notifications
     *
     * Optional query params:
     *  - view=notifications|my|assigned_by_me
     *
     *  view meanings:
     *   - notifications   : default; highlights new / overdue tasks (same as getNotificationsForUser)
     *   - my              : open tasks assigned to the current employee
     *   - assigned_by_me  : open tasks created by the current employee
     */
    #[Route('/notifications', name: 'employee_tasks_notifications', methods: ['GET'])]
    public function notifications(Request $request): JsonResponse
    {
        // view: notifications | my | assigned_by_me
        $view = (string) $request->query->get('view', 'notifications');

        $items = $this->taskService->getDashboardTasksForUser($this->getUser(), $view);

        return $this->json([
            'success' => true,
            'items' => $items,
        ]);
    }

    /**
     * Create a new task (admin/manager).
     *
     * Expected JSON body:
     *  - employeeId (required)
     *  - title (required)
     *  - description (optional)
     *  - unitId (optional)
     *  - dueDate (optional, "YYYY-MM-DD")
     *  - priority (optional: low|normal|high)
     *  - createdById (optional; for now we accept as parameter; later we can bind to logged-in user)
     */
    #[Route('', name: 'employee_tasks_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        try {
            $task = $this->taskService->createFromPayload($payload, $this->getUser());
        } catch (\InvalidArgumentException $e) {
            return $this->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 400);
        } catch (\RuntimeException $e) {
            return $this->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 404);
        }

        return $this->json([
            'success' => true,
            'item' => $this->serializeTask($task),
        ], 201);
    }

    /**
     * Show a single task by id.
     *
     * GET /api/employee-tasks/{id}
     */
    #[Route('/{id}', name: 'employee_tasks_show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        return $this->json([
            'success' => true,
            'item' => $this->serializeTask($task),
        ]);
    }

    /**
     * Partially update a task (e.g. notes, description, due date, priority).
     *
     * PATCH /api/employee-tasks/{id}
     *
     * Expected JSON body (all optional):
     *  - notes (string)
     *  - description (string)
     *  - dueDate ("YYYY-MM-DD")
     *  - priority ("low"|"normal"|"high")
     */
    #[Route('/{id}', name: 'employee_tasks_update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        $payload = json_decode($request->getContent(), true) ?? [];

        // Resolve updater (optional but preferred for auditing)
        $updater = $this->resolveCurrentEmployee();
        if ($updater) {
            $task->setUpdatedBy($updater);
        }

        // Notes
        if (array_key_exists('notes', $payload) && method_exists($task, 'setNotes')) {
            $task->setNotes($payload['notes'] !== null ? (string) $payload['notes'] : null);
        }

        // Description (if ever needed from this endpoint)
        if (array_key_exists('description', $payload)) {
            $task->setDescription($payload['description'] !== null ? (string) $payload['description'] : null);
        }

        // Due date (optional)
        if (array_key_exists('dueDate', $payload)) {
            $dueDateRaw = $payload['dueDate'];
            if ($dueDateRaw === null || $dueDateRaw === '') {
                $task->setDueDate(null);
            } elseif (is_string($dueDateRaw)) {
                try {
                    $dueDate = new \DateTimeImmutable($dueDateRaw);
                    $task->setDueDate($dueDate);
                } catch (\Exception $e) {
                    // Ignore invalid date; we could also return 400 if stricter behavior is desired.
                }
            }
        }

        // Priority (if provided)
        if (array_key_exists('priority', $payload)) {
            $priority = (string) $payload['priority'];
            if ($priority !== '') {
                $task->setPriority($priority);
            }
        }

        // Touch updatedAt whenever we PATCH a task
        $task->setUpdatedAt(new \DateTimeImmutable());

        $this->em->persist($task);
        $this->em->flush();

        return $this->json([
            'success' => true,
            'item' => $this->serializeTask($task),
        ]);
    }

    /**
     * Delete a task and all related data.
     *
     * DELETE /api/employee-tasks/{id}
     *
     * This will:
     *  - remove the EmployeeTask row
     *  - remove any EmployeeTaskComment rows for this task
     *  - remove attachments and underlying UnitDocument/UnitDocumentAttachment records
     *    via EmployeeTaskService::deleteTaskWithCascade().
     */
    #[Route('/{id}', name: 'employee_tasks_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            return $this->json([
                'success' => false,
                'error' => 'User not authenticated',
            ], 401);
        }

        // Delegate full cleanup to the service. The service will safely no-op
        // if the task does not exist.
        $this->taskService->deleteTaskWithCascade($id);

        return $this->json([
            'success' => true,
        ]);
    }

    /**
     * Update task status.
     *
     * Expected JSON body:
     *  - status (one of EmployeeTask::STATUS_*)
     *
     * NOTE: Role/permission rules (e.g. manager cannot validate own tasks)
     * can be enforced here later or moved into a dedicated service.
     */
    #[Route('/{id}/status', name: 'employee_tasks_update_status', methods: ['PATCH'])]
    public function updateStatus(int $id, Request $request): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $status = (string) ($payload['status'] ?? '');

        if ($status === '') {
            return $this->json([
                'success' => false,
                'error' => 'Status is required',
            ], 400);
        }

        // In v1 we trust the frontend to send a valid status.
        // Later we can whitelist against the known constants.

        // Track who performed the last update; we must be able to resolve an Employee
        $updater = $this->resolveCurrentEmployee();
        if (!$updater) {
            return $this->json([
                'success' => false,
                'error' => 'Unable to resolve current employee for status update',
            ], 403);
        }

        $task->setUpdatedBy($updater);
        $task->setUpdatedAt(new \DateTimeImmutable());

        // Delegate status change + oldStatus tracking to the service
        $this->taskService->updateStatus($task, $status);

        return $this->json([
            'success' => true,
            'item' => $this->serializeTask($task),
        ]);
    }

    /**
     * Acknowledge / start a task from the dashboard card.
     *
     * Intended for the teal check action or when the user opens the task
     * from the notifications card. This will:
     *
     *  - update the task status to "in_progress"
     *  - register a task_notification dismissal (AlertDismissal)
     *
     * No request body is required.
     */
    #[Route('/{id}/ack', name: 'employee_tasks_ack', methods: ['POST'])]
    public function ack(int $id): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            return $this->json([
                'success' => false,
                'error' => 'User not authenticated',
            ], 401);
        }

        // Resolve the current Employee so we can track who touched the task.
        $employee = $this->resolveCurrentEmployee();
        if (!$employee) {
            return $this->json([
                'success' => false,
                'error' => 'Unable to resolve current employee for ack',
            ], 403);
        }

        // Mark who updated the task and when
        $task->setUpdatedBy($employee);
        $task->setUpdatedAt(new \DateTimeImmutable());

        // Mark task as seen + move to in_progress
        $this->taskService->markTaskSeen($task, $user, EmployeeTask::STATUS_IN_PROGRESS);

        return $this->json([
            'success' => true,
            'item' => $this->serializeTask($task),
        ]);
    }

    /**
     * List comments for a task.
     *
     * GET /api/employee-tasks/{id}/comments
     */
    #[Route('/{id}/comments', name: 'employee_tasks_list_comments', methods: ['GET'])]
    public function listComments(int $id): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        $comments = $this->commentRepository->findBy(
            ['task' => $task],
            ['createdAt' => 'ASC']
        );

        $items = array_map(function (EmployeeTaskComment $comment) {
            return $this->serializeComment($comment);
        }, $comments);

        return $this->json([
            'success' => true,
            'items' => $items,
        ]);
    }

    /**
     * Add a comment to a task.
     *
     * Expected JSON body:
     *  - content (required)
     *  - authorId (optional; later can be bound to logged-in user)
     */
    #[Route('/{id}/comments', name: 'employee_tasks_add_comment', methods: ['POST'])]
    public function addComment(int $id, Request $request): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        $payload = json_decode($request->getContent(), true) ?? [];

        $content = trim((string) ($payload['content'] ?? ''));
        $authorId = isset($payload['authorId']) ? (int) $payload['authorId'] : null;

        if ($content === '') {
            return $this->json([
                'success' => false,
                'error' => 'Content is required',
            ], 400);
        }

        $comment = new EmployeeTaskComment();
        $comment->setTask($task)
            ->setContent($content);

        if ($authorId) {
            $author = $this->employeeRepository->find($authorId);
            if ($author) {
                $comment->setAuthor($author);
            }
        }

        // If no explicit authorId was provided, try to infer the author
        // from the currently logged-in user.
        if (!$comment->getAuthor()) {
            $employee = $this->resolveCurrentEmployee();
            if ($employee) {
                $comment->setAuthor($employee);
            }
        }

        // If the comment author is an admin/manager AND the task is in "needs_help",
        // auto-promote the status to "reviewed" when they comment (no explicit box selection).
        $user = $this->getUser();
        if ($user instanceof User) {
            $roles = $user->getRoles();
            $isAdminOrManager = \in_array('ROLE_ADMIN', $roles, true)
                || \in_array('ROLE_MANAGER', $roles, true);

            if ($isAdminOrManager && $task->getStatus() === 'needs_help') {
                $task->setStatus('reviewed');
            }
        }

        // Also treat a new comment as an update to the task: who touched it last and when
        if ($comment->getAuthor()) {
            $task->setUpdatedBy($comment->getAuthor());
            $task->setUpdatedAt(new \DateTimeImmutable());
        }

        $this->em->persist($task);
        $this->em->persist($comment);
        $this->em->flush();

        return $this->json([
            'success' => true,
            'item' => $this->serializeComment($comment),
        ], 201);
    }

    /**
     * Upload attachments for a task (mobile + web).
     *
     * POST /api/employee-tasks/{id}/attachments
     *
     * Expects multipart/form-data with:
     *  - files[]: up to 5 image files
     */
    #[Route('/{id}/attachments', name: 'employee_tasks_upload_attachments', methods: ['POST'])]
    public function uploadAttachments(int $id, Request $request): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        // Normalize uploaded files (if any) and enforce max 5
        $files = $request->files->get('files', []);
        if ($files instanceof UploadedFile) {
            $files = [$files];
        } elseif (!is_array($files)) {
            $files = [];
        }

        if (count($files) > 5) {
            return $this->json([
                'success' => false,
                'error'   => 'You can upload a maximum of 5 files for each task.',
            ], 400);
        }

        // Resolve the current employee for auditing (who attached the files)
        $employee = $this->resolveCurrentEmployee();
        if ($employee) {
            $task->setUpdatedBy($employee);
            $task->setUpdatedAt(new \DateTimeImmutable());
        }

        try {
            // Delegate the actual attachment handling to the service.
            // The service is responsible for persisting any TaskAttachment entities
            // and storing the physical files (e.g. S3, local filesystem, etc.).
            $this->taskService->addAttachments($task, $files, $employee);
        } catch (\InvalidArgumentException $e) {
            return $this->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 400);
        } catch (\RuntimeException $e) {
            return $this->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 500);
        }

        return $this->json([
            'success' => true,
            // For now we just return the serialized task; later we can embed attachments metadata if needed.
            'item'    => $this->serializeTask($task),
        ]);
    }

    /**
     * Delete a single attachment from a task.
     *
     * DELETE /api/employee-tasks/{id}/attachments/{attachmentId}
     *
     * This will:
     *  - ensure the task exists
     *  - ensure the attachment belongs to that task
     *  - remove the UnitDocumentAttachment row
     *  - if the underlying UnitDocument is now orphaned (no more attachments),
     *    also delete the document and its backing file via DocumentUploadService.
     */
    #[Route('/{id}/attachments/{attachmentId}', name: 'employee_tasks_delete_attachment', methods: ['DELETE'])]
    public function deleteAttachment(int $id, int $attachmentId): JsonResponse
    {
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found',
            ], 404);
        }

        // Delegate the actual removal logic to the service.
        // The service will silently no-op if the attachment does not belong
        // to this task or does not exist.
        $this->taskService->removeAttachment($id, $attachmentId);

        // Re-fetch the task to ensure we return the latest attachments state.
        $task = $this->taskRepository->find($id);
        if (!$task) {
            return $this->json([
                'success' => false,
                'error' => 'Task not found after deletion',
            ], 500);
        }

        return $this->json([
            'success' => true,
            'item' => $this->serializeTask($task),
        ]);
    }

    /**
     * Resolve the current logged-in user as an Employee, if possible.
     *
     * Preferred order:
     *  1) Use the explicit User → Employee relation (user.employee).
     *  2) Fallback to name-based matching on Employee.shortName (legacy).
     */
    private function resolveCurrentEmployee(): ?Employee
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            return null;
        }

        // 1) Prefer the explicit relation User → Employee, if present
        $linkedEmployee = $user->getEmployee();
        if ($linkedEmployee instanceof Employee) {
            return $linkedEmployee;
        }

        // 2) Fall back to name-based matching (legacy behavior)
        $name = $user->getName();
        if (!$name) {
            return null;
        }

        // 2a) Try exact match on shortName
        $employee = $this->employeeRepository->findOneBy([
            'shortName' => $name,
        ]);
        if ($employee instanceof Employee) {
            return $employee;
        }

        // 2b) Try first token of the name ("Pedro Macedo" => "Pedro")
        $parts = preg_split('/\s+/', $name);
        if (!empty($parts)) {
            $first = trim($parts[0]);
            if ($first !== '' && $first !== $name) {
                $employee = $this->employeeRepository->findOneBy([
                    'shortName' => $first,
                ]);
                if ($employee instanceof Employee) {
                    return $employee;
                }
            }
        }

        return null;
    }

    private function serializeComment(EmployeeTaskComment $comment): array
    {
        $task = $comment->getTask();

        $createdAt = $comment->getCreatedAt();
        $createdAtFormatted = null;
        if ($createdAt instanceof \DateTimeInterface) {
            $createdAtCancun = (clone $createdAt)->setTimezone(new \DateTimeZone('America/Cancun'));
            $createdAtFormatted = $createdAtCancun->format('Y-m-d H:i:s');
        }

        return [
            'id' => $comment->getId(),
            'taskId' => $task ? $task->getId() : null,
            'author' => $comment->getAuthor() ? [
                'id' => $comment->getAuthor()->getId(),
                'shortName' => $comment->getAuthor()->getShortName(),
            ] : null,
            'content' => $comment->getContent(),
            // "message" alias to play nicely with existing frontend mapping
            'message' => $comment->getContent(),
            'createdAt' => $createdAtFormatted,
        ];
    }

    private function serializeTask(EmployeeTask $task): array
    {
        $createdAt = $task->getCreatedAt();
        $createdAtFormatted = null;
        if ($createdAt instanceof \DateTimeInterface) {
            $createdAtCancun = (clone $createdAt)->setTimezone(new \DateTimeZone('America/Cancun'));
            $createdAtFormatted = $createdAtCancun->format('Y-m-d H:i:s');
        }

        $updatedAt = $task->getUpdatedAt();
        $updatedAtFormatted = null;
        if ($updatedAt instanceof \DateTimeInterface) {
            $updatedAtCancun = (clone $updatedAt)->setTimezone(new \DateTimeZone('America/Cancun'));
            $updatedAtFormatted = $updatedAtCancun->format('Y-m-d H:i:s');
        }

        // Build attachments payload, if any
        $attachments = [];
        if (method_exists($task, 'getAttachments')) {
            $taskAttachments = $task->getAttachments();
            if (is_iterable($taskAttachments)) {
                foreach ($taskAttachments as $att) {
                    $document = method_exists($att, 'getDocument') ? $att->getDocument() : null;

                    $url = null;
                    if ($document && method_exists($document, 'getPublicUrl') && $document->getPublicUrl()) {
                        $url = $document->getPublicUrl();
                    } elseif ($document && method_exists($document, 'getFilepath') && $document->getFilepath()) {
                        $url = $document->getFilepath();
                    }

                    $attachments[] = [
                        'id' => method_exists($att, 'getId') ? $att->getId() : null,
                        'category' => method_exists($att, 'getCategory') ? $att->getCategory() : null,
                        'documentId' => ($document && method_exists($document, 'getId')) ? $document->getId() : null,
                        'fileName' => ($document && method_exists($document, 'getOriginalFilename')) ? $document->getOriginalFilename() : null,
                        'url' => $url,
                    ];
                }
            }
        }

        return [
            'id' => $task->getId(),
            'employee' => $task->getEmployee() ? [
                'id' => $task->getEmployee()->getId(),
                'shortName' => $task->getEmployee()->getShortName(),
                'division' => $task->getEmployee()->getDivision(),
                'city' => $task->getEmployee()->getCity(),
            ] : null,
            'createdBy' => $task->getCreatedBy() ? [
                'id' => $task->getCreatedBy()->getId(),
                'shortName' => $task->getCreatedBy()->getShortName(),
            ] : null,
            'updatedBy' => $task->getUpdatedBy() ? [
                'id' => $task->getUpdatedBy()->getId(),
                'shortName' => $task->getUpdatedBy()->getShortName(),
            ] : null,
            'unit' => $task->getUnit() ? [
                'id' => $task->getUnit()->getId(),
                'unitName' => $task->getUnit()->getUnitName(),
                'city' => $task->getUnit()->getCity(),
            ] : null,
            'title' => $task->getTitle(),
            'description' => $task->getDescription(),
            'notes' => method_exists($task, 'getNotes') ? $task->getNotes() : null,
            'status' => $task->getStatus(),
            'priority' => $task->getPriority(),
            'createdAt' => $createdAtFormatted,
            'updatedAt' => $updatedAtFormatted,
            'dueDate' => $task->getDueDate()?->format('Y-m-d'),
            'attachments' => $attachments,
        ];
    }
}