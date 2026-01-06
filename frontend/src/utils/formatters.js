/**
 * Global formatting utilities for Owners2 Dashboard
 *
 * Conventions:
 * - Dates: render as "dd-mm-yyyy"
 * - Money: thousands "." and decimals "," with exactly 2 decimals (no symbol)
 * - Capitalization: only first letter of the whole string uppercased
 */

// Zero-pad helper
const z2 = (n) => String(n).padStart(2, '0');

/**
 * Parse common date inputs to a Date (UTC) or return null.
 * Accepts ISO strings "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm:ssZ", Date, or timestamp.
 */
export const toDate = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    // Normalize plain YYYY-MM or YYYY-MM-DD to UTC date
    const m = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (m) {
      const y = Number(m[1]);
      const mm = Math.max(1, Math.min(12, Number(m[2])));
      const dd = Number(m[3] ?? '01');
      const d = new Date(Date.UTC(y, mm - 1, dd));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Format a date-like value as "dd-mm-yyyy".
 * If invalid, returns empty string.
 */
export const formatDateDMY = (value) => {
  const d = toDate(value);
  if (!d) return '';
  // Use UTC parts to avoid timezone shifts
  const dd = z2(d.getUTCDate());
  const mm = z2(d.getUTCMonth() + 1);
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

/**
 * Format number as money with "." thousands and "," decimals, 2 decimals, no currency symbol.
 * If value is null/undefined/NaN, returns empty string.
 */
export const formatMoney = (value) => {
  if (value == null) return '';
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !isFinite(num)) return '';
  // de-DE locale uses "." for thousands and "," for decimals
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(num);
};

/**
 * Capitalize only the first letter of the string.
 * - Preserves the rest as-is.
 * - If not a string, returns the original value.
 */
export const capitalizeFirst = (value) => {
  if (value == null) return '';
  const s = String(value);
  if (!s.length) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Generic formatter dispatcher by token or custom function.
 * Usage: formatValue('date', someValue) → "31-12-2025"
 *        formatValue('money', 12345.6)  → "12.345,60"
 *        formatValue('capitalize', 'checkout') → "Checkout"
 */
export const formatValue = (kind, value) => {
  if (typeof kind === 'function') return kind(value);
  switch (kind) {
    case 'date':
    case 'dmy':
      return formatDateDMY(value);
    case 'money':
      return formatMoney(value);
    case 'capitalize':
      return capitalizeFirst(value);
    default:
      return value ?? '';
  }
};

export default {
  toDate,
  formatDateDMY,
  formatMoney,
  capitalizeFirst,
  formatValue,
};
