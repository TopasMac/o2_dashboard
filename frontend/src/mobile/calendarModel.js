const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseYmd(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatYmd(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getTodayYmd(timeZone = 'America/Cancun', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildMonthGrid(year, monthIndex) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first.getTime() - mondayOffset * DAY_MS);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getTime() + index * DAY_MS);
    return {
      ymd: formatYmd(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === monthIndex,
    };
  });
}

export function normalizeBooking(row) {
  const guestType = String(row?.guest_type || row?.guestType || '').toLowerCase();
  const source = String(row?.source_normalized || row?.source || '').trim();
  const sourceLower = source.toLowerCase();
  const isHold = row?.is_hold === true || row?.is_hold === 1 || guestType === 'hold' || sourceLower === 'hold';
  const isBlock = row?.is_block === true || row?.is_block === 1 || guestType === 'block' || sourceLower === 'block';

  return {
    id: row?.id,
    guestName: row?.guest_name || row?.guest || (isHold ? 'Hold' : isBlock ? 'Bloqueo' : 'Sin nombre'),
    confirmationCode: row?.confirmation_code || row?.reservation_code || row?.code || '',
    checkIn: String(row?.check_in || row?.start || '').slice(0, 10),
    checkOut: String(row?.check_out || row?.end || '').slice(0, 10),
    status: row?.status || '',
    source: isHold ? 'Hold' : isBlock ? 'Block' : source || 'Reserva',
    unitId: row?.unit_id ?? row?.unitId ?? null,
    unitName: row?.unit_name || row?.unitName || '',
    guests: row?.guests ?? row?.num_guests ?? null,
    payout: row?.payout ?? null,
    paymentMethod: row?.payment_method || row?.paymentMethod || '',
    cleaningFee: row?.cleaning_fee ?? row?.cleaningFee ?? null,
    commissionPercent: row?.commission_percent ?? row?.commissionPercent ?? null,
    isPaid: row?.is_paid === true || row?.is_paid === 1,
    notes: row?.notes || '',
    checkInNotes: row?.check_in_notes || row?.checkInNotes || '',
    checkOutNotes: row?.check_out_notes || row?.checkOutNotes || '',
    isHold,
    isBlock,
  };
}

export function bookingFormToApi(values = {}) {
  const numberOrZero = (value) => (value === '' || value === null || value === undefined ? 0 : Number(value));
  return {
    unit_id: values.unitId ?? null,
    status: values.status ?? '',
    source: values.source ?? '',
    guest_name: values.guestName ?? '',
    guests: values.guests === '' || values.guests === null || values.guests === undefined
      ? null
      : Number(values.guests),
    check_in: values.checkIn ?? '',
    check_out: values.checkOut ?? '',
    payout: numberOrZero(values.payout),
    is_paid: values.isPaid ? 1 : 0,
    payment_method: values.paymentMethod ?? '',
    cleaning_fee: numberOrZero(values.cleaningFee),
    commission_percent: numberOrZero(values.commissionPercent),
    notes: values.notes ?? '',
    check_in_notes: values.checkInNotes ?? '',
    check_out_notes: values.checkOutNotes ?? '',
  };
}

export function normalizeBookings(rows) {
  const unique = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const booking = normalizeBooking(row);
    const key = booking.id ?? `${booking.checkIn}|${booking.checkOut}|${booking.guestName}`;
    if (!unique.has(key)) unique.set(key, booking);
  });
  return Array.from(unique.values());
}

export function bookingCoversDate(booking, ymd) {
  return Boolean(booking?.checkIn && booking?.checkOut && booking.checkIn <= ymd && ymd < booking.checkOut);
}

export function bookingsForDate(bookings, ymd) {
  return (bookings || []).filter((booking) => bookingCoversDate(booking, ymd));
}

export function bookingTouchesDate(booking, ymd) {
  return Boolean(booking?.checkIn && booking?.checkOut && booking.checkIn <= ymd && ymd <= booking.checkOut);
}

export function bookingsTouchingDate(bookings, ymd) {
  return (bookings || []).filter((booking) => bookingTouchesDate(booking, ymd));
}

export function canCreateRecordOnDate(bookings, ymd) {
  return !bookingsForDate(bookings, ymd).length;
}

export function getBookingKind(booking) {
  if (booking?.isBlock) return 'block';
  if (booking?.isHold) return 'hold';
  return String(booking?.source || '').toLowerCase() === 'airbnb' ? 'airbnb' : 'reservation';
}

export const BOOKING_COLORS = Object.freeze({
  airbnb: '#e94b68',
  reservation: '#1E6F68',
  hold: '#E2A528',
  block: '#74817f',
});

export function getBookingColor(booking) {
  return BOOKING_COLORS[getBookingKind(booking)];
}

function firstName(booking) {
  const name = String(booking?.guestName || '').trim();
  if (!name) return booking?.isBlock ? 'Bloqueo' : booking?.isHold ? 'Hold' : '';
  return name.split(/\s+/)[0];
}

/**
 * Creates week-row bar segments for the month grid. Check-in and checkout are
 * positioned at the middle of their day cells so a turnover date can show the
 * departing and arriving reservation in the same cell.
 */
export function buildCalendarSegments(bookings, gridDays) {
  if (!Array.isArray(gridDays) || gridDays.length === 0) return [];
  const gridStart = parseYmd(gridDays[0].ymd);
  if (!gridStart) return [];

  const candidates = [];
  (bookings || []).forEach((booking) => {
    const checkIn = parseYmd(booking?.checkIn);
    const checkOut = parseYmd(booking?.checkOut);
    if (!checkIn || !checkOut || checkOut <= checkIn) return;

    const rawStart = (checkIn.getTime() - gridStart.getTime()) / DAY_MS + 0.5;
    const rawEnd = (checkOut.getTime() - gridStart.getTime()) / DAY_MS + 0.5;
    const clippedStart = Math.max(0, rawStart);
    const clippedEnd = Math.min(gridDays.length, rawEnd);
    if (clippedStart >= clippedEnd) return;

    const firstRow = Math.floor(clippedStart / 7);
    const lastRow = Math.floor((clippedEnd - Number.EPSILON) / 7);
    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowStart = row * 7;
      const segmentStart = Math.max(clippedStart, rowStart);
      const segmentEnd = Math.min(clippedEnd, rowStart + 7);
      if (segmentStart >= segmentEnd) continue;
      candidates.push({
        booking,
        row,
        start: segmentStart - rowStart,
        end: segmentEnd - rowStart,
        roundedStart: segmentStart === rawStart,
        roundedEnd: segmentEnd === rawEnd,
      });
    }
  });

  return candidates
    .sort((a, b) => a.row - b.row || a.start - b.start || b.end - a.end)
    .map((segment) => {
      return {
        ...segment,
        lane: 0,
        label: firstName(segment.booking),
        leftPercent: (segment.start / 7) * 100,
        widthPercent: ((segment.end - segment.start) / 7) * 100,
      };
    });
}

export function formatShortDate(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}
