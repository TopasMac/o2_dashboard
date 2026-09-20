<?php

namespace App\Controller\Api;

use App\Entity\AllBookings;
use App\Entity\Employee;
use App\Service\CleaningCityScopeService;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\DBAL\Types\Types;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Request;

class CheckActivityController extends AbstractController
{
    #[Route('/api/bookings/check-activity', name: 'api_check_activity', methods: ['GET'])]
    public function __invoke(
        Request $request,
        EntityManagerInterface $em,
        CleaningCityScopeService $cityScope,
    ): JsonResponse
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
        $requestedCity = $request->query->get('city');
        $user = $this->getUser();
        $employee = $user && method_exists($user, 'getEmployee')
            ? $user->getEmployee()
            : null;
        $city = $cityScope->resolve(
            $employee instanceof Employee ? $employee : null,
            $this->isGranted('ROLE_ADMIN'),
            is_string($requestedCity) ? $requestedCity : null,
        );

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
        // Collect unit ids from booking activity rows.
        $unitIds = [];
        foreach ($data as $r) {
            if (!empty($r['unit_id'])) {
                $unitIds[(int)$r['unit_id']] = true;
            }
        }

        // Include the practical unit/condo access details used by the mobile
        // cleaning calendar. These values are deliberately returned with the
        // general response so the access panel can open immediately. Client
        // accounts use this endpoint elsewhere, so credentials remain limited
        // to operational staff roles.
        $unitAccessIndex = [];
        $canViewUnitAccess = $this->isGranted('ROLE_ADMIN')
            || $this->isGranted('ROLE_MANAGER')
            || $this->isGranted('ROLE_EMPLOYEE');
        if ($canViewUnitAccess && !empty($unitIds)) {
            $conn = $em->getConnection();
            $accessSql = [];
            $accessSql[] = 'SELECT u.id AS unitId,';
            $accessSql[] = '       u.unit_number AS unitNumber,';
            $accessSql[] = '       u.unit_floor AS unitFloor,';
            $accessSql[] = '       u.access_type AS accessType,';
            $accessSql[] = '       u.access_code AS accessCode,';
            $accessSql[] = '       u.wifi_name AS wifiName,';
            $accessSql[] = '       u.wifi_password AS wifiPassword,';
            $accessSql[] = '       c.condo_name AS condoName,';
            $accessSql[] = '       c.door_code AS condoDoorCode';
            $accessSql[] = 'FROM unit u';
            $accessSql[] = 'LEFT JOIN condo c ON c.id = u.condo_id';
            $accessSql[] = 'WHERE u.id IN (' . implode(',', array_map('intval', array_keys($unitIds))) . ')';

            $accessRows = $conn->executeQuery(implode("\n", $accessSql))->fetchAllAssociative();
            foreach ($accessRows as $accessRow) {
                $unitId = (int)($accessRow['unitId'] ?? 0);
                if ($unitId <= 0) {
                    continue;
                }
                $unitAccessIndex[$unitId] = [
                    'unit_number' => $accessRow['unitNumber'] ?? null,
                    'unit_floor' => $accessRow['unitFloor'] ?? null,
                    'access_type' => $accessRow['accessType'] ?? null,
                    'access_code' => $accessRow['accessCode'] ?? null,
                    'wifi_name' => $accessRow['wifiName'] ?? null,
                    'wifi_password' => $accessRow['wifiPassword'] ?? null,
                    'condo_name' => $accessRow['condoName'] ?? null,
                    'condo_door_code' => $accessRow['condoDoorCode'] ?? null,
                ];
            }
        }

        foreach ($data as &$row) {
            $unitId = !empty($row['unit_id']) ? (int)$row['unit_id'] : 0;
            $access = $unitAccessIndex[$unitId] ?? [];
            $row['unit_number'] = $access['unit_number'] ?? null;
            $row['unit_floor'] = $access['unit_floor'] ?? null;
            $row['access_type'] = $access['access_type'] ?? null;
            $row['access_code'] = $access['access_code'] ?? null;
            $row['wifi_name'] = $access['wifi_name'] ?? null;
            $row['wifi_password'] = $access['wifi_password'] ?? null;
            $row['condo_name'] = $access['condo_name'] ?? null;
            $row['condo_door_code'] = $access['condo_door_code'] ?? null;
        }
        unset($row);

        // Load every cleaning type for the requested days. Refresh, mid-stay,
        // redo, and orphaned checkout rows must still appear even when there is
        // no booking check-in/check-out event for the unit on that day.
        $conn = $em->getConnection();
        $hkSql = [];
        $hkSql[] = 'SELECT h.id,';
        $hkSql[] = '       h.unit_id AS unitId,';
        $hkSql[] = "       COALESCE(u.unit_name, CONCAT('Unit #', h.unit_id)) AS unitName,";
        $hkSql[] = '       COALESCE(u.city, h.city) AS unitCity,';
        $hkSql[] = '       DATE(h.checkout_date) AS checkoutDate,';
        $hkSql[] = '       h.cleaning_type AS cleaningType,';
        $hkSql[] = '       h.reservation_code AS reservationCode,';
        $hkSql[] = '       h.assign_notes AS cleaningNotes,';
        $hkSql[] = '       h.status,';
        $hkSql[] = '       h.o2_collected_fee AS collectedFee,';
        $hkSql[] = '       h.assigned_to_id AS assignedToId,';
        $hkSql[] = '       e.short_name AS assignedToShortName,';
        $hkSql[] = '       u.unit_number AS unitNumber,';
        $hkSql[] = '       u.unit_floor AS unitFloor,';
        $hkSql[] = '       u.access_type AS accessType,';
        $hkSql[] = '       u.access_code AS accessCode,';
        $hkSql[] = '       u.wifi_name AS wifiName,';
        $hkSql[] = '       u.wifi_password AS wifiPassword,';
        $hkSql[] = '       c.condo_name AS condoName,';
        $hkSql[] = '       c.door_code AS condoDoorCode';
        $hkSql[] = 'FROM hk_cleanings h';
        $hkSql[] = 'LEFT JOIN unit u ON u.id = h.unit_id';
        $hkSql[] = 'LEFT JOIN condo c ON c.id = u.condo_id';
        $hkSql[] = 'LEFT JOIN employee e ON e.id = h.assigned_to_id';
        $hkSql[] = 'WHERE h.checkout_date BETWEEN :d1 AND :d2';
        if ($city) {
            $hkSql[] = '  AND COALESCE(u.city, h.city) = :hkCity';
        }
        $hkSql[] = 'ORDER BY u.unit_name ASC, h.id ASC';

        $stmt = $conn->prepare(implode("\n", $hkSql));
        $stmt->bindValue(':d1', $start->format('Y-m-d'));
        $stmt->bindValue(':d2', $end->format('Y-m-d'));
        if ($city) {
            $stmt->bindValue(':hkCity', $city);
        }
        $hkRowsRaw = $stmt->executeQuery()->fetchAllAssociative();

        $hkRows = [];
        $hkIndex = [];
        foreach ($hkRowsRaw as $h) {
            $normalized = [
                'id' => (int)($h['id'] ?? 0),
                'unitId' => (int)($h['unitId'] ?? 0),
                'unitName' => (string)($h['unitName'] ?? 'Unidad'),
                'unitCity' => (string)($h['unitCity'] ?? ''),
                'checkoutDate' => (string)($h['checkoutDate'] ?? ''),
                'cleaningType' => (string)($h['cleaningType'] ?? ''),
                'reservationCode' => $h['reservationCode'] ?? null,
                'cleaningNotes' => $h['cleaningNotes'] ?? null,
                'status' => (string)($h['status'] ?? ''),
                'collectedFee' => number_format((float)($h['collectedFee'] ?? 0), 2, '.', ''),
                'assignedToId' => isset($h['assignedToId']) ? (int)$h['assignedToId'] : null,
                'assignedToShortName' => isset($h['assignedToShortName']) ? (string)$h['assignedToShortName'] : null,
                'unitNumber' => $h['unitNumber'] ?? null,
                'unitFloor' => $h['unitFloor'] ?? null,
                'accessType' => $h['accessType'] ?? null,
                'accessCode' => $h['accessCode'] ?? null,
                'wifiName' => $h['wifiName'] ?? null,
                'wifiPassword' => $h['wifiPassword'] ?? null,
                'condoName' => $h['condoName'] ?? null,
                'condoDoorCode' => $h['condoDoorCode'] ?? null,
            ];
            $hkRows[] = $normalized;
            $hkIndex[$normalized['unitId']][$normalized['checkoutDate']][] = $normalized;
        }

        // Attach HK info only for checkout events
        $representedCleaningIds = [];
        foreach ($data as &$row) {
            // Default flat fields
            $row['hk_cleaning_id'] = null;
            $row['hk_done'] = false;
            $row['hk_assigned_to_id'] = null;
            $row['hk_assigned_to_short_name'] = null;
            $row['hk_cleaning_type'] = null;
            $row['hk_status'] = null;
            $row['cleaning_notes'] = null;
            $row['cleaner_notes'] = null;

            if (!empty($row['event_check_out'])) {
                $u = isset($row['unit_id']) ? (int) $row['unit_id'] : null;
                $d = !empty($row['check_out']) ? substr((string) $row['check_out'], 0, 10) : null;

                $candidates = ($u && $d) ? ($hkIndex[$u][$d] ?? []) : [];
                $reservationCode = (string)($row['reservation_code'] ?? '');
                $h = null;
                foreach ($candidates as $candidate) {
                    if ($reservationCode !== '' && (string)($candidate['reservationCode'] ?? '') === $reservationCode) {
                        $h = $candidate;
                        break;
                    }
                }
                if ($h === null) {
                    foreach ($candidates as $candidate) {
                        $type = strtolower(trim((string)($candidate['cleaningType'] ?? '')));
                        if (in_array($type, ['checkout', 'owner'], true)) {
                            $h = $candidate;
                            break;
                        }
                    }
                }

                if ($h !== null) {
                    $isDone = strtolower((string) $h['status']) === 'done';

                    $row['hk'] = [
                        'id'   => $h['id'],
                        'done' => $isDone,
                        'status' => $h['status'],
                        'cleaningType' => $h['cleaningType'],
                        'assignedToId' => $h['assignedToId'] ?? null,
                        'assignedToShortName' => $h['assignedToShortName'] ?? null,
                    ];
                    $row['hk_cleaning_id'] = $h['id'];
                    $row['hk_done'] = $isDone;
                    $row['hk_cleaning_type'] = $h['cleaningType'];
                    $row['hk_status'] = $h['status'];
                    $row['hk_assigned_to_id'] = $h['assignedToId'] ?? null;
                    $row['hk_assigned_to_short_name'] = $h['assignedToShortName'] ?? null;
                    $row['cleaning_notes'] = $h['cleaningNotes'] ?? null;
                    $representedCleaningIds[(int)$h['id']] = true;
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

        // Add cleaning-only rows for service types that have no corresponding
        // booking event, or for any unmatched checkout/owner cleaning.
        foreach ($hkRows as $h) {
            if (isset($representedCleaningIds[(int)$h['id']])) {
                continue;
            }
            $isDone = strtolower((string)$h['status']) === 'done';
            $data[] = [
                'id' => null,
                'unit_id' => $h['unitId'],
                'unit_name' => $h['unitName'],
                'guest' => '',
                'reservation_code' => $h['reservationCode'],
                'source' => '',
                'check_in' => null,
                'check_out' => null,
                'service_date' => $h['checkoutDate'],
                'notes' => null,
                'check_in_notes' => null,
                'check_out_notes' => null,
                'city' => $h['unitCity'],
                'event_check_in' => false,
                'event_check_out' => false,
                'event_cleaning_only' => true,
                'hk_cleaning_id' => $h['id'],
                'hk_done' => $isDone,
                'hk_cleaning_type' => $h['cleaningType'],
                'hk_status' => $h['status'],
                'hk_assigned_to_id' => $h['assignedToId'],
                'hk_assigned_to_short_name' => $h['assignedToShortName'],
                'cleaning_notes' => $h['cleaningNotes'],
                'cleaner_notes' => null,
                'hk' => [
                    'id' => $h['id'],
                    'done' => $isDone,
                    'status' => $h['status'],
                    'cleaningType' => $h['cleaningType'],
                    'assignedToId' => $h['assignedToId'],
                    'assignedToShortName' => $h['assignedToShortName'],
                ],
                'unit_number' => $canViewUnitAccess ? $h['unitNumber'] : null,
                'unit_floor' => $canViewUnitAccess ? $h['unitFloor'] : null,
                'access_type' => $canViewUnitAccess ? $h['accessType'] : null,
                'access_code' => $canViewUnitAccess ? $h['accessCode'] : null,
                'wifi_name' => $canViewUnitAccess ? $h['wifiName'] : null,
                'wifi_password' => $canViewUnitAccess ? $h['wifiPassword'] : null,
                'condo_name' => $canViewUnitAccess ? $h['condoName'] : null,
                'condo_door_code' => $canViewUnitAccess ? $h['condoDoorCode'] : null,
            ];
        }

        // --- Enrich with checklist draft/submission info (hk_cleaning_checklist) ---
        // We match by hk_cleanings.id (cleaning_id in hk_cleaning_checklist)
        $cleaningIds = [];
        foreach ($data as $r) {
            if (!empty($r['hk_cleaning_id'])) {
                $cleaningIds[(int) $r['hk_cleaning_id']] = true;
            }
        }

        $checklistIndex = []; // cleaningId => latest checklist details
        if (!empty($cleaningIds)) {
            $conn = $em->getConnection();
            $sql = [];
            $sql[] = 'SELECT c.cleaning_id AS cleaningId, c.cleaner_id AS cleanerId, c.submitted_at AS submittedAt,';
            $sql[] = '       c.cleaning_notes AS cleaningNotes, e.short_name AS cleanerShortName';
            $sql[] = 'FROM hk_cleaning_checklist c';
            $sql[] = 'LEFT JOIN employee e ON e.id = c.cleaner_id';
            $sql[] = 'WHERE c.cleaning_id IN (' . implode(',', array_map('intval', array_keys($cleaningIds))) . ')';
            $sql[] = '  AND c.id = (SELECT MAX(c2.id) FROM hk_cleaning_checklist c2 WHERE c2.cleaning_id = c.cleaning_id)';

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
                    'cleaningNotes' => isset($c['cleaningNotes']) ? (string) $c['cleaningNotes'] : null,
                ];
            }
        }

        foreach ($data as &$row) {
            // defaults
            $row['checklist_has_draft'] = false;
            $row['checklist_submitted_at'] = null;
            $row['checklist_cleaner_id'] = null;
            $row['checklist_cleaner_short_name'] = null;
            $row['checklist_cleaning_notes'] = null;

            $cid = !empty($row['hk_cleaning_id']) ? (int) $row['hk_cleaning_id'] : 0;
            if ($cid > 0 && array_key_exists($cid, $checklistIndex)) {
                $submittedAt = $checklistIndex[$cid]['submittedAt'] ?? null;
                $row['checklist_cleaner_id'] = $checklistIndex[$cid]['cleanerId'] ?? null;
                $row['checklist_cleaner_short_name'] = $checklistIndex[$cid]['cleanerShortName'] ?? null;
                $row['checklist_cleaning_notes'] = $checklistIndex[$cid]['cleaningNotes'] ?? null;
                $row['cleaner_notes'] = $checklistIndex[$cid]['cleaningNotes'] ?? null;

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
