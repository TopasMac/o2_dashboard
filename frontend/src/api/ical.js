function getAuthToken() {
  // Try common storage keys used in the app
  const keys = ['jwt', 'token', 'authToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

export async function fetchIcalReconcile({ unit, from, to, dry = false }) {
  const qs = new URLSearchParams();
  if (unit != null && unit !== '') qs.set('unit', String(unit));
  if (from) qs.set('from', from);
  if (to)   qs.set('to', to);
  if (dry)  qs.set('dry', 'true');

  // Always hide acknowledged rows in this view
  qs.set('hideAck', '1');

  const headers = { 'Accept': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api/ical/reconcile?${qs.toString()}`, {
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reconcile request failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function applyIcalUpdate(bookingId) {
  if (!bookingId) throw new Error('bookingId is required');

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api/ical/apply`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ bookingId })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apply request failed (${res.status}): ${text}`);
  }

  return res.json();
}