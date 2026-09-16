import {
  MOBILE_FEATURES,
  canAccessMobileFeature,
  getAccessibleMobileFeatures,
} from './mobileFeatures';

describe('Mobile V2 feature access', () => {
  test('grants administrators every registered feature', () => {
    const access = {
      isAdmin: true,
      isEnabled: true,
      isLoading: false,
      permissions: ['access.all'],
    };

    expect(canAccessMobileFeature(access, MOBILE_FEATURES.calendar)).toBe(true);
  });

  test('denies users without the required permission by default', () => {
    const access = {
      isAdmin: false,
      isEnabled: true,
      isLoading: false,
      permissions: [],
    };

    expect(canAccessMobileFeature(access, MOBILE_FEATURES.dashboard)).toBe(false);
  });

  test('supports individual permissions for future access assignments', () => {
    const access = {
      isAdmin: false,
      isEnabled: true,
      isLoading: false,
      permissions: ['mobile.calendar.view'],
    };

    expect(canAccessMobileFeature(access, MOBILE_FEATURES.calendar)).toBe(true);
    expect(canAccessMobileFeature(access, MOBILE_FEATURES.unitTransactions)).toBe(false);
  });

  test('only returns implemented features for navigation', () => {
    const access = {
      isAdmin: true,
      isEnabled: true,
      isLoading: false,
      permissions: ['access.all'],
    };

    expect(getAccessibleMobileFeatures(access).map((feature) => feature.id)).toEqual([
      'dashboard',
      'calendar',
    ]);
  });
});
