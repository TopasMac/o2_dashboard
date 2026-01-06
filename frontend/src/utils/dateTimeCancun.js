// Centralized date/time formatting helpers using Cancun timezone.
// Use these everywhere instead of ad‑hoc new Date().toLocaleString() calls.

const CANCUN_TZ = 'America/Cancun';

/**
 * Safely formats any date-like value (ISO string, timestamp, etc)
 * into DD/MM/YYYY in Cancun time.
 */
export function formatDateCancun(value) {
  if (!value) return '—';

  // If we get a plain date string (YYYY-MM-DD), avoid creating a Date object,
  // because JS will treat it as UTC and then shifting to Cancun would move it
  // to the previous calendar day. Instead, just reformat the string.
  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Match exactly YYYY-MM-DD
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, year, month, day] = m;
      return `${day}/${month}/${year}`;
    }
  }

  try {
    const d = new Date(value);
    return d.toLocaleDateString('en-GB', {
      timeZone: CANCUN_TZ,
    });
  } catch {
    return String(value);
  }
}

/**
 * Formats into DD/MM/YYYY HH:MM in Cancun time.
 */
export function formatDateTimeCancun(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    return d.toLocaleString('en-GB', {
      timeZone: CANCUN_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

/**
 * Formats time only (HH:MM) in Cancun time.
 */
export function formatTimeCancun(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    return d.toLocaleTimeString('en-GB', {
      timeZone: CANCUN_TZ,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

export { CANCUN_TZ };
