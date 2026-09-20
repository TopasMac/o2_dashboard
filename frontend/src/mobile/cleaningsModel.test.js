import {
  addDaysYmd,
  buildCleaningDateStrip,
  buildDailyCleaningCards,
  getCleaningTypeLabel,
  summarizeCleaningCards,
} from './cleaningsModel';

describe('Mobile V2 cleanings model', () => {
  test('builds a seven-day strip centered on the selected date', () => {
    const days = buildCleaningDateStrip('2026-09-16');

    expect(days).toHaveLength(7);
    expect(days[0].ymd).toBe('2026-09-13');
    expect(days[3]).toMatchObject({ ymd: '2026-09-16', day: 16 });
    expect(days[6].ymd).toBe('2026-09-19');
    expect(addDaysYmd('2026-09-30', 1)).toBe('2026-10-01');
  });

  test('merges check-in and check-out activity for a turnover unit', () => {
    const cards = buildDailyCleaningCards([
      {
        id: 1,
        unit_id: 7,
        unit_name: 'Sunset',
        city: 'Playa del Carmen',
        guest: 'Departing Guest',
        check_out_notes: 'Leave keys at reception',
        check_out: '2026-09-16',
        event_check_out: true,
        hk_cleaning_id: 42,
        hk_done: false,
        hk_cleaning_type: 'owner',
        cleaning_notes: 'Leave extra towels',
        checklist_cleaning_notes: 'Cambiar filtro del aire acondicionado',
        condo_name: 'Central Park',
        unit_number: '202',
        unit_floor: '2',
        condo_door_code: '1234',
        access_type: 'Keypad',
        access_code: '5678',
        wifi_name: 'HausIn Guest',
        wifi_password: 'welcome-home',
      },
      {
        id: 2,
        unit_id: 7,
        unit_name: 'Sunset',
        city: 'Playa del Carmen',
        guest: 'Arriving Guest',
        check_in_notes: 'Needs crib',
        check_in: '2026-09-16',
        event_check_in: true,
      },
    ], '2026-09-16');

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ unitName: 'Sunset', cleaningId: 42, cleaningType: 'owner', cleaningDone: false });
    expect(cards[0].checkOuts[0].guest).toBe('Departing Guest');
    expect(cards[0].checkOuts[0].notes).toBe('Leave keys at reception');
    expect(cards[0].checkIns[0].guest).toBe('Arriving Guest');
    expect(cards[0].checkIns[0].notes).toBe('Needs crib');
    expect(cards[0].cleaningNotes).toBe('Leave extra towels');
    expect(cards[0].cleanerNotes).toBe('Cambiar filtro del aire acondicionado');
    expect(cards[0].access).toEqual({
      condoName: 'Central Park',
      unitNumber: '202',
      unitFloor: '2',
      condoDoorCode: '1234',
      accessType: 'Keypad',
      accessCode: '5678',
      wifiName: 'HausIn Guest',
      wifiPassword: 'welcome-home',
    });
    expect(summarizeCleaningCards(cards)).toEqual({
      checkIns: 1,
      checkOuts: 1,
      cleanings: 1,
      completed: 0,
    });
  });

  test('renders standalone service cleanings and uses clear Spanish type labels', () => {
    const cards = buildDailyCleaningCards([{
      unit_id: 3,
      unit_name: 'Allegro_301',
      city: 'Playa del Carmen',
      service_date: '2026-08-03',
      event_cleaning_only: true,
      hk_cleaning_id: 941,
      hk_cleaning_type: 'Refresh',
      cleaning_notes: 'After 15:00',
      cleaner_notes: '',
      hk_done: true,
      hk_assigned_to_short_name: 'Ana',
    }], '2026-08-03');

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      cleaningId: 941,
      cleaningType: 'Refresh',
      cleaningDone: true,
      assignedCleaner: 'Ana',
      cleaningNotes: 'After 15:00',
      cleanerNotes: '',
    });
    expect(cards[0].checkIns).toEqual([]);
    expect(cards[0].checkOuts).toEqual([]);
    expect(summarizeCleaningCards(cards).cleanings).toBe(1);
    expect(summarizeCleaningCards(cards).completed).toBe(1);

    expect(getCleaningTypeLabel('checkout')).toBe('Salida');
    expect(getCleaningTypeLabel('owner')).toBe('Salida');
    expect(getCleaningTypeLabel('Refresh')).toBe('Repaso');
    expect(getCleaningTypeLabel('Mid-stay')).toBe('Estancia');
    expect(getCleaningTypeLabel('Re-do')).toBe('Rehacer');
  });

  test('hides check-in-only units but keeps a same-day turnover entry', () => {
    const cards = buildDailyCleaningCards([
      {
        id: 10,
        unit_id: 10,
        unit_name: 'Arrival only',
        check_in: '2026-09-16',
        event_check_in: true,
        guest: 'New guest',
      },
      {
        id: 11,
        unit_id: 11,
        unit_name: 'Turnover',
        check_out: '2026-09-16',
        event_check_out: true,
        guest: 'Departing guest',
        hk_cleaning_id: 51,
        hk_cleaning_type: 'checkout',
      },
      {
        id: 12,
        unit_id: 11,
        unit_name: 'Turnover',
        check_in: '2026-09-16',
        event_check_in: true,
        guest: 'Arriving guest',
      },
    ], '2026-09-16');

    expect(cards).toHaveLength(1);
    expect(cards[0].unitName).toBe('Turnover');
    expect(cards[0].checkOuts).toHaveLength(1);
    expect(cards[0].checkIns).toHaveLength(1);
  });
});
