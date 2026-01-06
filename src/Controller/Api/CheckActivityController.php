<?php

namespace App\Controller\Api;

use App\Entity\AllBookings;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\DBAL\Types\Types;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Request;

class CheckActivityController extends AbstractController
{
    #[Route('/api/bookings/check-activity', name: 'api_check_activity', methods: ['GET'])]
    public function __invoke(Request $request, EntityManagerInterface $em): JsonResponse
    {
        // Normalize incoming dates to immutable date-only (Y-m-d)
        $startRaw = $request->query->get('start');
        $endRaw = $request->query->get('end');

        $startBase = \DateTimeImmutable::createFromFormat('Y-m-d', (string) $startRaw)
            ?: ($startRaw ? new \DateTimeImmutable((string) $startRaw) : null);
        $endBase = \DateTimeImmutable::createFromFormat('Y-m-d', (string) $endRaw)
            ?: ($endRaw ? new \DateTimeImmutable((string) $endRaw) : null);

        $start = $startBase ? \DateTimeImmutable::createFromFormat('Y-m-d', $startBase->format('Y-m-d')) : null;
        $end = $endBase ? \DateTimeImmutable::createFromFormat('Y-m-d', $endBase->format('Y-m-d')) : null;
        $city = $request->query->get('city');

        if (!$start || !$end) {
            return $this->json(['error' => 'Start and end dates are required.'], 400);
        }

        $repo = $em->getRepository(AllBookings::class);

        // Exclude cancelled and Owners2 block/hold codes
        $shouldSkip = function (AllBookings $b): bool {
            $status = strtolower(trim((string)($b->getStatus() ?? '')));
            $code = strtoupper(trim((string)($b->getConfirmationCode() ?? '')));
            if (in_array($status, ['cancelled', 'canceled'], true)) return true;
            if (str_starts_with($code, 'O2B') || str_starts_with($code, 'O2H')) return true;
            return false;
        };

        // Helper: last checkout before a given date for a unit, excluding Cancelled and O2B/O2H blocks
        $getLastCheckout = function (int $unitId, \DateTimeInterface $before) use ($repo) : ?\DateTimeInterface {
            $qb = $repo->createQueryBuilder('b')
                ->select('MAX(b.checkOut) AS lastCo')
                ->where('b.unitId = :uid')
                ->andWhere('b.checkOut < :before')
                ->andWhere('LOWER(b.status) NOT IN (:bad)')
                ->andWhere('(b.confirmationCode IS NULL OR (b.confirmationCode NOT LIKE :o2b AND b.confirmationCode NOT LIKE :o2h))')
                ->setParameter('uid', $unitId)
                ->setParameter('before', $before, Types::DATE_IMMUTABLE)
                ->setParameter('bad', ['cancelled','canceled'])
                ->setParameter('o2b', 'O2B%')
                ->setParameter('o2h', 'O2H%')
                ->setMaxResults(1);
            $raw = $qb->getQuery()->getSingleScalarResult();
            if (!$raw) {
                return null;
            }
            if ($raw instanceof \DateTimeInterface) {
                return \DateTimeImmutable::createFromMutable($raw instanceof \DateTime ? $raw : new \DateTime($raw->format('Y-m-d')));
            }
            try {
                return new \DateTimeImmutable((string)$raw);
            } catch (\Throwable $e) {
                return null;
            }
        };

        // Fetch bookings where checkIn is within range
        $qbCheckIn = $repo->createQueryBuilder('b')
            ->where('b.checkIn BETWEEN :start AND :end')
            ->setParameter('start', $start, Types::DATE_IMMUTABLE)
            ->setParameter('end', $end, Types::DATE_IMMUTABLE);

        if ($city) {
            $qbCheckIn->andWhere('b.city = :city')
                      ->setParameter('city', $city);
        }

        $checkInBookings = $qbCheckIn->getQuery()->getResult();
        $checkInBookings = array_values(array_filter($checkInBookings, fn($b) => !$shouldSkip($b)));

        // Fetch bookings where checkOut is within range
        $qbCheckOut = $repo->createQueryBuilder('b')
            ->where('b.checkOut BETWEEN :start AND :end')
            ->setParameter('start', $start, Types::DATE_IMMUTABLE)
            ->setParameter('end', $end, Types::DATE_IMMUTABLE);

        if ($city) {
            $qbCheckOut->andWhere('b.city = :city')
                       ->setParameter('city', $city);
        }

        $checkOutBookings = $qbCheckOut->getQuery()->getResult();
        $checkOutBookings = array_values(array_filter($checkOutBookings, fn($b) => !$shouldSkip($b)));

        // Combine results, marking each entry by event type
        $combined = [];

        // Use booking id as key to merge check-in and check-out flags
        foreach ($checkInBookings as $b) {
            $combined[$b->getId()] = [
                'booking' => $b,
                'check_in' => true,
                'check_out' => false,
            ];
        }

        foreach ($checkOutBookings as $b) {
            if (isset($combined[$b->getId()])) {
                $combined[$b->getId()]['check_out'] = true;
            } else {
                $combined[$b->getId()] = [
                    'booking' => $b,
                    'check_in' => false,
                    'check_out' => true,
                ];
            }
        }

        $data = array_map(function ($entry) {
            $b = $entry['booking'];
            $code = $b->getConfirmationCode();
            return [
                'id' => $b->getId(),
                'unit_id' => $b->getUnitId(),
                'unit_name' => $b->getUnitName(),
                'guest' => $b->getGuestName(),
                'reservation_code' => $code,
                'source' => $b->getSource(),
                'check_in' => $b->getCheckIn()?->format('Y-m-d'),
                'check_out' => $b->getCheckOut()?->format('Y-m-d'),
                'notes' => $b->getNotes(),
                'check_in_notes' => $b->getCheckInNotes(),
                'check_out_notes' => $b->getCheckOutNotes(),
                'city' => $b->getCity(),
                'event_check_in' => $entry['check_in'],
                'event_check_out' => $entry['check_out'],
            ];
        }, $combined);

        // Enrich check-in rows with last checkout gap
        foreach ($data as &$row) {
            $row['last_checkout'] = null;
            $row['days_since_last_checkout'] = null;
            if (!empty($row['event_check_in']) && !empty($row['unit_id']) && !empty($row['check_in'])) {
                try {
                    $ci = new \DateTimeImmutable((string)$row['check_in']);
                    $last = $getLastCheckout((int)$row['unit_id'], $ci);
                    if ($last instanceof \DateTimeInterface) {
                        $row['last_checkout'] = $last->format('Y-m-d');
                        $row['days_since_last_checkout'] = (int)$last->diff($ci)->days;
                    }
                } catch (\Throwable $e) {
                    // ignore parse errors
                }
            }
        }
        unset($row);

        // --- Enrich with Housekeepers cleaning info (hk_cleanings) ---
        // Collect unit ids and min/max checkout dates from rows
        $unitIds = [];
        $minCheckout = null; // 'Y-m-d'
        $maxCheckout = null; // 'Y-m-d'
        foreach ($data as $r) {
            if (!empty($r['unit_id'])) {
                $unitIds[(int)$r['unit_id']] = true;
            }
            if (!empty($r['check_out'])) {
                $d = substr((string)$r['check_out'], 0, 10);
                if ($d) {
                    if ($minCheckout === null || $d < $minCheckout) { $minCheckout = $d; }
                    if ($maxCheckout === null || $d > $maxCheckout) { $maxCheckout = $d; }
                }
            }
        }

        $hkIndex = [];
        if (!empty($unitIds) && $minCheckout !== null && $maxCheckout !== null) {
            $conn = $em->getConnection();
            $hkSql = [];
            $hkSql[] = 'SELECT h.id,';
            $hkSql[] = '       h.unit_id AS unitId,';
            $hkSql[] = '       DATE(h.checkout_date) AS checkoutDate,';
            $hkSql[] = '       h.status,';
            $hkSql[] = '       h.o2_collected_fee AS collectedFee,';
            $hkSql[] = '       h.assigned_to_id AS assignedToId,';
            $hkSql[] = '       e.short_name AS assignedToShortName';
            $hkSql[] = 'FROM hk_cleanings h';
            $hkSql[] = 'LEFT JOIN employee e ON e.id = h.assigned_to_id';
            $hkSql[] = "WHERE h.cleaning_type = 'checkout'";
            $hkSql[] = '  AND h.checkout_date BETWEEN :d1 AND :d2';
            $hkSql[] = '  AND h.unit_id IN (' . implode(',', array_map('intval', array_keys($unitIds))) . ')';

            $stmt = $conn->prepare(implode("\n", $hkSql));
            $stmt->bindValue(':d1', $minCheckout);
            $stmt->bindValue(':d2', $maxCheckout);
            $hkRows = $stmt->executeQuery()->fetchAllAssociative();

            foreach ($hkRows as $h) {
                $u = (int)$h['unitId'];
                $d = (string)$h['checkoutDate']; // Y-m-d
                $hkIndex[$u][$d] = [
                    'id' => (int)($h['id'] ?? 0),
                    'status' => (string)($h['status'] ?? ''),
                    'collectedFee' => number_format((float)($h['collectedFee'] ?? 0), 2, '.', ''),
                    'assignedToId' => isset($h['assignedToId']) ? (int) $h['assignedToId'] : null,
                    'assignedToShortName' => isset($h['assignedToShortName']) ? (string) $h['assignedToShortName'] : null,
                ];
            }
        }

        // Attach HK info only for checkout events
        foreach ($data as &$row) {
            // Default flat fields
            $row['hk_cleaning_id'] = null;
            $row['hk_done'] = false;
            $row['hk_assigned_to_id'] = null;
            $row['hk_assigned_to_short_name'] = null;

            if (!empty($row['event_check_out'])) {
                $u = isset($row['unit_id']) ? (int) $row['unit_id'] : null;
                $d = !empty($row['check_out']) ? substr((string) $row['check_out'], 0, 10) : null;

                if ($u && $d && isset($hkIndex[$u][$d])) {
                    $h = $hkIndex[$u][$d];
                    $isDone = strtolower((string) $h['status']) === 'done';

                    $row['hk'] = [
                        'id'   => $h['id'],
                        'done' => $isDone,
                        'assignedToId' => $h['assignedToId'] ?? null,
                        'assignedToShortName' => $h['assignedToShortName'] ?? null,
                    ];
                    $row['hk_cleaning_id'] = $h['id'];
                    $row['hk_done'] = $isDone;
                    $row['hk_assigned_to_id'] = $h['assignedToId'] ?? null;
                    $row['hk_assigned_to_short_name'] = $h['assignedToShortName'] ?? null;
                } else {
                    // No matching hk_cleanings row
                    $row['hk'] = null;
                }
            } else {
                // Not a checkout event → no hk link needed
                $row['hk'] = null;
            }
        }
        unset($row);

        // --- Enrich with checklist draft/submission info (hk_cleaning_checklist) ---
        // We match by hk_cleanings.id (cleaning_id in hk_cleaning_checklist)
        $cleaningIds = [];
        foreach ($data as $r) {
            if (!empty($r['hk_cleaning_id'])) {
                $cleaningIds[(int) $r['hk_cleaning_id']] = true;
            }
        }

        $checklistIndex = []; // cleaningId => ['submittedAt' => mixed|null, 'cleanerId' => int|null]
        if (!empty($cleaningIds)) {
            $conn = $em->getConnection();
            $sql = [];
            $sql[] = 'SELECT c.cleaning_id AS cleaningId, c.cleaner_id AS cleanerId, c.submitted_at AS submittedAt, e.short_name AS cleanerShortName';
            $sql[] = 'FROM hk_cleaning_checklist c';
            $sql[] = 'LEFT JOIN employee e ON e.id = c.cleaner_id';
            $sql[] = 'WHERE c.cleaning_id IN (' . implode(',', array_map('intval', array_keys($cleaningIds))) . ')';

            $stmt = $conn->prepare(implode("\n", $sql));
            $rows = $stmt->executeQuery()->fetchAllAssociative();

            foreach ($rows as $c) {
                $cid = (int) ($c['cleaningId'] ?? 0);
                if ($cid <= 0) {
                    continue;
                }
                $checklistIndex[$cid] = [
                    'submittedAt' => $c['submittedAt'] ?? null,
                    'cleanerId'   => isset($c['cleanerId']) ? (int) $c['cleanerId'] : null,
                    'cleanerShortName' => isset($c['cleanerShortName']) ? (string) $c['cleanerShortName'] : null,
                ];
            }
        }

        foreach ($data as &$row) {
            // defaults
            $row['checklist_has_draft'] = false;
            $row['checklist_submitted_at'] = null;
            $row['checklist_cleaner_id'] = null;
            $row['checklist_cleaner_short_name'] = null;

            $cid = !empty($row['hk_cleaning_id']) ? (int) $row['hk_cleaning_id'] : 0;
            if ($cid > 0 && array_key_exists($cid, $checklistIndex)) {
                $submittedAt = $checklistIndex[$cid]['submittedAt'] ?? null;
                $row['checklist_cleaner_id'] = $checklistIndex[$cid]['cleanerId'] ?? null;
                $row['checklist_cleaner_short_name'] = $checklistIndex[$cid]['cleanerShortName'] ?? null;

                // If submitted_at is NULL => draft exists (saved but not submitted)
                if ($submittedAt === null) {
                    $row['checklist_has_draft'] = true;
                    $row['checklist_submitted_at'] = null;
                } else {
                    // submitted_at present
                    try {
                        if ($submittedAt instanceof \DateTimeInterface) {
                            $row['checklist_submitted_at'] = $submittedAt->format('Y-m-d H:i:s');
                        } else {
                            $dt = new \DateTimeImmutable((string) $submittedAt);
                            $row['checklist_submitted_at'] = $dt->format('Y-m-d H:i:s');
                        }
                    } catch (\Throwable $e) {
                        // fallback to raw string
                        $row['checklist_submitted_at'] = is_string($submittedAt) ? $submittedAt : null;
                    }

                    $row['checklist_has_draft'] = false;
                }
            }
        }
        unset($row);

        return $this->json(array_values($data));
    }
}
