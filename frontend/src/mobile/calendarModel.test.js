import {
  buildMonthGrid,
  buildCalendarSegments,
  bookingCoversDate,
  bookingFormToApi,
  bookingsTouchingDate,
  canCreateRecordOnDate,
  getBookingKind,
  normalizeBookings,
} from './calendarModel';

describe('Mobile V2 calendar model', () => {
  test('builds a Monday-first six-week grid', () => {
    const days = buildMonthGrid(2026, 8);

    expect(days).toHaveLength(42);
    expect(days[0]).toEqual({ ymd: '2026-08-31', day: 31, inMonth: false });
    expect(days[1]).toEqual({ ymd: '2026-09-01', day: 1, inMonth: true });
  });

  test('includes check-in and excludes checkout day', () => {
    const booking = { checkIn: '2026-09-10', checkOut: '2026-09-12' };

    expect(bookingCoversDate(booking, '2026-09-10')).toBe(true);
    expect(bookingCoversDate(booking, '2026-09-11')).toBe(true);
    expect(bookingCoversDate(booking, '2026-09-12')).toBe(false);
  });

  test('shows a departing booking card on its checkout day', () => {
    const bookings = [{ id: 1, checkIn: '2026-09-14', checkOut: '2026-09-17' }];

    expect(bookingsTouchingDate(bookings, '2026-09-17')).toEqual(bookings);
  });

  test('allows creation on an empty or checkout-only day, but not an occupied night', () => {
    const bookings = [{ id: 1, checkIn: '2026-09-14', checkOut: '2026-09-17' }];

    expect(canCreateRecordOnDate([], '2026-09-17')).toBe(true);
    expect(canCreateRecordOnDate(bookings, '2026-09-16')).toBe(false);
    expect(canCreateRecordOnDate(bookings, '2026-09-17')).toBe(true);
  });

  test('does not allow creation when a checkout and another check-in share the day', () => {
    const bookings = [
      { id: 1, checkIn: '2026-09-14', checkOut: '2026-09-17' },
      { id: 2, checkIn: '2026-09-17', checkOut: '2026-09-20' },
    ];

    expect(bookingsTouchingDate(bookings, '2026-09-17')).toHaveLength(2);
    expect(canCreateRecordOnDate(bookings, '2026-09-17')).toBe(false);
  });

  test('recognizes holds and blocks from existing API fields', () => {
    const bookings = normalizeBookings([
      { id: 1, guest_type: 'hold', source: 'Owners2', check_in: '2026-09-01', check_out: '2026-09-02' },
      { id: 2, source_normalized: 'Block', check_in: '2026-09-03', check_out: '2026-09-04' },
    ]);

    expect(getBookingKind(bookings[0])).toBe('hold');
    expect(getBookingKind(bookings[1])).toBe('block');
  });

  test('preserves the operational details used by the selected-day card', () => {
    const [booking] = normalizeBookings([{
      id: 9,
      guest_name: 'Ana López',
      check_in: '2026-09-10',
      check_out: '2026-09-12',
      payout: '3450.50',
      notes: 'Late arrival',
      check_in_notes: 'Key in lockbox',
      check_out_notes: 'Leave keys inside',
    }]);

    expect(booking).toMatchObject({
      payout: '3450.50',
      notes: 'Late arrival',
      checkInNotes: 'Key in lockbox',
      checkOutNotes: 'Leave keys inside',
    });
  });

  test('maps the edit form to the existing booking update contract', () => {
    expect(bookingFormToApi({
      unitId: 12,
      status: 'Upcoming',
      source: 'Private',
      guestName: 'Ana López',
      guests: '2',
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
      payout: '3450.50',
      isPaid: true,
      notes: 'Late arrival',
      checkInNotes: 'Key in lockbox',
      checkOutNotes: 'Leave keys inside',
    })).toMatchObject({
      unit_id: 12,
      guest_name: 'Ana López',
      guests: 2,
      check_in: '2026-09-10',
      check_out: '2026-09-12',
      payout: 3450.5,
      is_paid: 1,
      notes: 'Late arrival',
      check_in_notes: 'Key in lockbox',
      check_out_notes: 'Leave keys inside',
    });
  });

  test('removes duplicated union rows by booking id', () => {
    const rows = [
      { id: 7, guest_type: 'hold', check_in: '2026-09-01', check_out: '2026-09-02' },
      { id: 7, guest_type: 'hold', check_in: '2026-09-01', check_out: '2026-09-02' },
    ];

    expect(normalizeBookings(rows)).toHaveLength(1);
  });

  test('uses half-day edges so checkout and check-in can share one cell', () => {
    const days = buildMonthGrid(2026, 8);
    const segments = buildCalendarSegments([
      { id: 1, guestName: 'Ana López', checkIn: '2026-09-01', checkOut: '2026-09-03' },
      { id: 2, guestName: 'Luis Pérez', checkIn: '2026-09-03', checkOut: '2026-09-05' },
    ], days);

    expect(segments).toHaveLength(2);
    expect(segments[0].end).toBe(segments[1].start);
    expect(segments[0].lane).toBe(0);
    expect(segments[1].lane).toBe(0);
    expect(segments.map((segment) => segment.label)).toEqual(['Ana', 'Luis']);
  });

  test('splits a stay across week rows while preserving rounded outer ends', () => {
    const days = buildMonthGrid(2026, 8);
    const segments = buildCalendarSegments([
      { id: 3, guestName: 'Imad Noor', checkIn: '2026-09-04', checkOut: '2026-09-08' },
    ], days);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ row: 0, roundedStart: true, roundedEnd: false });
    expect(segments[1]).toMatchObject({ row: 1, roundedStart: false, roundedEnd: true });
  });

  test('keeps all bars in one lane even when booking dates overlap', () => {
    const days = buildMonthGrid(2026, 8);
    const segments = buildCalendarSegments([
      { id: 4, guestName: 'Ana', checkIn: '2026-09-01', checkOut: '2026-09-05' },
      { id: 5, guestName: 'Luis', checkIn: '2026-09-03', checkOut: '2026-09-06' },
    ], days);

    expect(segments.every((segment) => segment.lane === 0)).toBe(true);
  });
});
