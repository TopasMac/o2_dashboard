import { usesHausInBrand } from './appBrandingModel';

describe('application branding', () => {
  test('uses HausIn branding on the production app domain', () => {
    expect(usesHausInBrand('app.myhausin.com', '/')).toBe(true);
  });

  test('uses HausIn branding for local and shared mobile routes', () => {
    expect(usesHausInBrand('localhost', '/m/v2/calendar')).toBe(true);
    expect(usesHausInBrand('dashboard.owners2.com', '/m/login')).toBe(true);
  });

  test('uses HausIn branding on desktop routes', () => {
    expect(usesHausInBrand('dashboard.owners2.com', '/bookings')).toBe(true);
  });
});
