import { getRouterStateTarget, resolveLoginTarget } from './loginRedirect';

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

  test('redirects a Cleaner from unsupported explicit Mobile V2 destinations', () => {
    const cleaner = {
      hostname: 'app.myhausin.com',
      roles: ['ROLE_USER', 'ROLE_EMPLOYEE'],
      employeeArea: 'Cleaner',
    };

    expect(resolveLoginTarget({ ...cleaner, from: '/m/v2' })).toBe('/m/v2/cleanings');
    expect(resolveLoginTarget({ ...cleaner, from: '/m/v2/calendar' })).toBe('/m/v2/cleanings');
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

  test('never sends a mobile administrator to the legacy mobile shell', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      isMobileHint: true,
      roles: ['ROLE_ADMIN'],
    })).toBe('/m/v2');
  });

  test('does not restore a stale legacy route on another host', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      from: '/m/dashboard',
      isMobileHint: true,
      roles: ['ROLE_ADMIN'],
    })).toBe('/m/v2');
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

  test('sends unsupported mobile roles to the Mobile V2 access gate', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      isMobileHint: true,
      roles: ['ROLE_USER', 'ROLE_EMPLOYEE'],
      employeeArea: 'Supervisor',
    })).toBe('/m/v2');

    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      isMobileHint: true,
      roles: ['ROLE_USER', 'ROLE_CLIENT'],
    })).toBe('/m/v2');

    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      isMobileHint: true,
      roles: ['ROLE_USER', 'ROLE_MANAGER'],
    })).toBe('/manager-dashboard');
  });

  test('does not restore pre-V2 inventory share destinations', () => {
    expect(resolveLoginTarget({
      hostname: 'app.myhausin.com',
      from: '/m/inventory/form/123?tab=photos',
      roles: ['ROLE_ADMIN'],
    })).toBe('/m/v2');
  });

  test('keeps desktop Client and non-Cleaner employee defaults out of unauthorized dashboards', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      roles: ['ROLE_USER', 'ROLE_CLIENT'],
    })).toBe('/m/v2');

    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      roles: ['ROLE_USER', 'ROLE_EMPLOYEE'],
      employeeArea: 'Supervisor',
    })).toBe('/m/v2');
  });

  test('rejects external redirect targets', () => {
    expect(resolveLoginTarget({
      hostname: 'dashboard.owners2.com',
      redirectParam: '//example.com/path',
      roles: ['ROLE_ADMIN'],
    })).toBe('/dashboard');
  });
});

describe('getRouterStateTarget', () => {
  test('reconstructs an internal React Router location', () => {
    expect(getRouterStateTarget({
      pathname: '/m/v2/calendar',
      search: '?unit=12',
      hash: '#details',
    })).toBe('/m/v2/calendar?unit=12#details');
  });

  test('rejects external-style locations', () => {
    expect(getRouterStateTarget('//example.com/path')).toBeNull();
    expect(getRouterStateTarget('https://example.com/path')).toBeNull();
  });
});
