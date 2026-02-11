<?php

namespace App\Service;

use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;

/**
 * UnitListService
 *
 * Purpose: fast, table-oriented read model for Units.
 * - Single LEFT JOIN to client to expose client id + name.
 * - Supports lightweight filtering with partial matches for text fields.
 * - Returns a flat associative array per row with snake_case keys.
 */
class UnitListService
{
    private EntityManagerInterface $em;

    public function __construct(EntityManagerInterface $em)
    {
        $this->em = $em;
    }

    /**
     * Fetch a lean list of units for tables.
     *
     * Accepted filters (all optional):
     *  - unitName (partial, case-insensitive)
     *  - status (exact)
     *  - lifecycle: 'active' | 'inactive' | 'onboarding' | 'all'
     *  - activeOnly: '1' | '0' (alias for lifecycle=active when true)
     *  - city (partial)
     *  - type (exact)
     *  - paymentType (exact)
     *  - listingName (partial)
     *  - hostType (exact)
     *  - hoa / cfe / internet / water: 'yes' | 'no' | ''
     *  - clientName (partial)
     *
     * @param array $filters
     * @return array<int,array<string,mixed>> Flat rows ready for JSON.
     */
    public function getUnitList(array $filters = []): array
    {
        $qb = $this->em->getRepository(Unit::class)
            ->createQueryBuilder('u')
            ->leftJoin('u.client', 'c')
            ->addSelect('c')
            ->leftJoin('u.condo', 'co')
            ->addSelect('co')
            ->orderBy('u.unitName', 'ASC');

        // Normalize filters
        $unitName    = self::s($filters['unitName'] ?? '');
        $status      = self::s($filters['status'] ?? '');
        $lifecycle   = self::s($filters['lifecycle'] ?? '');
        $activeOnly  = self::s($filters['activeOnly'] ?? '');
        $city        = self::s($filters['city'] ?? '');
        $type        = self::s($filters['type'] ?? '');
        $paymentType = self::s($filters['paymentType'] ?? '');
        $listingName = self::s($filters['listingName'] ?? '');
        $hostType    = self::s($filters['hostType'] ?? '');
        $clientName  = self::s($filters['clientName'] ?? '');
        $hoa         = self::s($filters['hoa'] ?? '');
        $cfe         = self::s($filters['cfe'] ?? '');
        $internet    = self::s($filters['internet'] ?? '');
        $water       = self::s($filters['water'] ?? '');

        // Never return Alor or Internal units in the API list
        $qb->andWhere('(u.status IS NULL OR (LOWER(u.status) <> :_st_alor_never AND LOWER(u.status) <> :_st_internal_never))')
           ->setParameter('_st_alor_never', 'alor')
           ->setParameter('_st_internal_never', 'internal');

        // Lifecycle filtering (preferred over free-form status)
        // - active: dateEnded is NULL and status not Inactive/Onboarding
        // - inactive: dateEnded is NOT NULL OR status is Inactive
        // - onboarding: status is Onboarding (typically no dates)
        // - all: no lifecycle filtering
        if ($activeOnly !== '') {
            $ao = strtolower($activeOnly);
            if ($ao === '1' || $ao === 'true' || $ao === 'yes') {
                $lifecycle = 'active';
            } elseif ($ao === '0' || $ao === 'false' || $ao === 'no') {
                $lifecycle = ($lifecycle !== '' ? $lifecycle : 'all');
            }
        }

        // Lifecycle filtering (preferred over free-form status)
        // Supports CSV values, e.g. lifecycle=active,onboarding
        $lcs = array_values(array_filter(array_map('trim', explode(',', strtolower($lifecycle)))));

        if (!empty($lcs) && !in_array('all', $lcs, true)) {
            // Special-case: if multiple lifecycles are requested, OR them together
            if (count($lcs) > 1) {
                $orX = $qb->expr()->orX();

                // Active: dateEnded is NULL and status not Inactive/Onboarding/Alor/Internal
                if (in_array('active', $lcs, true)) {
                    $orX->add(
                        '(u.dateEnded IS NULL AND (u.status IS NULL OR (LOWER(u.status) <> :st_inactive AND LOWER(u.status) <> :st_onboarding AND LOWER(u.status) <> :st_alor AND LOWER(u.status) <> :st_internal)))'
                    );
                }

                // Inactive: dateEnded is NOT NULL OR status is Inactive
                if (in_array('inactive', $lcs, true)) {
                    $orX->add('(u.dateEnded IS NOT NULL OR LOWER(u.status) = :st_inactive2)');
                }

                // Onboarding: status is Onboarding
                if (in_array('onboarding', $lcs, true)) {
                    $orX->add('LOWER(u.status) = :st_onboarding2');
                }

                $qb->andWhere($orX)
                   ->setParameter('st_inactive', 'inactive')
                   ->setParameter('st_onboarding', 'onboarding')
                   ->setParameter('st_alor', 'alor')
                   ->setParameter('st_internal', 'internal')
                   ->setParameter('st_inactive2', 'inactive')
                   ->setParameter('st_onboarding2', 'onboarding');
            } else {
                // Single lifecycle value (existing behavior)
                $lc = $lcs[0];
                if ($lc === 'active') {
                    $qb->andWhere('u.dateEnded IS NULL')
                       ->andWhere('(u.status IS NULL OR (LOWER(u.status) <> :st_inactive AND LOWER(u.status) <> :st_onboarding AND LOWER(u.status) <> :st_alor AND LOWER(u.status) <> :st_internal))')
                       ->setParameter('st_inactive', 'inactive')
                       ->setParameter('st_onboarding', 'onboarding')
                       ->setParameter('st_alor', 'alor')
                       ->setParameter('st_internal', 'internal');
                } elseif ($lc === 'inactive') {
                    $qb->andWhere('(u.dateEnded IS NOT NULL OR LOWER(u.status) = :st_inactive2)')
                       ->setParameter('st_inactive2', 'inactive');
                } elseif ($lc === 'onboarding') {
                    $qb->andWhere('LOWER(u.status) = :st_onboarding2')
                       ->setParameter('st_onboarding2', 'onboarding');
                }
            }
        }

        if (($lifecycle === '' || strtolower($lifecycle) === 'all') && $status !== '' && strtolower($status) !== 'any') {
            $qb->andWhere('u.status = :status')->setParameter('status', $status);
        }
        if ($unitName !== '') {
            $qb->andWhere('LOWER(u.unitName) LIKE :unitName')
               ->setParameter('unitName', '%' . strtolower($unitName) . '%');
        }
        if ($city !== '') {
            $qb->andWhere('LOWER(u.city) LIKE :city')
               ->setParameter('city', '%' . strtolower($city) . '%');
        }
        if ($type !== '') {
            $qb->andWhere('u.type = :type')->setParameter('type', $type);
        }
        if ($paymentType !== '') {
            $qb->andWhere('u.paymentType = :paymentType')->setParameter('paymentType', $paymentType);
        }
        if ($listingName !== '') {
            $qb->andWhere('LOWER(u.listingName) LIKE :listingName')
               ->setParameter('listingName', '%' . strtolower($listingName) . '%');
        }
        if ($hostType !== '') {
            $qb->andWhere('u.hostType = :hostType')->setParameter('hostType', $hostType);
        }
        if ($clientName !== '') {
            $qb->andWhere('LOWER(c.name) LIKE :clientName')
               ->setParameter('clientName', '%' . strtolower($clientName) . '%');
        }

        // yes/no flags → booleans
        $this->applyYesNoFlag($qb, 'hoa', $hoa);
        $this->applyYesNoFlag($qb, 'cfe', $cfe);
        $this->applyYesNoFlag($qb, 'internet', $internet);
        $this->applyYesNoFlag($qb, 'water', $water);

        // Execute and flatten
        $units = $qb->getQuery()->getResult(); // returns Unit[] with Client joined

        $rows = [];
        foreach ($units as $unit) {
            /** @var Unit $unit */
            $client = $unit->getClient();
            $condo  = $unit->getCondo();

            $rows[] = [
                // Unit table (snake_case)
                'id'           => $unit->getId(),
                'unit_name'    => $unit->getUnitName(),
                'status'       => $unit->getStatus(),
                'client_id'    => $client ? $client->getId() : null,
                'date_started' => $unit->getDateStarted() ? $unit->getDateStarted()->format('Y-m-d') : null,
                'date_ended'   => (method_exists($unit, 'getDateEnded') && $unit->getDateEnded()) ? $unit->getDateEnded()->format('Y-m-d') : null,
                'type'         => $unit->getType(),
                'city'         => $unit->getCity(),
                'condo_id'     => $condo ? $condo->getId() : null,
                'condo_name'   => $condo ? ($condo->getCondoName() ?? '') : '',
                'listing_name' => $unit->getListingName(),
                'cleaning_fee' => $unit->getCleaningFee(),
                'linens_fee'   => $unit->getLinensFee(),
                'host_type'    => $unit->getHostType(),
                'payment_type' => $unit->getPaymentType(),
                'cfe'          => (bool) $unit->getCfe(),
                'internet'     => (bool) $unit->getInternet(),
                'water'        => (bool) $unit->getWater(),
                'hoa'          => (bool) $unit->getHoa(),
                'private_ical_enabled' => (bool) (method_exists($unit, 'isPrivateIcalEnabled') ? $unit->isPrivateIcalEnabled() : ($unit->getPrivateIcalEnabled() ?? false)),

                // Client table (id + name)
                'client_name'  => $client ? ($client->getName() ?? '') : '',
            ];
        }

        return $rows;
    }

    private static function s(?string $v): string
    {
        return trim((string) $v);
    }

    private function applyYesNoFlag($qb, string $field, string $value): void
    {
        if ($value === '') {
            return;
        }
        $bool = null;
        if ($value === 'yes') $bool = true;
        if ($value === 'no')  $bool = false;
        if ($bool === null) {
            return;
        }
        $qb->andWhere(sprintf('u.%s = :f_%s', $field, $field))
           ->setParameter('f_' . $field, $bool);
    }
}