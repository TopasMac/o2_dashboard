<?php

namespace App\Controller\Api;

use App\Entity\HKCleanings;
use App\Service\HKReconcileService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/hk-reconcile')]
class HKCleaningsReconcileController extends AbstractController
{
    #[Route('', name: 'api_hk_reconcile_list', methods: ['GET'])]
    public function list(Request $request, HKReconcileService $reconcileService): JsonResponse
    {
        $month = (string) $request->query->get('month', '');
        $city  = (string) $request->query->get('city', 'Tulum');

        if ($month === '' || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            return $this->json(['error' => 'Invalid or missing month (YYYY-MM)'], 400);
        }

        try {
            $view = $reconcileService->getMonthView($month, $city);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (\Throwable $e) {
            return $this->json(['error' => 'exception', 'message' => $e->getMessage()], 500);
        }

        return $this->json([
            'ok' => true,
            'month' => $month,
            'city' => $city,
            // keep payload backward-compatible for the current frontend page:
            // `data` is the table rows.
            'data' => $view['rows'] ?? [],
            // extra month totals for later UI (optional to render now)
            'totals' => $view['totals'] ?? null,
        ]);
    }

    #[Route('', name: 'api_hk_reconcile_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        return $this->json([
            'ok' => false,
            'error' => 'method_not_allowed',
            'message' => 'Create is not supported. Reconcile rows are derived from hk_cleanings. Use PUT /api/hk-reconcile/{hk_cleaning_id} to update costs on hk_cleanings.',
        ], Response::HTTP_METHOD_NOT_ALLOWED);
    }

    #[Route('/{id<\d+>}', name: 'api_hk_reconcile_update', methods: ['PUT'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $payload = [];
        try {
            $payload = $request->toArray();
        } catch (\Throwable $e) {
            // ignore, keep empty
        }

        /** @var HKCleanings|null $hk */
        $hk = $em->getRepository(HKCleanings::class)->find($id);
        if (!$hk) {
            return $this->json([
                'ok' => false,
                'error' => 'not_found',
                'message' => 'HK cleaning not found',
            ], Response::HTTP_NOT_FOUND);
        }

        // Optional guardrails: city/month filters (frontend passes them on the list endpoint; we accept them here too)
        $qCity = (string) $request->query->get('city', '');
        if ($qCity !== '') {
            $hkCity = method_exists($hk, 'getCity') ? (string)($hk->getCity() ?? '') : '';
            if ($hkCity !== '' && strcasecmp($hkCity, $qCity) !== 0) {
                return $this->json([
                    'ok' => false,
                    'error' => 'city_mismatch',
                    'message' => 'Cleaning city does not match requested city',
                    'city' => $hkCity,
                ], 409);
            }
        }

        $qMonth = (string) $request->query->get('month', '');
        if ($qMonth !== '' && preg_match('/^\d{4}-\d{2}$/', $qMonth)) {
            $d = method_exists($hk, 'getCheckoutDate') ? $hk->getCheckoutDate() : null;
            if ($d instanceof \DateTimeInterface) {
                $ym = $d->format('Y-m');
                if ($ym !== $qMonth) {
                    return $this->json([
                        'ok' => false,
                        'error' => 'month_mismatch',
                        'message' => 'Cleaning checkout month does not match requested month',
                        'month' => $ym,
                    ], 409);
                }
            }
        }

        // Only allow reconcile updates for DONE rows (per your workflow)
        $status = method_exists($hk, 'getStatus') ? (string)($hk->getStatus() ?? '') : '';
        if ($status !== '' && strtolower($status) !== 'done') {
            return $this->json([
                'ok' => false,
                'error' => 'invalid_status',
                'message' => 'Only DONE cleanings can be reconciled',
                'status' => $status,
            ], 409);
        }

        // Accept field aliases from frontend:
        // - cleaning_cost / real_cleaning_cost
        // - laundry_cost
        // - notes (stored into hk_cleanings_reconcile only)
        $cleaningCost = $payload['cleaning_cost'] ?? ($payload['real_cleaning_cost'] ?? null);
        $laundryCost  = $payload['laundry_cost'] ?? 0; // treat missing as 0
        $notes        = $payload['notes'] ?? null;
        $reportStatus = $payload['report_status'] ?? ($payload['reportStatus'] ?? null);

        // Basic numeric validation (>= 0), accept 0, treat empty/whitespace as 0, accept comma decimals
        $validateMoney = static function ($v): ?string {
            if ($v === null) return null;

            // Normalize strings: trim and allow comma decimals
            if (is_string($v)) {
                $v = trim($v);
                // Some UIs may send the literal strings "null"/"undefined"; treat them as empty.
                $lv = strtolower($v);
                if ($lv === 'null' || $lv === 'undefined') return null;
                if ($v === '') return null;
                $v = str_replace(',', '.', $v);
            }

            if (is_numeric($v)) {
                $n = (float)$v;
                if ($n < 0) return '__NEGATIVE__';
                return number_format($n, 2, '.', '');
            }

            return '__INVALID__';
        };

        $cc = $validateMoney($cleaningCost);
        if ($cc === '__INVALID__' || $cc === '__NEGATIVE__') {
            return $this->json([
                'ok' => false,
                'error' => 'invalid_cleaning_cost',
                'message' => 'cleaning_cost must be a number >= 0',
            ], 400);
        }

        $lc = $validateMoney($laundryCost);
        if ($lc === '__INVALID__' || $lc === '__NEGATIVE__') {
            return $this->json([
                'ok' => false,
                'error' => 'invalid_laundry_cost',
                'message' => 'laundry_cost must be a number >= 0',
            ], 400);
        }

        // Normalize empty values
        if ($cc === null) {
            $cc = '0.00';
        }
        if ($lc === null) {
            $lc = '0.00';
        }

        // Optional report_status validation (pending|reported|needs_review)
        $normalizedReportStatus = null;
        if ($reportStatus !== null && $reportStatus !== '') {
            $rs = strtolower(trim((string)$reportStatus));
            $allowed = ['pending', 'reported', 'needs_review'];
            if (!in_array($rs, $allowed, true)) {
                return $this->json([
                    'ok' => false,
                    'error' => 'invalid_report_status',
                    'message' => 'report_status must be one of: pending, reported, needs_review',
                ], 400);
            }
            $normalizedReportStatus = $rs;
        }

        if (method_exists($hk, 'setCleaningCost')) {
            $hk->setCleaningCost($cc);
        }
        if (method_exists($hk, 'setLaundryCost')) {
            $hk->setLaundryCost($lc);
        }

        // Default behavior on save:
        // - Tulum: pending -> reported
        // - If user explicitly sets needs_review, keep it.
        // - If current is needs_review and user didn't change it, do NOT override it.
        // - Playa: handled below (DONE implies reported)
        if ($normalizedReportStatus === null && method_exists($hk, 'getCity')) {
            $hkCityLower = strtolower(trim((string)($hk->getCity() ?? '')));
            if ($hkCityLower === 'tulum') {
                $curRs = method_exists($hk, 'getReportStatus') ? strtolower((string)($hk->getReportStatus() ?? '')) : '';

                // Only auto-promote when current is empty/pending/reported.
                // If current is needs_review, keep it.
                if ($curRs === '' || $curRs === 'pending' || $curRs === 'reported') {
                    $normalizedReportStatus = 'reported';
                }
            }
        }
        if ($normalizedReportStatus !== null && method_exists($hk, 'setReportStatus')) {
            $hk->setReportStatus($normalizedReportStatus);
        }
        if ($normalizedReportStatus === null
            && method_exists($hk, 'setReportStatus')
            && method_exists($hk, 'getCity')
        ) {
            $hkCity = strtolower(trim((string)($hk->getCity() ?? '')));
            if ($hkCity === 'playa del carmen') {
                // For Playa: DONE implies the cleaning has been reported.
                $hk->setReportStatus('reported');
            }
        }

        // Optional: mark reconciled (if fields exist)
        if (method_exists($hk, 'setReconciledAt')) {
            $hk->setReconciledAt(new \DateTimeImmutable());
        }
        if (method_exists($hk, 'setReconciledBy')) {
            $user = method_exists($this, 'getUser') ? $this->getUser() : null;
            if ($user && method_exists($user, 'getUserIdentifier')) {
                $hk->setReconciledBy((string)$user->getUserIdentifier());
            }
        }

        // Pre-flight guard: for Tulum we need checkout_date to build report_month/service_date
        $hkCityLower2 = method_exists($hk, 'getCity') ? strtolower(trim((string)($hk->getCity() ?? ''))) : '';
        $checkoutDate = null;
        if ($hkCityLower2 === 'tulum') {
            $d = method_exists($hk, 'getCheckoutDate') ? $hk->getCheckoutDate() : null;
            if (!$d instanceof \DateTimeInterface) {
                return $this->json([
                    'ok' => false,
                    'error' => 'missing_checkout_date',
                    'message' => 'checkout_date is required to reconcile a cleaning',
                ], 409);
            }
            $checkoutDate = $d;
        }

        $conn = $em->getConnection();
        $conn->beginTransaction();

        try {
            $em->persist($hk);
            $em->flush();

        // For Tulum only: persist a snapshot row into hk_cleanings_reconcile (idempotent upsert)
        // and keep hktransactions in sync.
        if ($hkCityLower2 === 'tulum') {

            $serviceDate = $checkoutDate->format('Y-m-d');
            $reportMonth = $checkoutDate->format('Y-m');

            // Money strings are formatted as "0.00".
            $ccNum = (float)$cc;
            $lcNum = (float)$lc;
            $realNum = null;
            if ($ccNum !== null) {
                $realNum = $ccNum + $lcNum;
            } else {
                // if no cleaning cost provided, still compute from laundry only
                $realNum = $lcNum;
            }

            // UPSERT by hk_cleaning_id
            $conn->executeStatement(
                'INSERT INTO hk_cleanings_reconcile (unit_id, city, report_month, service_date, cleaning_cost, laundry_cost, notes, created_at, updated_at, hk_cleaning_id, real_cleaning_cost)
                 VALUES (:unit_id, :city, :report_month, :service_date, :cleaning_cost, :laundry_cost, :notes, NOW(), NOW(), :hk_cleaning_id, :real_cleaning_cost)
                 ON DUPLICATE KEY UPDATE
                   unit_id = VALUES(unit_id),
                   city = VALUES(city),
                   report_month = VALUES(report_month),
                   service_date = VALUES(service_date),
                   cleaning_cost = VALUES(cleaning_cost),
                   laundry_cost = VALUES(laundry_cost),
                   notes = VALUES(notes),
                   real_cleaning_cost = VALUES(real_cleaning_cost),
                   updated_at = NOW()'
                ,
                [
                    'unit_id' => method_exists($hk, 'getUnit') && $hk->getUnit() ? $hk->getUnit()->getId() : null,
                    'city' => 'Tulum',
                    'report_month' => $reportMonth,
                    'service_date' => $serviceDate,
                    'cleaning_cost' => $ccNum,
                    'laundry_cost' => $lcNum,
                    'notes' => ($notes !== null && $notes !== '' ? trim((string)$notes) : null),
                    'hk_cleaning_id' => $hk->getId(),
                    'real_cleaning_cost' => $realNum,
                ]
            );

            // Sync hktransactions (paid/charged + notes) for the linked cleaning transaction
            // paid = cleaning_cost + laundry_cost
            // charged = o2_collected_fee (0 if null)
            $chargedNum = 0.0;
            if (method_exists($hk, 'getO2CollectedFee')) {
                $chargedNum = (float)($hk->getO2CollectedFee() ?? 0);
            }
            $paidNum = (float)($ccNum ?? 0) + (float)$lcNum;

            $conn->executeStatement(
                'UPDATE hktransactions
                 SET paid = :paid, charged = :charged
                 WHERE hk_cleaning_id = :hk_cleaning_id',
                [
                    'paid' => $paidNum,
                    'charged' => $chargedNum,
                    'hk_cleaning_id' => $hk->getId(),
                ]
            );
        }
            $conn->commit();
        } catch (\Throwable $e) {
            try {
                $conn->rollBack();
            } catch (\Throwable) {
                // ignore rollback errors
            }
            throw $e;
        }

        return $this->json([
            'ok' => true,
            'id' => $id,
            'updated' => [
                'cleaning_cost' => $cc,
                'laundry_cost' => $lc,
                'notes' => $notes,
                'report_status' => (method_exists($hk, 'getReportStatus') ? $hk->getReportStatus() : ($normalizedReportStatus ?? null)),
            ],
        ]);
    }

    #[Route('/{id<\d+>}', name: 'api_hk_reconcile_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        return $this->json([
            'ok' => false,
            'error' => 'method_not_allowed',
            'message' => 'Delete is not supported. Reconcile rows are derived from hk_cleanings.',
        ], Response::HTTP_METHOD_NOT_ALLOWED);
    }
}