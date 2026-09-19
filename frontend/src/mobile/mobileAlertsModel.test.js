import { buildMobileServiceAlerts } from './mobileAlertsModel';

describe('Mobile V2 service alerts model', () => {
  test('orders overdue, today, tomorrow, then later and uses agreed labels', () => {
    const alerts = buildMobileServiceAlerts([
      { id: 'later', type: 'service-payment-due-soon', service: 'Internet', yearMonth: '2026-09', deadline: 21, unitName: 'Veranto_209', serviceProvider: 'Totalplay', serviceReference: '0192', amount: 689 },
      { id: 'tomorrow', type: 'service-payment-due-soon', service: 'HOA', yearMonth: '2026-09', deadline: 19, unitName: 'Singular_111', amount: 3500 },
      { id: 'overdue', type: 'service-payment-overdue', service: 'CFE', yearMonth: '2026-09', deadline: 17, unitName: 'Kuxtal_203', serviceReference: '1234' },
      { id: 'today', type: 'service-payment-due-soon', service: 'Water', yearMonth: '2026-09', deadline: 18, unitName: 'Aldea_104', serviceReference: '7812' },
    ], '2026-09-18');

    expect(alerts.map((alert) => alert.id)).toEqual(['overdue', 'today', 'tomorrow', 'later']);
    expect(alerts.map((alert) => alert.deadlineLabel)).toEqual(['17 sep', 'Hoy', '19 sep', '21 sep']);
    expect(alerts[1]).toMatchObject({ service: 'Agua', detail: 'Referencia: 7812' });
    expect(alerts[3]).toMatchObject({ detail: 'Totalplay: 0192' });
  });

  test('keeps all overdue alerts and limits future alerts to seven days', () => {
    const alerts = buildMobileServiceAlerts([
      { id: 'old', type: 'service-payment-overdue', service: 'CFE', yearMonth: '2026-08', deadline: 1 },
      { id: 'seven', type: 'service-payment-due-soon', service: 'HOA', yearMonth: '2026-09', deadline: 25 },
      { id: 'eight', type: 'service-payment-due-soon', service: 'Internet', yearMonth: '2026-09', deadline: 26 },
      { id: 'mismatch', type: 'service-payment-mismatch', service: 'Internet', yearMonth: '2026-09', deadline: 18 },
    ], '2026-09-18');

    expect(alerts.map((alert) => alert.id)).toEqual(['old', 'seven']);
  });
});
