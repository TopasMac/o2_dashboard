<?php

namespace App\Controller\Api;

use App\Service\UnitListService;
use App\Service\UnitDetailsService;
use App\Service\UnitMaintenanceSchedulerService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\Response;
use App\Entity\Unit;
use App\Entity\Client;
use App\Entity\Condo;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;

class UnitsController extends AbstractController
{
    #[Route('/api/unit-list', name: 'api_units_list', methods: ['GET'])]
    public function getUnitList(Request $request, UnitListService $unitListService): JsonResponse
    {
        // Collect filters directly from the query string
        $filters = $request->query->all();

        // Default behavior: if no explicit status/lifecycle filter is provided,
        // return only Active units (Onboarding and Inactive excluded).
        // Frontend can keep the Status dropdown unselected by not sending any status.
        $hasStatusFilter = array_key_exists('status', $filters) && trim((string)$filters['status']) !== '';
        $hasLifecycle    = array_key_exists('lifecycle', $filters) && trim((string)$filters['lifecycle']) !== '';
        $hasActiveOnly   = array_key_exists('activeOnly', $filters) && trim((string)$filters['activeOnly']) !== '';
        if (!$hasStatusFilter && !$hasLifecycle && !$hasActiveOnly) {
            $filters['lifecycle'] = 'active';
        }

        // Fetch rows from service
        $rows = $unitListService->getUnitList($filters);

        // Optional: support `fields` param to return only selected columns
        $requested = $request->query->get('fields');
        if ($requested) {
            $requested = array_filter(array_map('trim', explode(',', $requested)));
            if (!empty($requested)) {
                $allowed = [
                    'id', 'unit_name', 'status', 'client_id', 'date_started', 'type', 'city', 'condo_id',
                    'listing_name', 'airbnb_ical', 'private_ical_enabled',
                    'cleaning_fee', 'linens_fee', 'host_type', 'payment_type',
                    'cfe', 'internet', 'water', 'hoa', 'client_name', 'cc_email',
                    'pax', 'baths', 'beds',
                ];
                $fields = array_values(array_intersect($requested, $allowed));
                if (!empty($fields)) {
                    $rows = array_map(function(array $r) use ($fields) {
                        $out = [];
                        foreach ($fields as $f) {
                            if (array_key_exists($f, $r)) {
                                $out[$f] = $r[$f];
                            }
                        }
                        return $out;
                    }, $rows);
                }
            }
        }

        return $this->json($rows);
    }

    #[Route('/api/unit-details/{id}', name: 'api_unit_details', methods: ['GET'])]
    public function getUnitDetails(int $id, UnitDetailsService $unitDetailsService): JsonResponse
    {
        $row = $unitDetailsService->getDetails($id);
        return $this->json($row);
    }

    #[Route('/api/units', name: 'api_units_create', methods: ['POST'])]
    public function createUnit(
        Request $request,
        EntityManagerInterface $em,
        UnitMaintenanceSchedulerService $maintenanceSchedulerService
    ): JsonResponse
    {
        $data = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($data)) {
            return $this->json(['error' => 'invalid_json'], Response::HTTP_BAD_REQUEST);
        }

        $unit = new Unit();

        // Required / basic fields
        $unit->setUnitName(trim((string)($data['unit_name'] ?? '')));
        $unit->setStatus((string)($data['status'] ?? ''));
        // If unit is created as Inactive, auto-set dateEnded and disable private iCal
        if (strtolower((string)$unit->getStatus()) === 'inactive') {
            if (method_exists($unit, 'setDateEnded')) {
                $unit->setDateEnded(new \DateTimeImmutable());
            }
            if (method_exists($unit, 'setPrivateIcalEnabled')) {
                $unit->setPrivateIcalEnabled(false);
            }
        }
        $unit->setCity((string)($data['city'] ?? ''));
        $unit->setType((string)($data['type'] ?? ''));
        $unit->setListingName((string)($data['listing_name'] ?? ''));
        $unit->setHostType((string)($data['host_type'] ?? ''));
        $unit->setPaymentType((string)($data['payment_type'] ?? ''));

        // Number helpers
        $nf = static fn($v) => ($v === '' || $v === null) ? null : (is_numeric($v) ? 0 + $v : null);
        $ni = static fn($v) => ($v === '' || $v === null) ? null : ((is_numeric($v)) ? (int)$v : null);

        // Relations
        $clientId = $ni($data['client_id'] ?? null);
        if ($clientId) {
            $client = $em->getRepository(Client::class)->find($clientId);
            $unit->setClient($client ?: null);
        } else {
            $unit->setClient(null);
        }
        $unit->setCondoId($ni($data['condo_id'] ?? null));

        // Dates
        if (!empty($data['date_started'])) {
            try { $unit->setDateStarted(new \DateTimeImmutable($data['date_started'])); } catch (\Throwable $e) {}
        }
        $unit->setInternetDeadline($ni($data['internet_deadline'] ?? null));
        $unit->setWaterDeadline($ni($data['water_deadline'] ?? null));

        // Numbers (nullable)
        $unit->setCleaningFee($nf($data['cleaning_fee'] ?? null));
        $unit->setLinensFee($nf($data['linens_fee'] ?? null));
        $unit->setHoaAmount($nf($data['hoa_amount'] ?? null));
        $unit->setInternetCost($nf($data['internet_cost'] ?? null));
        $unit->setPax($ni($data['pax'] ?? null));
        $unit->setBaths($ni($data['baths'] ?? null));
        $unit->setBeds($ni($data['beds'] ?? null));

        // Bed configuration (JSON array of {type,count})
        if (array_key_exists('bed_config', $data)) {
            $bc = $data['bed_config'];
            $unit->setBedConfig(is_array($bc) ? $bc : null);
        }

        // Strings (nullable)
        $ns = static fn($v) => ($v === '' || $v === null) ? null : (string)$v; // nullable string
        $unit->setUnitNumber($ns($data['unit_number'] ?? null));
        $unit->setUnitFloor($ns($data['unit_floor'] ?? null));
        $unit->setAccessType($ns($data['access_type'] ?? null));
        $unit->setAccessCode($ns($data['access_code'] ?? null));
        $unit->setBackupLockbox($ns($data['backup_lockbox'] ?? null));
        $unit->setWifiName($ns($data['wifi_name'] ?? null));
        $unit->setWifiPassword($ns($data['wifi_password'] ?? null));
        $unit->setParking($ns($data['parking'] ?? null));
        $unit->setNotes($ns($data['notes'] ?? null));
        $unit->setSeoShortDescription($ns($data['seo_short_description'] ?? null));
        $unit->setAirbnbEmail($ns($data['airbnb_email'] ?? null));
        $unit->setAirbnbPass($ns($data['airbnb_pass'] ?? null));
        $unit->setAirbnbId($ns($data['airbnb_id'] ?? null));
        $unit->setAirbnbPayRoute($ns($data['airbnb_pay_route'] ?? null));
        $unit->setCfeReference($ns($data['cfe_reference'] ?? null));
        $unit->setCfeName($ns($data['cfe_name'] ?? null));
        $unit->setCfePeriod($ns($data['cfe_period'] ?? null));
        $unit->setCfePaymentDay($ni($data['cfe_payment_day'] ?? null));
        $unit->setCfeStartingMonth($ni($data['cfe_starting_month'] ?? null));
        $unit->setInternetIsp($ns($data['internet_isp'] ?? null));
        $unit->setInternetReference($ns($data['internet_reference'] ?? null));
        $unit->setWaterReference($ns($data['water_reference'] ?? null));
        $unit->setCcEmail($ns($data['cc_email'] ?? null));

        // --- Auto-generate iCal export token on creation (except for status Alor)
        if (method_exists($unit, 'getStatus') && method_exists($unit, 'setIcalExportToken')) {
            $status = strtolower((string)$unit->getStatus());
            if ($status !== 'alor') {
                $currentToken = method_exists($unit, 'getIcalExportToken') ? (string)($unit->getIcalExportToken() ?? '') : '';
                if ($currentToken === '') {
                    try {
                        $unit->setIcalExportToken(bin2hex(random_bytes(16))); // 32 hex chars
                    } catch (\Throwable $e) {
                        // Fallback if random_bytes unavailable
                        $unit->setIcalExportToken(substr(hash('sha256', uniqid('', true)), 0, 32));
                    }
                }
            }
        }

        // Private iCal enabled: default to true when status = Active, unless explicitly provided
        $providedPie = array_key_exists('private_ical_enabled', $data) ? $data['private_ical_enabled'] : null;
        $pieVal = ($providedPie !== null)
            ? (($providedPie === 'yes' || $providedPie === '1' || $providedPie === 1 || $providedPie === 'true' || $providedPie === true) ? true : (($providedPie === 'no' || $providedPie === '0' || $providedPie === 0 || $providedPie === 'false' || $providedPie === false) ? false : null))
            : (strtolower((string)$unit->getStatus()) === 'active');

        // If status is Inactive, private iCal must be disabled regardless of provided value
        if (strtolower((string)$unit->getStatus()) === 'inactive') {
            $pieVal = false;
        }
        if ($pieVal !== null && method_exists($unit, 'setPrivateIcalEnabled')) {
            $unit->setPrivateIcalEnabled($pieVal);
        }

        // Booleans (accept yes/no, true/false, 1/0)
        $b = static fn($v) => is_bool($v) ? $v : (($v === 'yes' || $v === '1' || $v === 1 || $v === 'true') ? true : (($v === 'no' || $v === '0' || $v === 0 || $v === 'false') ? false : null));
        if (($tmp = $b($data['cfe'] ?? null)) !== null) { $unit->setCfe($tmp); }
        if (($tmp = $b($data['internet'] ?? null)) !== null) { $unit->setInternet($tmp); }
        if (($tmp = $b($data['water'] ?? null)) !== null) { $unit->setWater($tmp); }
        if (($tmp = $b($data['hoa'] ?? null)) !== null) { $unit->setHoa($tmp); }

        $em->persist($unit);
        $em->flush();

        // Auto-create default maintenance schedules for Active Playa units
        $activeAt = $unit->getDateStarted();
        $activeAtImmutable = $activeAt instanceof \DateTimeImmutable ? $activeAt : null;
        $maintenanceSchedulerService->ensureDefaultSchedulesForUnit($unit, $activeAtImmutable);

        return $this->json(['id' => $unit->getId()], Response::HTTP_CREATED);
    }

    #[Route('/api/units/{id}', name: 'api_units_update', methods: ['PATCH'])]
    public function updateUnit(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        UnitMaintenanceSchedulerService $maintenanceSchedulerService
    ): JsonResponse
    {
        $unit = $em->getRepository(Unit::class)->find($id);
        if (!$unit) {
            return $this->json(['error' => 'not_found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($data)) {
            return $this->json(['error' => 'invalid_json'], Response::HTTP_BAD_REQUEST);
        }

        // Track if private_ical_enabled was provided in payload
        $privateIcalProvided = array_key_exists('private_ical_enabled', $data);
        // Save original status for possible future use
        $originalStatus = (string)$unit->getStatus();

        // Helpers
        $setIfHas = function(string $key, callable $setter) use ($data) {
            if (array_key_exists($key, $data)) { $setter($data[$key]); }
        };
        $toBool = static fn($v) => is_bool($v) ? $v : (($v === 'yes' || $v === '1' || $v === 1 || $v === 'true') ? true : (($v === 'no' || $v === '0' || $v === 0 || $v === 'false') ? false : null));
        $toNum  = static fn($v) => ($v === '' || $v === null) ? null : (is_numeric($v) ? 0 + $v : null);

        // Scalars
        $setIfHas('unit_name', fn($v) => $unit->setUnitName(trim((string)$v)));
        $setIfHas('status', fn($v) => $unit->setStatus((string)$v));
        // If status is explicitly set to Inactive, auto-set dateEnded and disable private iCal
        if (array_key_exists('status', $data) && strtolower((string)$unit->getStatus()) === 'inactive') {
            if (method_exists($unit, 'setDateEnded')) {
                $cur = method_exists($unit, 'getDateEnded') ? $unit->getDateEnded() : null;
                if (!$cur) {
                    $unit->setDateEnded(new \DateTimeImmutable());
                }
            }
            if (method_exists($unit, 'setPrivateIcalEnabled')) {
                $unit->setPrivateIcalEnabled(false);
            }
        }
        $setIfHas('city', fn($v) => $unit->setCity((string)$v));
        $setIfHas('type', fn($v) => $unit->setType((string)$v));
        $setIfHas('listing_name', fn($v) => $unit->setListingName((string)$v));
        $setIfHas('host_type', fn($v) => $unit->setHostType((string)$v));
        $setIfHas('payment_type', fn($v) => $unit->setPaymentType((string)$v));
        $setIfHas('unit_number', fn($v) => $unit->setUnitNumber((string)$v));
        $setIfHas('unit_floor', fn($v) => $unit->setUnitFloor((string)$v));
        $setIfHas('access_type', fn($v) => $unit->setAccessType((string)$v));
        $setIfHas('access_code', fn($v) => $unit->setAccessCode((string)$v));
        $setIfHas('backup_lockbox', fn($v) => $unit->setBackupLockbox((string)$v));
        $setIfHas('wifi_name', fn($v) => $unit->setWifiName((string)$v));
        $setIfHas('wifi_password', fn($v) => $unit->setWifiPassword((string)$v));
        $setIfHas('parking', fn($v) => $unit->setParking((string)$v));
        $setIfHas('notes', fn($v) => $unit->setNotes((string)$v));
        $setIfHas('seo_short_description', fn($v) => $unit->setSeoShortDescription((string)$v));
        $setIfHas('airbnb_email', fn($v) => $unit->setAirbnbEmail((string)$v));
        $setIfHas('airbnb_pass', fn($v) => $unit->setAirbnbPass((string)$v));
        $setIfHas('airbnb_id', fn($v) => $unit->setAirbnbId(($v === '' || $v === null) ? null : (string)$v));
        $setIfHas('airbnb_pay_route', fn($v) => $unit->setAirbnbPayRoute(($v === '' || $v === null) ? null : (string)$v));
        $setIfHas('cfe_reference', fn($v) => $unit->setCfeReference((string)$v));
        $setIfHas('cfe_name', fn($v) => $unit->setCfeName((string)$v));
        $setIfHas('cfe_period', fn($v) => $unit->setCfePeriod((string)$v));
        $setIfHas('cfe_payment_day', fn($v) => $unit->setCfePaymentDay(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));
        $setIfHas('cfe_starting_month', fn($v) => $unit->setCfeStartingMonth(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));
        $setIfHas('internet_isp', fn($v) => $unit->setInternetIsp((string)$v));
        $setIfHas('internet_reference', fn($v) => $unit->setInternetReference((string)$v));
        $setIfHas('water_reference', fn($v) => $unit->setWaterReference((string)$v));
        $setIfHas('cc_email', fn($v) => $unit->setCcEmail(($v === '' || $v === null) ? null : trim((string)$v)));

        // iCal fields
        $setIfHas('airbnb_ical', fn($v) => $unit->setAirbnbIcal(($v === '' || $v === null) ? null : (string)$v));

        // Dates
        $setIfHas('date_started', fn($v) => !empty($v) ? $unit->setDateStarted(new \DateTimeImmutable((string)$v)) : $unit->setDateStarted(null));
        $setIfHas('internet_deadline', fn($v) => $unit->setInternetDeadline(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));
        $setIfHas('water_deadline', fn($v) => $unit->setWaterDeadline(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));

        // Numbers (nullable)
        $setIfHas('cleaning_fee', fn($v) => $unit->setCleaningFee($toNum($v)));
        $setIfHas('linens_fee', fn($v) => $unit->setLinensFee($toNum($v)));
        $setIfHas('hoa_amount', fn($v) => $unit->setHoaAmount($toNum($v)));
        $setIfHas('internet_cost', fn($v) => $unit->setInternetCost($toNum($v)));
        $setIfHas('pax', fn($v) => $unit->setPax(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));
        $setIfHas('baths', fn($v) => $unit->setBaths(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));
        $setIfHas('beds', fn($v) => $unit->setBeds(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));
        $setIfHas('bed_config', fn($v) => $unit->setBedConfig(is_array($v) ? $v : null));

        // Booleans
        $setIfHas('private_ical_enabled', fn($v) => ($tmp = $toBool($v)) !== null ? $unit->setPrivateIcalEnabled($tmp) : null);
        // If status is Inactive, force private iCal disabled even if payload tried to set it
        if (array_key_exists('status', $data) && strtolower((string)$unit->getStatus()) === 'inactive') {
            if (method_exists($unit, 'setPrivateIcalEnabled')) {
                $unit->setPrivateIcalEnabled(false);
            }
        }
        $setIfHas('cfe', fn($v) => ($tmp = $toBool($v)) !== null ? $unit->setCfe($tmp) : null);
        $setIfHas('internet', fn($v) => ($tmp = $toBool($v)) !== null ? $unit->setInternet($tmp) : null);
        $setIfHas('water', fn($v) => ($tmp = $toBool($v)) !== null ? $unit->setWater($tmp) : null);
        $setIfHas('hoa', fn($v) => ($tmp = $toBool($v)) !== null ? $unit->setHoa($tmp) : null);

        // Relations
        $setIfHas('client_id', function($v) use ($em, $unit) {
            if ($v === '' || $v === null) { $unit->setClient(null); return; }
            if (is_numeric($v)) {
                $client = $em->getRepository(Client::class)->find((int)$v);
                $unit->setClient($client ?: null);
            }
        });
        $setIfHas('condo_id', fn($v) => $unit->setCondoId(($v === '' || $v === null) ? null : (is_numeric($v) ? (int)$v : null)));

        // Auto-enable private iCal when status becomes Active, unless explicitly overridden in payload
        if (
            !$privateIcalProvided &&
            method_exists($unit, 'getStatus') &&
            method_exists($unit, 'setPrivateIcalEnabled')
        ) {
            $nowStatus = strtolower((string)$unit->getStatus());
            if ($nowStatus === 'active') {
                $unit->setPrivateIcalEnabled(true);
            }
        }

        $em->flush();

        // Ensure default maintenance schedules exist when unit is Active in Playa del Carmen
        $activeAt = $unit->getDateStarted();
        $activeAtImmutable = $activeAt instanceof \DateTimeImmutable ? $activeAt : null;
        $maintenanceSchedulerService->ensureDefaultSchedulesForUnit($unit, $activeAtImmutable);

        return $this->json(['id' => $unit->getId()], Response::HTTP_OK);
    }

    #[Route('/api/units/{id}', name: 'api_units_delete', methods: ['DELETE'])]
    public function deleteUnit(int $id, EntityManagerInterface $em): JsonResponse
    {
        $unit = $em->getRepository(Unit::class)->find($id);
        if (!$unit) {
            return $this->json(['error' => 'not_found'], Response::HTTP_NOT_FOUND);
        }
        $em->remove($unit);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
    #[Route('/api/units/options', name: 'api_units_options', methods: ['GET'], priority: 100)]
    public function getUnitOptions(Request $request, EntityManagerInterface $em): JsonResponse
    {
        // Optional lightweight filters (e.g., by city or text search)
        $requestedCity = trim((string)($request->query->get('city') ?? ''));
        $q             = trim((string)($request->query->get('q') ?? ''));

        // Determine visibility rules based on current session user
        $user = $this->getUser();
        $employee = null;
        if ($user && method_exists($user, 'getEmployee')) {
            $employee = $user->getEmployee();
        }

        $employeeCity = '';
        if ($employee && method_exists($employee, 'getCity')) {
            $employeeCity = (string)($employee->getCity() ?? '');
        }

        $isPrivileged = $this->isGranted('ROLE_ADMIN') || $this->isGranted('ROLE_MANAGER') || (strtolower($employeeCity) === 'general');

        // Admin/Manager (or employee city = General) should see both Playa del Carmen + Tulum
        // Others should see only their employee city
        $defaultAllowedCities = ['Playa del Carmen', 'Tulum'];

        $qb = $em->getRepository(Unit::class)->createQueryBuilder('u')
            ->select('u.id AS id, u.unitName AS unit_name, u.city AS city')
            // Active only
            ->andWhere('LOWER(u.status) = :active')
            ->setParameter('active', 'active')
            // Keep legacy safety: exclude ended units
            ->andWhere('u.dateEnded IS NULL')
            ->orderBy('u.unitName', 'ASC');

        if ($isPrivileged) {
            // Restrict to the two operational cities
            $qb->andWhere('u.city IN (:cities)')->setParameter('cities', $defaultAllowedCities);

            // If an explicit city was requested and it's one of the allowed cities, filter further
            if ($requestedCity !== '' && in_array($requestedCity, $defaultAllowedCities, true)) {
                $qb->andWhere('u.city = :city')->setParameter('city', $requestedCity);
            }
        } else {
            // Non-privileged users: force employee city filter (ignore requested city)
            if ($employeeCity !== '') {
                $qb->andWhere('u.city = :city')->setParameter('city', $employeeCity);
            } else {
                // If we cannot determine employee city, return empty list rather than over-exposing.
                return $this->json([]);
            }
        }

        if ($q !== '') {
            $qb->andWhere('LOWER(u.unitName) LIKE :q')->setParameter('q', '%' . strtolower($q) . '%');
        }

        $rows = $qb->getQuery()->getArrayResult();
        return $this->json($rows);
    }
}