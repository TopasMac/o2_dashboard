/**
 * Normalize a value into European money format:
 * - Thousands separated by "."
 * - Decimals separated by ","
 * Example: 1234.43 => "1.234,43"
 */
export function formatMoneyEuro(val) {
  if (val === null || val === undefined || val === '') return '';
  const num = typeof val === 'number' ? val : parseFloat(val.toString().replace(',', '.'));
  if (isNaN(num)) return '';
  return num
    .toFixed(2) // two decimals
    .replace('.', ',') // decimal comma
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // thousand separator
}

/**
 * Parse a European formatted string back to normalized float string:
 * - Accepts "1.234,43" and returns "1234.43"
 */
export function parseMoneyEuro(str) {
  if (str === null || str === undefined || str === '') return '';
  const normalized = str.toString().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? '' : num.toFixed(2);
}

/**
 * Normalize specific money fields in an object into float strings.
 */
export function normalizeMoneyFields(obj, fields = []) {
  const normalized = { ...obj };
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      const parsed = parseMoneyEuro(normalized[field]);
      normalized[field] = parsed === '' ? null : String(parsed);
    }
  });
  return normalized;
}