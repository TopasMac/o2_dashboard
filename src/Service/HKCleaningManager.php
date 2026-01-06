<?php

namespace App\Service;

use App\Entity\HKCleanings;
use App\Entity\HKTransactions;
use App\Entity\HKCleaningChecklist;
use App\Entity\HKCleaningChecklistFile;
use App\Entity\Employee;
use App\Entity\Unit;
use App\Entity\TransactionCategory;
use App\Service\HKCleaningRateResolver;
use DateTimeZone;
use App\Service\Document\DocumentUploadService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

class HKCleaningManager
{
    private EntityManagerInterface $em;
    private HKCleaningRateResolver $rateResolver;
    private DocumentUploadService $documentUploadService;

    public function __construct(
        EntityManagerInterface $em,
        HKCleaningRateResolver $rateResolver,
        DocumentUploadService $documentUploadService
    ) {
        $this->em = $em;
        $this->rateResolver = $rateResolver;
        $this->documentUploadService = $documentUploadService;
    }

    /**
     * Bulk create hk_cleanings rows.
     *
     * @param array $items Each item: [unitId, city, checkoutDate (Y-m-d), cleaningType, bookingId?, reservationCode?]
     * @param bool $createLedgerForTulum (deprecated, no effect)
     *
     * @return array Summary: [created => int, skipped => int, ledgerCreated => int (always 0)]
     */
    public function bulkCreate(array $items, bool $createLedgerForTulum = true): array
    {
        $created = 0;
        $skipped = 0;
        $ledgerCreated = 0;

        foreach ($items as $data) {
            if (empty($data['unitId']) || empty($data['checkoutDate'])) {
                $skipped++;
                continue;
            }

            $unit = $this->em->getRepository(Unit::class)->find($data['unitId']);
            if (!$unit) {
                $skipped++;
                continue;
            }

            $guestTypeRaw = isset($data['guestType']) ? strtolower((string)$data['guestType']) : '';
            if ($guestTypeRaw === 'owner') {
                $cleaningType = HKCleanings::TYPE_OWNER; // use constant
            } else {
                $cleaningType = $data['cleaningType'] ?? HKCleanings::TYPE_CHECKOUT;
            }

            $status = $data['status'] ?? HKCleanings::STATUS_PENDING; // auto-created rows start as pending
            $city = $data['city'] ?? ($unit->getCity() ?? '');
            $checkoutDateYmd = $data['checkoutDate'];
            $checkoutDt = new \DateTimeImmutable($checkoutDateYmd);

            // check if already exists (prefer reservation_code + date; fallback unit + date + type)
            $reservationCode = $data['reservationCode'] ?? null;
            $existing = null;
            if ($reservationCode) {
                $existing = $this->em->getRepository(HKCleanings::class)->findOneBy([
                    'reservationCode' => $reservationCode,
                    'checkoutDate' => $checkoutDt,
                ]);
            }
            if (!$existing) {
                $existing = $this->em->getRepository(HKCleanings::class)->findOneBy([
                    'unit' => $unit,
                    'checkoutDate' => $checkoutDt,
                    'cleaningType' => $cleaningType,
                ]);
            }

            if ($existing) {
                // Update status to requested value (e.g., done after checkbox)
                if (method_exists($existing, 'setStatus')) {
                    $existing->setStatus($status);
                }
                // If cleaning_cost is empty, resolve it now
                if (method_exists($existing, 'getCleaningCost') && method_exists($existing, 'setCleaningCost') && $existing->getCleaningCost() === null) {
                    $resolved = $this->rateResolver->resolveAmountForDateStr((int)$unit->getId(), $city, $checkoutDateYmd);
                    if ($resolved !== null) {
                        $existing->setCleaningCost((string)$resolved);
                    }
                }
                // Optionally set/refresh collected fee if provided in payload
                if (!empty($data['o2CollectedFee']) && method_exists($existing, 'setO2CollectedFee')) {
                    $existing->setO2CollectedFee((string)$data['o2CollectedFee']);
                }
                $skipped++; // count updates under 'skipped' to preserve return shape
                continue;
            }

            // Insert new
            $hk = new HKCleanings();
            $hk->setUnit($unit);
            $hk->setCity($city);
            $hk->setCheckoutDate($checkoutDt);
            $hk->setCleaningType($cleaningType);
            $hk->setBookingId($data['bookingId'] ?? null);
            $hk->setReservationCode($data['reservationCode'] ?? null);
            if (method_exists($hk, 'setStatus')) {
                $hk->setStatus($status);
            }
            // Resolve and set cleaning_cost at insert time (nullable if no rate)
            if (method_exists($hk, 'setCleaningCost')) {
                $resolved = $this->rateResolver->resolveAmountForDateStr((int)$unit->getId(), $city, $checkoutDateYmd);
                if ($resolved !== null) {
                    $hk->setCleaningCost((string)$resolved);
                }
            }
            // For Owner stays, default collected fee to Unit cleaning_fee if not provided
            if ($cleaningType === HKCleanings::TYPE_OWNER && empty($data['o2CollectedFee']) && method_exists($unit, 'getCleaningFee') && method_exists($hk, 'setO2CollectedFee')) {
                $unitFee = $unit->getCleaningFee();
                if ($unitFee !== null && $unitFee !== '') {
                    $hk->setO2CollectedFee((string)$unitFee);
                }
            }
            if (!empty($data['o2CollectedFee']) && method_exists($hk, 'setO2CollectedFee')) {
                $hk->setO2CollectedFee((string)$data['o2CollectedFee']);
            }

            // Ensure created_at is set if supported and empty
            if (method_exists($hk, 'setCreatedAt')) {
                $getCreatedAt = method_exists($hk, 'getCreatedAt') ? $hk->getCreatedAt() : null;
                if (!$getCreatedAt) {
                    $hk->setCreatedAt(new \DateTimeImmutable());
                }
            }

            $this->em->persist($hk);
            $created++;
        }

        $this->em->flush();

        return [
            'created' => $created,
            'skipped' => $skipped,
            'ledgerCreated' => $ledgerCreated,
        ];
    }

    /**
     * Mark a cleaning as done and create the matching hk_transactions row.
     * Idempotent: if a transaction already exists linked to this cleaning, it will be returned.
     */
    public function markDoneAndCreateTransaction(HKCleanings $hk): array
    {
        // Ensure status is DONE (soft guard; controller already set it)
        if (method_exists($hk, 'getStatus') && method_exists($hk, 'setStatus')) {
            if ($hk->getStatus() !== HKCleanings::STATUS_DONE) {
                $hk->setStatus(HKCleanings::STATUS_DONE);
            }
        }

        // Idempotency: if a tx already links to this cleaning, return it (fast-path via cleaning -> transaction, then repo fallback)
        $txRepo = $this->em->getRepository(HKTransactions::class);
        $existingTx = null;

        // Fast-path: check inverse/bidirectional relation if present on HKCleanings
        if (method_exists($hk, 'getHkTransaction')) {
            $maybeTx = $hk->getHkTransaction();
            if ($maybeTx instanceof HKTransactions) {
                $existingTx = $maybeTx;
            }
        }

        // Fallback: query by owning side if available
        if (!$existingTx && method_exists(HKTransactions::class, 'setHkCleaning')) {
            $existingTx = $txRepo->findOneBy(['hkCleaning' => $hk]);
        }

        if ($existingTx) {
            return [
                'id' => method_exists($existingTx, 'getId') ? $existingTx->getId() : null,
                'transactionCode' => method_exists($existingTx, 'getTransactionCode') ? $existingTx->getTransactionCode() : null,
                'alreadyExisted' => true,
            ];
        }

        $unit = method_exists($hk, 'getUnit') ? $hk->getUnit() : null;
        if (!$unit instanceof Unit) {
            throw new \RuntimeException('HKCleaning has no Unit; cannot create transaction');
        }

        $date = method_exists($hk, 'getCheckoutDate') ? $hk->getCheckoutDate() : null;
        if (!$date instanceof \DateTimeInterface) {
            throw new \RuntimeException('HKCleaning has no checkout date; cannot create transaction');
        }
        // Ensure immutable for HKTransactions::setDate(\DateTimeImmutable)
        $dateImmutable = $date instanceof \DateTimeImmutable ? $date : \DateTimeImmutable::createFromInterface($date);

        $city = method_exists($hk, 'getCity') ? (string)$hk->getCity() : (method_exists($unit, 'getCity') ? (string)$unit->getCity() : '');
        $dateYmd = $dateImmutable->format('Y-m-d');

        $isOwner = false;
        if (method_exists($hk, 'getCleaningType')) {
            $isOwner = strtolower((string)$hk->getCleaningType()) === HKCleanings::TYPE_OWNER;
        }

        // Resolve Paid via rate resolver
        $paid = $this->rateResolver->resolveAmountForDateStr((int)$unit->getId(), $city, $dateYmd);
        $paidStr = $paid !== null ? (string)$paid : null;

        // Resolve Charged from unit cleaning_fee if available
        $charged = null;
        if (method_exists($unit, 'getCleaningFee')) {
            $ufee = $unit->getCleaningFee();
            if ($ufee !== null && $ufee !== '') {
                $charged = $ufee;
            }
        }
        $chargedStr = $charged !== null ? (string)$charged : null;

        $tx = new HKTransactions();
        if (method_exists($tx, 'setDate')) {
            $tx->setDate($dateImmutable);
        }
        if (method_exists($tx, 'setUnit')) {
            $tx->setUnit($unit);
        }
        if (method_exists($tx, 'setCity')) {
            $tx->setCity($city);
        }

        $catRepo = $this->em->getRepository(TransactionCategory::class);
        if ($isOwner) {
            // Prefer id=8; fallback by name 'Limpieza_extra' (case-insensitive)
            $cat = $catRepo->find(8);
            if (!$cat) {
                $cat = $catRepo->findOneBy(['name' => 'Limpieza_extra']);
                if (!$cat) {
                    $cat = $catRepo->createQueryBuilder('c')
                        ->where('LOWER(c.name) = :n')
                        ->setParameter('n', 'limpieza_extra')
                        ->setMaxResults(1)
                        ->getQuery()
                        ->getOneOrNullResult();
                }
            }
            if (!$cat) {
                $cat = new TransactionCategory();
                if (method_exists($cat, 'setName')) { $cat->setName('Limpieza_extra'); }
                $this->em->persist($cat);
            }
        } else {
            $cat = $catRepo->findOneBy(['name' => 'Limpieza']);
            if (!$cat) {
                $cat = $catRepo->createQueryBuilder('c')
                    ->where('LOWER(c.name) = :n')
                    ->setParameter('n', 'limpieza')
                    ->setMaxResults(1)
                    ->getQuery()
                    ->getOneOrNullResult();
            }
            if (!$cat) {
                $cat = new TransactionCategory();
                if (method_exists($cat, 'setName')) { $cat->setName('Limpieza'); }
                $this->em->persist($cat);
            }
        }
        if (method_exists($tx, 'setCategory')) { $tx->setCategory($cat); }

        if (method_exists($tx, 'setCostCentre')) {
            $tx->setCostCentre($isOwner ? 'Client' : 'Owners2');
        }
        if (method_exists($tx, 'setDescription')) {
            $tx->setDescription($isOwner ? 'Estadia propietario' : '');
        }
        if (method_exists($tx, 'setPaid')) {
            $tx->setPaid($paidStr);
        }
        if (method_exists($tx, 'setCharged')) {
            if ($isOwner && method_exists($hk, 'getO2CollectedFee')) {
                $collected = $hk->getO2CollectedFee();
                $tx->setCharged(($collected !== null && $collected !== '') ? (string)$collected : $chargedStr);
            } else {
                $tx->setCharged($chargedStr);
            }
        }
        if ($isOwner && method_exists($tx, 'setAllocationTarget')) {
            $tx->setAllocationTarget('Unit');
        }
        if (method_exists($tx, 'generateTransactionCode')) {
            $tx->generateTransactionCode();
        }
        if (method_exists($tx, 'setHkCleaning')) {
            $tx->setHkCleaning($hk);
        }

        $this->em->persist($tx);
        $this->em->flush();

        return [
            'id' => method_exists($tx, 'getId') ? $tx->getId() : null,
            'transactionCode' => method_exists($tx, 'getTransactionCode') ? $tx->getTransactionCode() : null,
            'alreadyExisted' => false,
        ];
    }

    /**
     * Save or update a checklist draft for a cleaning (no submission).
     *
     * Responsibilities:
     * - Upsert HKCleaningChecklist row (by cleaning_id)
     * - Persist checklist_data, checklist_version (if supported), cleaner, notes, has_issues
     * - Set updated_at on every save
     * - Optionally upload files and create HKCleaningChecklistFile rows (appended)
     * - DOES NOT set submitted_at
     */
    public function saveChecklistDraft(
        HKCleanings $hk,
        Employee $cleaner,
        array $checklistData,
        ?string $notes,
        ?string $checklistVersion = null,
        array $files = []
    ): array {
        $unit = method_exists($hk, 'getUnit') ? $hk->getUnit() : null;
        if (!$unit instanceof Unit) {
            throw new BadRequestHttpException('Cleaning has no unit; cannot save checklist.');
        }

        // Derive hasIssues flag: notes present OR any checklist item explicitly signals an issue
        $hasIssues = false;
        if ($notes !== null && trim($notes) !== '') {
            $hasIssues = true;
        } else {
            foreach ($checklistData as $item) {
                if (is_array($item) && array_key_exists('hasIssue', $item) && $item['hasIssue']) {
                    $hasIssues = true;
                    break;
                }
            }
        }

        $now = new \DateTimeImmutable('now', new DateTimeZone('UTC'));
        $cleaningId = (int)(method_exists($hk, 'getId') ? $hk->getId() : 0);
        if ($cleaningId <= 0) {
            throw new BadRequestHttpException('Invalid cleaning id; cannot save checklist.');
        }

        // Upsert by cleaning_id
        $repo = $this->em->getRepository(HKCleaningChecklist::class);
        $checklist = $repo->findOneBy(['cleaningId' => $cleaningId]);
        $isNew = false;
        if (!$checklist instanceof HKCleaningChecklist) {
            $checklist = new HKCleaningChecklist();
            $checklist->setCleaningId($cleaningId);
            $isNew = true;
        }

        // Who submitted/saved the checklist
        if (method_exists($checklist, 'setCleaner')) {
            $checklist->setCleaner($cleaner);
        }

        // Payload
        if (method_exists($checklist, 'setChecklistData')) {
            $checklist->setChecklistData($checklistData);
        }
        if ($checklistVersion !== null && $checklistVersion !== '' && method_exists($checklist, 'setChecklistVersion')) {
            $checklist->setChecklistVersion($checklistVersion);
        }

        // Notes (renamed field)
        if (method_exists($checklist, 'setCleaningNotes')) {
            $checklist->setCleaningNotes($notes);
        }

        if (method_exists($checklist, 'setHasIssues')) {
            $checklist->setHasIssues($hasIssues);
        }

        // updated_at always bumps
        if (method_exists($checklist, 'setUpdatedAt')) {
            $checklist->setUpdatedAt($now);
        }

        // IMPORTANT: do not touch submitted_at here (draft save)

        $this->em->persist($checklist);
        $this->em->flush(); // ensure checklist has an ID for file uploads

        $checklistId = (int)(method_exists($checklist, 'getId') ? $checklist->getId() : 0);
        $unitId = method_exists($unit, 'getId') ? (int)$unit->getId() : 0;

        // Optionally upload files and append HKCleaningChecklistFile rows
        $fileCount = 0;
        foreach ($files as $file) {
            if (!$file instanceof UploadedFile) {
                continue;
            }

            $url = $this->documentUploadService->uploadForChecklist(
                $unitId,
                $checklistId,
                $file,
                null,
                $file->getMimeType() ?: null,
                $file->getClientOriginalName() ?: null
            );

            $fileEntity = new HKCleaningChecklistFile();
            $fileEntity->setChecklist($checklist);
            $fileEntity->setPath($url);
            $fileEntity->setFilename($file->getClientOriginalName() ?: null);
            $fileEntity->setMimeType($file->getMimeType() ?: null);
            $fileEntity->setSize($file->getSize() ?: null);
            $fileEntity->setUploadedAt($now);

            $this->em->persist($fileEntity);
            $fileCount++;
        }

        if ($fileCount > 0) {
            $this->em->flush();
        }

        return [
            'checklistId' => $checklistId,
            'fileCount'   => $fileCount,
            'hasIssues'   => $hasIssues,
            'isNew'       => $isNew,
            'submittedAt' => method_exists($checklist, 'getSubmittedAt') ? $checklist->getSubmittedAt() : null,
        ];
    }

    /**
     * Return the latest checklist state for a given cleaning.
     *
     * Shape:
     *  - checklistId: int|null
     *  - cleanerId: int|null
     *  - submittedAt: \DateTimeImmutable|null
     *  - updatedAt: \DateTimeImmutable|null
     *  - hasDraft: bool (true when a checklist exists and submitted_at IS NULL)
     *  - checklistData: array
     *  - notes: string|null
     */
    public function getChecklistState(HKCleanings $hk): array
    {
        $cleaningId = (int) (method_exists($hk, 'getId') ? $hk->getId() : 0);
        if ($cleaningId <= 0) {
            throw new BadRequestHttpException('Invalid cleaning id; cannot load checklist state.');
        }

        $conn = $this->em->getConnection();

        // Fetch latest checklist row for this cleaning. Prefer updated_at when present.
        $sql = "\n" .
            "SELECT id, cleaner_id, submitted_at, checklist_data, cleaning_notes, updated_at\n" .
            "FROM hk_cleaning_checklist\n" .
            "WHERE cleaning_id = :cid\n" .
            "ORDER BY COALESCE(updated_at, submitted_at) DESC, id DESC\n" .
            "LIMIT 1";

        $row = $conn->fetchAssociative($sql, ['cid' => $cleaningId]);

        if (!$row) {
            return [
                'checklistId'   => null,
                'cleanerId'     => null,
                'submittedAt'   => null,
                'updatedAt'     => null,
                'hasDraft'      => false,
                'checklistData' => [],
                'notes'         => null,
            ];
        }

        $checklistId = isset($row['id']) ? (int) $row['id'] : null;
        $cleanerId = isset($row['cleaner_id']) ? (int) $row['cleaner_id'] : null;

        $tz = new DateTimeZone('UTC');

        $submittedAtRaw = $row['submitted_at'] ?? null;
        $submittedAt = null;
        if ($submittedAtRaw !== null && $submittedAtRaw !== '') {
            try {
                if ($submittedAtRaw instanceof \DateTimeInterface) {
                    $submittedAt = \DateTimeImmutable::createFromInterface($submittedAtRaw)
                        ->setTimezone($tz);
                } else {
                    $submittedAt = new \DateTimeImmutable((string) $submittedAtRaw, $tz);
                }
            } catch (\Throwable $e) {
                $submittedAt = null;
            }
        }

        $updatedAtRaw = $row['updated_at'] ?? null;
        $updatedAt = null;
        if ($updatedAtRaw !== null && $updatedAtRaw !== '') {
            try {
                if ($updatedAtRaw instanceof \DateTimeInterface) {
                    $updatedAt = \DateTimeImmutable::createFromInterface($updatedAtRaw)
                        ->setTimezone($tz);
                } else {
                    $updatedAt = new \DateTimeImmutable((string) $updatedAtRaw, $tz);
                }
            } catch (\Throwable $e) {
                $updatedAt = null;
            }
        }

        $hasDraft = ($submittedAt === null);

        $dataRaw = $row['checklist_data'] ?? null;
        $checklistData = [];
        if (is_array($dataRaw)) {
            $checklistData = $dataRaw;
        } elseif (is_string($dataRaw) && trim($dataRaw) !== '') {
            $decoded = json_decode($dataRaw, true);
            if (is_array($decoded)) {
                $checklistData = $decoded;
            }
        }

        $notes = $row['cleaning_notes'] ?? null;
        if ($notes !== null) {
            $notes = (string) $notes;
        }

        return [
            'checklistId'   => $checklistId,
            'cleanerId'     => $cleanerId,
            'submittedAt'   => $submittedAt,
            'updatedAt'     => $updatedAt,
            'hasDraft'      => $hasDraft,
            'checklistData' => $checklistData,
            'notes'         => $notes,
        ];
    }

    /**
     * Complete a cleaning with a checklist + optional files.
     *
     * Responsibilities:
     * - Create HKCleaningChecklist row
     * - Upload checklist files (via DocumentUploadService::uploadForChecklist)
     * - Create HKCleaningChecklistFile rows
     * - Update HKCleanings: doneByEmployee, doneAt, status=done
     * - Create HKTransactions row (via markDoneAndCreateTransaction)
     *
     * @param HKCleanings $hk               The cleaning being completed
     * @param Employee    $cleaner          The employee who completed the cleaning
     * @param array       $checklistData    Structured checklist payload (already validated at controller)
     * @param string|null $notes            Optional free-text notes from the cleaner
     * @param UploadedFile[] $files         Uploaded image files (can be empty)
     */
    public function completeWithChecklist(
        HKCleanings $hk,
        Employee $cleaner,
        array $checklistData,
        ?string $notes,
        array $files = []
    ): array {
        $unit = method_exists($hk, 'getUnit') ? $hk->getUnit() : null;
        if (!$unit instanceof Unit) {
            throw new BadRequestHttpException('Cleaning has no unit; cannot complete.');
        }

        // Derive hasIssues flag: notes present OR any checklist item explicitly signals an issue
        $hasIssues = false;
        if ($notes !== null && trim($notes) !== '') {
            $hasIssues = true;
        } else {
            foreach ($checklistData as $item) {
                if (is_array($item) && array_key_exists('hasIssue', $item) && $item['hasIssue']) {
                    $hasIssues = true;
                    break;
                }
            }
        }

        $now = new \DateTimeImmutable('now', new DateTimeZone('UTC'));

        // Upsert checklist entity: if a draft exists for this cleaning (submitted_at IS NULL), update it.
        // Otherwise, create a new checklist row.
        $cleaningId = (int) $hk->getId();
        $repo = $this->em->getRepository(HKCleaningChecklist::class);

        // Prefer an existing draft row for this cleaning.
        $checklist = $repo->findOneBy(['cleaningId' => $cleaningId, 'submittedAt' => null]);

        // If there is no explicit draft row, fall back to the latest row for this cleaning.
        // If the latest is already submitted, we will create a new one (historical submissions).
        if (!$checklist instanceof HKCleaningChecklist) {
            $checklist = $repo->findOneBy(['cleaningId' => $cleaningId], ['updatedAt' => 'DESC', 'id' => 'DESC']);
            if ($checklist instanceof HKCleaningChecklist && method_exists($checklist, 'getSubmittedAt')) {
                $prevSubmitted = $checklist->getSubmittedAt();
                if ($prevSubmitted instanceof \DateTimeInterface) {
                    $checklist = null;
                }
            }
        }

        $isNewChecklist = false;
        if (!$checklist instanceof HKCleaningChecklist) {
            $checklist = new HKCleaningChecklist();
            $checklist->setCleaningId($cleaningId);
            $isNewChecklist = true;
        }

        // Who submitted/saved the checklist
        if (method_exists($checklist, 'setCleaner')) {
            $checklist->setCleaner($cleaner);
        }

        // Payload
        if (method_exists($checklist, 'setChecklistData')) {
            $checklist->setChecklistData($checklistData);
        }
        if (method_exists($checklist, 'setCleaningNotes')) {
            $checklist->setCleaningNotes($notes);
        }
        if (method_exists($checklist, 'setHasIssues')) {
            $checklist->setHasIssues($hasIssues);
        }

        // Mark submission timestamps
        if (method_exists($checklist, 'setSubmittedAt')) {
            $checklist->setSubmittedAt($now);
        }
        if (method_exists($checklist, 'setUpdatedAt')) {
            $checklist->setUpdatedAt($now);
        }

        $this->em->persist($checklist);
        $this->em->flush(); // ensure checklist has an ID for file uploads

        $checklistId = (int)$checklist->getId();
        $unitId = method_exists($unit, 'getId') ? (int)$unit->getId() : 0;

        // Upload files and create HKCleaningChecklistFile rows
        $fileCount = 0;
        foreach ($files as $file) {
            if (!$file instanceof UploadedFile) {
                continue;
            }

            $url = $this->documentUploadService->uploadForChecklist(
                $unitId,
                $checklistId,
                $file,
                null,
                $file->getMimeType() ?: null,
                $file->getClientOriginalName() ?: null
            );

            $fileEntity = new HKCleaningChecklistFile();
            $fileEntity->setChecklist($checklist);
            $fileEntity->setPath($url);
            $fileEntity->setFilename($file->getClientOriginalName() ?: null);
            $fileEntity->setMimeType($file->getMimeType() ?: null);
            $fileEntity->setSize($file->getSize() ?: null);
            $fileEntity->setUploadedAt($now);

            $this->em->persist($fileEntity);
            $fileCount++;
        }

        // Update HKCleaning with doneBy + doneAt + status DONE
        if (method_exists($hk, 'setDoneByEmployee')) {
            $hk->setDoneByEmployee($cleaner);
        }
        if (method_exists($hk, 'setDoneAt')) {
            $hk->setDoneAt($now);
        }
        if (method_exists($hk, 'setStatus')) {
            $hk->setStatus(HKCleanings::STATUS_DONE);
        }

        $this->em->persist($hk);
        $this->em->flush();

        // Create or reuse the HK transaction
        $txInfo = $this->markDoneAndCreateTransaction($hk);

        return [
            'checklistId' => $checklistId,
            'fileCount'   => $fileCount,
            'hasIssues'   => $hasIssues,
            'isNew'       => $isNewChecklist,
            'transaction' => $txInfo,
        ];
    }

    private function generateTxCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $out = 'HK';
        for ($i = 0; $i < 8; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $out;
    }
}