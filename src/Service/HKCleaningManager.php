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
use Doctrine\DBAL\Connection;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

class HKCleaningManager
{
    private EntityManagerInterface $em;
    private Connection $conn;
    private HKCleaningRateResolver $rateResolver;
    private DocumentUploadService $documentUploadService;

    public function __construct(
        EntityManagerInterface $em,
        HKCleaningRateResolver $rateResolver,
        DocumentUploadService $documentUploadService
    ) {
        $this->em = $em;
        $this->conn = $em->getConnection();
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
        /** @var HKCleanings[] $toFinalize */
        $toFinalize = [];

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

            // check if already exists
            // 1) Prefer stable keys that survive checkout date changes: bookingId, reservationCode (without date)
            // 2) Then fallback to reservationCode + date and unit + date + type
            $reservationCode = $data['reservationCode'] ?? null;
            $bookingId = $data['bookingId'] ?? null;
            $existing = null;
            $repo = $this->em->getRepository(HKCleanings::class);

            // A) bookingId + cleaningType (most stable)
            if ($bookingId) {
                $existing = $repo->findOneBy([
                    'bookingId' => $bookingId,
                    'cleaningType' => $cleaningType,
                ]);
            }

            // B) reservationCode only (stable even if date changes)
            if (!$existing && $reservationCode) {
                $existing = $repo->findOneBy([
                    'reservationCode' => $reservationCode,
                    'cleaningType' => $cleaningType,
                ]);
            }

            // C) reservationCode + date (legacy)
            if (!$existing && $reservationCode) {
                $existing = $repo->findOneBy([
                    'reservationCode' => $reservationCode,
                    'checkoutDate' => $checkoutDt,
                ]);
            }

            // D) unit + date + type (last resort)
            if (!$existing) {
                $existing = $repo->findOneBy([
                    'unit' => $unit,
                    'checkoutDate' => $checkoutDt,
                    'cleaningType' => $cleaningType,
                ]);
            }

            if ($existing) {
                // If booking checkout date changed, update checkoutDate ONLY when report_status is pending.
                // status does not matter.
                try {
                    $canMove = true;
                    if (method_exists($existing, 'getReportStatus')) {
                        $rs = (string)($existing->getReportStatus() ?? '');
                        $canMove = (strtolower(trim($rs)) === 'pending');
                    }
                    if ($canMove
                        && method_exists($existing, 'getCheckoutDate')
                        && method_exists($existing, 'setCheckoutDate')
                    ) {
                        $cur = $existing->getCheckoutDate();
                        $curDt = $cur instanceof \DateTimeImmutable ? $cur : ($cur instanceof \DateTimeInterface ? \DateTimeImmutable::createFromInterface($cur) : null);
                        if ($curDt && $curDt->format('Y-m-d') !== $checkoutDt->format('Y-m-d')) {
                            $existing->setCheckoutDate($checkoutDt);
                        }
                    }
                } catch (\Throwable $e) {
                    // best-effort; never block bulkCreate
                }

                // Ensure bookingId/reservationCode are attached when missing (helps future reconciliation)
                if ($bookingId && method_exists($existing, 'getBookingId') && method_exists($existing, 'setBookingId')) {
                    $curBid = $existing->getBookingId();
                    if ($curBid === null || $curBid === 0 || $curBid === '0') {
                        $existing->setBookingId($bookingId);
                    }
                }
                if ($reservationCode && method_exists($existing, 'getReservationCode') && method_exists($existing, 'setReservationCode')) {
                    $curRc = $existing->getReservationCode();
                    if ($curRc === null || trim((string)$curRc) === '') {
                        $existing->setReservationCode($reservationCode);
                    }
                }
                // Update status to requested value (e.g., done after checkbox)
                if (method_exists($existing, 'setStatus')) {
                    $existing->setStatus($status);
                    // If bulkCreate marks an existing row as DONE, also create the hktransactions ledger row.
                    if (strtolower((string)$status) === strtolower((string)HKCleanings::STATUS_DONE)) {
                        $toFinalize[] = $existing;
                    }
                }
                // If cleaning_cost is empty, resolve it now
                if (method_exists($existing, 'getCleaningCost') && method_exists($existing, 'setCleaningCost') && $existing->getCleaningCost() === null) {
                    $resolved = $this->rateResolver->resolveAmountForDateStr((int)$unit->getId(), $city, $checkoutDateYmd);
                    if ($resolved !== null) {
                        $existing->setCleaningCost((string)$resolved);
                    }
                }
                // Respect provided collected fee (accept snake_case and camelCase; 0 is a valid value)
                $o2CollectedFeeRaw = $data['o2_collected_fee'] ?? $data['o2CollectedFee'] ?? null;
                if ($o2CollectedFeeRaw !== null && $o2CollectedFeeRaw !== '') {
                    if (method_exists($existing, 'setO2CollectedFee')) {
                        $existing->setO2CollectedFee((string)$o2CollectedFeeRaw);
                    }
                }

                // Respect provided bill_to (accept snake_case and camelCase)
                $billToRaw = $data['bill_to'] ?? $data['billTo'] ?? null;
                if ($billToRaw !== null && $billToRaw !== '') {
                    if (method_exists($existing, 'setBillTo')) {
                        $existing->setBillTo((string)$billToRaw);
                    }
                }
                $this->em->persist($existing);
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
            // Respect provided bill_to (accept snake_case and camelCase)
            $billToRaw = $data['bill_to'] ?? $data['billTo'] ?? null;
            if ($billToRaw !== null && $billToRaw !== '') {
                if (method_exists($hk, 'setBillTo')) {
                    $hk->setBillTo((string)$billToRaw);
                }
            }
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
            // Defaults for o2_collected_fee (charged amount)
            // - checkout: default to Unit cleaning_fee
            // - owner:    default to Unit cleaning_fee
            // - redo:     force to 0 (internal redo, not charged)
            $typeLower = strtolower((string)$cleaningType);
            $isRedo = ($typeLower === 'redo') || (defined(HKCleanings::class . '::TYPE_REDO') && $cleaningType === HKCleanings::TYPE_REDO);
            $isOwner = ($typeLower === strtolower((string)HKCleanings::TYPE_OWNER));
            $isCheckout = ($typeLower === strtolower((string)HKCleanings::TYPE_CHECKOUT));

            if ($isRedo) {
                if (method_exists($hk, 'setO2CollectedFee')) {
                    $hk->setO2CollectedFee('0');
                }
            } else {
                // If caller provided a collected fee, it wins (accept snake_case and camelCase; 0 is valid).
                $o2CollectedFeeRaw = $data['o2_collected_fee'] ?? $data['o2CollectedFee'] ?? null;
                if ($o2CollectedFeeRaw !== null && $o2CollectedFeeRaw !== '' && method_exists($hk, 'setO2CollectedFee')) {
                    $hk->setO2CollectedFee((string)$o2CollectedFeeRaw);
                } else {
                    // For checkout/owner, default collected fee to Unit cleaning_fee if available.
                    if (($isOwner || $isCheckout) && method_exists($unit, 'getCleaningFee') && method_exists($hk, 'setO2CollectedFee')) {
                        $unitFee = $unit->getCleaningFee();
                        if ($unitFee !== null && $unitFee !== '') {
                            $hk->setO2CollectedFee((string)$unitFee);
                        }
                    }
                }
            }

            // Ensure created_at is set if supported and empty
            if (method_exists($hk, 'setCreatedAt')) {
                $getCreatedAt = method_exists($hk, 'getCreatedAt') ? $hk->getCreatedAt() : null;
                if (!$getCreatedAt) {
                    $hk->setCreatedAt(new \DateTimeImmutable());
                }
            }

            // If bulkCreate inserts a row already marked DONE, also create the hktransactions ledger row.
            if (strtolower((string)$status) === strtolower((string)HKCleanings::STATUS_DONE)) {
                $toFinalize[] = $hk;
            }
            $this->em->persist($hk);
            $created++;
        }

        $this->em->flush();

        // If any rows were created/updated as DONE during bulkCreate, ensure hktransactions rows exist.
        // markDoneAndCreateTransaction() is idempotent, so this is safe to call.
        foreach ($toFinalize as $hkDone) {
            try {
                $this->markDoneAndCreateTransaction($hkDone);
            } catch (\Throwable $e) {
                // Do not fail bulkCreate for a single ledger issue; keep creating remaining rows.
                // (Logger not injected here; silent fail by design.)
            }
        }

        return [
            'created' => $created,
            'skipped' => $skipped,
            'ledgerCreated' => $ledgerCreated,
        ];
    }

    /**
     * Mark a cleaning as done and create (idempotently) the matching hk_transactions row.
     *
     * Why: hk_transactions is the P&L / reporting ledger for cleanings. Every DONE cleaning must have
     * exactly one hk_transactions row (even if paid/charged are 0), plus separate rows for laundry/salaries.
     *
     * Idempotent: if a transaction already exists linked to this cleaning, it will be returned.
     */
    public function markDoneAndCreateTransaction(HKCleanings $hk): array
    {
        // 1) At the very beginning: ensure doneAt is set if missing
        $now = new \DateTimeImmutable('now', new DateTimeZone('America/Cancun'));
        if (
            method_exists($hk, 'getDoneAt') &&
            method_exists($hk, 'setDoneAt') &&
            (empty($hk->getDoneAt()))
        ) {
            $hk->setDoneAt($now);
        }

        // Ensure status is DONE (soft guard; controller already set it)
        if (method_exists($hk, 'getStatus') && method_exists($hk, 'setStatus')) {
            if ($hk->getStatus() !== HKCleanings::STATUS_DONE) {
                $hk->setStatus(HKCleanings::STATUS_DONE);
            }
        }

        // 7) Persist $hk after setting status/doneAt
        $this->em->persist($hk);

        // Ensure a reconcile row exists when a cleaning becomes DONE (idempotent).
        // This supports historical cost snapshots (rate changes over time) without overwriting prior months.
        try {
            $this->ensureReconcileRowExistsForDoneCleaning($hk);
        } catch (\Throwable $e) {
            // Reconcile is best-effort; never block DONE/ledger creation.
        }

        $unit = method_exists($hk, 'getUnit') ? $hk->getUnit() : null;
        if (!$unit instanceof Unit) {
            throw new \RuntimeException('HKCleaning has no Unit; cannot create transaction');
        }

        // Snapshot o2_collected_fee when missing for checkout/owner.
        // We want charged to always reflect what we charged the owner/guest for this cleaning.
        // Rule: checkout + owner -> use Unit.cleaning_fee when hk.o2_collected_fee is NULL/empty.
        try {
            $cleaningTypeSnap = method_exists($hk, 'getCleaningType') ? (string)$hk->getCleaningType() : '';
            $typeLowerSnap = strtolower(trim($cleaningTypeSnap));
            $isOwnerSnap = ($typeLowerSnap === strtolower((string)HKCleanings::TYPE_OWNER));
            $isCheckoutSnap = ($typeLowerSnap === strtolower((string)HKCleanings::TYPE_CHECKOUT));

            if (($isOwnerSnap || $isCheckoutSnap)
                && method_exists($hk, 'getO2CollectedFee')
                && method_exists($hk, 'setO2CollectedFee')
                && method_exists($unit, 'getCleaningFee')
            ) {
                $cur = $hk->getO2CollectedFee();
                if ($cur === null || trim((string)$cur) === '') {
                    $unitFee = $unit->getCleaningFee();
                    if ($unitFee !== null && trim((string)$unitFee) !== '') {
                        $hk->setO2CollectedFee((string)$unitFee);
                        $this->em->persist($hk);
                    }
                }
            }
        } catch (\Throwable $e) {
            // best-effort; never block transaction creation
        }

        // 2) Use checkoutDate for tx date (reporting is by checkout day)
        $date = method_exists($hk, 'getCheckoutDate') ? $hk->getCheckoutDate() : null;
        if (!$date instanceof \DateTimeInterface) {
            throw new \RuntimeException('HKCleaning has no checkout date; cannot create transaction');
        }

        // Normalize to DateTimeImmutable
        $txDateImmutable = $date instanceof \DateTimeImmutable ? $date : \DateTimeImmutable::createFromInterface($date);

        // Always create an HKTransactions row for every cleaning marked done.
        $billTo = '';
        if (method_exists($hk, 'getBillTo')) {
            $billTo = $hk->getBillTo();
        }

        // 5) Idempotency: always try to find tx by ['hkCleaning' => $hk] if not found by getHkTransaction
        $txRepo = $this->em->getRepository(HKTransactions::class);
        $existingTx = null;
        // Fast-path: check inverse/bidirectional relation if present on HKCleanings
        if (method_exists($hk, 'getHkTransaction')) {
            $maybeTx = $hk->getHkTransaction();
            if ($maybeTx instanceof HKTransactions) {
                $existingTx = $maybeTx;
            }
        }
        // Always try repo lookup by hkCleaning
        if (!$existingTx) {
            $existingTx = $txRepo->findOneBy(['hkCleaning' => $hk]);
        }
        if ($existingTx) {
            return [
                'id' => method_exists($existingTx, 'getId') ? $existingTx->getId() : null,
                'transactionCode' => method_exists($existingTx, 'getTransactionCode') ? $existingTx->getTransactionCode() : null,
                'alreadyExisted' => true,
            ];
        }

        $city = method_exists($hk, 'getCity') ? (string)$hk->getCity() : (method_exists($unit, 'getCity') ? (string)$unit->getCity() : '');
        $dateYmd = $txDateImmutable->format('Y-m-d');

        $cleaningType = method_exists($hk, 'getCleaningType') ? (string)$hk->getCleaningType() : '';
        $typeLower = strtolower(trim($cleaningType));

        $isOwner = ($typeLower === strtolower((string)HKCleanings::TYPE_OWNER));
        $isCheckout = ($typeLower === strtolower((string)HKCleanings::TYPE_CHECKOUT));
        $isRedo = ($typeLower === 'redo') || (\defined(HKCleanings::class . '::TYPE_REDO') && $cleaningType === HKCleanings::TYPE_REDO);

        // 3) Compute paid as cleaning_cost + laundry_cost (numeric, 2-decimal string)
        $cleaningCost = 0.0;
        if (method_exists($hk, 'getCleaningCost')) {
            $ccost = $hk->getCleaningCost();
            if ($ccost !== null && $ccost !== '') {
                $cleaningCost = (float)$ccost;
            } else {
                $resolved = $this->rateResolver->resolveAmountForDateStr((int)$unit->getId(), $city, $dateYmd);
                if ($resolved !== null && $resolved !== '') {
                    $cleaningCost = (float)$resolved;
                }
            }
        }
        $laundryCost = 0.0;
        if (method_exists($hk, 'getLaundryCost')) {
            $lc = $hk->getLaundryCost();
            if ($lc !== null && $lc !== '') {
                $laundryCost = (float)$lc;
            }
        }
        $paidSum = $cleaningCost + $laundryCost;
        $paidStr = number_format($paidSum, 2, '.', '');

        // 4) Compute charged as o2_collected_fee (2-decimal string)
        // (Snapshot rule above should have filled it for checkout/owner when possible.)
        $chargedVal = null;
        if (method_exists($hk, 'getO2CollectedFee')) {
            $collected = $hk->getO2CollectedFee();
            if ($collected !== null && trim((string)$collected) !== '') {
                $chargedVal = (float)$collected;
            }
        }
        if ($chargedVal === null && method_exists($unit, 'getCleaningFee')) {
            $ufee = $unit->getCleaningFee();
            if ($ufee !== null && trim((string)$ufee) !== '') {
                $chargedVal = (float)$ufee;
            }
        }
        if ($chargedVal === null) {
            $chargedVal = 0.0;
        }
        $chargedStr = number_format((float)$chargedVal, 2, '.', '');

        $tx = new HKTransactions();
        if (method_exists($tx, 'setDate')) {
            $tx->setDate($txDateImmutable);
        }
        if (method_exists($tx, 'setUnit')) {
            $tx->setUnit($unit);
        }
        if (method_exists($tx, 'setCity')) {
            $tx->setCity($city);
        }

        $catRepo = $this->em->getRepository(TransactionCategory::class);

        if ($isCheckout) {
            // Prefer fixed category id=7 for checkout cleanings
            $cat = $catRepo->find(7);
            if (!$cat) {
                $cat = $catRepo->findOneBy(['name' => 'Limpieza']);
                if (!$cat) {
                    $cat = $catRepo->createQueryBuilder('c')
                        ->where('LOWER(c.name) = :n')
                        ->setParameter('n', 'limpieza')
                        ->setMaxResults(1)
                        ->getQuery()
                        ->getOneOrNullResult();
                }
            }
            if (!$cat) {
                $cat = new TransactionCategory();
                if (method_exists($cat, 'setName')) {
                    $cat->setName('Limpieza');
                }
                $this->em->persist($cat);
            }
        } else {
            // Prefer fixed category id=8 for non-checkout cleanings
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
                if (method_exists($cat, 'setName')) {
                    $cat->setName('Limpieza_extra');
                }
                $this->em->persist($cat);
            }
        }
        if (method_exists($tx, 'setCategory')) { $tx->setCategory($cat); }

        // allocation_target = who we charge (Client/Owners2/Guest/Housekeepers)
        // cost_centre = internal accounting bucket (HK_Playa / HK_Tulum / HK_General)

        // 1) Who we charge
        if (method_exists($tx, 'setAllocationTarget')) {
            $billToNorm = strtoupper(trim((string) $billTo));
            if ($billToNorm === '') {
                $billToNorm = 'OWNERS2';
            }
            if ($billToNorm === 'CLIENT') {
                $tx->setAllocationTarget('Client');
            } elseif ($billToNorm === 'OWNERS2') {
                $tx->setAllocationTarget('Owners2');
            } elseif ($billToNorm === 'GUEST') {
                $tx->setAllocationTarget('Guest');
            } elseif ($billToNorm === 'HOUSEKEEPERS') {
                $tx->setAllocationTarget('Housekeepers');
            } else {
                // Fallback: keep a readable value
                $tx->setAllocationTarget($billToNorm !== '' ? $billToNorm : 'Client');
            }
        }

        // 2) Where it is recorded internally
        $cc = null;
        if (method_exists($hk, 'getCostCentre')) {
            $cc = $hk->getCostCentre();
        }

        // Canonical values: HK_Playa | HK_Tulum | HK_General
        // Backward-compatible inputs: housekeepers_playa | housekeepers_tulum | general
        $ccNorm = trim((string) ($cc ?? ''));
        if ($ccNorm !== '') {
            $lc = strtolower($ccNorm);
            if ($lc === 'housekeepers_playa') {
                $ccNorm = HKCleanings::COST_CENTRE_HK_PLAYA;
            } elseif ($lc === 'housekeepers_tulum') {
                $ccNorm = HKCleanings::COST_CENTRE_HK_TULUM;
            } elseif ($lc === 'general') {
                $ccNorm = HKCleanings::COST_CENTRE_GENERAL;
            }
        }

        if ($ccNorm === '') {
            $cityNorm = strtolower(trim((string) $city));
            if (str_contains($cityNorm, 'tulum')) {
                $ccNorm = HKCleanings::COST_CENTRE_HK_TULUM;
            } elseif (str_contains($cityNorm, 'playa')) {
                $ccNorm = HKCleanings::COST_CENTRE_HK_PLAYA;
            } else {
                $ccNorm = HKCleanings::COST_CENTRE_GENERAL;
            }
        }

        if (method_exists($tx, 'setCostCentre')) {
            $tx->setCostCentre($ccNorm);
        }

        if (method_exists($tx, 'setDescription')) {
            // Keep it simple and auditable: description mirrors hk_cleanings.cleaning_type
            $tx->setDescription($cleaningType);
        }
        if (method_exists($tx, 'setPaid')) {
            $tx->setPaid($paidStr);
        }
        if (method_exists($tx, 'setCharged')) {
            $tx->setCharged($chargedStr);
        }
        // 6) Set notes if available
        if (method_exists($tx, 'setNotes')) {
            $notesVal = null;
            if (method_exists($hk, 'getNotes')) {
                $notesVal = $hk->getNotes();
            }
            $tx->setNotes($notesVal);
        }
        if (method_exists($tx, 'generateTransactionCode')) {
            $tx->generateTransactionCode();
        }
        // 5) Always setHkCleaning
        $tx->setHkCleaning($hk);

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

    /**
     * Create (idempotently) a hk_cleanings_reconcile row for a DONE cleaning.
     *
     * Current design:
     * - We keep reconciliation rows for **Tulum only**.
     * - One reconcile row per hk_cleanings row (unique by hk_cleaning_id).
     * - This table is a historical snapshot store (rates can change over time).
     */
    private function ensureReconcileRowExistsForDoneCleaning(HKCleanings $hk): void
    {
        if (!method_exists($hk, 'getId')) {
            return;
        }
        $hkId = (int)($hk->getId() ?? 0);
        if ($hkId <= 0) {
            return;
        }

        $unit = method_exists($hk, 'getUnit') ? $hk->getUnit() : null;
        if (!$unit instanceof Unit) {
            return;
        }

        $checkout = method_exists($hk, 'getCheckoutDate') ? $hk->getCheckoutDate() : null;
        if (!$checkout instanceof \DateTimeInterface) {
            return; // checkout_date required
        }
        $checkoutDt = $checkout instanceof \DateTimeImmutable ? $checkout : \DateTimeImmutable::createFromInterface($checkout);

        $city = method_exists($hk, 'getCity') ? (string)($hk->getCity() ?? '') : '';
        if ($city === '' && method_exists($unit, 'getCity')) {
            $city = (string)($unit->getCity() ?? '');
        }

        // Tulum only
        if (strtolower(trim($city)) !== 'tulum') {
            return;
        }

        $reportMonth = $checkoutDt->format('Y-m');
        $serviceDate = $checkoutDt->format('Y-m-d');

        // Snapshot values
        $cleaningCostStr = null;
        if (method_exists($hk, 'getCleaningCost')) {
            $cc = $hk->getCleaningCost();
            if ($cc !== null && trim((string)$cc) !== '') {
                $cleaningCostStr = number_format((float)$cc, 2, '.', '');
            }
        }
        if (($cleaningCostStr === null || $cleaningCostStr === '') && method_exists($unit, 'getId')) {
            try {
                $resolved = $this->rateResolver->resolveAmountForDateStr((int)$unit->getId(), 'Tulum', $serviceDate);
                if ($resolved !== null && trim((string)$resolved) !== '') {
                    $cleaningCostStr = number_format((float)$resolved, 2, '.', '');
                }
            } catch (\Throwable) {
                // ignore
            }
        }
        if ($cleaningCostStr === null || $cleaningCostStr === '') {
            $cleaningCostStr = '0.00';
        }

        $laundryCostStr = '0.00';
        if (method_exists($hk, 'getLaundryCost')) {
            $lc = $hk->getLaundryCost();
            if ($lc !== null && trim((string)$lc) !== '') {
                $laundryCostStr = number_format((float)$lc, 2, '.', '');
            }
        }

        $realTotalStr = number_format(((float)$cleaningCostStr) + ((float)$laundryCostStr), 2, '.', '');

        // Notes: keep notes ONLY in reconcile (do not store into hk_cleanings).
        // Some schemas may not have hk_cleanings.notes; so we default to NULL.
        $notes = null;

        // Idempotency: if row already exists for this hk_cleaning_id, do nothing.
        try {
            $exists = $this->conn->fetchOne(
                'SELECT 1 FROM hk_cleanings_reconcile WHERE hk_cleaning_id = :cid LIMIT 1',
                ['cid' => $hkId]
            );
            if ($exists) {
                return;
            }
        } catch (\Throwable) {
            // If table doesn't exist or query fails, abort silently.
            return;
        }

        // Insert a minimal reconcile row.
        // IMPORTANT: We do NOT overwrite existing rows; this is a snapshot starter row.
        try {
            $this->conn->executeStatement(
                'INSERT INTO hk_cleanings_reconcile
                    (unit_id, city, report_month, service_date, cleaning_cost, real_cleaning_cost, laundry_cost, notes, created_at, updated_at, hk_cleaning_id)
                 VALUES
                    (:unit_id, :city, :report_month, :service_date, :cleaning_cost, :real_cleaning_cost, :laundry_cost, :notes, NOW(), NOW(), :hk_cleaning_id)',
                [
                    'unit_id' => (int)$unit->getId(),
                    'city' => 'Tulum',
                    'report_month' => $reportMonth,
                    'service_date' => $serviceDate,
                    'cleaning_cost' => (float)$cleaningCostStr,
                    'real_cleaning_cost' => (float)$realTotalStr,
                    'laundry_cost' => (float)$laundryCostStr,
                    'notes' => ($notes !== null && trim((string)$notes) !== '' ? trim((string)$notes) : null),
                    'hk_cleaning_id' => $hkId,
                ]
            );
        } catch (\Throwable) {
            // schema mismatch or missing columns: fail silently
            return;
        }
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