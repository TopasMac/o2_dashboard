import { z } from 'zod';
import { validateBookingDates } from './bookingDates';

const schema = z.object({ checkIn: z.string(), checkOut: z.string() }).superRefine(validateBookingDates);

test.each([
  ['2026-11-21', '2026-11-01'],
  ['21/11/2026', '01/11/2026'],
  ['2026-11-21', '2026-11-21'],
  ['2026-11-30', '2026-02-31'],
])('rejects invalid checkout %s → %s', (checkIn, checkOut) => {
  const result = schema.safeParse({ checkIn, checkOut });
  expect(result.success).toBe(false);
  expect(result.error.issues[0].path).toEqual(['checkOut']);
});

test.each([
  ['2026-11-21', '2026-11-22'],
  ['31/12/2026', '01/01/2027'],
  ['2028-02-28', '2028-02-29'],
])('accepts valid stay %s → %s', (checkIn, checkOut) => {
  expect(schema.safeParse({ checkIn, checkOut }).success).toBe(true);
});
