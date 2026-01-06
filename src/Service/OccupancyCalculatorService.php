<?php

namespace App\Service;

use App\Repository\AllBookingsRepository;
use App\Repository\UnitRepository;

class OccupancyCalculatorService
{
    private AllBookingsRepository $bookingsRepo;
    private UnitRepository $unitRepo;

    public function __construct(AllBookingsRepository $bookingsRepo, UnitRepository $unitRepo)
    {
        $this->bookingsRepo = $bookingsRepo;
        $this->unitRepo = $unitRepo;
    }

    public function calculate(): array
    {
        $bookings = $this->bookingsRepo->createQueryBuilder('b')
            ->andWhere('b.status IN (:included)')
            ->setParameter('included', ['Upcoming', 'Ongoing', 'Past'])
            ->getQuery()
            ->getResult();
        $unitMonthData = [];

        foreach ($bookings as $booking) {
            $unitId = $booking->getUnitId();
            $unit = $this->unitRepo->find($unitId);
            $checkIn = $booking->getCheckIn();
            $checkOut = $booking->getCheckOut();

            if (!$unitId || !$checkIn || !$checkOut) {
                continue;
            }

            $period = new \DatePeriod(
                new \DateTime($checkIn->format('Y-m-01')),
                new \DateInterval('P1M'),
                (new \DateTime($checkOut->format('Y-m-01')))->modify('+1 month')
            );

            foreach ($period as $month) {
                $year = (int) $month->format('Y');
                $monthNum = (int) $month->format('m');
                $daysInMonth = cal_days_in_month(CAL_GREGORIAN, $monthNum, $year);

                $startOfMonth = new \DateTime("{$year}-{$monthNum}-01");
                $endOfMonth = (clone $startOfMonth)->modify('last day of this month');

                $start = $checkIn > $startOfMonth ? $checkIn : $startOfMonth;
                $end = $checkOut < $endOfMonth ? $checkOut : $endOfMonth;

                $daysBooked = (int) $start->diff($end)->format('%a');

                if ($daysBooked <= 0) {
                    continue;
                }

                $key = "{$unitId}_{$year}_{$monthNum}";

                if (!isset($unitMonthData[$key])) {
                    $unitMonthData[$key] = [
                        'unitId' => $unitId,
                        'unitName' => $unit?->getUnitId() ?? 'Unknown',
                        'city' => $unit?->getCity() ?? 'Unknown',
                        'year' => $year,
                        'month' => $monthNum,
                        'bookedDays' => 0,
                        'daysInMonth' => $daysInMonth
                    ];
                }

                $unitMonthData[$key]['bookedDays'] += $daysBooked;
            }
        }

        // Calculate occupancy %
        $result = [];
        foreach ($unitMonthData as $entry) {
            $entry['occupancy'] = round(($entry['bookedDays'] / $entry['daysInMonth']) * 100, 2);
            $result[] = $entry;
        }

        return $result;
    }
}