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

  test('keeps non-admin feature permissions disabled for the initial rollout', () => {
    const nonAdminProfiles = [
      { isManager: true, permissions: ['mobile.calendar.view'] },
      { isCleaner: true, permissions: ['mobile.cleanings.view'] },
    ];

    nonAdminProfiles.forEach((profile) => {
      const access = {
        isAdmin: false,
        isEnabled: true,
        isLoading: false,
        ...profile,
      };

      expect(canAccessMobileFeature(access, MOBILE_FEATURES.calendar)).toBe(false);
      expect(canAccessMobileFeature(access, MOBILE_FEATURES.cleanings)).toBe(false);
    });
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
  });
});
