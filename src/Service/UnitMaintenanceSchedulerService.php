<?php

namespace App\Service;

use App\Entity\UnitMaintenanceSchedule;
use App\Entity\EmployeeTask;
use App\Entity\Employee;
use App\Repository\UnitMaintenanceScheduleRepository;
use App\Repository\EmployeeRepository;
use Doctrine\ORM\EntityManagerInterface;
use DateTimeImmutable;
use DateTimeZone;

class UnitMaintenanceSchedulerService
{
    private const PLAYA_CITY = 'Playa del Carmen';
    private const SUPERVISOR_EMPLOYEE_ID = 7;
    private const ADMIN_EMPLOYEE_ID = 1;

    public function __construct(
        private UnitMaintenanceScheduleRepository $scheduleRepo,
        private EmployeeRepository $employeeRepo,
        private EntityManagerInterface $em,
    ) {}

    public function run(?DateTimeImmutable $now = null): int
    {
        if ($now === null) {
            $now = new DateTimeImmutable('now', new DateTimeZone('America/Cancun'));
        }

        $supervisor = $this->employeeRepo->find(self::SUPERVISOR_EMPLOYEE_ID);
        $admin = $this->employeeRepo->find(self::ADMIN_EMPLOYEE_ID);
        if (!$supervisor || !$admin) {
            return 0;
        }

        $created = 0;
        $schedules = $this->scheduleRepo->findAll();
        foreach ($schedules as $schedule) {
            if (!$schedule->isEnabled()) {
                continue;
            }
            $unit = $schedule->getUnit();
            if (!$unit) {
                continue;
            }
            if ($unit->getStatus() !== 'Active') {
                continue;
            }
            if ($unit->getCity() !== self::PLAYA_CITY) {
                continue;
            }

            $nextDueAt = $schedule->getNextDueAt();
            $justInitialized = false;

            // If last_done_at exists, next_due_at should be anchored to it.
            // This allows manual fixes to last_done_at (or first completion) to realign scheduling.
            $lastDoneAt = $schedule->getLastDoneAt();
            if ($lastDoneAt instanceof \DateTimeInterface) {
                $anchoredNext = $this->computeNextDueFromLastDone($schedule, $lastDoneAt);

                // Update only if different (compare to minute precision to avoid noise).
                $currentKey = $nextDueAt instanceof \DateTimeInterface ? $nextDueAt->format('Y-m-d H:i') : null;
                $anchoredKey = $anchoredNext->format('Y-m-d H:i');

                if ($currentKey !== $anchoredKey) {
                    $schedule->setNextDueAt($anchoredNext);
                    $this->em->persist($schedule);
                    $nextDueAt = $anchoredNext;
                }
            }

            if ($nextDueAt === null) {
                // First-time initialization: assign a dispersed due date
                // and allow immediate task creation regardless of lead time.
                $nextDueAt = $this->computeInitialNextDue($schedule, $now);
                $schedule->setNextDueAt($nextDueAt);
                $this->em->persist($schedule);
                $justInitialized = true;
            }

            // For existing schedules, only create tasks when we are within
            // 5 days of the next due date. For newly initialized schedules
            // we skip this check so a first task is created immediately.
            if (!$justInitialized) {
                $leadThreshold = $now->modify('+5 days');

                if ($nextDueAt > $leadThreshold) {
                    // Too early — wait until we are within 5 days of due date
                    continue;
                }
            }

            if ($this->hasOpenTaskForSchedule($schedule)) {
                continue;
            }

            $task = new EmployeeTask();
            $task->setEmployee($supervisor);
            $task->setCreatedBy($admin);
            $task->setUnit($unit);
            $task->setTitle($this->buildTitle($schedule));
            $task->setDescription($this->buildDescription($schedule));
            $task->setStatus('in_progress');
            if (method_exists($task, 'setOldStatus')) {
                $task->setOldStatus('in_progress');
            }
            $task->setPriority('normal');
            $task->setCreatedAt($now);
            $task->setUpdatedAt($now);
            $task->setDueDate($schedule->getNextDueAt());
            $task->setMaintenanceSchedule($schedule);
            $this->em->persist($task);
            $created++;
        }
        $this->em->flush();
        return $created;
    }

    private function computeInitialNextDue(UnitMaintenanceSchedule $schedule, DateTimeImmutable $now): DateTimeImmutable
    {
        // First date starts 5 days from "now".
        $minOffsetDays = 5;

        // We want to ensure a maximum of 3 units per day on initial seeding.
        // Use the schedule ID as a stable index and group by buckets of 3.
        $id = $schedule->getId() ?? 0;
        $index = max($id - 1, 0); // zero-based index
        $dayBucket = intdiv($index, 3); // 0,0,0,1,1,1,2,2,2, ...

        $offsetDays = $minOffsetDays + $dayBucket;

        return $now
            ->setTime(9, 0)
            ->modify('+' . $offsetDays . ' days');
    }

    private function computeNextDueFromLastDone(UnitMaintenanceSchedule $schedule, \DateTimeInterface $lastDoneAt): DateTimeImmutable
    {
        $tz = new DateTimeZone('America/Cancun');

        // Normalize to Cancun date/time baseline at 09:00.
        $base = DateTimeImmutable::createFromInterface($lastDoneAt)
            ->setTimezone($tz)
            ->setTime(9, 0);

        $weeks = (int) ($schedule->getFrequencyWeeks() ?? 0);
        $months = (int) ($schedule->getFrequencyMonths() ?? 0);

        if ($weeks > 0) {
            return $base->modify('+' . $weeks . ' weeks');
        }
        if ($months > 0) {
            return $base->modify('+' . $months . ' months');
        }

        // Fallback: 4 weeks
        return $base->modify('+4 weeks');
    }

    private function hasOpenTaskForSchedule(UnitMaintenanceSchedule $schedule): bool
    {
        $qb = $this->em->createQueryBuilder();
        $qb->select('t')
            ->from(EmployeeTask::class, 't')
            ->where('t.maintenanceSchedule = :schedule')
            ->andWhere($qb->expr()->notIn('t.status', ':closed'))
            ->setParameter('schedule', $schedule)
            ->setParameter('closed', [
                'Archived', 'archived', 'Completed', 'completed', 'Done', 'done'
            ])
            ->setMaxResults(1);
        return (bool)$qb->getQuery()->getOneOrNullResult();
    }

    private function buildTitle(UnitMaintenanceSchedule $schedule): string
    {
        $unitName = $schedule->getUnit()?->getUnitName() ?? ('Unidad #' . $schedule->getUnit()?->getId());
        switch ($schedule->getTaskCode()) {
            case 'monthly_preventive':
                $base = 'Mantenimiento Preventivo';
                break;
            case 'ac_full_maintenance':
                $base = 'Mantenimiento AC';
                break;
            default:
                $base = 'Mantenimiento';
        }
        return $base;
    }

    private function buildDescription(UnitMaintenanceSchedule $schedule): string
    {
        switch ($schedule->getTaskCode()) {
            case 'monthly_preventive':
                return 'Limpiar filtros AC, destapar desagues, aplicar anti sarro baños y grifos.';
            case 'ac_full_maintenance':
                return 'Programar mantenimiento general de AC con técnico externo: limpieza unidades interiores/exteriores, revisión de gas y funcionamiento.';
            default:
                return 'Tarea de mantenimiento programada: ' . ($schedule->getLabel() ?? $schedule->getTaskCode()) . '.';
        }
    }
    /**
     * Ensure a new Active Playa unit gets its two default schedules:
     * - monthly_preventive (every 4 weeks)
     * - ac_full_maintenance (every 4 months)
     *
     * $activeAt = date when unit became active (defaults to now, Cancun time)
     */
    public function ensureDefaultSchedulesForUnit($unit, ?\DateTimeImmutable $activeAt = null): void
    {
        // Only for Active + Playa units
        if (!$unit || $unit->getStatus() !== 'Active' || $unit->getCity() !== self::PLAYA_CITY) {
            return;
        }

        // Determine the baseline date
        $tz = new \DateTimeZone('America/Cancun');
        $activeAt = $activeAt ?? new \DateTimeImmutable('now', $tz);

        // Prevent duplicates
        $monthly = $this->scheduleRepo->findOneBy([
            'unit' => $unit,
            'taskCode' => 'monthly_preventive',
        ]);

        if (!$monthly) {
            $schedule = new UnitMaintenanceSchedule();
            $schedule
                ->setUnit($unit)
                ->setTaskCode('monthly_preventive')
                ->setLabel('Mantenimiento Preventivo – AC + Plomería')
                ->setFrequencyWeeks(4)
                ->setIsEnabled(true)
                ->setLastDoneAt(null)
                ->setNextDueAt($activeAt->modify('+4 weeks'));
            $this->em->persist($schedule);
        }

        $ac = $this->scheduleRepo->findOneBy([
            'unit' => $unit,
            'taskCode' => 'ac_full_maintenance',
        ]);

        if (!$ac) {
            $schedule = new UnitMaintenanceSchedule();
            $schedule
                ->setUnit($unit)
                ->setTaskCode('ac_full_maintenance')
                ->setLabel('Mantenimiento AC – Servicio general')
                ->setFrequencyMonths(4)
                ->setIsEnabled(true)
                ->setLastDoneAt(null)
                ->setNextDueAt($activeAt->modify('+4 months'));
            $this->em->persist($schedule);
        }

        $this->em->flush();
    }
}