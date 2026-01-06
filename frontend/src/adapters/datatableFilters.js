export function isDateColumn(col) {
  return col.id === 'date' || col.accessorKey === 'date';
}

export function isUnitColumn(col) {
  return col.id === 'unit' || col.accessorKey === 'unit';
}

export function isCityColumn(col) {
  return col.id === 'city' || col.accessorKey === 'city';
}

export function isReservationColumn(col) {
  return ['guestName', 'source', 'reservationCode', 'confirmationCode'].includes(col.id || col.accessorKey);
}

export function getFilterType(col) {
  if (isDateColumn(col)) {
    return 'search';
  }
  if (isUnitColumn(col) || isCityColumn(col)) {
    return 'autocomplete';
  }
  if (isReservationColumn(col)) {
    return 'autocomplete';
  }
  return 'search';
}

export function getOptions(col, rows) {
  if (!rows || rows.length === 0) return [];
  const unique = new Set();
  rows.forEach(row => {
    const value = col.accessorFn ? col.accessorFn(row) : row[col.accessorKey];
    if (value !== undefined && value !== null) {
      unique.add(value);
    }
  });
  return Array.from(unique).sort();
}

export function applyFilters(rows, columns, debouncedFilters, opts = {}) {
  if (!rows || rows.length === 0) return [];

  return rows.filter(row => {
    for (const col of columns) {
      const filterValue = debouncedFilters[col.id || col.accessorKey];
      if (filterValue === undefined || filterValue === null || filterValue === '') {
        continue;
      }
      const rowValue = col.accessorFn ? col.accessorFn(row) : row[col.accessorKey];

      if (col.getFilterValue) {
        if (!col.getFilterValue(rowValue, filterValue, row, opts)) {
          return false;
        }
      } else {
        if (isReservationColumn(col)) {
          const search = String(filterValue).toLowerCase();
          const matches =
            (row.guestName && row.guestName.toLowerCase().includes(search)) ||
            (row.source && row.source.toLowerCase().includes(search)) ||
            (row.reservationCode && row.reservationCode.toLowerCase().includes(search)) ||
            (row.confirmationCode && row.confirmationCode.toLowerCase().includes(search));
          if (!matches) return false;
          continue;
        }
        // default filtering logic
        if (typeof rowValue === 'string') {
          if (!rowValue.toLowerCase().includes(String(filterValue).toLowerCase())) {
            return false;
          }
        } else if (typeof rowValue === 'number') {
          if (String(rowValue) !== String(filterValue)) {
            return false;
          }
        } else if (rowValue instanceof Date) {
          if (String(rowValue) !== String(filterValue)) {
            return false;
          }
        } else {
          // fallback to string comparison
          if (String(rowValue) !== String(filterValue)) {
            return false;
          }
        }
      }
    }
    return true;
  });
}
