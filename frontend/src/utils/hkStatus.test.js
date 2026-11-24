import { resolveHkStatus, displayStatusAfterChoice } from './hkStatus';

test.each(['Tulum', 'Playa del Carmen'])('cancellation wins over report status and notes in %s', (city) => {
  expect(resolveHkStatus({ city, status: 'cancelled', report_status: 'reported', display_status: 'reported', resolution_status: 'open' })).toBe('cancelled');
});

test('reopening cancellation shows pending until performed again', () => {
  expect(displayStatusAfterChoice({ status: 'cancelled', report_status: 'reported' }, 'pending')).toBe('pending');
});
