import {
  MOBILE_FEATURES,
  canAccessMobileFeature,
  getAccessibleMobileFeatures,
  getMobileV2EntryPath,
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

  test('allows a cleaner to access only the cleanings feature during the pilot', () => {
    const access = {
      isAdmin: false,
      isCleaner: true,
      isEnabled: true,
      isLoading: false,
      permissions: ['mobile.cleanings.view'],
    };

    expect(canAccessMobileFeature(access, MOBILE_FEATURES.dashboard)).toBe(false);
    expect(canAccessMobileFeature(access, MOBILE_FEATURES.calendar)).toBe(false);
    expect(canAccessMobileFeature(access, MOBILE_FEATURES.cleanings)).toBe(true);
    expect(getAccessibleMobileFeatures(access).map((feature) => feature.id)).toEqual(['cleanings']);
    expect(getMobileV2EntryPath(access)).toBe('/m/v2/cleanings');
  });

  test('keeps managers outside the non-admin pilot', () => {
    const access = {
      isAdmin: false,
      isManager: true,
      isEnabled: true,
      isLoading: false,
      permissions: ['mobile.calendar.view', 'mobile.cleanings.view'],
    };

    expect(canAccessMobileFeature(access, MOBILE_FEATURES.calendar)).toBe(false);
    expect(canAccessMobileFeature(access, MOBILE_FEATURES.cleanings)).toBe(false);
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
      'cleanings',
    ]);
    expect(getMobileV2EntryPath(access)).toBe('/m/v2');
  });
});
