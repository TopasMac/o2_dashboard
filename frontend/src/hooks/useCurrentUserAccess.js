//
// Central place to interpret the current user: roles + employee data.
//
// This hook depends on your auth context/store to provide the logged-in user.
// Adjust the import of `useAuth` below to match your project structure.

import { useMemo, useState, useEffect } from 'react';
import api from '../api.js';
import i18n from '../i18n';

/**
 * useCurrentUserAccess
 *
 * Returns:
 *  - user, roles, employee
 *  - isAdmin, isManager, isEmployee, isClient
 *  - isSupervisor, isCleaner, isMaintenance
 *  - isOwners2, isHousekeepers
 *  - area, city, division, normArea, normCity, normDivision
 */
export function useCurrentUserAccess(explicitUser) {
  // Prefer explicitly passed user (optional), otherwise use global auth context.
  // For now, auth context is not wired on mobile, so we fall back to explicitUser
  // and optionally enrich it with data from /api/session/me.

  const baseUser = explicitUser || {};

  // Simple module-level cache so we only hit /api/session/me once per tab.
  // This avoids multiple pages all refetching the same session payload.
  const [sessionUser, setSessionUser] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (sessionLoaded) {
      return undefined;
    }

    const loadSession = async () => {
      try {
        const response = await api.get('/api/session/me');
        if (!isMounted) return;

        const data = response.data;

        // ---- Language selection (centralized) ----
        // Employees: always Spanish.
        // Clients (later): use client.language when available.
        try {
          const areaRaw = data?.employee?.area ? String(data.employee.area).trim() : '';
          const normArea = areaRaw ? areaRaw.toLowerCase() : '';
          const hasEmployee = !!data?.employee;

          const clientLang = data?.client?.language ? String(data.client.language).toLowerCase() : null;

          let desiredLang = null;

          // Employees: default language based on employee.area
          // - Admin => English
          // - Any other area => Spanish
          if (hasEmployee) {
            desiredLang = normArea === 'admin' ? 'en' : 'es';
          } else if (clientLang === 'en' || clientLang === 'es') {
            // Clients (later): use client.language when available.
            desiredLang = clientLang;
          }

          if (desiredLang && i18n.language !== desiredLang) {
            i18n.changeLanguage(desiredLang);
          }
        } catch {}

        const enriched = {
          name:
            data.displayName ||
            data.username ||
            baseUser.name ||
            baseUser.username ||
            baseUser.email,
          username: data.username || baseUser.username,
          email: baseUser.email,
          roles: Array.isArray(data.roles) ? data.roles : baseUser.roles || [],
          employee: data.employee || null,
          permissions: Array.isArray(data.permissions)
            ? data.permissions
            : baseUser.permissions || [],
          isEnabled:
            typeof data.isEnabled === 'boolean'
              ? data.isEnabled
              : baseUser.isEnabled ?? true,
        };

        setSessionUser(enriched);
        setSessionLoaded(true);
      } catch (e) {
        if (!isMounted) return;
        // If the request fails (e.g. 401 handled by interceptor), just mark as loaded.
        setSessionLoaded(true);
      }
    };

    loadSession();

    return () => {
      isMounted = false;
    };
  }, [baseUser, sessionLoaded]);

  const user = sessionUser ? { ...baseUser, ...sessionUser } : baseUser;

  const roles = Array.isArray(user.roles) ? user.roles : [];
  const employee = user.employee || null;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const isEnabled = typeof user.isEnabled === 'boolean' ? user.isEnabled : true;

  const access = useMemo(() => {
    const hasRole = (role) => roles.includes(role);

    const isAdmin    = hasRole('ROLE_ADMIN');
    const isManager  = hasRole('ROLE_MANAGER');
    // Treat ROLE_EMPLOYEE as the main employee flag.
    // NOTE: Do not use ROLE_USER as an employee signal (Admins also have ROLE_USER).
    const isEmployee = hasRole('ROLE_EMPLOYEE');
    const isClient   = hasRole('ROLE_CLIENT');

    const area     = employee?.area || null;
    const city     = employee?.city || null;
    const division = employee?.division || null;

    const normArea     = area ? String(area).toLowerCase() : null;
    const normCity     = city ? String(city).toLowerCase() : null;
    const normDivision = division ? String(division).toLowerCase() : null;

    // Derived "sub-roles" based on employee area
    const hasEmployee = !!employee;

    const isSupervisor  = hasEmployee && normArea === 'supervisor';
    const isCleaner     = hasEmployee && normArea === 'cleaner';
    const isMaintenance = hasEmployee && normArea === 'maintenance';

    // Division-based flags
    const isOwners2      = normDivision === 'owners2';
    const isHousekeepers = normDivision === 'housekeepers';

    // Simple auth flag; tweak if you prefer another condition (e.g. presence of token).
    const isAuthenticated = !!user && (!!user.name || !!user.username || !!user.email);

    return {
      user,
      roles,
      employee,
      isLoading: !sessionLoaded,

      isAuthenticated,
      isEnabled,

      // permissions
      permissions,

      // core roles
      isAdmin,
      isManager,
      isEmployee,
      isClient,

      // raw employee fields
      area,
      city,
      division,
      normArea,
      normCity,
      normDivision,

      // derived employee capabilities
      isSupervisor,
      isCleaner,
      isMaintenance,
      isOwners2,
      isHousekeepers,
    };
  }, [user, roles, employee, permissions, sessionLoaded]);

  return access;
}

export default useCurrentUserAccess;