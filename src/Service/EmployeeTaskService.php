<?php

namespace App\Service;

use App\Entity\Unit;
use App\Entity\Employee;
use App\Repository\UnitRepository;
use App\Repository\EmployeeRepository;
use App\Repository\EmployeeTaskRepository;
use App\Repository\EmployeeTaskCommentRepository;
use App\Entity\EmployeeTask;
use App\Entity\User;
use App\Entity\AlertDismissal;
use App\Entity\UnitDocumentAttachment;
use Doctrine\ORM\EntityManagerInterface;
use App\Service\Document\DocumentUploadService;
use App\Service\Document\UploadRequestDTO;
use App\Service\Document\AttachOptions;

class EmployeeTaskService
{
    private EntityManagerInterface $em;
    private UnitRepository $unitRepository;
    private EmployeeRepository $employeeRepository;
    private EmployeeTaskRepository $taskRepository;
    private EmployeeTaskCommentRepository $commentRepository;
    private DocumentUploadService $documentUploadService;

    public function __construct(
        EntityManagerInterface $em,
        UnitRepository $unitRepository,
        EmployeeRepository $employeeRepository,
        EmployeeTaskRepository $taskRepository,
        EmployeeTaskCommentRepository $commentRepository,
        DocumentUploadService $documentUploadService,
    ) {
        $this->em = $em;
        $this->unitRepository = $unitRepository;
        $this->employeeRepository = $employeeRepository;
        $this->taskRepository = $taskRepository;
        $this->commentRepository = $commentRepository;
        $this->documentUploadService = $documentUploadService;
    }

    /**
     * Convenience method for the frontend:
     * returns all data needed to build the Employee Task form.
     *
     * Structure:
     *  [
     *      'units' => [
     *          ['id' => 1, 'unitName' => 'Macondo 301', 'city' => 'Playa'],
     *          ...
     *      ],
     *      'employees' => [
     *          ['id' => 7, 'shortName' => 'Diego'],
     *          ...
     *      ],
     *  ]
     */
    public function getFormOptions(): array
    {
        return [
            'units' => $this->getActiveUnitsForTasks(),
            'employees' => $this->getAssignableEmployees(),
        ];
    }

    /**
     * Create a new EmployeeTask from a raw payload and the current User.
     *
     * This centralizes validation and entity wiring so controllers stay thin.
     *
     * Expected payload keys:
     *  - employeeId (required)
     *  - title (required)
     *  - description (optional)
     *  - unitId (optional)
     *  - dueDate (optional, "YYYY-MM-DD")
     *  - priority (optional: low|normal|high; defaults to PRIORITY_NORMAL)
     *  - createdById (optional; if omitted we infer from the User)
     *
     * Throws:
     *  - \InvalidArgumentException on validation errors (400)
     *  - \RuntimeException on not-found errors (404)
     */
    public function createFromPayload(array $payload, ?User $user): EmployeeTask
    {
        $employeeId = (int) ($payload['employeeId'] ?? 0);
        $title = trim((string) ($payload['title'] ?? ''));
        $description = array_key_exists('description', $payload)
            ? (string) $payload['description']
            : null;
        $notes = array_key_exists('notes', $payload)
            ? (string) $payload['notes']
            : null;
        $unitId = isset($payload['unitId']) ? (int) $payload['unitId'] : null;
        $dueDateStr = isset($payload['dueDate']) ? (string) $payload['dueDate'] : null;
        $priority = (string) ($payload['priority'] ?? EmployeeTask::PRIORITY_NORMAL);
        $createdById = isset($payload['createdById']) ? (int) $payload['createdById'] : null;
  
        if ($employeeId <= 0 || $title === '') {
            throw new \InvalidArgumentException('employeeId and title are required');
        }
  
        $employee = $this->employeeRepository->find($employeeId);
        if (!$employee) {
            throw new \RuntimeException('Employee not found');
        }
  
        $unit = null;
        if ($unitId) {
            $unit = $this->unitRepository->find($unitId);
        }
  
        $dueDate = null;
        if ($dueDateStr) {
            try {
                $dueDate = new \DateTimeImmutable($dueDateStr);
            } catch (\Throwable) {
                // ignore invalid date; keep null
            }
        }
  
        $task = new EmployeeTask();
        $task
            ->setEmployee($employee)
            ->setTitle($title)
            ->setDescription($description)
            ->setNotes($notes)
            ->setUnit($unit)
            ->setPriority($priority);
  
        if ($dueDate) {
            $task->setDueDate($dueDate);
        }
  
        // Determine creator: explicit createdById wins, otherwise infer from User
        $creator = null;
        if ($createdById) {
            $creator = $this->employeeRepository->find($createdById);
        }
        if (!$creator) {
            $creator = $this->resolveEmployeeFromUser($user);
        }
        if ($creator) {
            $task->setCreatedBy($creator);
        }
  
        // Default status for new tasks:
        // - If the creator assigns the task to himself, start as "in_progress"
        // - Otherwise start as "open"
        if (method_exists($task, 'setStatus')) {
            if (
                $creator instanceof Employee &&
                $employee instanceof Employee &&
                $creator->getId() === $employee->getId()
            ) {
                $task->setStatus(EmployeeTask::STATUS_IN_PROGRESS);
            } else {
                $task->setStatus(EmployeeTask::STATUS_OPEN);
            }
        }

        // For a new task we consider oldStatus = current status (no prior change).
        if (method_exists($task, 'setOldStatus')) {
            $task->setOldStatus($task->getStatus());
        }
  
        $this->em->persist($task);
        $this->em->flush();
  
        return $task;
    }
  
    /**
     * Update the task status while keeping track of the previous status.
     *
     * This helper ensures that oldStatus is always populated correctly
     * whenever the status changes. It is intended to be used by any
     * controller or service that needs to change a task's status.
     */
    public function updateStatus(EmployeeTask $task, string $newStatus): void
    {
        $currentStatus = $task->getStatus();

        // If nothing changes, do nothing.
        if ($currentStatus === $newStatus) {
            return;
        }

        // Preserve the current status as oldStatus (if supported by the entity).
        if (method_exists($task, 'setOldStatus')) {
            $task->setOldStatus($currentStatus);
        }

        $task->setStatus($newStatus);

        // If this is a maintenance task and it has just been marked as completed,
        // advance the linked UnitMaintenanceSchedule (lastDoneAt + nextDueAt).
        if (
            $newStatus === EmployeeTask::STATUS_COMPLETED
            && method_exists($task, 'getMaintenanceSchedule')
        ) {
            $schedule = $task->getMaintenanceSchedule();
            if ($schedule) {
                // Use UTC for persistence; convert to local timezone only when rendering via API.
                $tz = new \DateTimeZone('UTC');
                $now = new \DateTimeImmutable('now', $tz);

                if (method_exists($schedule, 'setLastDoneAt')) {
                    $schedule->setLastDoneAt($now);
                }

                // Compute the next due date based on frequencyWeeks / frequencyMonths,
                // counting from last_done_at (now). Cast defensively because DB values
                // may come back as strings.
                $next = $now;
                $frequencyWeeks = method_exists($schedule, 'getFrequencyWeeks') ? (int) ($schedule->getFrequencyWeeks() ?? 0) : 0;
                $frequencyMonths = method_exists($schedule, 'getFrequencyMonths') ? (int) ($schedule->getFrequencyMonths() ?? 0) : 0;

                if ($frequencyWeeks > 0) {
                    $next = $next->modify('+' . $frequencyWeeks . ' weeks');
                } elseif ($frequencyMonths > 0) {
                    $next = $next->modify('+' . $frequencyMonths . ' months');
                } else {
                    // Sensible fallback: 4 weeks.
                    $next = $next->modify('+4 weeks');
                }

                if (method_exists($schedule, 'setNextDueAt')) {
                    $schedule->setNextDueAt($next);
                }

                $this->em->persist($schedule);
            }
        }

        $this->em->persist($task);
        $this->em->flush();
    }
    /**
     * Resolve an Employee from the current User, reusing the previous
     * controller logic (User->Employee association, then name/shortName match).
     */
    private function resolveEmployeeFromUser(?User $user): ?Employee
    {
        if (!$user instanceof User) {
            return null;
        }

        // 1) Prefer explicit User -> Employee relation, if present.
        if (method_exists($user, 'getEmployee')) {
            $linkedEmployee = $user->getEmployee();
            if ($linkedEmployee instanceof Employee) {
                return $linkedEmployee;
            }
        }

        // 1b) Fallback: if there is an explicit employeeId on the User, use it.
        if (method_exists($user, 'getEmployeeId')) {
            $employeeId = $user->getEmployeeId();
            if ($employeeId) {
                $byId = $this->employeeRepository->find($employeeId);
                if ($byId instanceof Employee) {
                    return $byId;
                }
            }
        }

        // 2) Fallback to name-based matching on Employee.shortName.
        // Try several common accessors for the display name.
        $name = null;
        if (method_exists($user, 'getName')) {
            $name = $user->getName();
        } elseif (method_exists($user, 'getUserIdentifier')) {
            $name = $user->getUserIdentifier();
        } elseif (method_exists($user, 'getUsername')) {
            $name = $user->getUsername();
        }

        if (!$name) {
            return null;
        }

        // 2a) Exact match on shortName
        $employee = $this->employeeRepository->findOneBy([
            'shortName' => $name,
        ]);
        if ($employee instanceof Employee) {
            return $employee;
        }

        // 2b) First token of the name ("Pedro Macedo" => "Pedro")
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

    /**
     * From unit table:
     *  - id
     *  - unit_name (unitName in the entity)
     *  - city
     *
     * Only for units where status = 'Active'.
     */
    public function getActiveUnitsForTasks(): array
    {
        $units = $this->unitRepository->findBy(
            ['status' => 'Active'],
            ['city' => 'ASC', 'unitName' => 'ASC']
        );

        return array_map(static function (Unit $unit): array {
            return [
                'id' => $unit->getId(),
                'unitName' => $unit->getUnitName(),
                'city' => $unit->getCity(),
            ];
        }, $units);
    }

    /**
     * From employee table:
     *  - id
     *  - short_name (shortName in the entity)
     *  - division
     *  - city
     *
     * Only for employees where user_id IS NOT NULL.
     */
    public function getAssignableEmployees(): array
    {
        $qb = $this->employeeRepository->createQueryBuilder('e');

        // Filter employees that are linked to a User (user_id is not null).
        // Assuming the Employee entity has an association property named "user".
        $qb
            ->andWhere('e.user IS NOT NULL')
            ->orderBy('e.shortName', 'ASC');

        /** @var Employee[] $employees */
        $employees = $qb->getQuery()->getResult();

        return array_map(static function (Employee $employee): array {
            return [
                'id' => $employee->getId(),
                'shortName' => $employee->getShortName(),
                'division' => $employee->getDivision(),
                'city' => $employee->getCity(),
            ];
        }, $employees);
    }

    /**
     * Compute a simple due-status for a task based on its due date and status.
     *
     * Rules:
     *  - If there is no due date, returns null.
     *  - If status is completed/archived, returns null.
     *  - If due date is in the past (strictly before "today"), returns "overdue".
     *  - If due date is today or within the next 2 days, returns "close_to_overdue".
     *  - Otherwise returns null.
     *
     * The $today argument should be a date-only reference (midnight) in the target timezone.
     */
    private function computeDueStatus(EmployeeTask $task, \DateTimeImmutable $today, ?\DateTimeZone $tz = null): ?string
    {
        if (!method_exists($task, 'getDueDate') || !method_exists($task, 'getStatus')) {
            return null;
        }

        $dueDate = $task->getDueDate();
        $status = $task->getStatus();

        if (!$dueDate instanceof \DateTimeInterface) {
            return null;
        }

        // Skip tasks that are already completed or archived
        if (\in_array($status, [EmployeeTask::STATUS_COMPLETED, EmployeeTask::STATUS_ARCHIVED], true)) {
            return null;
        }

        $tz = $tz ?? new \DateTimeZone('America/Cancun');

        // Normalize both dates to date-only in the same timezone
        $todayLocal = $today->setTimezone($tz);
        $todayDate = new \DateTimeImmutable($todayLocal->format('Y-m-d'), $tz);

        $dueLocal = (clone $dueDate)->setTimezone($tz);
        $dueDateOnly = new \DateTimeImmutable($dueLocal->format('Y-m-d'), $tz);

        $diffDays = (int) $todayDate->diff($dueDateOnly)->format('%r%a');

        if ($diffDays < 0) {
            return 'overdue';
        }

        if ($diffDays <= 2) {
            return 'close_to_overdue';
        }

        return null;
    }
    /**
     * Build a simple notification list for the dashboard card.
     *
     * For now we surface only "open" tasks visible to the current user.
     *
     * Visibility rules:
     *  - scope = 'employee' (default):
     *      tasks where task.employee = current employee
     *  - scope = 'manager':
     *      tasks where task.employee = current employee OR task.createdBy = current employee
     *
     * Each item is shaped for TaskNotificationsCard:
     *  [
     *      'id' => 123,
     *      'title' => 'Deep cleaning Macondo 301',
     *      'subtitle' => 'Overdue • Due 04/11 • Assigned to you',
     *      'type' => 'overdue', // new|overdue
     *      'dueDate' => '2025-11-04',
     *      'status' => 'open',
     *      'priority' => 'normal',
     *      'assignedToLabel' => 'You',
     *  ]
     */
    public function getNotificationsForUser(?User $user, string $scope = 'employee'): array
    {
        $employee = $this->resolveEmployeeFromUser($user);

        // Without an Employee profile we cannot resolve "assigned to / assigned by"
        if (!$employee instanceof Employee) {
            return [];
        }

        // Load any dismissals for this user so we can hide tasks they have already acknowledged.
        // We keep track of the dismissal timestamp per task so that newer events (e.g. comments)
        // can still generate notifications.
        $dismissedTasks = [];
        if ($user instanceof User) {
            /** @var \Doctrine\Persistence\ObjectRepository $dismissRepo */
            $dismissRepo = $this->em->getRepository(AlertDismissal::class);

            $dismissals = $dismissRepo->findBy([
                'category'    => 'task_notification',
                'dismissedBy' => $user,
            ]);

            foreach ($dismissals as $dismissal) {
                if (!method_exists($dismissal, 'getToken')) {
                    continue;
                }
                $token = (string) $dismissal->getToken();
                if (strpos($token, 'task:') === 0) {
                    $idPart = substr($token, 5);
                    if ($idPart !== '' && ctype_digit($idPart)) {
                        $taskId = (int) $idPart;
                        $dismissedAt = method_exists($dismissal, 'getDismissedAt')
                            ? $dismissal->getDismissedAt()
                            : null;
                        $dismissedTasks[$taskId] = $dismissedAt instanceof \DateTimeInterface
                            ? $dismissedAt
                            : null;
                    }
                }
            }
        }

        $qb = $this->taskRepository->createQueryBuilder('t')
            // Show tasks either assigned to the current employee OR created by them
            ->andWhere('t.employee = :employee OR t.createdBy = :employee')
            ->setParameter('employee', $employee)
            ->orderBy('t.dueDate', 'ASC')
            ->addOrderBy('t.id', 'DESC');

        /** @var EmployeeTask[] $tasks */
        $tasks = $qb->getQuery()->getResult();

        $cancunTz = new \DateTimeZone('America/Cancun');
        $today = new \DateTimeImmutable('today', $cancunTz);

        $items = [];
        foreach ($tasks as $task) {
            $taskId = $task->getId();
            $dueDate = method_exists($task, 'getDueDate') ? $task->getDueDate() : null;
            $status = method_exists($task, 'getStatus') ? $task->getStatus() : null;
            $assignedEmployee = method_exists($task, 'getEmployee') ? $task->getEmployee() : null;
            $unit = method_exists($task, 'getUnit') ? $task->getUnit() : null;
            $priority = method_exists($task, 'getPriority') ? $task->getPriority() : null;
            $createdAt = method_exists($task, 'getCreatedAt') ? $task->getCreatedAt() : null;
            $updatedAt = method_exists($task, 'getUpdatedAt') ? $task->getUpdatedAt() : null;
            $oldStatus = method_exists($task, 'getOldStatus') ? $task->getOldStatus() : null;
            $dueStatus = $this->computeDueStatus($task, $today, $cancunTz);

            // Maintenance tasks: prefer explicit linkage to UnitMaintenanceSchedule.
            $isMaintenanceTask = false;
            $maintenanceTaskCode = null;

            $schedule = null;
            if (method_exists($task, 'getMaintenanceSchedule')) {
                $schedule = $task->getMaintenanceSchedule();
                if ($schedule) {
                    $isMaintenanceTask = true;
                    if (method_exists($schedule, 'getTaskCode')) {
                        $maintenanceTaskCode = $schedule->getTaskCode();
                    }
                }
            }

            $maintenanceLastDoneAt = null;
            if ($schedule && method_exists($schedule, 'getLastDoneAt')) {
                $ldt = $schedule->getLastDoneAt();
                if ($ldt instanceof \DateTimeInterface) {
                    $maintenanceLastDoneAt = $ldt->setTimezone($cancunTz)->format('Y-m-d H:i:s');
                }
            }

            // Fallback to title-based detection (legacy/backfill)
            if (!$isMaintenanceTask) {
                $t0 = trim((string) $task->getTitle());
                if (\in_array($t0, ['Mantenimiento Preventivo', 'Mantenimiento AC'], true)) {
                    $isMaintenanceTask = true;
                }
            }

            // Privacy rule: admin self-tasks (admin creates task for themselves)
            // are only visible to that admin.
            $creator = method_exists($task, 'getCreatedBy') ? $task->getCreatedBy() : null;
            $isAdminSelfTask = false;
            if ($creator instanceof Employee && $assignedEmployee instanceof Employee) {
                if ($creator->getId() === $assignedEmployee->getId()) {
                    $creatorUser = method_exists($creator, 'getUser') ? $creator->getUser() : null;
                    if ($creatorUser instanceof User && method_exists($creatorUser, 'getRoles')) {
                        $roles = $creatorUser->getRoles();
                        if (is_array($roles) && \in_array('ROLE_ADMIN', $roles, true)) {
                            $isAdminSelfTask = true;
                        }
                    }
                }
            }

            if ($isAdminSelfTask) {
                // Only the creator (same employee) can see this task.
                if (
                    !$employee instanceof Employee ||
                    $creator->getId() !== $employee->getId()
                ) {
                    continue;
                }
            }


            // Count attachments (for quick flags in list views)
            $attachmentsCount = 0;
            if (method_exists($task, 'getAttachments')) {
                $attachments = $task->getAttachments();
                if (is_iterable($attachments)) {
                    foreach ($attachments as $attachment) {
                        $attachmentsCount++;
                    }
                }
            }

            // Determine assigned-to label
            $assignedToLabel = null;
            if ($assignedEmployee instanceof Employee) {
                if ($employee instanceof Employee && $assignedEmployee->getId() === $employee->getId()) {
                    $assignedToLabel = 'You';
                } else {
                    $assignedToLabel = $assignedEmployee->getShortName() ?: 'Employee';
                }
            }

            // Look at the latest comment on this task, if any
            $lastComment = $this->commentRepository->findOneBy(
                ['task' => $task],
                ['createdAt' => 'DESC']
            );

            // Prepare a compact payload for the latest comment, if any
            $lastCommentPayload = null;
            if ($lastComment !== null) {
                $author = method_exists($lastComment, 'getAuthor') ? $lastComment->getAuthor() : null;
                $authorId = $author instanceof Employee ? $author->getId() : null;
                $authorShortName = $author instanceof Employee ? $author->getShortName() : null;
                $commentCreatedAt = method_exists($lastComment, 'getCreatedAt') ? $lastComment->getCreatedAt() : null;

                $lastCommentPayload = [
                    'id' => method_exists($lastComment, 'getId') ? $lastComment->getId() : null,
                    'content' => method_exists($lastComment, 'getContent') ? (string) $lastComment->getContent() : null,
                    'authorId' => $authorId,
                    'authorShortName' => $authorShortName,
                    'createdAt' => $commentCreatedAt instanceof \DateTimeInterface
                        ? $commentCreatedAt->setTimezone($cancunTz)->format('Y-m-d H:i:s')
                        : null,
                ];
            }

            // --- Latest event detector ---------------------------------------
            // We consider three possible event types:
            //   - "new"     : task creation
            //   - "status"  : status change (oldStatus != status)
            //   - "comment" : latest comment
            //
            // For each task we pick the most recent event by timestamp.
            $eventType = 'new';
            $eventTime = $createdAt instanceof \DateTimeInterface ? $createdAt : null;

            // Candidate: status change (requires oldStatus != status and an updatedAt timestamp)
            if ($oldStatus !== null && $status !== null && $oldStatus !== $status && $updatedAt instanceof \DateTimeInterface) {
                if ($eventTime === null || $updatedAt > $eventTime) {
                    $eventType = 'status';
                    $eventTime = $updatedAt;
                }
            }

            // Candidate: latest comment
            if ($lastComment !== null) {
                $commentCreatedAt = $lastComment->getCreatedAt();
                if ($commentCreatedAt instanceof \DateTimeInterface) {
                    if ($eventTime === null || $commentCreatedAt > $eventTime) {
                        $eventType = 'comment';
                        $eventTime = $commentCreatedAt;
                    }
                }
            }

            // Special rule:
            // If the only status change is from "open" to "in_progress" and there is
            // a comment at the same moment or later, we prefer treating the latest
            // event as a "comment" so the assignee sees a comment notification,
            // not a generic status update.
            if (
                $eventType === 'status'
                && $oldStatus === EmployeeTask::STATUS_OPEN
                && $status === EmployeeTask::STATUS_IN_PROGRESS
                && $lastComment !== null
            ) {
                $commentCreatedAt = $lastComment->getCreatedAt();
                if ($commentCreatedAt instanceof \DateTimeInterface) {
                    if ($eventTime === null || $commentCreatedAt >= $eventTime) {
                        $eventType = 'comment';
                        $eventTime = $commentCreatedAt;
                    }
                }
            }

            // Business rule: maintenance tasks should not create "new task" notifications.
            // They only appear in notifications after a status change or a comment.
            if ($isMaintenanceTask && $eventType === 'new') {
                continue;
            }

            // Global rule: any transition to "archived" is an internal acknowledgment transition and should
            // never generate notifications for anyone (maintenance or not).
            if (
                $eventType === 'status'
                && $status === EmployeeTask::STATUS_ARCHIVED
            ) {
                continue;
            }

            // For internal logic we keep $eventType as the canonical event:
            //   - new | status | comment
            // For UI we expose a separate $uiType that can be overridden to "overdue".
            $uiType = $eventType;
            if ($dueStatus === 'overdue') {
                $uiType = 'overdue';
            }

            // If the user has previously dismissed this task, only suppress the notification
            // if the latest event (creation/status-change/comment) is not newer than the
            // dismissal time. Newer events should still generate notifications.
            if (isset($dismissedTasks[$taskId])) {
                $dismissedAt = $dismissedTasks[$taskId];

                if ($dismissedAt instanceof \DateTimeInterface) {
                    if ($eventTime instanceof \DateTimeInterface) {
                        // If the latest event is older or equal to the dismissal, skip.
                        if ($eventTime <= $dismissedAt) {
                            continue;
                        }
                    } else {
                        // No meaningful event time; treat as already acknowledged.
                        continue;
                    }
                }
            }

            // ---------------- Actor-based routing (creator vs assignee) ----------------
            $updatedBy = method_exists($task, 'getUpdatedBy') ? $task->getUpdatedBy() : null;

            // --- Revised actor-based routing logic ---
            $creatorId = $creator instanceof Employee ? $creator->getId() : null;
            $assignedId = $assignedEmployee instanceof Employee ? $assignedEmployee->getId() : null;
            $currentId = $employee instanceof Employee ? $employee->getId() : null;

            $isAssigned = ($assignedId !== null && $currentId !== null && $assignedId === $currentId);
            $isCreator  = ($creatorId  !== null && $currentId !== null && $creatorId  === $currentId);

            // Defensive rule: if a status-change event exists but updatedBy was not recorded
            // (common when using API Platform PATCH directly), assume the assignee triggered
            // the change and do not show a status notification to the assignee.
            if ($eventType === 'status' && !($updatedBy instanceof Employee) && $isAssigned && !$isCreator) {
                continue;
            }

            // If current user is neither assigned nor creator, skip.
            if (!$isAssigned && !$isCreator) {
                continue;
            }

            // Determine actor of latest event based on the canonical event type
            $actor = null;
            if ($eventType === 'new') {
                $actor = $creator;
            } elseif ($eventType === 'status') {
                if ($updatedBy instanceof Employee) {
                    $actor = $updatedBy;
                } elseif ($creator instanceof Employee) {
                    $actor = $creator;
                } else {
                    $actor = $assignedEmployee;
                }
            } elseif ($eventType === 'comment' && $lastComment !== null && method_exists($lastComment, 'getAuthor')) {
                $actor = $lastComment->getAuthor();
            }

            $actorId = $actor instanceof Employee ? $actor->getId() : null;

            // 1) No notification for the actor
            if ($actorId !== null && $currentId !== null && $actorId === $currentId) {
                continue;
            }

            // 1b) Do not show "new task" notifications to the creator, even if the actor
            // could not be resolved correctly. This prevents admins/managers from seeing
            // notifications for tasks they themselves created for others.
            if ($isCreator && $eventType === 'new') {
                continue;
            }

            // 2) Routing logic uses the canonical event type (new|status|comment)
            if ($eventType === 'new') {
                if (!$isAssigned) {
                    continue;
                }
            } elseif ($eventType === 'status' || $eventType === 'comment') {
                // creator sees notifications only when assignee acts
                if ($isCreator && !$isAssigned) {
                    if ($actorId !== $assignedId) {
                        continue;
                    }
                }
                // assignee sees notifications only when creator acts
                elseif ($isAssigned && !$isCreator) {
                    if ($actorId !== $creatorId) {
                        continue;
                    }
                }
                // same person created & assigned -> no notifications for status/comment
                else {
                    continue;
                }
            }

            // Prefer a context-specific subtitle:
            //  - for "comment" notifications: latest comment content
            //  - otherwise: task description, falling back to a generic summary
            $description = method_exists($task, 'getDescription') ? (string) $task->getDescription() : '';
            $description = trim($description);

            $subtitle = null;

            if ($type === 'comment' && $lastComment !== null) {
                // Use latest comment content as subtitle, trimmed and single-line
                $rawContent = (string) $lastComment->getContent();
                $clean = trim(preg_replace('/\s+/', ' ', strip_tags($rawContent)));
                if ($clean !== '') {
                    // Soft limit to keep the card tidy
                    $subtitle = mb_strlen($clean) > 120 ? mb_substr($clean, 0, 120) . '…' : $clean;
                }
            }

            if ($subtitle === null) {
                if ($description !== '') {
                    $subtitle = $description;
                } else {
                    // Build a fallback summary: New/Overdue • Due dd/mm • Assigned to ...
                    $subtitleParts = [];
                    if ($uiType === 'overdue') {
                        $subtitleParts[] = 'Overdue';
                    } else {
                        $subtitleParts[] = 'New';
                    }

                    if ($dueDate instanceof \DateTimeInterface) {
                        $subtitleParts[] = 'Due ' . $dueDate->format('d/m');
                    }

                    if ($assignedToLabel) {
                        $subtitleParts[] = (strtolower($assignedToLabel) === 'you')
                            ? 'Assigned to you'
                            : 'Assigned to ' . $assignedToLabel;
                    }

                    $subtitle = implode(' • ', $subtitleParts);
                }
            }

            $items[] = [
                'id' => $task->getId(),
                'title' => $task->getTitle(),
                'notes' => method_exists($task, 'getNotes') ? $task->getNotes() : null,
                'subtitle' => $subtitle,
                'type' => $uiType,
                'dueDate' => $dueDate instanceof \DateTimeInterface
                    ? $dueDate->format('Y-m-d')
                    : null,
                'status' => $status,
                'priority' => $priority,
                'assignedToLabel' => $assignedToLabel,
                'oldStatus' => $oldStatus,
                'newStatus' => $status,
                'updatedAt' => $updatedAt instanceof \DateTimeInterface
                    ? $updatedAt->setTimezone($cancunTz)->format('Y-m-d H:i:s')
                    : null,
                'updatedByShortName' => null, // No longer using $latestUpdatedByShortName
                'createdAt' => $createdAt instanceof \DateTimeInterface
                    ? $createdAt->setTimezone($cancunTz)->format('Y-m-d H:i:s')
                    : null,
                'dueStatus' => $dueStatus,
                'lastComment' => $lastCommentPayload,
                'unitId' => $unit instanceof Unit ? $unit->getId() : null,
                'unitName' => $unit instanceof Unit ? $unit->getUnitName() : null,
                'isMaintenance' => $isMaintenanceTask,
                'maintenanceTaskCode' => $maintenanceTaskCode,
                'maintenanceLastDoneAt' => $maintenanceLastDoneAt,
                'attachmentsCount' => $attachmentsCount,
                'hasAttachments' => $attachmentsCount > 0,
            ];
        }

        return $items;
    }

    /**
     * General dashboard helper that supports multiple views:
     *  - notifications      (default): same semantics as getNotificationsForUser()
     *  - my                 : active tasks (all except completed/archived) assigned to the current employee
     *  - assigned_by_me     : active tasks (all except completed/archived) created by the current employee
     */
    public function getDashboardTasksForUser(?User $user, string $view = 'notifications'): array
    {
        $normalizedView = \in_array($view, ['notifications', 'my', 'assigned_by_me', 'maintenance', 'all'], true)
            ? $view
            : 'notifications';

        // Reuse the existing logic for the default "notifications" view
        if ($normalizedView === 'notifications') {
            return $this->getNotificationsForUser($user, 'employee');
        }

        $employee = $this->resolveEmployeeFromUser($user);
        if (!$employee instanceof Employee) {
            // Without an Employee profile we cannot reliably resolve "my" or "assigned_by_me"
            return [];
        }

        // Base query: active tasks (all except completed/archived)
        $qb = $this->taskRepository->createQueryBuilder('t')
            ->andWhere('t.status NOT IN (:excludedStatuses)')
            ->setParameter('excludedStatuses', [
                EmployeeTask::STATUS_COMPLETED,
                EmployeeTask::STATUS_ARCHIVED,
            ])
            ->orderBy('t.dueDate', 'ASC')
            ->addOrderBy('t.id', 'DESC');

        if ($normalizedView === 'my') {
            $qb->andWhere('t.employee = :employee');
            $qb->setParameter('employee', $employee);
        } elseif ($normalizedView === 'assigned_by_me') {
            $qb->andWhere('t.createdBy = :employee');
            $qb->setParameter('employee', $employee);
        } elseif ($normalizedView === 'maintenance') {
            // Maintenance tab: tasks assigned to the current employee that are linked to a maintenance schedule.
            $qb->andWhere('t.employee = :employee');
            $qb->setParameter('employee', $employee);

            // Prefer explicit relation when available.
            if (property_exists(EmployeeTask::class, 'maintenanceSchedule')) {
                $qb->andWhere('t.maintenanceSchedule IS NOT NULL');
            }
        }

        /** @var EmployeeTask[] $tasks */
        $tasks = $qb->getQuery()->getResult();

        $cancunTz = new \DateTimeZone('America/Cancun');
        $today = new \DateTimeImmutable('today', $cancunTz);
        $items = [];

        foreach ($tasks as $task) {
            $dueDate = method_exists($task, 'getDueDate') ? $task->getDueDate() : null;
            $status = method_exists($task, 'getStatus') ? $task->getStatus() : null;
            $assignedEmployee = method_exists($task, 'getEmployee') ? $task->getEmployee() : null;
            $unit = method_exists($task, 'getUnit') ? $task->getUnit() : null;
            $priority = method_exists($task, 'getPriority') ? $task->getPriority() : null;
            $updatedAt = method_exists($task, 'getUpdatedAt') ? $task->getUpdatedAt() : null;
            $createdAt = method_exists($task, 'getCreatedAt') ? $task->getCreatedAt() : null;
            $dueStatus = $this->computeDueStatus($task, $today, $cancunTz);

            // For programmed maintenance tasks linked to a maintenance schedule,
            // only surface them when the due date is within the next 5 days (inclusive).
            $isMaintenanceTask = false;
            $maintenanceTaskCode = null;
            $schedule = null;

            if (method_exists($task, 'getMaintenanceSchedule')) {
                $schedule = $task->getMaintenanceSchedule();
                if ($schedule) {
                    $isMaintenanceTask = true;
                    if (method_exists($schedule, 'getTaskCode')) {
                        $maintenanceTaskCode = $schedule->getTaskCode();
                    }
                }
            }

            $maintenanceLastDoneAt = null;
            if ($schedule && method_exists($schedule, 'getLastDoneAt')) {
                $ldt = $schedule->getLastDoneAt();
                if ($ldt instanceof \DateTimeInterface) {
                    $maintenanceLastDoneAt = $ldt->setTimezone($cancunTz)->format('Y-m-d H:i:s');
                }
            }

            if ($isMaintenanceTask) {
                if (!$dueDate instanceof \DateTimeInterface) {
                    // Skip maintenance tasks without a proper due date.
                    continue;
                }

                // Normalize to Cancun date-only for comparison
                $dueLocal = (clone $dueDate)->setTimezone($cancunTz);
                $dueDateOnly = new \DateTimeImmutable($dueLocal->format('Y-m-d'), $cancunTz);
                $todayDate = new \DateTimeImmutable($today->format('Y-m-d'), $cancunTz);

                $diffDays = (int) $todayDate->diff($dueDateOnly)->format('%r%a');

                // If due date is more than 5 days in the future, hide it from the dashboard list.
                if ($diffDays > 5) {
                    continue;
                }
            }

            // In maintenance view, only return maintenance tasks.
            if ($normalizedView === 'maintenance' && !$isMaintenanceTask) {
                continue;
            }

            $creator = method_exists($task, 'getCreatedBy') ? $task->getCreatedBy() : null;
            $creatorId = $creator instanceof Employee ? $creator->getId() : null;
            $creatorShortName = $creator instanceof Employee ? $creator->getShortName() : null;

            // Privacy rule: admin self-tasks (admin creates task for themselves)
            // are only visible to that admin, across all non-notification views.
            $isAdminSelfTask = false;
            if ($creator instanceof Employee && $assignedEmployee instanceof Employee) {
                if ($creator->getId() === $assignedEmployee->getId()) {
                    $creatorUser = method_exists($creator, 'getUser') ? $creator->getUser() : null;
                    if ($creatorUser instanceof User && method_exists($creatorUser, 'getRoles')) {
                        $roles = $creatorUser->getRoles();
                        if (is_array($roles) && \in_array('ROLE_ADMIN', $roles, true)) {
                            $isAdminSelfTask = true;
                        }
                    }
                }
            }

            if ($isAdminSelfTask) {
                // Only the creator (same employee) can see this task in dashboard lists.
                if ($employee->getId() !== $creator->getId()) {
                    continue;
                }
            }

            // Count attachments (for quick flags in list views)
            $attachmentsCount = 0;
            if (method_exists($task, 'getAttachments')) {
                $attachments = $task->getAttachments();
                if (is_iterable($attachments)) {
                    foreach ($attachments as $attachment) {
                        $attachmentsCount++;
                    }
                }
            }

            // Look at the latest comment on this task, if any (for My / Assigned-by-me views)
            $lastComment = $this->commentRepository->findOneBy(
                ['task' => $task],
                ['createdAt' => 'DESC']
            );

            $lastCommentPayload = null;
            if ($lastComment !== null) {
                $author = method_exists($lastComment, 'getAuthor') ? $lastComment->getAuthor() : null;
                $authorId = $author instanceof Employee ? $author->getId() : null;
                $authorShortName = $author instanceof Employee ? $author->getShortName() : null;
                $commentCreatedAt = method_exists($lastComment, 'getCreatedAt') ? $lastComment->getCreatedAt() : null;

                $lastCommentPayload = [
                    'id' => method_exists($lastComment, 'getId') ? $lastComment->getId() : null,
                    'content' => method_exists($lastComment, 'getContent') ? (string) $lastComment->getContent() : null,
                    'authorId' => $authorId,
                    'authorShortName' => $authorShortName,
                    'createdAt' => $commentCreatedAt instanceof \DateTimeInterface
                        ? $commentCreatedAt->setTimezone($cancunTz)->format('Y-m-d H:i:s')
                        : null,
                ];
            }

            // Determine assigned-to label
            $assignedToLabel = null;
            if ($assignedEmployee instanceof Employee) {
                if ($assignedEmployee->getId() === $employee->getId()) {
                    $assignedToLabel = 'You';
                } else {
                    $assignedToLabel = $assignedEmployee->getShortName() ?: 'Employee';
                }
            }

            // Determine notification type, reused for consistency.
            // We only flag "overdue" here; "close_to_overdue" is exposed via dueStatus.
            $type = 'new';
            if ($dueStatus === 'overdue') {
                $type = 'overdue';
            }

            // Prefer the task description as subtitle, falling back to a generated summary.
            $description = method_exists($task, 'getDescription') ? (string) $task->getDescription() : '';
            $description = trim($description);

            if ($description !== '') {
                $subtitle = $description;
            } else {
                // Build a fallback summary: New/Overdue • Due dd/mm • Assigned to ...
                $subtitleParts = [];
                if ($type === 'overdue') {
                    $subtitleParts[] = 'Overdue';
                } else {
                    $subtitleParts[] = 'New';
                }

                if ($dueDate instanceof \DateTimeInterface) {
                    $subtitleParts[] = 'Due ' . $dueDate->format('d/m');
                }

                if ($assignedToLabel) {
                    $subtitleParts[] = (strtolower($assignedToLabel) === 'you')
                        ? 'Assigned to you'
                        : 'Assigned to ' . $assignedToLabel;
                }

                $subtitle = implode(' • ', $subtitleParts);
            }

            $items[] = [
                'id' => $task->getId(),
                'title' => $task->getTitle(),
                'notes' => method_exists($task, 'getNotes') ? $task->getNotes() : null,
                'subtitle' => $subtitle,
                'type' => $type,
                'dueDate' => $dueDate instanceof \DateTimeInterface
                    ? $dueDate->format('Y-m-d')
                    : null,
                'status' => $status,
                'priority' => $priority,
                'assignedToLabel' => $assignedToLabel,
                'oldStatus' => null,
                'newStatus' => $status,
                'updatedAt' => $updatedAt instanceof \DateTimeInterface
                    ? $updatedAt->setTimezone($cancunTz)->format('Y-m-d H:i:s')
                    : null,
                'createdAt' => $createdAt instanceof \DateTimeInterface
                    ? $createdAt->setTimezone($cancunTz)->format('Y-m-d H:i:s')
                    : null,
                'dueStatus' => $dueStatus,
                'lastComment' => $lastCommentPayload,
                'unitId' => $unit instanceof Unit ? $unit->getId() : null,
                'unitName' => $unit instanceof Unit ? $unit->getUnitName() : null,
                'isMaintenance' => $isMaintenanceTask,
                'maintenanceTaskCode' => $maintenanceTaskCode,
                'maintenanceLastDoneAt' => $maintenanceLastDoneAt,
                'attachmentsCount' => $attachmentsCount,
                'hasAttachments' => $attachmentsCount > 0,
                'createdById' => $creatorId,
                'createdByShortName' => $creatorShortName,
            ];
        }

        // Sort items so that:
        //  1) Overdue tasks come first (dueStatus = 'overdue'), ordered by dueDate ASC.
        //  2) Then "close to overdue" (dueStatus = 'close_to_overdue'), ordered by dueDate ASC.
        //  3) Remaining tasks with a dueDate (no dueStatus) ordered by dueDate ASC.
        //  4) Finally tasks with no dueDate at all, ordered by createdAt ASC.
        usort($items, static function (array $a, array $b): int {
            $priorityFn = static function (array $item): int {
                $dueStatus = $item['dueStatus'] ?? null;
                if ($dueStatus === 'overdue') {
                    return 0;
                }
                if ($dueStatus === 'close_to_overdue') {
                    return 1;
                }
                // All others (no dueStatus) share the same priority bucket (2),
                // but we'll further split them by presence/absence of dueDate below.
                return 2;
            };

            $pa = $priorityFn($a);
            $pb = $priorityFn($b);

            if ($pa !== $pb) {
                return $pa <=> $pb;
            }

            // Same group: for overdue / close_to_overdue, sort by dueDate ASC, then createdAt ASC.
            if ($pa === 0 || $pa === 1) {
                $da = $a['dueDate'] ?? null;
                $db = $b['dueDate'] ?? null;

                if ($da !== $db) {
                    if ($da === null) {
                        return 1;
                    }
                    if ($db === null) {
                        return -1;
                    }
                    return strcmp($da, $db);
                }

                $ca = $a['createdAt'] ?? null;
                $cb = $b['createdAt'] ?? null;

                return strcmp((string) $ca, (string) $cb);
            }

            // Group 3 (no dueStatus):
            //  - first tasks WITH a dueDate, ordered by dueDate ASC
            //  - then tasks WITHOUT dueDate, ordered by createdAt ASC
            $da = $a['dueDate'] ?? null;
            $db = $b['dueDate'] ?? null;

            // Both have a dueDate -> sort by dueDate ASC.
            if ($da !== null && $db !== null) {
                return strcmp($da, $db);
            }

            // Only one has a dueDate -> the one with dueDate comes first.
            if ($da !== null && $db === null) {
                return -1;
            }
            if ($da === null && $db !== null) {
                return 1;
            }

            // Neither has a dueDate -> sort by createdAt ASC.
            $ca = $a['createdAt'] ?? null;
            $cb = $b['createdAt'] ?? null;

            return strcmp((string) $ca, (string) $cb);
        });

        return $items;
    }
    /**
     * Mark a task as seen by the current user and optionally update its status.
     *
     * This is intended to be used by the dashboard "teal check" or when the
     * user opens the task from the notifications card. It both:
     *  - persists an AlertDismissal row with category = "task_notification"
     *    and token = "task:{id}" for the current User
     *  - optionally updates the task status using updateStatus()
     *
     * If $newStatus is null, the task status is left unchanged.
     */
    public function markTaskSeen(EmployeeTask $task, ?User $user, ?string $newStatus = null): void
    {
        if (!$user instanceof User) {
            return;
        }

        // Optional status change (e.g. "ongoing"/"in_progress")
        // When we change the status via this helper, we also mark "updatedBy"
        // as the current employee so that notifications attribute the latest
        // status-change event to the correct actor (assignee or creator).
        if ($newStatus !== null) {
            $employee = $this->resolveEmployeeFromUser($user);
            if ($employee instanceof Employee && method_exists($task, 'setUpdatedBy')) {
                $task->setUpdatedBy($employee);
            }
            $this->updateStatus($task, $newStatus);
        }

        $token = 'task:' . $task->getId();

        /** @var \Doctrine\Persistence\ObjectRepository $repo */
        $repo = $this->em->getRepository(AlertDismissal::class);

        $dismissal = $repo->findOneBy([
            'category'    => 'task_notification',
            'token'       => $token,
            'dismissedBy' => $user,
        ]);

        if (!$dismissal instanceof AlertDismissal) {
            $dismissal = new AlertDismissal();
            $dismissal
                ->setCategory('task_notification')
                ->setToken($token)
                ->setDismissedBy($user);
        }

        $dismissal->setDismissedAt(new \DateTimeImmutable('now'));

        $this->em->persist($dismissal);
        $this->em->flush();
    }
    /**
     * Attach uploaded files to a task.
     *
     * This mirrors the high-level behaviour of EmployeeCashLedgerService for now:
     *  - Enforces a maximum of 5 attachments per task
     *  - Delegates the actual persistence / storage to the document layer (to be wired later)
     *
     * For now this method focuses on enforcing limits and providing a single integration
     * point for controllers. The underlying storage can be implemented later, similar to
     * how EmployeeCashLedgerService::create()/update() handle $files.
     *
     * @param EmployeeTask $task
     * @param array        $files      Array of UploadedFile instances (or empty)
     * @param Employee|null $employee  Optional employee performing the action (for auditing)
     */
    public function addAttachments(EmployeeTask $task, array $files, ?Employee $employee = null): void
    {
        if (empty($files)) {
            return;
        }

        // Normalize $files into a flat array (defensive)
        $normalizedFiles = [];
        foreach ($files as $file) {
            if ($file === null) {
                continue;
            }
            // We intentionally avoid hard-typing to UploadedFile here to keep this service
            // decoupled from HttpFoundation; controllers guarantee the correct types.
            $normalizedFiles[] = $file;
        }

        if (empty($normalizedFiles)) {
            return;
        }

        // Enforce a maximum of 5 attachments per task, counting existing ones.
        $existingCount = 0;
        if (method_exists($task, 'getAttachments')) {
            $existingAttachments = $task->getAttachments();
            if (is_iterable($existingAttachments)) {
                foreach ($existingAttachments as $att) {
                    $existingCount++;
                }
            }
        }

        $newCount = \count($normalizedFiles);
        if ($existingCount + $newCount > 5) {
            throw new \InvalidArgumentException('You can upload a maximum of 5 files for each task.');
        }

        // At this point we have validated counts and normalised input.
        // Mirror the EmployeeCashLedgerService pattern: create an UploadRequestDTO
        // and AttachOptions per file, call uploadAndAttach(), then link the attachment
        // back to this task entity.
        foreach ($normalizedFiles as $file) {
            $description = $task->getDescription() ?? $task->getTitle() ?? 'Task attachment';

            $dto = new UploadRequestDTO(
                transactionType: 'task',
                costCentre: null,
                category: 'Tasks',
                description: $description,
                file: $file
            );

            $opts = new AttachOptions(
                targetType: 'employee_task',
                targetId: $task->getId(),
                category: 'Task',
                mode: 'allow-many',
                scope: 'per-parent'
            );

            $attachment = $this->documentUploadService->uploadAndAttach($dto, $opts);

            if (method_exists($attachment, 'setEmployeeTask')) {
                $attachment->setEmployeeTask($task);
                $this->em->persist($attachment);
            }

            if (method_exists($task, 'addAttachment')) {
                $task->addAttachment($attachment);
            }
        }

        // Persist the relation updates (employee_task_id on attachments)
        $this->em->flush();
    }

    /**
     * Delete a task and clean up all related data:
     *  - employee_task_comment rows
     *  - attachments linked to the task (including their UnitDocumentAttachment rows)
     *  - underlying UnitDocument + S3 objects when they become orphaned
     *
     * This helper is intended to back the DELETE /api/employee-tasks/{id}
     * endpoint so that the UI can safely remove a task from the system.
     */
    public function deleteTaskWithCascade(int $taskId): void
    {
        if ($taskId <= 0) {
            return;
        }

        /** @var EmployeeTask|null $task */
        $task = $this->taskRepository->find($taskId);
        if (!$task instanceof EmployeeTask) {
            return;
        }

        // 1) Remove attachments via the existing helper so that UnitDocument +
        // S3 cleanup logic is reused. We keep a local snapshot of IDs to avoid
        // mutating the collection while iterating.
        if (method_exists($task, 'getAttachments')) {
            $attachments = $task->getAttachments();
            if (is_iterable($attachments)) {
                $attachmentIds = [];
                foreach ($attachments as $attachment) {
                    if ($attachment instanceof UnitDocumentAttachment && method_exists($attachment, 'getId')) {
                        $attachmentIds[] = (int) $attachment->getId();
                    }
                }

                foreach ($attachmentIds as $attId) {
                    $this->removeAttachment($taskId, $attId);
                }
            }
        }

        // 2) Remove comments associated with this task.
        // Prefer the collection on the entity if available; otherwise fall back
        // to a repository query.
        $commentsToRemove = [];
        if (method_exists($task, 'getComments')) {
            $comments = $task->getComments();
            if (is_iterable($comments)) {
                foreach ($comments as $comment) {
                    $commentsToRemove[] = $comment;
                }
            }
        } else {
            $commentsToRemove = $this->commentRepository->findBy(['task' => $task]);
        }

        foreach ($commentsToRemove as $comment) {
            $this->em->remove($comment);
        }

        // 3) Finally remove the task itself.
        $this->em->remove($task);
        $this->em->flush();
    }

    /**
     * Remove a single attachment by taskId + attachmentId.
     *
     * This is a convenience helper for controllers / APIs that operate on IDs
     * rather than hydrated entities. It will:
     *  - ensure the task exists
     *  - ensure the attachment belongs to that task
     *  - remove the UnitDocumentAttachment row
     *  - if the underlying UnitDocument is now orphaned (no more attachments),
     *    delegate deletion to DocumentUploadService so the S3 object and
     *    UnitDocument row are cleaned up as well.
     *
     * Silently returns if the task or attachment are not found or do not match.
     */
    public function removeAttachment(int $taskId, int $attachmentId): void
    {
        if ($taskId <= 0 || $attachmentId <= 0) {
            return;
        }

        /** @var EmployeeTask|null $task */
        $task = $this->taskRepository->find($taskId);
        if (!$task instanceof EmployeeTask) {
            return;
        }

        /** @var UnitDocumentAttachment|null $attachment */
        $attachment = $this->em->getRepository(UnitDocumentAttachment::class)->find($attachmentId);
        if (!$attachment instanceof UnitDocumentAttachment) {
            return;
        }

        // Ensure this attachment actually belongs to the given task
        if (method_exists($attachment, 'getEmployeeTask')) {
            $owner = $attachment->getEmployeeTask();
            if (!$owner instanceof EmployeeTask || $owner->getId() !== $task->getId()) {
                // Attachment does not belong to this task; do nothing.
                return;
            }
        }

        // Capture the underlying document before removal
        $document = method_exists($attachment, 'getDocument') ? $attachment->getDocument() : null;

        // Remove the attachment row
        $this->em->remove($attachment);
        $this->em->flush();

        // If there is a backing document and it no longer has any attachments
        // in the database, delegate deletion to DocumentUploadService so S3 +
        // UnitDocument are cleaned up consistently.
        if ($document) {
            $attachmentRepo = $this->em->getRepository(UnitDocumentAttachment::class);
            $remainingCount = $attachmentRepo->count(['document' => $document]);

            if ($remainingCount === 0) {
                // This will remove the UnitDocument row and the S3 object.
                $this->documentUploadService->delete($document);
            }
        }
    }

    /**
     * Remove attachments from a task by their IDs.
     *
     * This is a generic helper that operates on the task's getAttachments()
     * collection (if present) and removes any attachment whose id is in the
     * provided $attachmentIds list. It intentionally does not make assumptions
     * about the concrete attachment entity type, so that it can be adapted
     * once the attachment model is finalised.
     *
     * @param EmployeeTask $task
     * @param array        $attachmentIds  List of attachment IDs to remove
     */
    public function removeAttachmentsFromTask(EmployeeTask $task, array $attachmentIds): void
    {
        if (empty($attachmentIds)) {
            return;
        }

        if (!method_exists($task, 'getAttachments')) {
            return;
        }

        $attachmentIds = array_map('intval', $attachmentIds);
        $attachmentIds = array_filter($attachmentIds, static fn ($id) => $id > 0);

        if (empty($attachmentIds)) {
            return;
        }

        $attachments = $task->getAttachments();
        if (!is_iterable($attachments)) {
            return;
        }

        foreach ($attachments as $attachment) {
            if (!method_exists($attachment, 'getId')) {
                continue;
            }
            $attId = (int) $attachment->getId();
            if (\in_array($attId, $attachmentIds, true)) {
                // For now we simply remove the attachment entity.
                // If there is a shared UnitDocument / file-layer underneath,
                // a separate cleanup step can be added similar to the logic
                // in EmployeeCashLedgerService.
                $this->em->remove($attachment);
            }
        }

        $this->em->flush();
    }
}
