import { bookingBusinessDates, getBookingDisplayStatus, getBookingSortRank, sortBookingsForTable } from './bookingTableOrder';

const now = new Date('2026-11-05T18:00:00Z'); // Cancun 13:00
const row = (id, status, checkIn, checkOut, extra = {}) => ({ id, status, checkIn, checkOut, ...extra });

test('groups ongoing, upcoming, past, cancelled and expired with holds/blocks in date order', () => {
  const rows = [
    row(9, 'Expired', '2026-11-01', '2026-11-30', { guestType: 'Hold' }),
    row(8, 'Cancelled', '2026-11-01', '2026-11-30', { guestType: 'Block' }),
    row(7, 'Past', '2026-11-01', '2026-11-03'),
    row(6, 'Upcoming', '2026-11-09', '2026-11-12'),
    row(5, 'Hold', '2026-11-08', '2026-11-10'),
    row(4, 'Upcoming', '2026-11-07', '2026-11-10'),
    row(3, 'Ongoing', '2026-11-03', '2026-11-15'),
    row(2, 'Block', '2026-11-02', '2026-11-10'),
    row(1, 'Ongoing', '2026-10-20', '2026-11-15'),
  ];
  expect(sortBookingsForTable(rows, now).map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(rows[0].id).toBe(9); // Never mutate API data.
});

test('Owners2 Active blocks and holds join the date group without changing their status', () => {
  expect(getBookingSortRank(row(1, 'Active', '2026-11-02', '2026-11-10', { source: 'Owners2', guestType: 'Maintenance' }), now)).toBe(0);
  expect(getBookingSortRank(row(2, 'Active', '2026-11-08', '2026-11-10', { guest_type: 'hold' }), now)).toBe(1);
  expect(getBookingSortRank(row(3, 'Hold', '2026-11-01', '2026-11-04'), now)).toBe(2);
});

test('uses Cancun 15:00 arrivals and 11:00 departures even across UTC month boundaries', () => {
  expect(bookingBusinessDates(new Date('2026-12-01T02:00:00Z')).today).toBe('2026-11-30');
  const arriving = row(1, 'Block', '2026-11-05', '2026-11-07');
  expect(getBookingSortRank(arriving, new Date('2026-11-05T19:59:00Z'))).toBe(1);
  expect(getBookingSortRank(arriving, new Date('2026-11-05T20:00:00Z'))).toBe(0);
  const departing = row(2, 'Hold', '2026-11-01', '2026-11-05');
  expect(getBookingSortRank(departing, new Date('2026-11-05T15:59:00Z'))).toBe(0);
  expect(getBookingSortRank(departing, new Date('2026-11-05T16:00:00Z'))).toBe(2);
});

test('keeps terminal groups newest checkout first and missing dates last', () => {
  expect(sortBookingsForTable([
    row(1, 'Past', '2026-11-01', null), row(2, 'Past', '2026-11-01', '2026-11-03'),
    row(3, 'Past', '2026-11-01', '2026-11-04'), row(4, 'Unknown', null, null),
  ], now).map(({ id }) => id)).toEqual([3, 2, 1, 4]);
});

test('display labels distinguish active holds and blocks while preserving terminal statuses', () => {
  const hold = row(1, 'Active', '2026-11-06', '2026-11-10', { guest_type: 'Hold' });
  expect(getBookingDisplayStatus(hold, now)).toBe('Hold');
  expect(hold.status).toBe('Active');
  expect(getBookingDisplayStatus({ ...hold, status: 'Expired' }, now)).toBe('Expired');
  expect(getBookingDisplayStatus({ ...hold, status: 'Cancelled' }, now)).toBe('Cancelled');
  expect(getBookingDisplayStatus({ ...hold, status: 'Active', guest_type: 'Block' }, now)).toBe('Block');
  expect(getBookingDisplayStatus(row(2, 'Active', '2026-11-01', '2026-11-04', { guestType: 'Block' }), now)).toBe('Past');
  expect(getBookingDisplayStatus({ ...hold, guest_type: 'Block', status: 'Cancelled' }, now)).toBe('Cancelled');
  expect(getBookingDisplayStatus(row(3, 'Active', '2026-11-06', '2026-11-10', { source: 'Owners2', guestType: 'Maintenance' }), now)).toBe('Block');
  expect(getBookingDisplayStatus(row(4, 'Ongoing', '2026-11-01', '2026-11-10'), now)).toBe('Ongoing');
});
