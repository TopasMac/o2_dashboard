<?php

namespace App\Service;

use App\Entity\Employee;
use App\Entity\EmployeeCashLedger;
use App\Entity\O2Transactions;
use App\Entity\HKTransactions;
use App\Entity\UnitTransactions;
use App\Entity\UnitDocumentAttachment;
use App\Entity\UnitDocument;
use App\Repository\EmployeeCashLedgerRepository;
use App\Service\Document\DocumentUploadService;
use Symfony\Bundle\SecurityBundle\Security;
use App\Service\Document\UploadRequestDTO;
use App\Service\Document\AttachOptions;
use Doctrine\ORM\EntityManagerInterface;

class EmployeeCashLedgerService
{
    private EntityManagerInterface $em;
    private EmployeeCashLedgerRepository $repo;
    private DocumentUploadService $documentUploadService;
    private ?Security $security;

    public function __construct(
        EntityManagerInterface $em,
        EmployeeCashLedgerRepository $repo,
        DocumentUploadService $documentUploadService,
        ?Security $security = null
    ) {
        $this->em = $em;
        $this->repo = $repo;
        $this->documentUploadService = $documentUploadService;
        $this->security = $security;
    }

    /**
     * List/search cash ledger entries and return them as plain arrays for the API.
     */
    public function list(
        ?int $employeeId,
        ?string $status,
        ?string $type,
        ?string $division,
        ?string $city
    ): array {
        $rows = $this->repo->search($employeeId, $status, $type, $division, $city);

        // Compute running balance per row (excluding the effect of Rejected rows)
        $balanceById = [];
        $current = 0.0;

        // Sort rows by date ASC, then createdAt ASC, then id ASC, so balance is chronological
        $sorted = $rows;
        usort($sorted, function (EmployeeCashLedger $a, EmployeeCashLedger $b): int {
            // Primary chronology: business date
            $cmp = $a->getDate() <=> $b->getDate();
            if ($cmp !== 0) {
                return $cmp;
            }
            // Tie-breaker: creation timestamp
            $cmp = $a->getCreatedAt() <=> $b->getCreatedAt();
            if ($cmp !== 0) {
                return $cmp;
            }
            // Final tie-breaker: id
            return ($a->getId() ?? 0) <=> ($b->getId() ?? 0);
        });

        foreach ($sorted as $row) {
            // Rejected rows do not affect the running balance, but still show the current balance
            if ($row->getStatus() !== EmployeeCashLedger::STATUS_REJECTED) {
                $delta = $this->signedDelta($row);
                $current += $delta;
            }

            $balanceById[$row->getId()] = number_format($current, 2, '.', '');
        }

        return array_map(
            function (EmployeeCashLedger $row) use ($balanceById) {
                $balance = $balanceById[$row->getId()] ?? null;
                return $this->toArray($row, $balance);
            },
            $rows
        );
    }

    /**
     * Create a new cash ledger row.
     *
     * Required:
     *  - employeeId
     *  - type (CashAdvance, GuestPayment, CashReturn, Expense, Other)
     *  - amount
     *
     * Optional:
     *  - notes
     *  - status (validated; defaults to PENDING if not provided – admin flows
     *            can still explicitly send APPROVED when needed)
     *
     * Derived (ignored from payload and computed server-side):
     *  - division   (from Employee::getDivision)
     *  - city       (from Employee::getCity)
     *  - costCentre (from division + city)
     *  - code       (auto-generated ECASHxxxxx)
     */
    public function create(array $payload, array $files = []): EmployeeCashLedger
    {
        if (empty($payload['employeeId'])) {
            throw new \InvalidArgumentException('employeeId is required');
        }
        if (empty($payload['type'])) {
            throw new \InvalidArgumentException('type is required');
        }
        if (!isset($payload['amount'])) {
            throw new \InvalidArgumentException('amount is required');
        }

        $employee = $this->em->getRepository(Employee::class)->find((int) $payload['employeeId']);
        if (!$employee) {
            throw new \InvalidArgumentException('Employee not found: ' . (int) $payload['employeeId']);
        }

        $type = (string) $payload['type'];
        $allowedTypes = [
            EmployeeCashLedger::TYPE_CASH_ADVANCE,
            EmployeeCashLedger::TYPE_GUEST_PAYMENT,
            EmployeeCashLedger::TYPE_CASH_RETURN,
            EmployeeCashLedger::TYPE_EXPENSE,
            EmployeeCashLedger::TYPE_OTHER,
        ];
        if (!in_array($type, $allowedTypes, true)) {
            throw new \InvalidArgumentException('Invalid type: ' . $type);
        }

        $amount = (float) $payload['amount'];
        if ($amount <= 0) {
            throw new \InvalidArgumentException('amount must be greater than zero');
        }

        // Date: use payload date (YYYY-MM-DD) if provided, otherwise today (UTC)
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $date = $now;
        if (!empty($payload['date']) && is_string($payload['date'])) {
            $parsed = \DateTimeImmutable::createFromFormat('Y-m-d', $payload['date'], new \DateTimeZone('UTC'));
            if ($parsed instanceof \DateTimeImmutable) {
                $date = $parsed;
            }
        }

        // Division / City are always derived from the Employee; payload values are ignored.
        $division = method_exists($employee, 'getDivision') ? $employee->getDivision() : null;
        $city     = method_exists($employee, 'getCity') ? $employee->getCity() : null;

        // costCentre is always inferred from division + city; client payload is ignored.
        $costCentre = null;
        if ($division) {
            $divisionNorm = strtolower(trim((string) $division));

            // Normalize city into one of: general, playa, tulum
            $cityNorm = strtolower(trim((string) ($city ?? '')));
            $suffix = 'general';
            if (str_contains($cityNorm, 'playa')) {
                $suffix = 'playa';
            } elseif (str_contains($cityNorm, 'tulum')) {
                $suffix = 'tulum';
            }

            if ($divisionNorm === 'owners2') {
                // Owners2 + General/Playa del Carmen/Tulum
                $costCentre = 'O2_' . $suffix; // O2_general, O2_playa, O2_tulum
            } elseif ($divisionNorm === 'housekeepers') {
                // Housekeepers + General/Playa del Carmen/Tulum
                $costCentre = 'HK_' . $suffix; // HK_general, HK_playa, HK_tulum
            }
        }

        // Status: validated; if not provided, default based on current user role.
        // Admin-created rows default to APPROVED, others to PENDING.
        $rawStatus = $payload['status'] ?? null;
        if ($rawStatus === null || $rawStatus === '') {
            if ($this->security && $this->security->isGranted('ROLE_ADMIN')) {
                $rawStatus = EmployeeCashLedger::STATUS_APPROVED;
            } else {
                $rawStatus = EmployeeCashLedger::STATUS_PENDING;
            }
        }
        $allowedStatuses = [
            EmployeeCashLedger::STATUS_PENDING,
            EmployeeCashLedger::STATUS_APPROVED,
            EmployeeCashLedger::STATUS_ALLOCATED,
            EmployeeCashLedger::STATUS_REJECTED,
        ];
        if (!in_array($rawStatus, $allowedStatuses, true)) {
            throw new \InvalidArgumentException('Invalid status: ' . $rawStatus);
        }
        $status = $rawStatus;

        $row = new EmployeeCashLedger();
        $row->setEmployee($employee);
        $row->setDate($date);
        $row->setEmployeeShortName(method_exists($employee, 'getShortName') ? $employee->getShortName() : null);
        $row->setType($type);
        $row->setAmount(number_format($amount, 2, '.', ''));
        $row->setDivision($division);
        $row->setCity($city);
        $row->setCostCentre($costCentre);
        $row->setNotes($payload['notes'] ?? null);
        $row->setStatus($status);

        // Code generation (ECASHxxxxx) is always server-side; payload code is ignored.
        $code = $this->generateCode();
        $row->setCode($code);

        $this->em->persist($row);
        $this->em->flush();

        // Handle attachments (max 2 files already validated in controller)
        if (!empty($files)) {
            foreach ($files as $file) {
                $dto = new UploadRequestDTO(
                    transactionType: 'o2',
                    costCentre: $row->getCostCentre(),
                    description: $payload['notes'] ?? $payload['type'] ?? 'Employee Cash',
                    file: $file
                );

                $opts = new AttachOptions(
                    targetType: 'employee_cash_ledger',
                    targetId: $row->getId(),
                    category: 'Cash Ledger',
                    mode: 'allow-many',
                    scope: 'per-parent'
                );

                // Upload and create attachment, then link back to this ledger row
                $attachment = $this->documentUploadService->uploadAndAttach($dto, $opts);
                if (method_exists($attachment, 'setEmployeeCashLedger')) {
                    $attachment->setEmployeeCashLedger($row);
                    $this->em->persist($attachment);
                }
                if (method_exists($row, 'addAttachment')) {
                    $row->addAttachment($attachment);
                }
            }
            // Persist the relation updates (employee_cash_ledger_id)
            $this->em->flush();
        }

        return $row;
    }

    /**
     * Update basic fields of a cash ledger row.
     */
    public function update(EmployeeCashLedger $row, array $payload, array $files = []): EmployeeCashLedger
    {
        // Capture previous state so we can detect de-allocation (Allocated -> Pending/Approved)
        $previousStatus         = $row->getStatus();
        $previousAllocationType = $row->getAllocationType();
        $previousAllocationId   = $row->getAllocationId();
        if (array_key_exists('type', $payload) && $payload['type']) {
            $type = (string) $payload['type'];
            $allowedTypes = [
                EmployeeCashLedger::TYPE_CASH_ADVANCE,
                EmployeeCashLedger::TYPE_GUEST_PAYMENT,
                EmployeeCashLedger::TYPE_CASH_RETURN,
                EmployeeCashLedger::TYPE_EXPENSE,
                EmployeeCashLedger::TYPE_OTHER,
            ];
            if (!in_array($type, $allowedTypes, true)) {
                throw new \InvalidArgumentException('Invalid type: ' . $type);
            }
            $row->setType($type);
        }

        if (array_key_exists('amount', $payload) && $payload['amount'] !== null && $payload['amount'] !== '') {
            $amount = (float) $payload['amount'];
            if ($amount <= 0) {
                throw new \InvalidArgumentException('amount must be greater than zero');
            }
            $row->setAmount(number_format($amount, 2, '.', ''));
        }

        if (array_key_exists('date', $payload) && $payload['date']) {
            if (!is_string($payload['date'])) {
                throw new \InvalidArgumentException('date must be a string in YYYY-MM-DD format');
            }
            $parsed = \DateTimeImmutable::createFromFormat('Y-m-d', $payload['date'], new \DateTimeZone('UTC'));
            if (!$parsed instanceof \DateTimeImmutable) {
                throw new \InvalidArgumentException('Invalid date format; expected YYYY-MM-DD');
            }
            $row->setDate($parsed);
        }

        if (array_key_exists('division', $payload)) {
            $row->setDivision($payload['division'] ?: null);
        }

        if (array_key_exists('city', $payload)) {
            $row->setCity($payload['city'] ?: null);
        }

        if (array_key_exists('costCentre', $payload)) {
            $row->setCostCentre($payload['costCentre'] ?: null);
        }

        if (\array_key_exists('notes', $payload)) {
            $notes = $payload['notes'];

            // Normalize empty string to null
            if ($notes === '') {
                $notes = null;
            }

            $row->setNotes($notes);
        }

        if (\array_key_exists('adminComment', $payload)) {
            $adminComment = $payload['adminComment'];

            // Normalize empty string to null
            if ($adminComment === '') {
                $adminComment = null;
            }

            // Store admin/reviewer comment (e.g., rejection reason)
            if (method_exists($row, 'setAdminComment')) {
                $row->setAdminComment($adminComment);
            }
        }

        if (array_key_exists('status', $payload) && $payload['status']) {
            $status = (string) $payload['status'];
            $allowedStatuses = [
                EmployeeCashLedger::STATUS_PENDING,
                EmployeeCashLedger::STATUS_APPROVED,
                EmployeeCashLedger::STATUS_ALLOCATED,
                EmployeeCashLedger::STATUS_REJECTED,
            ];
            if (!in_array($status, $allowedStatuses, true)) {
                throw new \InvalidArgumentException('Invalid status: ' . $status);
            }
            $row->setStatus($status);
        }

        // Business rule: admin comment is mandatory when status is Rejected
        if ($row->getStatus() === EmployeeCashLedger::STATUS_REJECTED) {
            $comment = null;
            if (method_exists($row, 'getAdminComment')) {
                $comment = $row->getAdminComment();
            }
            $commentStr = is_string($comment) ? trim($comment) : '';
            if ($commentStr === '') {
                throw new \InvalidArgumentException('adminComment is required when status is Rejected');
            }
        }

        if (array_key_exists('code', $payload) && $payload['code']) {
            $row->setCode($payload['code']);
        }

        // Handle new attachments on update (optional). We enforce a maximum of 2 attachments
        // per entry, counting both existing and newly uploaded files.
        if (!empty($files)) {
            $existingCount = 0;
            if (method_exists($row, 'getAttachments')) {
                $existingAttachments = $row->getAttachments();
                if (is_iterable($existingAttachments)) {
                    foreach ($existingAttachments as $att) {
                        $existingCount++;
                    }
                }
            }

            $newCount = count($files);
            if ($existingCount + $newCount > 2) {
                throw new \InvalidArgumentException('You can upload a maximum of 2 files for each entry.');
            }

            foreach ($files as $file) {
                $dto = new UploadRequestDTO(
                    transactionType: 'o2',
                    costCentre: $row->getCostCentre(),
                    description: $payload['notes'] ?? $payload['type'] ?? 'Employee Cash',
                    file: $file
                );

                $opts = new AttachOptions(
                    targetType: 'employee_cash_ledger',
                    targetId: $row->getId(),
                    category: 'Cash Ledger',
                    mode: 'allow-many',
                    scope: 'per-parent'
                );

                $attachment = $this->documentUploadService->uploadAndAttach($dto, $opts);
                if (method_exists($attachment, 'setEmployeeCashLedger')) {
                    $attachment->setEmployeeCashLedger($row);
                    $this->em->persist($attachment);
                }
                if (method_exists($row, 'addAttachment')) {
                    $row->addAttachment($attachment);
                }
            }
        }

        // Handle removal of existing attachments (optional). The front-end can send
        // `attachmentsToRemove` as an array of attachment IDs that should be removed
        // from this cash ledger entry. We will:
        //  - unlink the attachment from this EmployeeCashLedger
        //  - and if the underlying UnitDocument is now orphaned (no other attachments),
        //    we also delete both the attachment and the document.
        if (!empty($payload['attachmentsToRemove']) && is_array($payload['attachmentsToRemove'])) {
            $ids = array_filter(
                array_map('intval', $payload['attachmentsToRemove']),
                static fn (int $v): bool => $v > 0
            );
            $ids = array_values(array_unique($ids));

            if (!empty($ids)) {
                $attRepo = $this->em->getRepository(UnitDocumentAttachment::class);

                foreach ($ids as $attId) {
                    /** @var UnitDocumentAttachment|null $att */
                    $att = $attRepo->find($attId);
                    if (!$att) {
                        continue;
                    }

                    // Ensure this attachment is actually linked to this cash row
                    if (method_exists($att, 'getEmployeeCashLedger') && $att->getEmployeeCashLedger() !== $row) {
                        continue;
                    }

                    // Grab the underlying document (if any)
                    $doc = method_exists($att, 'getDocument') ? $att->getDocument() : null;

                    // Detach from this cash ledger row
                    if (method_exists($row, 'removeAttachment')) {
                        $row->removeAttachment($att);
                    }
                    if (method_exists($att, 'setEmployeeCashLedger')) {
                        $att->setEmployeeCashLedger(null);
                    }

                    // If we have a document, check whether it is still used elsewhere.
                    // Only when this attachment is the *last* one referencing that document
                    // do we delete both the attachment and the document.
                    if ($doc instanceof UnitDocument && method_exists($doc, 'getAttachments')) {
                        $otherAttachments = 0;
                        foreach ($doc->getAttachments() as $docAtt) {
                            if ($docAtt === $att) {
                                continue;
                            }
                            $otherAttachments++;
                            if ($otherAttachments > 0) {
                                break;
                            }
                        }

                        if ($otherAttachments === 0) {
                            // No other attachments are using this document: safe to remove both
                            if (method_exists($doc, 'removeAttachment')) {
                                $doc->removeAttachment($att);
                            }
                            $this->em->remove($att);
                            $this->em->remove($doc);
                            continue; // skip the persist($att) below
                        }
                    }

                    // If the document is still referenced elsewhere, we keep it and
                    // simply persist the detached attachment state.
                    $this->em->persist($att);
                }
            }
        }

        // Step 1: if status changed from Allocated to Pending/Approved, clear allocation fields
        $newStatus = $row->getStatus();
        if (
            $previousStatus === EmployeeCashLedger::STATUS_ALLOCATED &&
            \in_array($newStatus, [EmployeeCashLedger::STATUS_PENDING, EmployeeCashLedger::STATUS_APPROVED], true) &&
            $previousAllocationId
        ) {
            // Clear allocation metadata on this cash row so the UI shows the Allocate button again
            $row->setAllocationType(null);
            $row->setAllocationId(null);
            $row->setAllocationCode(null);
            $row->setAllocatedAt(null);
            if (method_exists($row, 'setAllocatedBy')) {
                $row->setAllocatedBy(null);
            }

            // Step 2: hard-delete the linked allocation entity (currently implemented for O2)
            $this->deleteAllocationChild($previousAllocationType, (int) $previousAllocationId);
        }

        $this->em->flush();

        return $row;
    }

    /**
     * Hard-delete the linked allocation row when de-allocating a cash entry.
     *
     * For now we implement this for Owners2 (O2) and Housekeepers (HK) allocations,
     * and Unit allocations (allocationType = 'Unit').
     */
    private function deleteAllocationChild(?string $allocationType, int $allocationId): void
    {
        if (!$allocationType || $allocationId <= 0) {
            return;
        }

        switch ($allocationType) {
            case 'O2':
                $repo = $this->em->getRepository(O2Transactions::class);
                $child = $repo->find($allocationId);
                if ($child) {
                    $this->em->remove($child);
                }
                break;
            case 'HK':
                $repo = $this->em->getRepository(HKTransactions::class);
                $child = $repo->find($allocationId);
                if ($child) {
                    $this->em->remove($child);
                }
                break;
            case 'Unit':
                $repo = $this->em->getRepository(UnitTransactions::class);
                $child = $repo->find($allocationId);
                if ($child) {
                    $this->em->remove($child);
                }
                break;
            default:
                // Unknown or not yet supported allocation type; do nothing.
                break;
        }
    }

    /**
     * Mark a row as Approved.
     */
    public function approve(EmployeeCashLedger $row): EmployeeCashLedger
    {
        $row->setStatus(EmployeeCashLedger::STATUS_APPROVED);
        $this->em->flush();

        return $row;
    }

    /**
     * Mark a row as Rejected.
     */
    public function reject(EmployeeCashLedger $row, array $payload = []): EmployeeCashLedger
    {
        // Allow passing a rejection reason via payload
        if (\array_key_exists('adminComment', $payload)) {
            $adminComment = $payload['adminComment'];
            if ($adminComment === '') {
                $adminComment = null;
            }
            if (method_exists($row, 'setAdminComment')) {
                $row->setAdminComment($adminComment);
            }
        }

        $row->setStatus(EmployeeCashLedger::STATUS_REJECTED);

        // Business rule: admin comment is mandatory when status is Rejected
        $comment = null;
        if (method_exists($row, 'getAdminComment')) {
            $comment = $row->getAdminComment();
        }
        $commentStr = is_string($comment) ? trim($comment) : '';
        if ($commentStr === '') {
            throw new \InvalidArgumentException('adminComment is required when status is Rejected');
        }

        $this->em->flush();

        return $row;
    }

    /**
     * Mark a row as Allocated and set allocation metadata.
     *
     * For now, this method only updates the link fields; actual O2/HK/Unit transaction
     * creation can be handled by a separate service and call this afterwards.
     */
    public function allocate(EmployeeCashLedger $row, array $payload, ?Employee $actor = null): EmployeeCashLedger
    {
        if (empty($payload['allocationType'])) {
            throw new \InvalidArgumentException('allocationType is required');
        }

        $rawType = strtolower(trim((string) $payload['allocationType']));
        switch ($rawType) {
            case 'o2':
            case 'owners2':
                $allocationType = 'O2';
                break;
            case 'hk':
            case 'housekeepers':
                $allocationType = 'HK';
                break;
            case 'unit':
            case 'units':
                $allocationType = 'Unit';
                break;
            default:
                throw new \InvalidArgumentException('Invalid allocationType: ' . $payload['allocationType']);
        }

        $row->setAllocationType($allocationType);

        if (array_key_exists('allocationId', $payload)) {
            $row->setAllocationId($payload['allocationId'] !== null ? (int) $payload['allocationId'] : null);
        }

        if (array_key_exists('allocationCode', $payload)) {
            $row->setAllocationCode($payload['allocationCode'] ?: null);
        }

        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $row->setAllocatedAt($now);
        if ($actor) {
            $row->setAllocatedBy($actor);
        }

        // Business rule: an allocated entry is considered approved and allocated.
        $row->setStatus(EmployeeCashLedger::STATUS_ALLOCATED);

        $this->em->flush();

        return $row;
    }

    /**
     * Convert a row to an array shape suitable for JSON responses.
     */
    public function toArray(EmployeeCashLedger $row, ?string $balance = null): array
    {
        $emp = $row->getEmployee();
        $utc = new \DateTimeZone('UTC');

        $createdAt = $row->getCreatedAt()->setTimezone($utc)->format('Y-m-d H:i:s');
        $allocatedAt = $row->getAllocatedAt()
            ? $row->getAllocatedAt()->setTimezone($utc)->format('Y-m-d H:i:s')
            : null;

        $date = $row->getDate()
            ? $row->getDate()->setTimezone($utc)->format('Y-m-d')
            : null;

        $attachments = [];

        // Prefer the in-memory relation if available
        $entityAttachments = [];
        if (method_exists($row, 'getAttachments')) {
            $entityAttachments = $row->getAttachments();
        }

        // If the in-memory collection is empty, fall back to a direct query by employeeCashLedger
        $hasAny = false;
        if (is_iterable($entityAttachments)) {
            foreach ($entityAttachments as $_) {
                $hasAny = true;
                break;
            }
        }

        if (!$hasAny) {
            // Defensive: ensure the attachment entity actually has an employeeCashLedger relation
            $repo = $this->em->getRepository(UnitDocumentAttachment::class);
            $entityAttachments = $repo->findBy(['employeeCashLedger' => $row]);
        }

        if (is_iterable($entityAttachments)) {
            foreach ($entityAttachments as $att) {
                // Be defensive in case methods differ slightly
                $doc = method_exists($att, 'getDocument') ? $att->getDocument() : null;

                $url = null;
                if ($doc) {
                    if (method_exists($doc, 'getS3Url') && $doc->getS3Url()) {
                        $url = $doc->getS3Url();
                    } elseif (method_exists($doc, 'getDocumentUrl') && $doc->getDocumentUrl()) {
                        $url = $doc->getDocumentUrl();
                    } elseif (method_exists($doc, 'getFilepath') && $doc->getFilepath()) {
                        $url = $doc->getFilepath();
                    }
                }

                $attachments[] = [
                    'id' => method_exists($att, 'getId') ? $att->getId() : null,
                    'category' => method_exists($att, 'getCategory') ? $att->getCategory() : null,
                    'documentId' => ($doc && method_exists($doc, 'getId')) ? $doc->getId() : null,
                    'fileName' => ($doc && method_exists($doc, 'getOriginalFilename')) ? $doc->getOriginalFilename() : null,
                    'url' => $url,
                ];
            }
        }

        return [
            'id' => $row->getId(),
            'code' => $row->getCode(),
            'employee' => $emp ? [
                'id' => $emp->getId(),
                'shortName' => method_exists($emp, 'getShortName') ? $emp->getShortName() : null,
                'division' => method_exists($emp, 'getDivision') ? $emp->getDivision() : null,
                'city' => method_exists($emp, 'getCity') ? $emp->getCity() : null,
            ] : null,
            'employeeShortName' => $row->getEmployeeShortName(),
            'type' => $row->getType(),
            'amount' => $row->getAmount(),
            'division' => $row->getDivision(),
            'city' => $row->getCity(),
            'costCentre' => $row->getCostCentre(),
            'notes' => $row->getNotes(),
            'adminComment' => method_exists($row, 'getAdminComment') ? $row->getAdminComment() : null,
            'status' => $row->getStatus(),
            'allocationType' => $row->getAllocationType(),
            'allocationId' => $row->getAllocationId(),
            'allocationCode' => $row->getAllocationCode(),
            'balance' => $balance,
            'date' => $date,
            'createdAt' => $createdAt,
            'allocatedAt' => $allocatedAt,
            'attachments' => $attachments,
        ];
    }
    /**
     * Compute the signed delta for a row, based on its type.
     *
     * CashAdvance / GuestPayment increase the balance.
     * CashReturn / Expense decrease the balance.
     * Other currently has no effect.
     */
    private function signedDelta(EmployeeCashLedger $row): float
    {
        $amount = (float) $row->getAmount();
        $type = $row->getType();

        switch ($type) {
            case EmployeeCashLedger::TYPE_CASH_ADVANCE:
            case EmployeeCashLedger::TYPE_GUEST_PAYMENT:
                return $amount;
            case EmployeeCashLedger::TYPE_CASH_RETURN:
            case EmployeeCashLedger::TYPE_EXPENSE:
                return -$amount;
            case EmployeeCashLedger::TYPE_OTHER:
            default:
                return 0.0;
        }
    }

    /**
     * Generate a new unique code for EmployeeCashLedger rows.
     */
    private function generateCode(): string
    {
        $tries = 0;
        do {
            $tries++;
            $num = random_int(1, 99999);
            $code = sprintf('ECASH%05d', $num);
            $existing = $this->em->getRepository(EmployeeCashLedger::class)->findOneBy(['code' => $code]);
            if (!$existing) {
                return $code;
            }
        } while ($tries < 20);

        throw new \RuntimeException('Unable to generate unique code for EmployeeCashLedger');
    }

    /**
     * Normalize a city name into the costCentre suffix (Playa, Tulum, General).
     */
    private function normalizeCityKey(?string $city): string
    {
        if (!$city) {
            return 'General';
        }

        $c = strtolower(trim($city));
        if (str_contains($c, 'playa')) {
            return 'Playa';
        }
        if (str_contains($c, 'tulum')) {
            return 'Tulum';
        }

        return 'General';
    }
}
