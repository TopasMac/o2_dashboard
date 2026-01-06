function getAuthToken() {
  const keys = ['jwt', 'jwtToken', 'token', 'authToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

function authHeaders() {
    const token = getAuthToken();
    const h = { 'Accept': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }
  
  const BASE = '/api';
  
  export async function getBooking(id) {
    if (!id) throw new Error('getBooking: missing id');
    const res = await fetch(`${BASE}/bookings/${id}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`getBooking ${id} failed: ${res.status} ${text}`);
    }
    return res.json();
  }
  
  export async function updateBooking(id, payload) {
    if (!id) throw new Error('updateBooking: missing id');
    const res = await fetch(`${BASE}/bookings/${id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateBooking ${id} failed: ${res.status} ${text}`);
    }
    return res.json();
  }