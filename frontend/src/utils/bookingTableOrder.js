const normalized = (value) => String(value || '').trim().toLowerCase();
const dateKey = (value) => {
  const key = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

// Match the backend ReservationStatus business clock, using stored calendar dates.
export function bookingBusinessDates(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  const previous = new Date(`${today}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  return {
    today,
    lastArrived: Number(values.hour) >= 15 ? today : yesterday,
    lastDeparted: Number(values.hour) >= 11 ? today : yesterday,
  };
}

export function getBookingStatusRank(status) {
  const value = normalized(status);
  if (['ongoing', 'inhouse', 'in house', 'current'].includes(value)) return 0;
  if (['upcoming', 'future', 'scheduled', 'pending', 'active'].includes(value)) return 1;
  if (['past', 'completed', 'finished', 'done'].includes(value)) return 2;
  if (['cancelled', 'canceled'].includes(value)) return 3;
  if (value === 'expired') return 4;
  return 5;
}

function rankForDates(row, dates) {
  const status = normalized(row.status);
  const rank = getBookingStatusRank(status);
  // Terminal statuses always win over a row's Hold/Block type or dates.
  if (rank >= 2 && rank <= 4) return rank;
  const kind = normalized(row.guestType ?? row.guest_type);
  const isSoft = ['hold', 'block'].includes(status)
    || ['hold', 'block', 'cleaning', 'maintenance', 'late check-out', 'late checkout', 'other'].includes(kind)
    || normalized(row.source) === 'owners2';
  if (!isSoft) return rank;
  const checkIn = dateKey(row.checkIn ?? row.check_in);
  const checkOut = dateKey(row.checkOut ?? row.check_out);
  if (checkOut && checkOut <= dates.lastDeparted) return 2;
  return checkIn && checkIn <= dates.lastArrived ? 0 : 1;
}

// Presentation only: retain raw status for edit/save and lifecycle operations.
export function getBookingDisplayStatus(row, now = new Date()) {
  const status = normalized(row.status);
  if (['cancelled', 'canceled'].includes(status)) return 'Cancelled';
  if (status === 'expired') return 'Expired';
  if (status === 'past') return 'Past';
  const kind = normalized(row.guestType || row.guest_type);
  const isHold = kind === 'hold' || status === 'hold';
  const isBlock = kind === 'block' || status === 'block'
    || (normalized(row.source) === 'owners2' && !isHold);
  if (isHold) return 'Hold';
  if (isBlock) return rankForDates(row, bookingBusinessDates(now)) === 2 ? 'Past' : 'Block';
  return row.status;
}

export function getBookingSortRank(row, now = new Date()) {
  return rankForDates(row, bookingBusinessDates(now));
}

export function sortBookingsForTable(rows, now = new Date()) {
  const dates = bookingBusinessDates(now);
  return [...rows].sort((a, b) => {
    const rankA = rankForDates(a, dates);
    const rankB = rankForDates(b, dates);
    if (rankA !== rankB) return rankA - rankB;
    const active = rankA < 2;
    const dateA = dateKey(active ? (a.checkIn ?? a.check_in) : (a.checkOut ?? a.check_out));
    const dateB = dateKey(active ? (b.checkIn ?? b.check_in) : (b.checkOut ?? b.check_out));
    if (dateA == null || dateB == null) return dateA == null ? (dateB == null ? 0 : 1) : -1;
    return active ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
  });
}
