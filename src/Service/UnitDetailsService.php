<?php

namespace App\Service;

use App\Entity\Unit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * UnitDetailsService
 *
 * Read-model for Unit forms (edit and prefill). Returns a flat associative array
 * with snake_case keys expected by the frontend forms.
 */
class UnitDetailsService
{
    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    /**
     * Fetch a single Unit and flatten all required fields for the form.
     *
     * @param int $id
     * @return array<string, mixed>
     */
    public function getDetails(int $id): array
    {
        $qb = $this->em->getRepository(Unit::class)
            ->createQueryBuilder('u')
            ->leftJoin('u.client', 'c')->addSelect('c')
            ->leftJoin('u.condo', 'co')->addSelect('co')
            ->andWhere('u.id = :id')->setParameter('id', $id)
        ;

        /** @var Unit|null $unit */
        $unit = $qb->getQuery()->getOneOrNullResult();
        if (!$unit) {
            throw new NotFoundHttpException('Unit not found');
        }

        return $this->mapUnit($unit);
    }

    /**
     * Map a Unit entity into a flat array with snake_case keys for the form.
     *
     * @param Unit $unit
     * @return array<string, mixed>
     */
    private function mapUnit(Unit $unit): array
    {
        $client = $unit->getClient();
        $condo  = $unit->getCondo();

        $date = $unit->getDateStarted();

        $row = [
            // base ids
            'id'              => $unit->getId(),
            'unit_name'       => $unit->getUnitName(),
            'status'          => $unit->getStatus(),
            'client_id'       => $client?->getId(),
            'date_started'    => $date ? $date->format('Y-m-d') : null,
            'type'            => $unit->getType(),
            'city'            => $unit->getCity(),
            'condo_id'        => $condo?->getId(),
            'unit_number'     => $unit->getUnitNumber(),
            'unit_floor'      => $unit->getUnitFloor(),

            // access
            'access_type'     => $unit->getAccessType(),
            'access_code'     => $unit->getAccessCode(),
            'backup_lockbox'  => $unit->getBackupLockbox(),

            // wifi
            'wifi_name'       => $unit->getWifiName(),
            'wifi_password'   => $unit->getWifiPassword(),

            // parking & notes
            'parking'         => $unit->getParking(),
            'pax'             => $unit->getPax(),
            'baths'           => $unit->getBaths(),
            'beds'            => $unit->getBeds(),
            'bed_config'      => $unit->getBedConfig(),
            'notes'           => $unit->getNotes(),

            // listing
            'listing_name'    => $unit->getListingName(),
            'seo_short_description' => $unit->getSeoShortDescription(),

            // financials
            'cleaning_fee'    => $unit->getCleaningFee(),
            'host_type'       => $unit->getHostType(),
            'airbnb_email'    => $unit->getAirbnbEmail(),
            'airbnb_pass'     => $unit->getAirbnbPass(),
            'airbnb_id'       => $unit->getAirbnbId(),
            'airbnb_pay_route' => $unit->getAirbnbPayRoute(),
            'payment_type'    => $unit->getPaymentType(),

            // iCal integration
            'private_ical_enabled' => (bool) $unit->isPrivateIcalEnabled(),
            'ical_export_token'    => $unit->getIcalExportToken(),
            'airbnb_ical'        => (string) ($unit->getAirbnbIcal() ?? ''),

            // CFE (electric)
            'cfe'                 => (bool) $unit->getCfe(),
            'cfe_reference'       => $unit->getCfeReference(),
            'cfe_name'            => $unit->getCfeName(),
            'cfe_period'          => $unit->getCfePeriod(),
            'cfe_payment_day'     => $unit->getCfePaymentDay(),
            'cfe_starting_month'  => $unit->getCfeStartingMonth(),

            // Internet
            'internet'            => (bool) $unit->getInternet(),
            'internet_isp'        => $unit->getInternetIsp(),
            'internet_reference'  => $unit->getInternetReference(),
            'internet_cost'       => $unit->getInternetCost(),
            'internet_deadline'   => $unit->getInternetDeadline(),

            // Water
            'water'               => (bool) $unit->getWater(),
            'water_reference'     => $unit->getWaterReference(),
            'water_deadline'      => $unit->getWaterDeadline(),

            // HOA & linens
            'hoa'                 => (bool) $unit->getHoa(),
            'hoa_amount'          => $unit->getHoaAmount(),
            'linens_fee'          => $unit->getLinensFee(),

            // joined extras (names for display)
            'condo_name'      => $condo?->getCondoName() ?? '',
            'door_code'       => $condo?->getDoorCode() ?? '',
            'client_name'     => $client?->getName() ?? '',
            'cc_email'        => $unit->getCcEmail(),
        ];

        return $row;
    }
}