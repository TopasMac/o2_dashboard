export type OccupancyRow = {
    unitId: number;
    unitName: string | null;
    city: string | null;
    period: string; // YYYY-MM-01
    occupancyPercent: number;
    bookedDays: number;
    totalDays: number;
    lowThreshold: number;
    highThreshold: number;
    status: 'low' | 'ok' | 'high' | null;
    lastNote: { id: number; note: string | null; pinned: boolean; createdAt: string | null } | null;
    notesCount: number;
    lastActionType: string | null;
    lastActionAt: string | null;
    suppression: {
      alertType: string;
      status: 'active' | 'dismissed' | 'snoozed';
      snoozeUntil: string | null;
      reason: string | null;
      version: number;
    } | null;
  };
  
  export type WatchParams = {
    period: string;         // 'YYYY-MM'
    city?: string | null;
    low?: number;
    high?: number;
    filter?: 'crossing';
  };
  
  export async function fetchOccupancyWatch(params: WatchParams, baseUrl = ''): Promise<OccupancyRow[]> {
    const u = new URL(`${baseUrl || ''}/api/occupancy-watch`, window.location.origin);
    u.searchParams.set('period', params.period);
    if (params.city) u.searchParams.set('city', params.city);
    if (params.low != null) u.searchParams.set('low', String(params.low));
    if (params.high != null) u.searchParams.set('high', String(params.high));
    if (params.filter) u.searchParams.set('filter', params.filter);
  
    const res = await fetch(u.toString(), {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // if you rely on cookies; otherwise omit
    });
    if (!res.ok) throw new Error(`watch fetch failed: ${res.status}`);
    const json = await res.json();
    return json?.data ?? [];
  }