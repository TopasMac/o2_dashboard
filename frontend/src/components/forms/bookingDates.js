import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export const CHECKOUT_ORDER_ERROR = 'Check-out must be after check-in';

export function parseBookingDate(value) {
  if (!value) return null;
  const calendarValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.split('T')[0] : value;
  const date = dayjs(calendarValue, ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY'], true);
  return date.isValid() ? date : null;
}

export function validateBookingDates(data, ctx) {
  const start = parseBookingDate(data.checkIn);
  const end = parseBookingDate(data.checkOut);
  for (const [field, date] of [['checkIn', start], ['checkOut', end]]) {
    if (data[field] && !date) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Enter a valid date' });
    }
  }
  if (start && end && !end.isAfter(start, 'day')) {
    ctx.addIssue({ code: 'custom', path: ['checkOut'], message: CHECKOUT_ORDER_ERROR });
  }
}
