function parseYmd(ymd) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDaysYmd(ymd, amount) {
  const date = parseYmd(ymd);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function buildCleaningDateStrip(selectedYmd, radius = 3) {
  const days = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    const ymd = addDaysYmd(selectedYmd, offset);
    const date = parseYmd(ymd);
    if (!date) continue;
    days.push({
      ymd,
      weekday: new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' })
        .format(date)
        .replace('.', '')
        .slice(0, 2)
        .toUpperCase(),
      day: date.getUTCDate(),
    });
  }
  return days;
}

function isDone(row) {
  return Boolean(row?.hk_done || row?.hk?.done || String(row?.hk?.status || '').toLowerCase() === 'done');
}

export function getCleaningTypeLabel(value) {
  const type = String(value || '').trim().toLowerCase().replaceAll('_', '-');
  if (type === 'checkout' || type === 'owner') return 'Salida';
  if (type === 'initial') return 'Limpieza inicial';
  if (type === 'refresh') return 'Repaso';
  if (type === 'mid-stay' || type === 'midstay') return 'Estancia';
  if (type === 'redo' || type === 're-do') return 'Rehacer';
  return value ? String(value) : '';
}

export function buildDailyCleaningCards(rows, selectedYmd) {
  const byUnit = new Map();

  (rows || []).forEach((row) => {
    const hasCheckIn = Boolean(row?.event_check_in && row?.check_in === selectedYmd);
    const hasCheckOut = Boolean(row?.event_check_out && row?.check_out === selectedYmd);
    const hasCleaningOnly = Boolean(row?.event_cleaning_only && row?.service_date === selectedYmd);
    if (!hasCheckIn && !hasCheckOut && !hasCleaningOnly) return;

    const baseUnitKey = String(row?.unit_id ?? row?.unit_name ?? row?.id ?? 'unknown');
    const unitKey = hasCleaningOnly
      ? `${baseUnitKey}:cleaning:${row?.hk_cleaning_id ?? row?.id ?? 'unknown'}`
      : baseUnitKey;
    if (!byUnit.has(unitKey)) {
      byUnit.set(unitKey, {
        unitId: row?.unit_id ?? null,
        unitName: row?.unit_name || 'Unidad',
        city: row?.city || '',
        access: {
          condoName: row?.condo_name || '',
          unitNumber: row?.unit_number || '',
          unitFloor: row?.unit_floor || '',
          condoDoorCode: row?.condo_door_code || '',
          accessType: row?.access_type || '',
          accessCode: row?.access_code || '',
          wifiName: row?.wifi_name || '',
          wifiPassword: row?.wifi_password || '',
        },
        checkIns: [],
        checkOuts: [],
        cleaningId: row?.hk_cleaning_id ?? row?.hk?.id ?? null,
        cleaningType: row?.hk_cleaning_type ?? row?.hk?.cleaningType ?? '',
        cleaningDone: isDone(row),
        cleaningNotes: row?.checklist_cleaning_notes ?? row?.hk?.cleaningNotes ?? '',
        assignedCleaner: row?.hk_assigned_to_short_name || row?.hk?.assignedToShortName || '',
      });
    }

    const card = byUnit.get(unitKey);
    const event = {
      bookingId: row?.id ?? null,
      guest: row?.guest || '',
      notes: hasCheckOut ? row?.check_out_notes || '' : row?.check_in_notes || '',
      source: row?.source || '',
    };

    if (hasCheckOut) {
      card.checkOuts.push(event);
      card.cleaningId = row?.hk_cleaning_id ?? row?.hk?.id ?? card.cleaningId;
      card.cleaningType = row?.hk_cleaning_type ?? row?.hk?.cleaningType ?? card.cleaningType;
      card.cleaningDone = card.cleaningDone || isDone(row);
      card.cleaningNotes = row?.checklist_cleaning_notes ?? row?.hk?.cleaningNotes ?? card.cleaningNotes;
      card.assignedCleaner = row?.hk_assigned_to_short_name
        || row?.hk?.assignedToShortName
        || card.assignedCleaner;
    }
    if (hasCheckIn) card.checkIns.push(event);
  });

  return Array.from(byUnit.values())
    .filter((card) => Boolean(card.cleaningId || card.checkOuts.length > 0))
    .sort((a, b) => {
      const aHasCleaning = a.cleaningId || a.checkOuts.length > 0 ? 0 : 1;
      const bHasCleaning = b.cleaningId || b.checkOuts.length > 0 ? 0 : 1;
      if (aHasCleaning !== bHasCleaning) return aHasCleaning - bHasCleaning;
      return a.unitName.localeCompare(b.unitName, undefined, { sensitivity: 'base' });
    });
}

export function summarizeCleaningCards(cards) {
  return (cards || []).reduce((summary, card) => ({
    checkIns: summary.checkIns + card.checkIns.length,
    checkOuts: summary.checkOuts + card.checkOuts.length,
    cleanings: summary.cleanings + (card.cleaningId || card.checkOuts.length ? 1 : 0),
    completed: summary.completed + ((card.cleaningId || card.checkOuts.length) && card.cleaningDone ? 1 : 0),
  }), { checkIns: 0, checkOuts: 0, cleanings: 0, completed: 0 });
}
