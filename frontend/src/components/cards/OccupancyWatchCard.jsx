import React, { useEffect, useRef, useState } from 'react';
import api from '../../api';
import OccWNoteModal from '../modals/OccWNoteModal';
import { Link } from 'react-router-dom';

// --- helpers ---------------------------------------------------------------
const yymm = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const addMonths = (ym, delta) => {
  const [y, m] = ym.split('-').map(n => parseInt(n, 10));
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' });
};

const pct = (n) => `${Math.round(Number(n || 0))}%`;
const ddmm = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${mon}`;
};

// --- small UI atoms --------------------------------------------------------
const StatusChip = ({ value }) => {
  const v = String(value || '').toLowerCase();
  const base = { display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:11, border:'1px solid rgba(0,0,0,.08)' };
  const low  = { background:'#fff5f5', color:'#b42318', borderColor:'#f1a5a5' };
  const ok   = { background:'#f6fef9', color:'#067647', borderColor:'#98e5bf' };
  const high = { background:'#fff8e6', color:'#915930', borderColor:'#f2cf95' };
  const style = v === 'low' ? low : (v === 'high' ? high : ok);
  return <span style={{ ...base, ...style }}>{value || '—'}</span>;
};

const Bar = ({ value=0, low=0, high=100, forceOk=false }) => {
  const v  = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  const lo = Math.max(0, Math.min(100, Number(low  || 0)));
  const hi = Math.max(0, Math.min(100, Number(high || 100)));
  const COL_LOW = '#E74C3C';
  const COL_OK  = '#1E6F68';
  const COL_HI  = '#F4C542';
  let fill = v < lo ? COL_LOW : (v >= hi ? COL_HI : COL_OK);
  if (forceOk && v >= hi) fill = COL_OK;
  return (
    <div title={`${v}%`} style={{ position:'relative', height:8, background:'#eee', borderRadius:6, overflow:'hidden', minWidth:120 }}>
      <div style={{ width:`${v}%`, height:'100%', background:fill, transition:'width 140ms ease' }} />
      <div style={{ position:'absolute', left:`${lo}%`, top:0, bottom:0 }}>
        <div style={{ position:'absolute', left:-1, top:0, bottom:0, width:2, background:'#ddd' }} />
      </div>
      <div style={{ position:'absolute', left:`${hi}%`, top:0, bottom:0 }}>
        <div style={{ position:'absolute', left:-1, top:0, bottom:0, width:2, background:'#ddd' }} />
      </div>
    </div>
  );
};

// --- main component --------------------------------------------------------
export default function OccupancyWatchCard() {
  // constants for sticky layout (kept tight and predictable)
  const HEADER_H  = 40;
  const FILTERS_H = 64; // fallback; actual value measured at runtime

  const [period, setPeriod] = useState(yymm());
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('Filtered'); // default: only crossing (Low/High)
  const [sortUpdated, setSortUpdated] = useState(''); // '', 'asc', 'desc'
  const [low, setLow] = useState(0);
  const [high, setHigh] = useState(0);
  const [lowTouched, setLowTouched] = useState(false);
  const [highTouched, setHighTouched] = useState(false);
  const [lowEditing, setLowEditing] = useState(false);
  const [highEditing, setHighEditing] = useState(false);
  const [lowInput, setLowInput] = useState('');
  const [highInput, setHighInput] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notesHydrating, setNotesHydrating] = useState(false);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteCtx, setNoteCtx] = useState({
    unitId: null,
    unitName: '',
    city: '',
    periodYm: '',
    noteId: null,
    noteText: '',
  });
  const [noteLoading, setNoteLoading] = useState(false);
  const [notesByKey, setNotesByKey] = useState(new Map()); // key: `${unitId}|${ym}` -> { hasNote, noteId, note }
  const loadTimerRef = useRef(null);
  const loadReqIdRef = useRef(0);
  // --- note helpers/modal handlers -----------------------------------------
  const openNoteFor = async (row) => {
    const periodYm = String(row.period || '').slice(0, 7);
    const key = `${row.unitId}|${periodYm}`;
    setNoteLoading(true);

    // Optional prefill from cache to minimize flicker (will be overwritten by GET result below)
    let cached = null;
    if (row && (row.hasNote || row.note != null || row.noteId)) {
      cached = { id: row.noteId ?? null, note: row.note ?? '' };
    } else {
      const mapItem = notesByKey instanceof Map ? notesByKey.get(key) : null;
      if (mapItem && (mapItem.hasNote || mapItem.note || mapItem.noteId)) {
        cached = { id: mapItem.noteId ?? null, note: mapItem.note ?? '' };
      }
    }

    try {
      // ALWAYS fetch latest from the Occupancy Watch endpoint
      const res = await api.get('/api/occupancy-watch/note', {
        params: { unitId: row.unitId, period: periodYm }
      });
      const d = res?.data?.data;
      const payload = d ? { id: d.noteId ?? null, note: d.note ?? '' } : cached;

      setNoteCtx({
        unitId: row.unitId,
        unitName: row.unitName || `#${row.unitId}`,
        city: row.city || '',
        periodYm,
        noteId: payload?.id ?? null,
        noteText: payload?.note ?? '',
      });
      setNoteOpen(true);
    } catch (e) {
      // Fallback: open with cached values if GET fails
      setNoteCtx({
        unitId: row.unitId,
        unitName: row.unitName || `#${row.unitId}`,
        city: row.city || '',
        periodYm,
        noteId: cached?.id ?? row?.noteId ?? null,
        noteText: cached?.note ?? row?.note ?? '',
      });
      setNoteOpen(true);
    } finally {
      setNoteLoading(false);
    }
  };

  const handleSaveNote = async (text) => {
    if (!noteCtx.unitId || !noteCtx.periodYm) return;
    try {
      const payload = {
        unitId: noteCtx.unitId,
        period: noteCtx.periodYm, // YYYY-MM
        note: text,
        pinned: true
      };
      const res = await api.post('/api/occupancy-watch/note', payload);
      const saved = res?.data?.data;
      // optimistic update into rows (use returned fields)
      setRows(prev => prev.map(r => {
        if (r.unitId === noteCtx.unitId && String(r.period || '').startsWith(noteCtx.periodYm)) {
          const hadNote = !!(r.noteId || (typeof r.note === 'string' && r.note.trim().length > 0) || r.hasNote);
          const nextCount = (r.notesCount ?? 0) + (hadNote ? 0 : 1);
          return {
            ...r,
            noteId: saved?.noteId ?? r?.noteId ?? null,
            note: saved?.note ?? text,
            updatedAt: saved?.updatedAt ?? r?.updatedAt ?? null,
            hasNote: true,
            notesCount: nextCount
          };
        }
        return r;
      }));
      // sync notesByKey cache
      setNotesByKey(prev => {
        const m = new Map(prev);
        const k = `${noteCtx.unitId}|${noteCtx.periodYm}`;
        m.set(k, { hasNote: true, noteId: saved?.noteId ?? null, note: saved?.note ?? text });
        return m;
      });
      setNoteCtx(ctx => ({ ...ctx, noteId: saved?.noteId ?? ctx.noteId, noteText: saved?.note ?? text }));
      setNoteOpen(false);
    } catch (e) {
      console.error('Save note failed', e);
    }
  };

  const handleDeleteNote = async () => {
    if (!noteCtx.noteId) { setNoteOpen(false); return; }
    try {
      await api.delete(`/api/occupancy-watch/note/${noteCtx.noteId}`);
      setRows(prev => prev.map(r => {
        if (r.unitId === noteCtx.unitId && String(r.period || '').startsWith(noteCtx.periodYm)) {
          const nextCount = Math.max(0, (r.notesCount ?? 0) - 1);
          return { ...r, noteId: null, note: null, updatedAt: null, hasNote: false, notesCount: nextCount };
        }
        return r;
      }));
      // sync notesByKey cache
      setNotesByKey(prev => {
        const m = new Map(prev);
        const k = `${noteCtx.unitId}|${noteCtx.periodYm}`;
        m.set(k, { hasNote: false, noteId: null, note: null });
        return m;
      });
      setNoteOpen(false);
    } catch (e) {
      console.error('Delete note failed', e);
    }
  };

  const scrollRef = useRef(null);
  const filtersRef = useRef(null);
  const [filtersHeight, setFiltersHeight] = useState(FILTERS_H);
  // measure filters area so table header sticks immediately below it (no peek-through gap)
  useEffect(() => {
    const el = filtersRef.current;
    if (!el) return;

    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h && h !== filtersHeight) setFiltersHeight(h);
    };

    // initial and on resize
    measure();
    window.addEventListener('resize', measure);

    // also observe element size changes (fonts/inputs can vary)
    let ro;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }

    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  // include deps that change filters layout/height
  }, [filtersRef, city, status, lowEditing, highEditing, low, high, sortUpdated]);

  // navigation
  const nowYm   = yymm();
  const canPrev = period > addMonths(nowYm, -2);
  const canNext = period < addMonths(nowYm,  2);

  const clearFilters = () => {
    setPeriod(nowYm);
    setCity('');
    setStatus('Filtered');
    setLow(0); setHigh(0);
    setLowTouched(false); setHighTouched(false);
    setLowEditing(false); setHighEditing(false);
    setLowInput(''); setHighInput('');
  };

  // data load
  const load = async () => {
    const reqId = ++loadReqIdRef.current;
    setLoading(true); setError(null);
    const myId = reqId;
    try {
      const qs = new URLSearchParams();
      qs.set('period', period);
      if (city) qs.set('city', city);
      const s = (status || '').toLowerCase();
      if (s === 'filtered' || !s) qs.set('filter', 'crossing');
      else if (s === 'all') qs.set('status', 'all');
      else if (['low','high','on track'].includes(s)) qs.set('status', s);
      if (lowTouched  && low  != null) qs.set('low',  String(low));
      if (highTouched && high != null) qs.set('high', String(high));

      const res = await api.get(`/api/occupancy-watch?${qs.toString()}`);
      const data = Array.isArray(res?.data?.data) ? res.data.data : [];
      // Preserve note-related fields already hydrated on the client to avoid flicker/overwrites
      setRows(prev => {
        const byKey = new Map(
          Array.isArray(prev) ? prev.map(r => [`${r.unitId}|${String(r.period).slice(0,7)}`, r]) : []
        );
        return data.map(r => {
          const key = `${r.unitId}|${String(r.period).slice(0,7)}`;
          const old = byKey.get(key);
          if (old) {
            return {
              ...r,
              note: old.note ?? r.note,
              noteId: old.noteId ?? r.noteId,
              hasNote: (typeof old.hasNote === 'boolean' ? old.hasNote : r.hasNote),
              notesCount: (old.notesCount ?? r.notesCount)
            };
          }
          return r;
        });
      });

      // adopt backend defaults once per period unless user has touched
      if (data.length) {
        const t0 = data[0];
        if (!lowTouched  && typeof t0.lowThreshold  === 'number') setLow(t0.lowThreshold);
        if (!highTouched && typeof t0.highThreshold === 'number') setHigh(t0.highThreshold);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Error');
    } finally {
      if (myId !== loadReqIdRef.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    // Debounce loads to avoid rapid duplicate calls on mount and quick successive state changes
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      load();
    }, 150);
    return () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
      }
    };
  }, [period, city, status, low, high, lowTouched, highTouched]);

  useEffect(() => {
    // Notes are now provided directly by /api/occupancy-watch; no client-side hydration needed.
    // This no-op effect remains to preserve any future hooks on rows.
  }, [rows]);

  // --- UI ------------------------------------------------------------------
  return (
    <div
      className="ow-card"
      style={{
        width:'100%', minWidth:360, maxWidth:800,
        border:'1px solid #e5e7eb', borderRadius:8, background:'#fff',
        boxShadow:'0 2px 4px rgba(0,0,0,0.05)',
        height:600, display:'flex', flexDirection:'column'
      }}
    >
      {/* single scroll container so stickies work reliably */}
      <div ref={scrollRef} style={{ overflowY:'auto', overflowX:'hidden', flex:1 }}>
        {/* sticky header */}
        <div
          style={{
            position:'sticky', top:0, zIndex:20,
            height:HEADER_H, display:'flex', alignItems:'center', justifyContent:'space-between',
            background:'#2E645F', color:'#fff',
            padding:'0 12px', borderTopLeftRadius:8, borderTopRightRadius:8,
            fontWeight:600
          }}
        >
          <span>Occupancy Watch</span>
          <Link
            to="/occupancy-report"
            title="Open Occupancy Report"
            aria-label="Open Occupancy Report"
            style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:6, textDecoration:'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* bar chart icon */}
              <rect x="3" y="10" width="4" height="10" />
              <rect x="10" y="6" width="4" height="14" />
              <rect x="17" y="3" width="4" height="17" />
            </svg>
          </Link>
        </div>

        {/* sticky filters */}
        <div
          ref={filtersRef}
          style={{
            position:'sticky', top:HEADER_H, zIndex:15, background:'#fff',
            borderBottom:'1px solid #eee'
          }}
        >
          <div style={{ display:'flex', gap:16, alignItems:'center', padding:'16px 12px', minHeight:30 }}>
            {/* Period */}
            <div style={{ position:'relative', width:170 }}>
              <label style={{ position:'absolute', top:-8, left:12, background:'#fff', padding:'0 4px', fontSize:11, color:'#2E645F' }}>Period</label>
              <div style={{ display:'flex', alignItems:'center', gap:8, border:'1px solid #ccc', borderRadius:6, padding:'6px 8px', height:35, boxSizing:'border-box' }}>
                <button
                  type="button"
                  onClick={() => canPrev && setPeriod(p => addMonths(p, -1))}
                  disabled={!canPrev}
                  style={{ border:'none', background:'transparent', cursor: canPrev ? 'pointer' : 'not-allowed', opacity: canPrev ? 1 : .5 }}
                >←</button>
                <div style={{ flex:1, textAlign:'center', fontWeight:600 }}>{monthLabel(period)}</div>
                <button
                  type="button"
                  onClick={() => canNext && setPeriod(p => addMonths(p, 1))}
                  disabled={!canNext}
                  style={{ border:'none', background:'transparent', cursor: canNext ? 'pointer' : 'not-allowed', opacity: canNext ? 1 : .5 }}
                >→</button>
              </div>
            </div>

            {/* City */}
            <div style={{ position:'relative', width:200 }}>
              <label style={{ position:'absolute', top:-8, left:12, background:'#fff', padding:'0 4px', fontSize:11, color:'#2E645F' }}>City</label>
              <input
                list="occ-city"
                value={city}
                onChange={(e) => setCity(e.target.value.trim())}
                placeholder="All"
                style={{ width:'100%', boxSizing:'border-box', padding:'6px 8px', border:'1px solid #ccc', borderRadius:6, outline:'none', fontSize:13, color: city ? '#000' : '#999', height:35 }}
              />
              {city && (
                <button
                  type="button"
                  onClick={() => setCity('')}
                  title="Clear city"
                  style={{ position:'absolute', right:22, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', fontSize:14, color:'#999', cursor:'pointer' }}
                >×</button>
              )}
              <datalist id="occ-city">
                <option value="Playa del Carmen" />
                <option value="Tulum" />
              </datalist>
            </div>

            {/* Status */}
            <div style={{ position:'relative', width:140 }}>
              <label style={{ position:'absolute', top:-8, left:12, background:'#fff', padding:'0 4px', fontSize:11, color:'#2E645F' }}>Status</label>
              <input
                list="occ-status"
                value={status}
                onChange={(e) => setStatus(e.target.value.trim())}
                placeholder="Filtered"
                style={{ width:'100%', boxSizing:'border-box', padding:'6px 8px', border:'1px solid #ccc', borderRadius:6, outline:'none', fontSize:13, color: status ? '#000' : '#999', height:35 }}
              />
              {status && (
                <button
                  type="button"
                  onClick={() => setStatus('')}
                  title="Clear status"
                  style={{ position:'absolute', right:22, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', fontSize:14, color:'#999', cursor:'pointer' }}
                >×</button>
              )}
              <datalist id="occ-status">
                <option value="Low" />
                <option value="High" />
                <option value="On Track" />
                <option value="Filtered" />
                <option value="All" />
              </datalist>
            </div>

            {/* Updated sort */}
            <div style={{ position:'relative', width:90 }}>
              <label style={{ position:'absolute', top:-8, left:12, background:'#fff', padding:'0 4px', fontSize:11, color:'#2E645F' }}>Updated</label>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #ccc', borderRadius:6, padding:'6px 8px', height:35, boxSizing:'border-box' }}>
                {/* cleaner icon buttons */}
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <button
                    type="button"
                    title="Sort by Updated (ascending)"
                    onClick={() => setSortUpdated(prev => prev === 'asc' ? '' : 'asc')}
                    aria-pressed={sortUpdated === 'asc'}
                    style={{
                      display:'inline-flex', alignItems:'center', justifyContent:'center',
                      width:24, height:22,
                      border:'1px solid ' + (sortUpdated === 'asc' ? '#2E645F' : '#dcdcdc'),
                      background: sortUpdated === 'asc' ? '#EAF4F2' : '#fff',
                      color:'#2E645F',
                      borderRadius:6, cursor:'pointer'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Sort by Updated (descending)"
                    onClick={() => setSortUpdated(prev => prev === 'desc' ? '' : 'desc')}
                    aria-pressed={sortUpdated === 'desc'}
                    style={{
                      display:'inline-flex', alignItems:'center', justifyContent:'center',
                      width:24, height:22,
                      border:'1px solid ' + (sortUpdated === 'desc' ? '#2E645F' : '#dcdcdc'),
                      background: sortUpdated === 'desc' ? '#EAF4F2' : '#fff',
                      color:'#2E645F',
                      borderRadius:6, cursor:'pointer'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Low */}
            <div style={{ position:'relative', width:80 }}>
              <label style={{ position:'absolute', top:-8, left:12, background:'#fff', padding:'0 4px', fontSize:11, color:'#2E645F' }}>Low</label>
              <input
                type="text"
                value={lowEditing ? lowInput : (low ? `${low}%` : '')}
                onChange={(e) => setLowInput(e.target.value.replace(/[^0-9]/g, ''))}
                onMouseDown={() => { if (!lowEditing) { setLowEditing(true); setLowInput(''); } }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                onBlur={() => { const n = parseFloat((lowInput || '').trim()); setLow(Number.isNaN(n) ? 0 : n); setLowTouched(true); setLowEditing(false); }}
                style={{ width:'100%', boxSizing:'border-box', padding:'6px 8px', border:'1px solid #ccc', borderRadius:6, outline:'none', textAlign:'center', fontSize:13, height:35 }}
                inputMode="numeric"
              />
              {(lowTouched && !lowEditing) && (
                <button
                  type="button"
                  title="Reset Low"
                  onClick={() => { setLow(0); setLowTouched(false); setLowInput(''); }}
                  style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', fontSize:14, color:'#999', cursor:'pointer' }}
                >×</button>
              )}
            </div>

            {/* High */}
            <div style={{ position:'relative', width:80 }}>
              <label style={{ position:'absolute', top:-8, left:12, background:'#fff', padding:'0 4px', fontSize:11, color:'#2E645F' }}>High</label>
              <input
                type="text"
                value={highEditing ? highInput : (high ? `${high}%` : '')}
                onChange={(e) => setHighInput(e.target.value.replace(/[^0-9]/g, ''))}
                onMouseDown={() => { if (!highEditing) { setHighEditing(true); setHighInput(''); } }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                onBlur={() => { const n = parseFloat((highInput || '').trim()); setHigh(Number.isNaN(n) ? 0 : n); setHighTouched(true); setHighEditing(false); }}
                style={{ width:'100%', boxSizing:'border-box', padding:'6px 8px', border:'1px solid #ccc', borderRadius:6, outline:'none', textAlign:'center', fontSize:13, height:35 }}
                inputMode="numeric"
              />
              {(highTouched && !highEditing) && (
                <button
                  type="button"
                  title="Reset High"
                  onClick={() => { setHigh(0); setHighTouched(false); setHighInput(''); }}
                  style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', fontSize:14, color:'#999', cursor:'pointer' }}
                >×</button>
              )}
            </div>

            <div style={{ flex:1 }} />
            {/* reset icon */}
            <button
              type="button"
              onClick={clearFilters}
              title="Reset filters"
              aria-label="Reset filters"
              style={{ border:'none', background:'transparent', cursor:'pointer', padding:6 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E645F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 10-3.09 6.76" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* table header (sticky) */}
        <div
          style={{
            position:'sticky', top:HEADER_H + filtersHeight, zIndex:10, background:'#fff',
            borderBottom:'1px solid #eee'
          }}
        >
          <div style={{
            display:'grid',
            gridTemplateColumns:'minmax(140px,180px) 70px 70px 165px 70px 70px 50px 70px',
            gap:12, padding:'8px 10px', fontWeight:600
          }}>
            <div>Unit</div>
            <div>City</div>
            <div>Occ %</div>
            <div>Progress</div>
            <div>Booked</div>
            <div>Status</div>
            <div>Notes</div>
            <div>Updated</div>
          </div>
        </div>

        {/* table body */}
        <div>
          {loading && <p style={{ padding:12 }}>Loading…</p>}
          {error && <p style={{ padding:12, color:'crimson' }}>{error}</p>}
          {!loading && !error && (
            rows.length ? (
              rows
                .sort((a, b) => {
                  const toTs = (r) => {
                    if (!r || !r.updatedAt) return null;
                    const t = Date.parse(r.updatedAt);
                    return Number.isNaN(t) ? null : t;
                  };
                  if (sortUpdated === 'asc' || sortUpdated === 'desc') {
                    const ta = toTs(a);
                    const tb = toTs(b);
                    // Put nulls at the end for both directions
                    if (ta === null && tb === null) return 0;
                    if (ta === null) return 1;
                    if (tb === null) return -1;
                    return sortUpdated === 'asc' ? (ta - tb) : (tb - ta);
                  }
                  const s = (status || '').toLowerCase();
                  if (s === 'all') {
                    const rank = (c) => (c === 'Playa del Carmen' ? 0 : 1);
                    const ra = rank(a.city || '');
                    const rb = rank(b.city || '');
                    if (ra !== rb) return ra - rb;
                    return (a.occupancyPercent || 0) - (b.occupancyPercent || 0);
                  }
                  return (a.occupancyPercent || 0) - (b.occupancyPercent || 0);
                })
                .map((r) => {
                  const today = new Date();
                  const isCurrentLate = (r.period || '').slice(0, 7) === yymm(today) && today.getDate() > 14;
                  return (
                    <div
                      key={`${r.unitId}-${r.period}`}
                      style={{
                        display:'grid',
                        gridTemplateColumns:'minmax(140px,180px) 70px 70px 165px 70px 70px 50px 70px',
                        gap:12, padding:'8px 10px', borderBottom:'1px solid #f1f1f1', alignItems:'center'
                      }}
                    >
                      <div style={{ fontWeight:600, whiteSpace:'nowrap', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis' }}>{r.unitName || `#${r.unitId}`}</div>
                      <div style={{ maxWidth:70, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {r.city === 'Playa del Carmen' ? 'Playa' : (r.city || '—')}
                      </div>
                      <div>{pct(r.occupancyPercent)}</div>
                      <div>
                        <Bar value={r.occupancyPercent} low={r.lowThreshold} high={r.highThreshold} forceOk={isCurrentLate} />
                      </div>
                      <div>{(r.bookedDays ?? 0)} / {(r.totalDays ?? 0)}</div>
                      <div style={{ maxWidth:70, overflow:'hidden' }}><StatusChip value={r.status} /></div>
                      <div style={{ display:'flex', alignItems:'center' }}>
                        {(() => {
                          const ym = String(r.period).slice(0,7);
                          const k = `${r.unitId}|${ym}`;
                          const mapItem = notesByKey instanceof Map ? notesByKey.get(k) : null;
                          const hasNote = !!(
                            r?.hasNote === true ||
                            (typeof r?.note === 'string' && r.note.trim().length > 0) ||
                            (r?.noteId) ||
                            (mapItem && (mapItem.hasNote === true || (mapItem.noteId) || (typeof mapItem.note === 'string' && mapItem.note.trim().length > 0)))
                          );
                          const noteText = (r?.note && r.note.trim().length > 0) ? r.note : (mapItem?.note ?? '');
                          return (
                            <button
                              type="button"
                              title={hasNote && noteText ? noteText : 'Add a note'}
                              onClick={() => openNoteFor(r)}
                              style={{
                                border: '1px solid #d4e4e1',
                                background: '#fff',
                                color: '#2E645F',
                                width: 28, height: 28, borderRadius: 6,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                              aria-label={hasNote ? 'Edit note' : 'Add note'}
                            >
                              {hasNote ? (
                                // document icon
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <path d="M14 2v6h6" />
                                  <path d="M9 13h6" />
                                  <path d="M9 17h6" />
                                </svg>
                              ) : (
                                // plus icon
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 5v14" />
                                  <path d="M5 12h14" />
                                </svg>
                              )}
                            </button>
                          );
                        })()}
                      </div>
                      <div style={{ color:'#555', textAlign:'center' }}>{r.updatedAt ? ddmm(r.updatedAt) : '—'}</div>
                    </div>
                  );
                })
            ) : (
              <div style={{ padding:12, color:'#666' }}>No rows</div>
            )
          )}
        </div>
      </div>
      {/* Note Modal */}
      <OccWNoteModal
        open={noteOpen}
        note={noteCtx.noteText}
        noteId={noteCtx.noteId}
        headerTitle="Note"
        subtitle={`${noteCtx.unitName}${noteCtx.city ? ' · ' + noteCtx.city : ''} · ${noteCtx.periodYm}`}
        onSave={handleSaveNote}
        onDelete={noteCtx.noteId ? handleDeleteNote : undefined}
        onClose={() => setNoteOpen(false)}
      />
    </div>
  );
}