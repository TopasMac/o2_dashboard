export function usesHausInBrand(hostname, pathname) {
  const host = String(hostname || '').toLowerCase();
  const path = String(pathname || '');
  return host === 'app.myhausin.com' || path === '/m' || path.startsWith('/m/');
}
