export function resolveLoginTarget({
  hostname = '',
  redirectParam = null,
  from = null,
  isMobileHint = false,
  roles = [],
} = {}) {
  const normalizedHostname = String(hostname).trim().toLowerCase();
  const normalizedRoles = Array.isArray(roles) ? roles : [];
  const hasRole = (role) => normalizedRoles.includes(role);
  const requestedTarget = redirectParam || from;

  // The dedicated HausIn app always uses Mobile V2. Keep the legacy mobile
  // destination for the existing dashboard-domain mobile entry points.
  if (normalizedHostname === 'app.myhausin.com') {
    if (typeof requestedTarget === 'string' && requestedTarget.startsWith('/m/v2')) {
      return requestedTarget;
    }
    return '/m/v2';
  }

  if (requestedTarget) {
    return requestedTarget;
  }

  if (isMobileHint) {
    return '/m/dashboard';
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
    return '/m/dashboard';
  }

  return '/';
}
