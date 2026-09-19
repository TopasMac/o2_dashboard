import { addDaysYmd, getCleaningTypeLabel } from './cleaningsModel';

const CITY_ORDER = ['Playa del Carmen', 'Tulum'];

function parseYmd(ymd) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeCleaningType(value) {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-');
}

function isIndependentCleaning(value) {
  const type = normalizeCleaningType(value);
  return Boolean(type) && !['checkout', 'owner'].includes(type);
}

function eventFromRow(row, kind) {
  return {
    bookingId: row?.id ?? null,
    guest: row?.guest || 'Sin nombre',
    notes: row?.notes || '',
    detailNotes: kind === 'checkout' ? row?.check_out_notes || '' : row?.check_in_notes || '',
  };
}

function emptySummary() {
  return { turnovers: 0, checkIns: 0, checkOuts: 0, cleanings: 0 };
}

export function buildActivityDateStrip(todayYmd) {
  return [-1, 0, 1, 2, 3].map((offset) => {
    const ymd = addDaysYmd(todayYmd, offset);
    const date = parseYmd(ymd);
    return {
      ymd,
      weekday: new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' })
        .format(date)
        .replace('.', '')
        .slice(0, 3)
        .toUpperCase(),
      day: date.getUTCDate(),
    };
  });
}

export function formatActivityDate(ymd) {
  const date = parseYmd(ymd);
  if (!date) return '';
  const formatted = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function buildDailyActivity(rows, selectedYmd) {
  const cityMaps = new Map();
  const allCleaningIds = new Set();

  const ensureCity = (cityName) => {
    const city = cityName || 'Sin ciudad';
    if (!cityMaps.has(city)) {
      cityMaps.set(city, { units: new Map(), cleanings: [], cleaningIds: new Set() });
    }
    return cityMaps.get(city);
  };

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const hasCheckIn = Boolean(row?.event_check_in && row?.check_in === selectedYmd);
    const hasCheckOut = Boolean(row?.event_check_out && row?.check_out === selectedYmd);
    const hasCleaningOnly = Boolean(row?.event_cleaning_only && row?.service_date === selectedYmd);
    if (!hasCheckIn && !hasCheckOut && !hasCleaningOnly) return;

    const cityData = ensureCity(row?.city || row?.unitCity || 'Sin ciudad');
    const cleaningId = row?.hk_cleaning_id ?? row?.hk?.id ?? null;
    if (cleaningId) {
      const key = String(cleaningId);
      cityData.cleaningIds.add(key);
      allCleaningIds.add(key);
    }

    if (hasCheckIn || hasCheckOut) {
      const unitKey = String(row?.unit_id ?? row?.unit_name ?? row?.id ?? 'unknown');
      if (!cityData.units.has(unitKey)) {
        cityData.units.set(unitKey, {
          unitId: row?.unit_id ?? null,
          unitName: row?.unit_name || 'Unidad',
          checkIns: [],
          checkOuts: [],
        });
      }
      const unit = cityData.units.get(unitKey);
      if (hasCheckOut) unit.checkOuts.push(eventFromRow(row, 'checkout'));
      if (hasCheckIn) unit.checkIns.push(eventFromRow(row, 'checkin'));
    }

    if (hasCleaningOnly && isIndependentCleaning(row?.hk_cleaning_type ?? row?.hk?.cleaningType)) {
      const cleaningType = row?.hk_cleaning_type ?? row?.hk?.cleaningType ?? '';
      cityData.cleanings.push({
        id: cleaningId,
        unitId: row?.unit_id ?? null,
        unitName: row?.unit_name || 'Unidad',
        type: cleaningType,
        typeLabel: getCleaningTypeLabel(cleaningType) || 'Limpieza',
        done: Boolean(row?.hk_done || row?.hk?.done),
      });
    }
  });

  const cityGroups = Array.from(cityMaps.entries()).map(([city, cityData]) => {
    const units = Array.from(cityData.units.values()).sort((a, b) => (
      a.unitName.localeCompare(b.unitName, undefined, { sensitivity: 'base' })
    ));
    const turnovers = units.filter((unit) => unit.checkOuts.length > 0 && unit.checkIns.length > 0);
    const checkouts = units
      .filter((unit) => unit.checkOuts.length > 0 && unit.checkIns.length === 0)
      .flatMap((unit) => unit.checkOuts.map((event) => ({ ...event, unitId: unit.unitId, unitName: unit.unitName })));
    const checkins = units
      .filter((unit) => unit.checkIns.length > 0 && unit.checkOuts.length === 0)
      .flatMap((unit) => unit.checkIns.map((event) => ({ ...event, unitId: unit.unitId, unitName: unit.unitName })));
    const checkIns = units.reduce((count, unit) => count + unit.checkIns.length, 0);
    const checkOuts = units.reduce((count, unit) => count + unit.checkOuts.length, 0);

    return {
      city,
      turnovers,
      checkouts,
      checkins,
      cleanings: cityData.cleanings.sort((a, b) => (
        a.unitName.localeCompare(b.unitName, undefined, { sensitivity: 'base' })
      )),
      summary: {
        turnovers: turnovers.length,
        checkIns,
        checkOuts,
        cleanings: cityData.cleaningIds.size,
      },
    };
  }).sort((a, b) => {
    const aIndex = CITY_ORDER.indexOf(a.city);
    const bIndex = CITY_ORDER.indexOf(b.city);
    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }
    return a.city.localeCompare(b.city, undefined, { sensitivity: 'base' });
  });

  const summary = cityGroups.reduce((total, group) => ({
    turnovers: total.turnovers + group.summary.turnovers,
    checkIns: total.checkIns + group.summary.checkIns,
    checkOuts: total.checkOuts + group.summary.checkOuts,
    cleanings: total.cleanings + group.summary.cleanings,
  }), emptySummary());

  // Use the global set as the source of truth in case a malformed response
  // repeats the same cleaning in more than one city group.
  summary.cleanings = allCleaningIds.size;

  return { cityGroups, summary };
}

