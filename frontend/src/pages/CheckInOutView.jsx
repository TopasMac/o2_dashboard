import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { ArrowDownCircleIcon, ArrowUpCircleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { CheckIcon } from '@heroicons/react/24/solid';
import AppShell from '../components/layout/AppShell';
import Page from '../components/layout/Page';

// New page dedicated to housekeeping creation/completion from check-outs
// Data source: GET /api/bookings/check-activity?start=YYYY-MM-DD&end=YYYY-MM-DD&city=...
// Complete (create if missing + mark done): POST /api/hk-cleanings/mark-done-by { unitId, checkoutDate, reservationCode?, createIfMissing: true }

const CheckInOutView = () => {
  // ===== Filters =====
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [city, setCity] = useState('');

  const toISO = (d) => d.toISOString().slice(0, 10);
  const handleStartChange = (val) => {
    setStart(val);
    if (val) {
      const d = new Date(val);
      if (!isNaN(d)) {
        const endD = new Date(d);
        endD.setDate(d.getDate() + 6);
        setEnd(toISO(endD));
      }
    } else {
      setEnd('');
    }
  };

  // ===== Data & selection =====
  const [rows, setRows] = useState([]); // raw API rows
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState({}); // key => entry
  const [pending, setPending] = useState({}); // key => true while submitting
  const exportRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  // Hide legacy sidebar on this page only (show our NavRail instead)
  useEffect(() => {
    const hidden = [];
    // 1) Try known selectors first
    const selectors = ['[data-sidebar]', '#sidebar', '.sidebar', '.app-sidebar', '.MuiDrawer-root', 'aside[role="navigation"]'];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.closest('[data-appshell-navrail]')) return;
        if (hidden.find(h => h.el === el)) return;
        hidden.push({ el, prev: el.style.display });
        el.style.display = 'none';
        el.style.width = '0';
        el.style.minWidth = '0';
        el.style.maxWidth = '0';
      });
    });
    // 2) Heuristic fallback: hide any fixed/sticky left rail the size of a sidebar
    const candidates = Array.from(document.querySelectorAll('aside,nav,div'));
    candidates.forEach((el) => {
      if (el.closest('[data-appshell-navrail]')) return;
      try {
        const cs = window.getComputedStyle(el);
        const pos = cs.position;
        const left = parseInt(cs.left || '0', 10);
        const width = el.getBoundingClientRect().width;
        const height = el.getBoundingClientRect().height;
        const isFullHeight = height >= window.innerHeight * 0.8;
        const isLeftDocked = (pos === 'fixed' || pos === 'sticky') && left <= 8;
        const isSidebarWidth = width >= 56 && width <= 320;
        if (isFullHeight && isLeftDocked && isSidebarWidth) {
          if (!hidden.find(h => h.el === el)) {
            hidden.push({ el, prev: el.style.display });
            el.style.display = 'none';
            el.style.width = '0';
            el.style.minWidth = '0';
            el.style.maxWidth = '0';
          }
        }
      } catch (e) {
        // ignore
      }
    });
    return () => {
      hidden.forEach(({ el, prev }) => {
        el.style.display = prev;
        el.style.width = '';
        el.style.minWidth = '';
        el.style.maxWidth = '';
      });
    };
  }, []);
  // Export as image
  const exportAsImage = async () => {
    if (!exportRef.current) return;
    try {
      setCapturing(true);
      await new Promise((r) => setTimeout(r, 50)); // allow layout to settle
      const { default: html2canvas } = await import('html2canvas');
      const node = exportRef.current;
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: window.devicePixelRatio > 1 ? 2 : 2,
        useCORS: true,
        logging: false,
        scrollY: -window.scrollY,
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const a = document.createElement('a');
      const citySafe = (city || 'All').replace(/[^A-Za-z0-9]/g, ''); // strip spaces/accents/punct
      const startDM = formatDMCompact(start) || 'start';
      const endDM = formatDMCompact(end) || 'end';
      a.href = dataUrl;
      a.download = `${citySafe}_${startDM}_${endDM}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error('Export image error', e);
      alert('To export as image, please install html2canvas: npm i html2canvas');
    } finally {
      setCapturing(false);
    }
  };

  const makeKey = (unitId, date) => `${unitId}__${date}`;
  const isSelected = (unitId, date) => !!selected[makeKey(unitId, date)];
  const toggleSelected = (entry) => {
    const key = makeKey(entry.unit_id, entry.check_out);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = entry;
      return next;
    });
  };
  const clearSelection = () => setSelected({});

  // Helper: try to read reservation code from various possible API field names
  const getResCode = (e) =>
    e?.reservation_code ??
    e?.reservationCode ??
    e?.confirmation_code ??
    e?.confirmationCode ??
    e?.code ??
    null;

  // Note to display: ONLY event-specific notes. Never render generic `notes`.
  const getEventNote = (r) => {
    if (r?.event_check_out) return r?.check_out_notes || '';
    if (r?.event_check_in)  return r?.check_in_notes  || '';
    return '';
  };

  // Days since last checkout (integer or null)
  const getIdleDays = (r) => {
    const v = r?.days_since_last_checkout;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };


  // ===== Fetch =====
  const fetchData = async () => {
    if (!start || !end) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/bookings/check-activity', { params: { start, end, city } });
      setRows(Array.isArray(res.data) ? res.data : []);
      clearSelection();
    } catch (e) {
      console.error(e);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ===== Group by city + date for display =====
  const grouped = useMemo(() => {
    const out = {};

    const ensureBucket = (cityName, date) => {
      if (!out[cityName]) out[cityName] = {};
      if (!out[cityName][date]) out[cityName][date] = [];
      return out[cityName][date];
    };

    (rows || []).forEach((r) => {
      const cityName = r.city || 'Unknown';

      // If both events exist, create TWO records: one for check-in (on check_in date) and one for check-out (on check_out date)
      if (r.event_check_in && r.check_in) {
        const bucket = ensureBucket(cityName, r.check_in);
        bucket.push({
          ...r,
          type: 'Check in',
          event_check_in: true,
          event_check_out: false,
        });
      }
      if (r.event_check_out && r.check_out) {
        const bucket = ensureBucket(cityName, r.check_out);
        bucket.push({
          ...r,
          type: 'Check out',
          event_check_in: false,
          event_check_out: true,
        });
      }

      // If neither flag is set, do nothing (no visible event)
    });

    return out;
  }, [rows]);

  // ===== Bulk complete (create if missing) =====
  const selectedCount = Object.keys(selected).length;
  const bulkCreate = async () => {
    if (!selectedCount) return;
    const entries = Object.values(selected);
    try {
      // Fire requests in parallel but cap concurrency if needed later
      await Promise.all(entries.map(async (e) => {
        const reservationCode = getResCode(e);
        if (!reservationCode) {
          console.warn('Missing reservationCode for entry', e);
          throw new Error('Missing reservationCode for one or more selected rows.');
        }
        await api.post('/api/hk-cleanings/mark-done-by', {
          unitId: e.unit_id,
          checkoutDate: e.check_out,
          reservationCode,
          createIfMissing: true,
        }, { headers: { 'Accept': 'application/json' } });
      }));
      clearSelection();
      fetchData();
    } catch (e) {
      console.error('bulk complete error', e);
      const apiMsg = e?.response?.data?.error || e?.message || 'Unknown error';
      alert(`Some cleanings could not be completed: ${apiMsg}`);
    }
  };

  const createCleaningForRow = async (entry) => {
    const key = makeKey(entry.unit_id, entry.check_out);
    if (pending[key]) return;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const reservationCode = getResCode(entry);
      if (!reservationCode) {
        throw new Error('Missing reservationCode for this row.');
      }
      await api.post('/api/hk-cleanings/mark-done-by', {
        unitId: entry.unit_id,
        checkoutDate: entry.check_out,
        reservationCode,
        createIfMissing: true,
      }, { headers: { 'Accept': 'application/json' } });

      // Optimistically mark hk as done in local state
      setRows((prev) => prev.map((r) => {
        if (r.unit_id === entry.unit_id && r.check_out === entry.check_out) {
          const hk = { ...(r.hk || {}), exists: true, status: 'done' };
          return { ...r, hk };
        }
        return r;
      }));
    } catch (e) {
      console.error('complete error', e);
      const apiMsg = e?.response?.data?.error || e?.message || 'Unknown error';
      alert(`Error completing cleaning for this checkout: ${apiMsg}`);
    } finally {
      setPending((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  };

  // ===== UI helpers =====
  const todayISO = new Date().toISOString().slice(0, 10);

  const makeWeekDates = (startISO) => {
    if (!startISO) return [];
    const startDate = new Date(startISO);
    if (isNaN(startDate)) return [];
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };
  const weekDates = useMemo(() => makeWeekDates(start), [start]);

  const formatDayLabel = (iso) => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!y || !m || !d) return iso;
    // Build a UTC date to avoid TZ shifts
    const dt = new Date(Date.UTC(y, m - 1, d));
    const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${days[dt.getUTCDay()]} ${dd}/${mm}`;
  };

  // Format ISO date as dd/mm
  const formatDM = (iso) => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [, mm, dd] = parts;
    if (!dd || !mm) return iso;
    return `${dd}/${mm}`;
  };

  // Filename settings
  const formatDMCompact = (iso) => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return '';
    const [, mm, dd] = parts;
    return (dd && mm) ? `${dd}${mm}` : '';
  };

  const renderCityRow = (cityName) => {
    const byDate = grouped[cityName] || {};
    const datesToShow = Object.keys(byDate).sort();
    return (
      <div data-city-cards style={{ marginTop: 0, marginBottom: 0 }}>
        <div style={{ margin: '0 0 8px 0' }}>
          <h3 style={{ margin: 0, fontWeight: 700 }}>
            {capturing ? `${cityName}, ${formatDM(start)} al ${formatDM(end)}` : cityName}
          </h3>
        </div>
        <div style={{ overflowX: 'hidden', paddingBottom: 12, marginTop: 0 }}>
          <div
            style={{
              display: 'grid',
              ...(capturing
                ? { gridTemplateColumns: '1fr', rowGap: 14 }
                : { gridTemplateColumns: `repeat(${Math.max(datesToShow.length || 0, 1)}, minmax(170px, 1fr))`, gap: 8 }
              )
            }}
          >
            {datesToShow.map((date) => {
              const baseRows = byDate[date] || [];
              // Build per-day status map to know which units have both in & out (turnover)
              const statusMap = {};
              baseRows.forEach((ev) => {
                const id = ev.unit_id;
                if (!statusMap[id]) statusMap[id] = { in: false, out: false };
                if (ev.event_check_in)  statusMap[id].in = true;
                if (ev.event_check_out) statusMap[id].out = true;
              });
              const isTurnover = (id) => !!(statusMap[id]?.in && statusMap[id]?.out);
              const dayRows = baseRows.slice().sort((a, b) => {
                // Check-outs first column
                if (a.event_check_out !== b.event_check_out) return a.event_check_out ? -1 : 1;
                // Within check-ins, promote turnover units to the top
                if (a.event_check_in && b.event_check_in) {
                  const aTurn = isTurnover(a.unit_id);
                  const bTurn = isTurnover(b.unit_id);
                  if (aTurn !== bTurn) return aTurn ? -1 : 1;
                }
                // Then keep the original grouping order between in vs out
                if (a.event_check_in !== b.event_check_in) return a.event_check_in ? 1 : -1;
                // Finally alphabetical by unit name
                return String(a.unit_name || '').localeCompare(String(b.unit_name || ''), undefined, { sensitivity: 'base' });
              });

                if (capturing) {
                  const outs = dayRows.filter((r) => r.event_check_out);
                  const ins  = dayRows.filter((r) => r.event_check_in);
                  const turnoverIds = new Set(
                    outs.map(o => o.unit_id).filter(id => ins.some(i => i.unit_id === id))
                  );
                  // Sort ins: turnover units first, then alphabetically
                  const insSorted = ins.slice().sort((a, b) => {
                    const aTurn = turnoverIds.has(a.unit_id);
                    const bTurn = turnoverIds.has(b.unit_id);
                    if (aTurn !== bTurn) return aTurn ? -1 : 1; // turnover first
                    // fallback: alphabetical by unit name
                    return String(a.unit_name || '').localeCompare(String(b.unit_name || ''), undefined, { sensitivity: 'base' });
                  });
                  return (
                    <div
                      key={`${cityName}-${date}`}
                      style={{
                        position: 'relative',
                        border: '1px solid #e0e0e0',
                        borderRadius: 8,
                        background: '#fff',
                        padding: '14px 8px 8px 8px',
                        minHeight: 110,
                        overflow: 'visible',
                        marginTop: 4
                      }}
                    >
                      {/* Floating date label like desktop cards */}
                      <span
                        style={{
                          position: 'absolute',
                          top: -6,
                          left: 8,
                          fontSize: 10,
                          color: '#818181',
                          background: '#fff',
                          padding: '0 4px',
                          zIndex: 2,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formatDayLabel(date)}
                      </span>

                      {/* Activity: two fixed-width columns so names stay on one line */}
                      <div style={{ display: 'grid', gridTemplateColumns: '180px 180px', columnGap: 24, marginTop: 6 }}>
                        {/* OUTS */}
                        <div>
                          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 4 }}>Check-outs</div>
                          {outs.length === 0 ? (
                            <div style={{ opacity: 0.5 }}>—</div>
                          ) : (
                            outs.map((r, i) => (
                              <div key={`o-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 0' }}>
                                <span style={{ width: 16, height: 16, minWidth: 16, minHeight: 16, flex: '0 0 16px', alignSelf: 'flex-start', marginTop: 1 }}>
                                  {turnoverIds.has(r.unit_id)
                                    ? <ArrowPathIcon style={{ display: 'block', width: 16, height: 16, color: '#e53935' }} />
                                    : <ArrowUpCircleIcon style={{ display: 'block', width: 16, height: 16, color: '#e53935' }} />}
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{r.unit_name}</span>
                                  {(() => {
                                    const n = getEventNote(r);
                                    return n ? <em style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>({n})</em> : null;
                                  })()}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        {/* INS */}
                        <div>
                          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 4 }}>Check-ins</div>
                          {ins.length === 0 ? (
                            <div style={{ opacity: 0.5 }}>—</div>
                          ) : (
                            insSorted.map((r, i) => {
                              const idle = getIdleDays(r);
                              const isIdle = idle != null && idle > 5;
                              return (
                                <div key={`i-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 0' }}>
                                  <span style={{ width: 16, height: 16, minWidth: 16, minHeight: 16, flex: '0 0 16px', alignSelf: 'flex-start', marginTop: 1 }}>
                                    {turnoverIds.has(r.unit_id)
                                      ? <ArrowPathIcon style={{ display: 'block', width: 16, height: 16, color: '#43a047' }} />
                                      : <ArrowDownCircleIcon style={{ display: 'block', width: 16, height: 16, color: isIdle ? '#FFB300' : '#43a047' }} />}
                                  </span>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
                                      {r.unit_name}
                                      {(isIdle && !turnoverIds.has(r.unit_id)) ? <em style={{ marginLeft: 6, opacity: 0.6, fontSize: 12 }}>({idle}d)</em> : null}
                                    </span>
                                    {(() => {
                                      const n = getEventNote(r);
                                      return n ? <em style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>({n})</em> : null;
                                    })()}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

              // ===== Non-capturing: existing per-card layout =====
              const dayUnitStatus = statusMap;
              return (
                <div
                  key={`${cityName}-${date}`}
                  style={{
                    position: 'relative',
                    border: '1px solid #e0e0e0',
                    borderRadius: 8,
                    background: '#fff',
                    padding: '14px 6px 6px 6px',
                    minHeight: 110,
                    overflow: 'visible',
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: -6,
                      left: 8,
                      fontSize: 10,
                      color: '#818181',
                      background: '#fff',
                      padding: '0 4px',
                      zIndex: 2,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {formatDayLabel(date)}
                  </span>
                  {dayRows.length === 0 ? (
                    <div style={{ opacity: 0.5, fontSize: 13 }}>No activity</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {dayRows.map((r, idx) => {
                        const isDone = r?.hk?.status === 'done';
                        const idle = getIdleDays(r);
                        const isIdle = idle != null && idle > 5;
                        const isTurnover = !!(dayUnitStatus[r.unit_id]?.in && dayUnitStatus[r.unit_id]?.out);
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 4
                            }}
                          >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span aria-label={r.type} style={{ width: 16, height: 16, minWidth: 16, minHeight: 16, flex: '0 0 16px', alignSelf: 'flex-start', marginTop: 1 }}>
                        {(dayUnitStatus[r.unit_id]?.in && dayUnitStatus[r.unit_id]?.out) ? (
                          r.event_check_out ? (
                            <ArrowPathIcon style={{ display: 'block', width: 16, height: 16, color: '#e53935' }} />
                          ) : r.event_check_in ? (
                            <ArrowPathIcon style={{ display: 'block', width: 16, height: 16, color: '#43a047' }} />
                          ) : (
                            <ArrowPathIcon style={{ display: 'block', width: 16, height: 16, color: '#888888' }} />
                          )
                        ) : r.event_check_out ? (
                          <ArrowUpCircleIcon style={{ display: 'block', width: 16, height: 16, color: '#e53935' }} />
                        ) : r.event_check_in ? (
                          <ArrowDownCircleIcon style={{ display: 'block', width: 16, height: 16, color: (!isTurnover && isIdle) ? '#FFB300' : '#43a047' }} />
                        ) : (
                          <span>•</span>
                        )}
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
                        <span>
                          {r.unit_name}
                          {r.event_check_in && isIdle && !isTurnover ? <em style={{ marginLeft: 6, opacity: 0.55, fontSize: 11 }}>({idle}d)</em> : null}
                        </span>
                        {(() => {
                          const n = getEventNote(r);
                          return n ? <em style={{ opacity: 0.55, fontSize: 11 }}>({n})</em> : null;
                        })()}
                      </div>
                    </div>
                            {r.event_check_out ? (
                              <span title={isDone ? 'Cleaning done' : `Mark cleaning done for ${r.unit_name} (${r.check_out})`}>
                                {(() => {
                                  const key = makeKey(r.unit_id, r.check_out);
                                  const isBusy = !!pending[key];
                                  if (isDone) {
                                    return (
                                      <CheckIcon style={{ width: 18, height: 18, color: '#2e7d32' }} />
                                    );
                                  }
                                  return (
                                    <input
                                      type="checkbox"
                                      checked={false}
                                      disabled={isBusy}
                                      onChange={() => { if (!isBusy) createCleaningForRow(r); }}
                                      style={{ width: 16, height: 16, cursor: isBusy ? 'not-allowed' : 'pointer' }}
                                      aria-label={`Mark cleaning done for ${r.unit_name} (${r.check_out})`}
                                    />
                                  );
                                })()}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppShell title="Check-ins & Check-outs">
      <Page title="Check-ins & Check-outs">
        <div
          ref={exportRef}
          style={
            capturing
              ? { maxWidth: 420, margin: '0 auto', paddingLeft: 12, paddingRight: 8 }
              : undefined
          }
        >
          {/* Filters (hidden during capture) */}
          <div
            style={{
              display: capturing ? 'none' : 'grid',
              marginTop: 6,
              gridTemplateColumns: 'repeat(auto-fit, 140px)',
              justifyContent: 'start',
              gap: 12,
              alignItems: 'end'
            }}
          >
            {/* Start */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  height: 37,
                  padding: '0 8px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <input
                  type="date"
                  value={start}
                  onChange={(e) => handleStartChange(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    height: '100%',
                    background: 'transparent',
                    lineHeight: 'normal'
                  }}
                />
              </div>
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  left: 10,
                  fontSize: 11,
                  color: '#818181',
                  background: '#fff',
                  padding: '0 4px'
                }}
              >
                Start
              </span>
            </div>

            {/* End */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  height: 37,
                  padding: '0 8px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    height: '100%',
                    background: 'transparent',
                    lineHeight: 'normal'
                  }}
                />
              </div>
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  left: 10,
                  fontSize: 11,
                  color: '#818181',
                  background: '#fff',
                  padding: '0 4px'
                }}
              >
                End
              </span>
            </div>

            {/* City */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  height: 37,
                  padding: '0 30px 0 8px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  position: 'relative'
                }}
              >
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    height: '100%',
                    background: 'transparent',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    appearance: 'none',
                    lineHeight: 'normal'
                  }}
                >
                  <option value="">All</option>
                  <option value="Playa del Carmen">Playa del Carmen</option>
                  <option value="Tulum">Tulum</option>
                </select>
                <span
                  style={{
                    position: 'absolute',
                    right: 10,
                    pointerEvents: 'none',
                    fontSize: 14,
                    color: '#666'
                  }}
                >
                  ▼
                </span>
              </div>
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  left: 10,
                  fontSize: 11,
                  color: '#818181',
                  background: '#fff',
                  padding: '0 4px'
                }}
              >
                City
              </span>
            </div>

              <div style={{ display: capturing ? 'none' : 'flex', gap: 8, alignItems: 'end' }}>
                <button
                  onClick={fetchData}
                  disabled={!start || !end}
                  style={{
                    height: 37,
                    padding: '0 12px',
                    border: '1px solid teal',
                    borderRadius: 6,
                    background: 'transparent',
                    color: 'teal',
                    cursor: (!start || !end) ? 'not-allowed' : 'pointer',
                    opacity: (!start || !end) ? 0.5 : 1,
                  }}
                >
                  Show
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setStart('');
                    setEnd('');
                    setCity('');
                    setRows([]);
                    clearSelection();
                  }}
                  style={{ height: 37 }}
                >
                  Clear
                </button>
                <button
                  onClick={exportAsImage}
                  style={{
                    height: 37,
                    padding: '0 12px',
                    border: '1px solid #1976d2',
                    borderRadius: 6,
                    background: 'transparent',
                    color: '#1976d2',
                    cursor: exportRef ? 'pointer' : 'not-allowed'
                  }}
                >
                  Export
                </button>
              </div>
            </div>

          {(!city || city === 'Playa del Carmen') && (
            <div
              style={
                capturing
                  ? { marginTop: 12, marginBottom: 12, padding: 0 }
                  : {
                      marginTop: 20,
                      marginBottom: 20,
                      padding: 12,
                      border: '1px dashed #d3d3d3',
                      borderRadius: 8,
                    }
              }
            >
              {renderCityRow('Playa del Carmen')}
            </div>
          )}

          {(!city || city === 'Tulum') && (
            <div
              style={
                capturing
                  ? { marginTop: 12, marginBottom: 12, padding: 0 }
                  : {
                      marginTop: 20,
                      marginBottom: 20,
                      padding: 12,
                      border: '1px dashed #d3d3d3',
                      borderRadius: 8,
                    }
              }
            >
              {renderCityRow('Tulum')}
            </div>
          )}
        </div>
      </Page>
    </AppShell>
  );
};

export default CheckInOutView;