import {
  buildActivityDateStrip,
  buildDailyActivity,
  formatActivityDate,
} from './activityModel';

describe('Mobile V2 daily activity model', () => {
  test('offers yesterday, today, and the next three days', () => {
    const days = buildActivityDateStrip('2026-09-18');

    expect(days.map((day) => day.ymd)).toEqual([
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
    ]);
    expect(formatActivityDate('2026-09-18')).toBe('Viernes, 18 de septiembre');
  });

  test('groups same-unit checkout and check-in as one turnover without truncating notes data', () => {
    const activity = buildDailyActivity([
      {
        id: 10,
        unit_id: 7,
        unit_name: 'Kuxtal_203',
        city: 'Playa del Carmen',
        guest: 'Departing Guest',
        notes: 'Long general checkout note that must remain available in full',
        check_out_notes: 'Leave keys at reception',
        check_out: '2026-09-18',
        event_check_out: true,
        hk_cleaning_id: 44,
        hk_cleaning_type: 'checkout',
      },
      {
        id: 11,
        unit_id: 7,
        unit_name: 'Kuxtal_203',
        city: 'Playa del Carmen',
        guest: 'Arriving Guest',
        notes: 'Crib requested',
        check_in_notes: 'Arrival at 15:00',
        check_in: '2026-09-18',
        event_check_in: true,
      },
    ], '2026-09-18');

    expect(activity.summary).toEqual({ turnovers: 1, checkIns: 1, checkOuts: 1, cleanings: 1 });
    expect(activity.cityGroups[0].turnovers).toHaveLength(1);
    expect(activity.cityGroups[0].turnovers[0].checkOuts[0]).toMatchObject({
      guest: 'Departing Guest',
      notes: 'Long general checkout note that must remain available in full',
      detailNotes: 'Leave keys at reception',
    });
    expect(activity.cityGroups[0].turnovers[0].checkIns[0]).toMatchObject({
      guest: 'Arriving Guest',
      notes: 'Crib requested',
      detailNotes: 'Arrival at 15:00',
    });
  });

  test('orders cities and sections while keeping checkout cleanings out of standalone cleanings', () => {
    const activity = buildDailyActivity([
      {
        id: 1,
        unit_id: 1,
        unit_name: 'Tulum Checkout',
        city: 'Tulum',
        guest: 'Guest One',
        check_out: '2026-09-18',
        event_check_out: true,
        hk_cleaning_id: 91,
        hk_cleaning_type: 'owner',
      },
      {
        id: 2,
        unit_id: 2,
        unit_name: 'Playa Arrival',
        city: 'Playa del Carmen',
        guest: 'Guest Two',
        check_in: '2026-09-18',
        event_check_in: true,
      },
      {
        unit_id: 3,
        unit_name: 'Playa Refresh',
        city: 'Playa del Carmen',
        service_date: '2026-09-18',
        event_cleaning_only: true,
        hk_cleaning_id: 92,
        hk_cleaning_type: 'refresh',
      },
      {
        unit_id: 4,
        unit_name: 'Tulum Midstay',
        city: 'Tulum',
        service_date: '2026-09-18',
        event_cleaning_only: true,
        hk_cleaning_id: 93,
        hk_cleaning_type: 'mid-stay',
      },
    ], '2026-09-18');

    expect(activity.cityGroups.map((group) => group.city)).toEqual(['Playa del Carmen', 'Tulum']);
    expect(activity.cityGroups[0].checkins).toHaveLength(1);
    expect(activity.cityGroups[0].cleanings[0].typeLabel).toBe('Repaso');
    expect(activity.cityGroups[1].checkouts).toHaveLength(1);
    expect(activity.cityGroups[1].cleanings.map((cleaning) => cleaning.typeLabel)).toEqual(['Estancia']);
    expect(activity.summary).toEqual({ turnovers: 0, checkIns: 1, checkOuts: 1, cleanings: 3 });
  });

  test('maps initial cleaning types to the agreed Spanish label', () => {
    const activity = buildDailyActivity([{
      unit_id: 3,
      unit_name: 'Initial Unit',
      city: 'Playa del Carmen',
      service_date: '2026-09-18',
      event_cleaning_only: true,
      hk_cleaning_id: 101,
      hk_cleaning_type: 'initial',
    }], '2026-09-18');

    expect(activity.cityGroups[0].cleanings[0].typeLabel).toBe('Limpieza inicial');
  });
});

