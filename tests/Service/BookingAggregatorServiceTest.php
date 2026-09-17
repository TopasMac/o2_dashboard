<?php

namespace App\Tests\Service;

use App\Entity\AllBookings;
use App\Service\BookingAggregatorService;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use PHPUnit\Framework\TestCase;

class BookingAggregatorServiceTest extends TestCase
{
    public function testValidateOverlapThrowsWhenExistingBookingOverlapsDateRange(): void
    {
        /** @var BookingAggregatorService $service */
        $service = (new \ReflectionClass(BookingAggregatorService::class))->newInstanceWithoutConstructor();

        $existingBooking = new AllBookings();
        $existingBooking->setUnitId(7);
        $existingBooking->setCheckIn(new \DateTimeImmutable('2025-01-01 15:00:00'));
        $existingBooking->setCheckOut(new \DateTimeImmutable('2025-01-03 11:00:00'));
        $existingBooking->setStatus('confirmed');

        $repository = $this->createMock(EntityRepository::class);
        $repository->expects($this->once())
            ->method('findBy')
            ->with(['unitId' => 7])
            ->willReturn([$existingBooking]);

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects($this->once())
            ->method('getRepository')
            ->with(AllBookings::class)
            ->willReturn($repository);

        $this->setServiceProperty($service, 'entityManager', $entityManager);

        $booking = new AllBookings();
        $booking->setUnitId(7);
        $booking->setCheckIn(new \DateTimeImmutable('2025-01-02 15:00:00'));
        $booking->setCheckOut(new \DateTimeImmutable('2025-01-04 11:00:00'));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('Another booking already exists');

        $method = (new \ReflectionClass($service))->getMethod('validateOverlap');
        $method->invoke($service, $booking);
    }

    public function testValidateOverlapAllowsBackToBackBookings(): void
    {
        $existingBooking = (new AllBookings())
            ->setUnitId(7)
            ->setCheckIn(new \DateTimeImmutable('2025-01-01 15:00:00'))
            ->setCheckOut(new \DateTimeImmutable('2025-01-03 11:00:00'))
            ->setStatus('confirmed');

        $booking = (new AllBookings())
            ->setUnitId(7)
            ->setCheckIn(new \DateTimeImmutable('2025-01-03 15:00:00'))
            ->setCheckOut(new \DateTimeImmutable('2025-01-05 11:00:00'));

        $this->invokeValidateOverlap($booking, [$existingBooking]);

        self::addToAssertionCount(1);
    }

    public function testValidateOverlapIgnoresCancelledBookings(): void
    {
        $existingBooking = (new AllBookings())
            ->setUnitId(7)
            ->setCheckIn(new \DateTimeImmutable('2025-01-01 15:00:00'))
            ->setCheckOut(new \DateTimeImmutable('2025-01-03 11:00:00'))
            ->setStatus('Cancelled');

        $booking = (new AllBookings())
            ->setUnitId(7)
            ->setCheckIn(new \DateTimeImmutable('2025-01-02 15:00:00'))
            ->setCheckOut(new \DateTimeImmutable('2025-01-04 11:00:00'));

        $this->invokeValidateOverlap($booking, [$existingBooking]);

        self::addToAssertionCount(1);
    }

    /** @param list<AllBookings> $candidates */
    private function invokeValidateOverlap(AllBookings $booking, array $candidates): void
    {
        /** @var BookingAggregatorService $service */
        $service = (new \ReflectionClass(BookingAggregatorService::class))->newInstanceWithoutConstructor();

        $repository = $this->createMock(EntityRepository::class);
        $repository->expects($this->once())
            ->method('findBy')
            ->with(['unitId' => $booking->getUnitId()])
            ->willReturn($candidates);

        $entityManager = $this->createMock(EntityManagerInterface::class);
        $entityManager->expects($this->once())
            ->method('getRepository')
            ->with(AllBookings::class)
            ->willReturn($repository);

        $this->setServiceProperty($service, 'entityManager', $entityManager);

        (new \ReflectionClass($service))->getMethod('validateOverlap')->invoke($service, $booking);
    }

    private function setServiceProperty(object $service, string $property, mixed $value): void
    {
        $reflection = new \ReflectionProperty($service, $property);
        $reflection->setValue($service, $value);
    }
}
