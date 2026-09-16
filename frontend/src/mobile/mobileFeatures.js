export const MOBILE_FEATURES = Object.freeze({
  dashboard: Object.freeze({
    id: 'dashboard',
    label: 'Inicio',
    description: 'Alertas y actividad de hoy',
    path: '/m/v2',
    permission: 'mobile.dashboard.view',
    available: true,
  }),
  calendar: Object.freeze({
    id: 'calendar',
    label: 'Calendario',
    description: 'Reservas, bloqueos y holds',
    path: '/m/v2/calendar',
    permission: 'mobile.calendar.view',
    available: true,
  }),
  unitTransactions: Object.freeze({
    id: 'unitTransactions',
    label: 'Transacciones de unidades',
    description: 'Consulta, edición y nuevos registros',
    path: '/m/v2/unit-transactions',
    permission: 'mobile.unit_transactions.view',
    available: false,
  }),
  housekeepingTransactions: Object.freeze({
    id: 'housekeepingTransactions',
    label: 'Transacciones de HK',
    description: 'Consulta, edición y nuevos registros',
    path: '/m/v2/hk-transactions',
    permission: 'mobile.hk_transactions.view',
    available: false,
  }),
});

export const MOBILE_FEATURE_LIST = Object.freeze(Object.values(MOBILE_FEATURES));

/**
 * One access decision for every Mobile V2 page and navigation item.
 *
 * Administrators currently receive `access.all` from /api/session/me. Future
 * users can be granted the individual permission declared by each feature.
 */
export function canAccessMobileFeature(access, feature) {
  if (!access || !feature || access.isLoading || access.isEnabled === false) {
    return false;
  }

  const permissions = Array.isArray(access.permissions) ? access.permissions : [];

  if (access.isAdmin || permissions.includes('access.all')) {
    return true;
  }

  return Boolean(feature.permission && permissions.includes(feature.permission));
}

export function getAccessibleMobileFeatures(access, { includeUnavailable = false } = {}) {
  return MOBILE_FEATURE_LIST.filter(
    (feature) =>
      (includeUnavailable || feature.available) && canAccessMobileFeature(access, feature)
  );
}
