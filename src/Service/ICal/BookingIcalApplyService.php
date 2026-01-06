<?php

namespace App\Service\ICal;

use App\Entity\AllBookings;
use App\Entity\IcalEvent;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

class BookingIcalApplyService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ?LoggerInterface $logger = null,
    ) {}

    /**
     * Apply iCal dates to a single booking by its ID.
     * Returns a payload describing whether an update happened and the before/after snapshot.
     */
    public function applyForBookingId(int $bookingId): array
    {
        /** @var AllBookings|null $booking */
        $booking = $this->em->getRepository(AllBookings::class)->find($bookingId);
        if (!$booking) {
            return [
                'ok' => false,
                'bookingId' => $bookingId,
                'error' => 'not_found',
                'message' => 'Booking not found',
            ];
        }

        return $this->applyForBooking($booking);
    }

    /**
     * Apply iCal dates to the provided booking entity.
     */
    public function applyForBooking(AllBookings $booking): array
    {
        $before = [
            'checkIn'  => $booking->getCheckIn(),
            'checkOut' => $booking->getCheckOut(),
        ];

        // Get source and booking code
        $source = method_exists($booking, 'getSource') ? $booking->getSource() : null;
        $bookingCode = null;
        if (method_exists($booking, 'getReservationCode')) {
            $bookingCode = $booking->getReservationCode();
        } elseif (method_exists($booking, 'getConfirmationCode')) {
            $bookingCode = $booking->getConfirmationCode();
        }

        // Prefer the explicit relation if it exists
        $event = null;
        if (method_exists($booking, 'getIcalEvent')) {
            /** @var IcalEvent|null $rel */
            $rel = $booking->getIcalEvent();
            if ($rel instanceof IcalEvent) {
                $event = $rel;
            }
        }

        if (!$event) {
            // Optional fallback: if entity stores a foreign key method like getIcalEventId()
            if (method_exists($booking, 'getIcalEventId')) {
                $eventId = $booking->getIcalEventId();
                if ($eventId) {
                    $event = $this->em->getRepository(IcalEvent::class)->find($eventId);
                }
            }
        }

        if (!$event) {
            return [
                'ok' => false,
                'bookingId' => $booking->getId(),
                'error' => 'no_event',
                'message' => 'No linked iCal event to apply from',
            ];
        }

        $eventCode = method_exists($event, 'getReservationCode') ? $event->getReservationCode() : null;
        $icalIn  = $event->getDtstart();
        $icalOut = $event->getDtend();
        if (!$icalIn || !$icalOut) {
            return [
                'ok' => false,
                'bookingId' => $booking->getId(),
                'error' => 'event_missing_dates',
                'message' => 'Linked iCal event is missing dtstart/dtend',
            ];
        }

        // Normalize to Y-m-d strings for comparison and for setter input (if setters accept string)
        $currIn  = $this->toYmd($booking->getCheckIn());
        $currOut = $this->toYmd($booking->getCheckOut());
        $newIn   = $this->toYmd($icalIn);
        $newOut  = $this->toYmd($icalOut);

        // Precedence: if Airbnb booking has an HM code and the iCal event code differs, cancel the booking
        $isAirbnb = ($source === 'Airbnb');
        $isHmMismatch = $isAirbnb && $bookingCode && $eventCode && ($bookingCode !== $eventCode);
        if ($isHmMismatch) {
            $statusBefore = method_exists($booking, 'getStatus') ? $booking->getStatus() : null;
            if (method_exists($booking, 'setStatus')) {
                // Use your canonical cancelled status label
                $booking->setStatus('Cancelled');
            }
            if (method_exists($booking, 'setLastUpdatedAt')) {
                $booking->setLastUpdatedAt(new \DateTimeImmutable());
            }
            if (method_exists($booking, 'setLastUpdatedVia')) {
                $booking->setLastUpdatedVia('ical');
            }
            $this->em->persist($booking);
            $this->em->flush();

            $after = [
                'checkIn'  => $this->toYmd($booking->getCheckIn()),
                'checkOut' => $this->toYmd($booking->getCheckOut()),
            ];

            $this->logger?->info('iCal apply: cancelled booking due to HM mismatch', [
                'bookingId' => $booking->getId(),
                'bookingCode' => $bookingCode,
                'eventCode' => $eventCode,
                'statusBefore' => $statusBefore,
                'statusAfter' => method_exists($booking, 'getStatus') ? $booking->getStatus() : null,
            ]);

            return [
                'ok' => true,
                'bookingId' => $booking->getId(),
                'updated' => true,
                'action' => 'cancelled_due_to_ical_mismatch',
                'before' => [
                    'status' => $statusBefore,
                    'checkIn'  => $this->toYmd($before['checkIn']),
                    'checkOut' => $this->toYmd($before['checkOut']),
                ],
                'after' => [
                    'status' => method_exists($booking, 'getStatus') ? $booking->getStatus() : null,
                    'checkIn'  => $after['checkIn'],
                    'checkOut' => $after['checkOut'],
                ],
                'event' => [
                    'id' => $event->getId(),
                    'code' => $eventCode,
                    'dtstart' => $this->toYmd($icalIn ?? null),
                    'dtend'   => $this->toYmd($icalOut ?? null),
                ],
            ];
        }

        $changed = false;
        if ($currIn !== $newIn) {
            // Accept both string or DateTimeInterface depending on your entity signature
            $this->setBookingDate($booking, 'setCheckIn', $newIn);
            $changed = true;
        }
        if ($currOut !== $newOut) {
            $this->setBookingDate($booking, 'setCheckOut', $newOut);
            $changed = true;
        }

        if (!$changed) {
            return [
                'ok' => true,
                'bookingId' => $booking->getId(),
                'updated' => false,
                'reason' => 'no_change',
                'before' => [
                    'checkIn'  => $currIn,
                    'checkOut' => $currOut,
                ],
                'after' => [
                    'checkIn'  => $currIn,
                    'checkOut' => $currOut,
                ],
            ];
        }

        // Stamp last updated via iCal only when actual mutation occurs
        if (method_exists($booking, 'setLastUpdatedAt')) {
            $booking->setLastUpdatedAt(new \DateTimeImmutable());
        }
        if (method_exists($booking, 'setLastUpdatedVia')) {
            $booking->setLastUpdatedVia('ical');
        }

        $this->em->persist($booking);
        $this->em->flush();

        $after = [
            'checkIn'  => $this->toYmd($booking->getCheckIn()),
            'checkOut' => $this->toYmd($booking->getCheckOut()),
        ];

        $this->logger?->info('Applied iCal dates to booking', [
            'bookingId' => $booking->getId(),
            'before' => $before,
            'after'  => $after,
            'eventId' => $event->getId(),
        ]);

        return [
            'ok' => true,
            'bookingId' => $booking->getId(),
            'updated' => true,
            'before' => [
                'checkIn'  => $this->toYmd($before['checkIn']),
                'checkOut' => $this->toYmd($before['checkOut']),
            ],
            'after' => $after,
            'event' => [
                'id' => $event->getId(),
                'dtstart' => $this->toYmd($icalIn),
                'dtend'   => $this->toYmd($icalOut),
            ],
        ];
    }

    private function toYmd($v): ?string
    {
        if ($v === null) return null;
        if ($v instanceof \DateTimeInterface) return $v->format('Y-m-d');
        // assume string already 'Y-m-d' or 'Y-m-d H:i:s'
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', (string)$v, $m)) {
            return $m[1];
        }
        $ts = strtotime((string)$v);
        return $ts ? gmdate('Y-m-d', $ts) : null;
    }

    private function setBookingDate(AllBookings $b, string $setter, string $ymd): void
    {
        // If your setters accept string, this is fine; if they require DateTime, convert here
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $ymd) ?: new \DateTimeImmutable($ymd);
        $b->$setter($dt instanceof \DateTimeInterface ? $dt : $ymd);
    }
}
