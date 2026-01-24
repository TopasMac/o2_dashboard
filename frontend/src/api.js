import axios from 'axios';

// Backend base URL resolution:
// 1) Use build-time env REACT_APP_BACKEND_BASE when provided.
// 2) Otherwise, default to current origin (never localhost fallback in production bundles).
const ENV_BASE = (process.env.REACT_APP_BACKEND_BASE || '').trim().replace(/\/+$/, '');
const DEFAULT_BASE = `${window.location.origin.replace(/\/+$/, '')}`;
export const BACKEND_BASE = ENV_BASE || DEFAULT_BASE; // note: no trailing /api here

const AUTH_BYPASS = ['/api/login_check', '/api/login', '/api/token/refresh'];

// Create axios instance using domain base; callers will use paths like "/api/..."
const api = axios.create({
  // Use same-origin; let calls like '/api/...' hit the current host (desktop or mobile)
  baseURL: ENV_BASE || '',
  withCredentials: true,
});

// Helper: JSON Merge Patch (Api Platform expects this for PATCH)
api.patchJson = (url, data, config = {}) => {
  return api.patch(url, data, {
    ...config,
    headers: {
      'Content-Type': 'application/merge-patch+json',
      ...(config.headers || {}),
    },
  });
};

// Enforce JSON Merge Patch for all PATCH requests by default
api.defaults.headers.patch = api.defaults.headers.patch || {};
api.defaults.headers.patch['Content-Type'] = 'application/merge-patch+json';
api.defaults.headers.common['Accept'] = 'application/json';

// Also wrap the instance .patch to merge any custom headers while keeping merge-patch
const _originalPatch = api.patch.bind(api);
api.patch = (url, data, config = {}) => {
  return _originalPatch(url, data, {
    ...config,
    headers: {
      'Content-Type': 'application/merge-patch+json',
      ...(config.headers || {}),
    },
  });
};

console.log('API BACKEND_BASE:', BACKEND_BASE);
console.log('API baseURL:', api.defaults.baseURL);

// Add interceptor for JWT
api.interceptors.request.use((config) => {
  // Ensure headers object exists
  config.headers = config.headers || {};

  const base = config.baseURL || '';
  const path = config.url || '';
  const fullUrl = `${base}${path}`;

  // Determine if this request should bypass Authorization
  const shouldBypass = AUTH_BYPASS.some(p => fullUrl.endsWith(p) || path.includes(p));

  if (shouldBypass) {
    // Remove any lingering auth header for login/refresh calls
    delete config.headers['Authorization'];
    delete config.headers['authorization'];
    console.log('Auth bypass for:', fullUrl);
  } else {
    // Attach JWT if present
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Default headers
  if (!config.headers['Accept']) {
    config.headers['Accept'] = 'application/json';
  }

  console.log('Calling URL:', fullUrl);
  return config;
});

// Response interceptor: auto-logout on 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';

    // 🚫 Skip global redirect for login failures
    if (url.includes('/api/login_check')) {
      return Promise.reject(error);
    }

    if (status === 401) {
      console.warn('Token expired or unauthorized. Logging out.');

      localStorage.removeItem('token');
      sessionStorage.removeItem('token');

      const currentPath = window.location.pathname + window.location.search;
      const from = encodeURIComponent(currentPath);

      const isMobileRoute = currentPath.startsWith('/m/');
      const loginPath = isMobileRoute ? '/m/login' : '/login';

      window.location.href = `${loginPath}?expired=1&from=${from}`;
    }

    return Promise.reject(error);
  }
);

export const mergePatch = (url, data, config = {}) => {
  const cfg = { ...config, headers: { ...(config.headers || {}), 'Content-Type': 'application/merge-patch+json' } };
  return api.patch(url, data, cfg);
};

export default api;