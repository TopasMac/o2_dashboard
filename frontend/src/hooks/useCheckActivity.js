// frontend/src/hooks/useCheckActivity.js
// A reusable hook to power both desktop and mobile Check-Ins/Outs UIs
// It encapsulates: week navigation, filtering, fetching, grouping and mark-done actions.

import * as React from 'react';
import api from '../api';

// --- date helpers -----------------------------------------------------------
const toYMD = (d) => {
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};

const startOfWeek = (date, weekStartsOn = 1) => { // 1 = Monday
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn; // days since week start
  d.setDate(d.getDate() - diff);
  d.setHours(0,0,0,0);
  return d;
};

const endOfWeek = (date, weekStartsOn = 1) => {
  const s = startOfWeek(date, weekStartsOn);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23,59,59,999);
  return e;
};

const formatDM = (date) => {
  const d = (date instanceof Date) ? date : new Date(date);
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

// Normalize a row coming from the API so UIs can rely on stable fields
const normalizeRow = (r) => {
  // Expected common shapes:
  // { type: 'OUT'|'IN', date: 'YYYY-MM-DD', unitName, city, bookingId, done }
  // or legacy: { isCheckout: 1/0, isCheckin: 1/0, onDate, unit_name, id, is_done }
  const type = (r.type || (r.isCheckout ? 'OUT' : (r.isCheckin ? 'IN' : '')) || '').toUpperCase();
  const date = r.date || r.onDate || r.check_date || r.checkDate || r.check_in || r.check_out;
  return {
    raw: r,
    type: type === 'OUT' ? 'OUT' : 'IN',
    date: toYMD(date || new Date()),
    unitName: r.unitName || r.unit_name || r.unit || '',
    city: r.city || r.cityName || r.location || '',
    bookingId: r.bookingId ?? r.id ?? r.booking_id ?? null,
    guestName: r.guestName || r.guest_name || r.guest || '',
    code: r.confirmationCode || r.confirmation_code || r.code || '',
    done: Boolean(r.done ?? r.is_done ?? r.cleaning_done ?? false),
  };
};

// Group rows by date with separate IN/OUT buckets
const groupByDate = (rows) => {
  const map = new Map();
  rows.forEach((r) => {
    const day = r.date;
    if (!map.has(day)) map.set(day, { date: day, ins: [], outs: [] });
    if (r.type === 'OUT') map.get(day).outs.push(r); else map.get(day).ins.push(r);
  });
  // sort by date asc, outs first inside a day
  return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
};

export default function useCheckActivity({
  initialDate = new Date(),
  initialMode = 'outs', // 'outs' | 'ins' | 'all'
  initialCity = 'All',
  weekStartsOn = 1,
} = {}) {
  // navigation state
  const [anchorDate, setAnchorDate] = React.useState(initialDate);
  const weekStart = React.useMemo(() => startOfWeek(anchorDate, weekStartsOn), [anchorDate, weekStartsOn]);
  const weekEnd = React.useMemo(() => endOfWeek(anchorDate, weekStartsOn), [anchorDate, weekStartsOn]);

  // filters
  const [mode, setMode] = React.useState(initialMode);
  const [city, setCity] = React.useState(initialCity);

  // data state
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [rows, setRows] = React.useState([]);

  // selections for bulk actions
  const [selected, setSelected] = React.useState(new Set());

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/bookings/check-activity', {
        params: {
          start: toYMD(weekStart),
          end: toYMD(weekEnd),
          city: city && city !== 'All' ? city : undefined,
        },
      });
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.rows || []);
      const normalized = list.map(normalizeRow);
      // apply mode filter client-side (outs/ins/all)
      const filtered = (mode === 'all') ? normalized : normalized.filter(r => (mode === 'outs' ? r.type === 'OUT' : r.type === 'IN'));
      setRows(filtered);
    } catch (e) {
      setError(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, city, mode]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  // week navigation
  const goPrevWeek = React.useCallback(() => setAnchorDate(d => { const nd = new Date(d); nd.setDate(nd.getDate()-7); return nd; }), []);
  const goNextWeek = React.useCallback(() => setAnchorDate(d => { const nd = new Date(d); nd.setDate(nd.getDate()+7); return nd; }), []);
  const goThisWeek = React.useCallback(() => setAnchorDate(new Date()), []);

  // grouping and counts
  const grouped = React.useMemo(() => groupByDate(rows), [rows]);
  const counts = React.useMemo(() => ({
    outs: rows.filter(r => r.type === 'OUT').length,
    ins: rows.filter(r => r.type === 'IN').length,
    all: rows.length,
  }), [rows]);

  // selection helpers
  const isSelected = React.useCallback((id) => selected.has(id), [selected]);
  const toggleSelected = React.useCallback((id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const clearSelection = React.useCallback(() => setSelected(new Set()), []);

  // mark-done single
  const markDoneFor = React.useCallback(async (row) => {
    if (!row) return;
    try {
      await api.post('/api/hk-cleanings/mark-done-by', {
        bookingId: row.bookingId,
        date: row.date,
      });
      // optimistic update
      setRows(prev => prev.map(r => (r.bookingId === row.bookingId && r.date === row.date ? { ...r, done: true } : r)));
    } catch (e) {
      // swallow; caller can toast
      throw e;
    }
  }, []);

  // bulk mark-done
  const bulkMarkDone = React.useCallback(async () => {
    if (selected.size === 0) return;
    const payload = Array.from(selected).map((id) => {
      const r = rows.find(x => x.bookingId === id || x.id === id);
      return r ? { bookingId: r.bookingId, date: r.date } : null;
    }).filter(Boolean);
    if (payload.length === 0) return;
    try {
      await api.post('/api/hk-cleanings/mark-done-by', { items: payload });
      setRows(prev => prev.map(r => (selected.has(r.bookingId) ? { ...r, done: true } : r)));
      setSelected(new Set());
    } catch (e) {
      throw e;
    }
  }, [rows, selected]);

  return {
    // state
    loading,
    error,
    mode, setMode,
    city, setCity,
    weekStart, weekEnd, anchorDate,

    // data
    rows,
    grouped,
    counts,

    // actions
    refresh: fetchData,
    goPrevWeek, goNextWeek, goThisWeek,
    isSelected, toggleSelected, clearSelection,
    markDoneFor, bulkMarkDone,

    // utils
    toYMD, formatDM,
  };
}