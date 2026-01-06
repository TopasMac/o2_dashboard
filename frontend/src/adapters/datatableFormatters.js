export function fmtDMY(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date)) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function fmtDMYslash(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date)) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function fmtMoney(amount, currency = 'MXN') {
  if (amount == null || isNaN(amount)) return '';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function fmtPercent(value) {
  if (value == null || isNaN(value)) return '';
  return `${(value * 100).toFixed(0)}%`;
}

export function fmtCityAndUnit(row) {
  if (!row) return '';
  const city = row.city || '';
  const unitName = row.unitName || '';
  return `${city}${city && unitName ? ' - ' : ''}${unitName}`;
}
