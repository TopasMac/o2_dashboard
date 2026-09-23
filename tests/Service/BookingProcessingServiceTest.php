<?php

namespace App\Tests\Service;

use App\Entity\AirbnbEmailImport;
use App\Entity\AllBookings;
use App\Entity\BookingConfig;
use App\Entity\IcalEvent;
use App\Entity\Unit;
use App\Service\BookingAggregatorService;
use App\Service\BookingProcessingService;
use App\Service\MonthSliceRefresher;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use PHPUnit\Framework\TestCase;

final class BookingProcessingServiceTest extends TestCase
{
    public function testHydratesGenuineIcalPlaceholderWithoutReplacingItsIdentityOrReconciliationData(): void
    {
        $email = $this->emailImport('HM2TJCBCJP');
        $icalEvent = new IcalEvent();
        $lastIcalSyncAt = new \DateTimeImmutable('2026-09-20 10:15:00');
        $placeholder = (new AllBookings())
            ->setConfirmationCode('HM2TJCBCJP')
            ->setReservationCode('HM2TJCBCJP')
            ->setSource('Airbnb')
            ->setGuestName('Missing email')
            ->setPayout(0.0)
            ->setUnitId(44)
            ->setUnitName('Preserved unit')
            ->setCity('Tulum')
            ->setIcalEvent($icalEvent)
            ->setDateSyncStatus('matched')
            ->setLastIcalSyncAt($lastIcalSyncAt)
            ->setLastUpdatedVia('ical-create');
        $this->setId($placeholder, 1319);

        [$service, $em, $aggregator, $refresher] = $this->serviceFor(
            [$email],
            $placeholder,
        );

        $aggregator->expects(self::once())
            ->method('recalculateAllBookingFields')
            ->with(self::identicalTo($placeholder))
            ->willReturnCallback(static function (AllBookings $booking): void {
                $booking
                    ->setTaxAmount(192.0)
                    ->setNetPayout(1408.0)
                    ->setCommissionBase(1308.0)
                    ->setCommissionValue(261.6)
                    ->setClientIncome(1046.4)
                    ->setO2Total(361.6)
                    ->setStatus('Upcoming');
            });
        $em->expects(self::once())->method('persist')->with(self::identicalTo($placeholder));
        $em->expects(self::exactly(2))->method('flush');

        $sliceRefresh = null;
        $refresher->expects(self::once())
            ->method('refreshForBooking')
            ->willReturnCallback(static function (int $id, \DateTimeInterface $in, \DateTimeInterface $out) use (&$sliceRefresh): int {
                $sliceRefresh = [$id, $in, $out];

                return 2;
            });
        $service->processAirbnbEmails();

        self::assertIsArray($sliceRefresh);
        [$sliceBookingId, $sliceCheckIn, $sliceCheckOut] = $sliceRefresh;
        $novemberStart = new \DateTimeImmutable($sliceCheckIn->format('Y-m-d'));
        $decemberStart = new \DateTimeImmutable('2026-12-01');
        $decemberEnd = new \DateTimeImmutable($sliceCheckOut->format('Y-m-d'));
        self::assertSame(1319, $sliceBookingId);
        self::assertSame('2026-11-04', $sliceCheckIn->format('Y-m-d'));
        self::assertSame('2026-12-05', $sliceCheckOut->format('Y-m-d'));
        self::assertSame(31, $novemberStart->diff($decemberEnd)->days);
        self::assertSame(27, $novemberStart->diff($decemberStart)->days);
        self::assertSame(4, $decemberStart->diff($decemberEnd)->days);
        self::assertSame(1319, $placeholder->getId());
        self::assertSame(44, $placeholder->getUnitId());
        self::assertSame('Preserved unit', $placeholder->getUnitName());
        self::assertSame($icalEvent, $placeholder->getIcalEvent());
        self::assertSame('HM2TJCBCJP', $placeholder->getReservationCode());
        self::assertSame('matched', $placeholder->getDateSyncStatus());
        self::assertSame($lastIcalSyncAt, $placeholder->getLastIcalSyncAt());
        self::assertSame('email', $placeholder->getLastUpdatedVia());
        self::assertSame('Actual Guest', $placeholder->getGuestName());
        self::assertSame(1600.0, $placeholder->getPayout());
        self::assertSame(100.0, $placeholder->getCleaningFee());
        self::assertSame(48.39, $placeholder->getRoomFee());
        self::assertSame(31, $placeholder->getDays());
        self::assertSame(192.0, $placeholder->getTaxAmount());
        self::assertSame(1408.0, $placeholder->getNetPayout());
        self::assertSame(1308.0, $placeholder->getCommissionBase());
        self::assertSame(261.6, $placeholder->getCommissionValue());
        self::assertSame(1046.4, $placeholder->getClientIncome());
        self::assertSame(361.6, $placeholder->getO2Total());
        self::assertSame('44', $email->getUnitId());
    }

    public function testCreatesOrdinaryNewImportAndRunsExistingDownstreamWork(): void
    {
        $email = $this->emailImport('HMNEWIMPORT');
        $unit = (new Unit())
            ->setUnitName('New import unit')
            ->setListingName('Airbnb listing')
            ->setCity('Playa del Carmen')
            ->setPaymentType('OWNERS2');
        $this->setId($unit, 52);

        [$service, $em, $aggregator, $refresher] = $this->serviceFor(
            [$email],
            null,
            $unit,
        );

        $created = null;
        $aggregator->expects(self::once())
            ->method('recalculateAllBookingFields')
            ->willReturnCallback(static function (AllBookings $booking) use (&$created): void {
                $created = $booking;
                // These values must be initialized before the real aggregator runs.
                // In particular, Owners2 calculation does not reliably backfill a
                // missing commission_percent.
                self::assertSame(12.0, $booking->getTaxPercent());
                self::assertSame(20.0, $booking->getCommissionPercent());
                self::assertSame(192.0, $booking->getTaxAmount());
                self::assertSame(1408.0, $booking->getNetPayout());
                self::assertSame(261.6, $booking->getCommissionValue());
                self::assertSame(1046.4, $booking->getClientIncome());
                self::assertSame(361.6, $booking->getO2Total());
                $booking->setStatus('Upcoming');
            });
        $em->expects(self::once())
            ->method('persist')
            ->willReturnCallback(function (AllBookings $booking): void {
                $this->setId($booking, 1400);
            });
        $em->expects(self::exactly(2))->method('flush');
        $refresher->expects(self::once())->method('refreshForBooking')->with(1400, self::isInstanceOf(\DateTimeInterface::class), self::isInstanceOf(\DateTimeInterface::class));
        $service->processAirbnbEmails();

        self::assertInstanceOf(AllBookings::class, $created);
        self::assertSame('HMNEWIMPORT', $created->getConfirmationCode());
        self::assertSame(52, $created->getUnitId());
        self::assertSame('New import unit', $created->getUnitName());
        self::assertSame('Actual Guest', $created->getGuestName());
        self::assertNull($created->getLastUpdatedVia());
        self::assertSame('52', $email->getUnitId());
    }

    public function testMatchingCodeDoesNotOverwriteLegitimateExistingBooking(): void
    {
        $email = $this->emailImport('HMPROTECTED');
        $legitimate = (new AllBookings())
            ->setConfirmationCode('HMPROTECTED')
            ->setSource('Airbnb')
            ->setGuestName('Legitimate Guest')
            ->setPayout(725.0)
            ->setIcalEvent(new IcalEvent())
            ->setLastUpdatedVia('ical-create');
        $this->setId($legitimate, 1300);

        [$service, $em, $aggregator, $refresher] = $this->serviceFor(
            [$email],
            $legitimate,
        );

        $aggregator->expects(self::never())->method('recalculateAllBookingFields');
        $em->expects(self::never())->method('persist');
        $em->expects(self::once())->method('flush');
        $refresher->expects(self::never())->method('refreshForBooking');
        $service->processAirbnbEmails();

        self::assertSame('Legitimate Guest', $legitimate->getGuestName());
        self::assertSame(725.0, $legitimate->getPayout());
        self::assertSame('ical-create', $legitimate->getLastUpdatedVia());
    }

    private function emailImport(string $code): AirbnbEmailImport
    {
        return (new AirbnbEmailImport())
            ->setBookingDate(new \DateTime('2026-09-23'))
            ->setSource('Airbnb')
            ->setConfirmationCode($code)
            ->setGuestName('Actual Guest')
            ->setListingName('Airbnb listing')
            ->setGuests(2)
            ->setCheckIn('4 Nov')
            ->setCheckOut('5 Dec')
            ->setPayout(1600.0)
            ->setCleaningFee(100.0)
            ->setRoomFee(48.39);
    }

    /**
     * @return array{BookingProcessingService, EntityManagerInterface&\PHPUnit\Framework\MockObject\MockObject, BookingAggregatorService&\PHPUnit\Framework\MockObject\MockObject, MonthSliceRefresher&\PHPUnit\Framework\MockObject\MockObject}
     */
    private function serviceFor(array $emails, ?AllBookings $existing, ?Unit $unit = null): array
    {
        $emailRepository = $this->createMock(EntityRepository::class);
        $emailRepository->method('findAll')->willReturn($emails);

        $unitRepository = $this->createMock(EntityRepository::class);
        $unitRepository->method('findOneBy')->willReturn($unit);

        $bookingRepository = $this->createMock(EntityRepository::class);
        $bookingRepository->method('findOneBy')->willReturn($existing);

        $bookingConfigRepository = $this->createMock(EntityRepository::class);
        $bookingConfigRepository->method('findOneBy')->willReturn(null);

        $em = $this->createMock(EntityManagerInterface::class);
        $em->method('getRepository')->willReturnCallback(static fn (string $class): EntityRepository => match ($class) {
            AirbnbEmailImport::class => $emailRepository,
            Unit::class => $unitRepository,
            BookingConfig::class => $bookingConfigRepository,
            AllBookings::class => $bookingRepository,
            default => throw new \LogicException("Unexpected repository: $class"),
        });

        $aggregator = $this->createMock(BookingAggregatorService::class);
        $refresher = $this->createMock(MonthSliceRefresher::class);

        return [
            new BookingProcessingService($em, $aggregator, $refresher),
            $em,
            $aggregator,
            $refresher,
        ];
    }

    private function setId(object $entity, int $id): void
    {
        $property = new \ReflectionProperty($entity, 'id');
        $property->setValue($entity, $id);
    }
}
