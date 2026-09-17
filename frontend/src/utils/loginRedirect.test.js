import { resolveLoginTarget } from './loginRedirect';

describe('resolveLoginTarget', () => {
  test('keeps the dedicated HausIn app on Mobile V2', () => {
    expect(resolveLoginTarget({
      hostname: 'app.myhausin.com',
      roles: ['ROLE_ADMIN'],
    })).toBe('/m/v2');
  });

  test('does not restore a stale legacy mobile route on the HausIn app', () => {
    expect(resolveLoginTarget({
      hostname: 'app.myhausin.com',
      from: '/m/dashboard',
      roles: ['ROLE_ADMIN'],
    })).toBe('/m/v2');
  });

  test('preserves an explicit Mobile V2 destination on the HausIn app', () => {
    expect(resolveLoginTarget({
      hostname: 'app.myhausin.com',
      redirectParam: '/m/v2/cleanings',
      roles: ['ROLE_ADMIN'],
    })).toBe('/m/v2/cleanings');
  });

  test('sends a verified Cleaner to the Mobile V2 cleaning pilot', () => {
    expect(resolveLoginTarget({
      hostname: 'app.myhausin.com',
      isMobileHint: true,
      roles: ['ROLE_USER', 'ROLE_EMPLOYEE'],
      employeeArea: 'Cleaner',
    })).toBe('/m/v2/cleanings');
  });

  test('does not grant the Cleaner destination from an unverified employee role', () => {
    expect(resolveLoginTarget({
      hostname: 'app.myhausin.com',
      isMobileHint: true,
      roles: ['ROLE_USER', 'ROLE_EMPLOYEE'],
      employeeArea: '',
    })).toBe('/m/v2');
  });

  test('preserves the legacy mobile destination on other hosts', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      isMobileHint: true,
      roles: ['ROLE_ADMIN'],
    })).toBe('/m/dashboard');
  });

  test('preserves desktop role-based destinations', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      roles: ['ROLE_ADMIN'],
    })).toBe('/dashboard');

    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      roles: ['ROLE_MANAGER'],
    })).toBe('/manager-dashboard');
  });

  test('preserves explicit destinations on the existing dashboard host', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      redirectParam: '/bookings',
      roles: ['ROLE_ADMIN'],
    })).toBe('/bookings');
  });
});
