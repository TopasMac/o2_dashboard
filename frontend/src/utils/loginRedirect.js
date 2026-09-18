export function resolveLoginTarget({
  hostname = '',
  redirectParam = null,
  from = null,
  isMobileHint = false,
  roles = [],
  employeeArea = '',
} = {}) {
  const normalizedHostname = String(hostname).trim().toLowerCase();
  const normalizedRoles = Array.isArray(roles) ? roles : [];
  const hasRole = (role) => normalizedRoles.includes(role);
  const requestedTarget = getInternalTarget(redirectParam) || getInternalTarget(from);
  const isCleanerEmployee =
    String(employeeArea || '').trim().toLowerCase() === 'cleaner'
    && hasRole('ROLE_EMPLOYEE')
    && !hasRole('ROLE_MANAGER')
    && !hasRole('ROLE_ADMIN')
    && !hasRole('ROLE_CLIENT');

  const isLegacyMobileTarget = requestedTarget === '/m'
    || (requestedTarget?.startsWith('/m/') && !requestedTarget.startsWith('/m/v2'));

  // The dedicated HausIn app always uses Mobile V2. Preserve an explicit V2
  // destination, but never restore one of the retired legacy mobile routes.
  if (normalizedHostname === 'app.myhausin.com') {
    if (requestedTarget?.startsWith('/m/v2')) {
      return requestedTarget;
    }
    if (isCleanerEmployee) {
      return '/m/v2/cleanings';
    }
    return '/m/v2';
  }

  if (requestedTarget && !isLegacyMobileTarget) {
    return requestedTarget;
  }

  if (isMobileHint) {
    if (isCleanerEmployee) {
      return '/m/v2/cleanings';
    }
    if (hasRole('ROLE_ADMIN')) {
      return '/m/v2';
    }
    if (hasRole('ROLE_MANAGER')) {
      return '/manager-dashboard';
    }
    return '/m/v2';
  }

  if (hasRole('ROLE_MANAGER') && !hasRole('ROLE_ADMIN')) {
    return '/manager-dashboard';
  }

  if (hasRole('ROLE_ADMIN')) {
    return '/dashboard';
  }

  if (hasRole('ROLE_MANAGER')) {
    return '/manager-dashboard';
  }

  if (hasRole('ROLE_CLIENT')) {
    return '/m/v2';
  }

  if (hasRole('ROLE_EMPLOYEE')) {
    return '/m/v2';
  }

  return '/';
}

function getInternalTarget(target) {
  if (typeof target !== 'string') return null;
  return target.startsWith('/') && !target.startsWith('//') ? target : null;
}

export function getRouterStateTarget(from) {
  if (typeof from === 'string') {
    return getInternalTarget(from);
  }

  if (!from || typeof from !== 'object') return null;

  const pathname = getInternalTarget(from.pathname);
  if (!pathname) return null;

  const search = typeof from.search === 'string' ? from.search : '';
  const hash = typeof from.hash === 'string' ? from.hash : '';
  return `${pathname}${search}${hash}`;
}
