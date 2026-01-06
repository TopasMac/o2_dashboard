import React, { useState, useEffect, useMemo } from 'react';
import api from '../../api';

// ---------- Helpers ----------
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDdMonYy = (d) => `${String(d.getDate()).padStart(2,'0')}-${MONTH_ABBR[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
const toLower = (v) => (v == null ? '' : String(v).toLowerCase());

// Returns YYYY-MM-DD string for date in given IANA timezone (default: Cancún)
const ymdInTz = (d, tz = 'America/Cancun') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const parseYmd = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(s); // fallback for unexpected formats
  const [, y, mo, d] = m;
  // Construct a local date (no time) to avoid UTC timezone shifts
  return new Date(Number(y), Number(mo) - 1, Number(d));
};


function formatGuestName(name) {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function deriveUnitName(b) {
  const direct = b.unitName || b.unit_name || b.listingName || b.propertyName || b.rentalName || b.apartmentName || b.roomName;
  if (direct) return direct;
  const nested =
    b.unit?.name || b.unit?.title || b.unit?.displayName ||
    b.listing?.name || b.listing?.title ||
    b.property?.name || b.property?.title ||
    b.rental?.name || b.rental?.title ||
    b.apartment?.name || b.apartment?.title ||
    b.room?.name || b.room?.title;
  if (nested) return nested;
  return '';
}

// ---------- Source Icons ----------
function AirbnbIcon({ size = 20 }) {
  return (
    <img
      src="/images/airbnb.png"
      alt="Airbnb"
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain', marginTop: '-2px' }}
    />
  );
}
function PrivateIcon({ size = 20 }) {
  return (
    <img
      src="/images/o2icon.svg"
      alt="Private"
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain' }}
    />
  );
}
function SourceTag({ source }) {
  if (!source) return null;
  if (toLower(source) === 'airbnb') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', verticalAlign: 'middle' }} title="Airbnb" aria-label="Airbnb">
        <AirbnbIcon size={16} />
      </span>
    );
  }
  if (toLower(source) === 'private') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', verticalAlign: 'middle' }} title="Private" aria-label="Private">
        <PrivateIcon size={16} />
      </span>
    );
  }
  return <span>{source}</span>;
}


// ---------- City normalization helper ----------
function normalizeCityBucket(city) {
  if (!city) return null;
  const lc = toLower(city);
  if (lc.includes('playa')) return 'playa';
  if (lc.includes('tulum')) return 'tulum';
  return null;
}

// ---------- Component ----------
export default function ActivityCard() {
  // Stable today and window
  const today = useMemo(() => toDateOnly(new Date()), []);
  const windowFrom = useMemo(() => addDays(today, -1), [today]);
  const windowTo = useMemo(() => addDays(today, 2), [today]);

  const [day, setDay] = useState(today);
  const goPrevDay = () =>
    setDay(prev => {
      const next = addDays(prev, -1);
      return next < windowFrom ? prev : next;
    });
  const goNextDay = () =>
    setDay(prev => {
      const next = addDays(prev, 1);
      return next > windowTo ? prev : next;
    });
  const goToday = () => setDay(today);

  const titleDate = fmtDdMonYy(day);
  const isToday = today.getTime() === day.getTime();
  const titlePrefix = isToday ? 'Actividad Hoy' : 'Actividad';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupedDays, setGroupedDays] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadWindow() {
      setLoading(true);
      setError(null);
      try {
        const startStr = ymdInTz(windowFrom);
        const endStr = ymdInTz(windowTo);
        const { data } = await api.get('/api/bookings/check-activity', {
          params: { start: startStr, end: endStr },
        });

        if (cancelled) return;

        // Initialize empty structure for each day in window
        const days = {};
        let cursor = windowFrom;
        while (cursor <= windowTo) {
          const key = ymdInTz(cursor);
          days[key] = {
            playa: { checkIns: [], checkOuts: [] },
            tulum: { checkIns: [], checkOuts: [] },
          };
          cursor = addDays(cursor, 1);
        }

        const rows = Array.isArray(data) ? data : [];

        rows.forEach(row => {
          const cityKey = normalizeCityBucket(row.city);
          if (!cityKey) return;

          // Check-in event
          if (row.event_check_in && row.check_in) {
            const key = String(row.check_in).slice(0, 10);
            if (days[key]) {
              days[key][cityKey].checkIns.push({
                id: row.id,
                unitName: row.unit_name || deriveUnitName(row) || '',
                guestName: row.guest || row.guest_name || '',
                source: row.source ?? null,
                notes: row.notes || '',
                checkInNotes: row.check_in_notes || row.checkInNotes || '',
                checkOutNotes: null,
              });
            }
          }

          // Check-out event
          if (row.event_check_out && row.check_out) {
            const key = String(row.check_out).slice(0, 10);
            if (days[key]) {
              days[key][cityKey].checkOuts.push({
                id: row.id,
                unitName: row.unit_name || deriveUnitName(row) || '',
                guestName: row.guest || row.guest_name || '',
                source: row.source ?? null,
                notes: row.notes || '',
                checkInNotes: null,
                checkOutNotes: row.check_out_notes || row.checkOutNotes || '',
              });
            }
          }
        });

        // Sort each bucket for consistent display
        Object.values(days).forEach(dayObj => {
          ['playa', 'tulum'].forEach(cityKey => {
            ['checkIns', 'checkOuts'].forEach(kind => {
              dayObj[cityKey][kind].sort((a, b) => {
                const u1 = a.unitName || '';
                const u2 = b.unitName || '';
                const cmp = u1.localeCompare(u2);
                if (cmp !== 0) return cmp;
                const g1 = a.guestName || '';
                const g2 = b.guestName || '';
                return g1.localeCompare(g2);
              });
            });
          });
        });

        setGroupedDays(days);
      } catch (e) {
        console.error(e);
        setError(e?.message || 'Error cargando actividad.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadWindow();

    return () => {
      cancelled = true;
    };
  }, [windowFrom, windowTo]);

  // Compute today's arrays from groupedDays
  const currentKey = ymdInTz(day);
  const current = groupedDays[currentKey] || {
    playa: { checkIns: [], checkOuts: [] },
    tulum: { checkIns: [], checkOuts: [] },
  };

  const todayCheckins = current.playa.checkIns;
  const todayCheckouts = current.playa.checkOuts;
  const todayCheckinsTulum = current.tulum.checkIns;
  const todayCheckoutsTulum = current.tulum.checkOuts;

  // Alignment helpers: ensure CheckIn/CheckOut subtitles line up across columns
  const ACT_ROW_H = 40;
  const maxInRows = Math.max(todayCheckins.length, todayCheckinsTulum.length);
  const maxOutRows = Math.max(todayCheckouts.length, todayCheckoutsTulum.length);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '720px',
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      }}
    >
      {/* Header with date controls */}
      <div style={{ borderBottom: '1px solid #eee', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={goPrevDay} disabled={loading} aria-label="Día anterior" title="Día anterior" style={{ background: 'none', border: '1px solid #ddd', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>‹</button>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            {titlePrefix}
            <span style={{ color: 'teal' }}> {titleDate}</span>
          </h2>
          <button onClick={goNextDay} disabled={loading} aria-label="Día siguiente" title="Día siguiente" style={{ background: 'none', border: '1px solid #ddd', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>›</button>
          <button onClick={goToday} disabled={loading || isToday} aria-label="Ir a hoy" title="Ir a hoy" style={{ background: 'none', border: '1px solid teal', padding: '2px 8px', borderRadius: '50%', cursor: 'pointer', marginLeft: 6, color: 'teal' }}>⟳</button>
        </div>
      </div>

      {/* Body: two fixed columns with a vertical teal divider */}
      <div style={{ padding: '12px' }}>
        {loading && <p style={{ color: '#666', margin: 0 }}>Cargando…</p>}
        {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}

        {!loading && !error && (
          <div style={{ position: 'relative' }}>
            {/* Divider with padding and teal color, not touching top/bottom */}
            <div style={{ position: 'absolute', left: '50%', top: 8, bottom: 8, transform: 'translateX(-50%)', padding: '0 6px' }}>
              <div style={{ width: 1, height: '100%', background: 'teal' }} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 0,
              }}
            >
              {/* LEFT: Playa del Carmen */}
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'teal', fontWeight: 600 }}>Playa del Carmen</h3>

                <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#333' }}>CheckIn</h4>
                <div style={{ minHeight: maxInRows * ACT_ROW_H }}>
                  {todayCheckins.length > 0 ? (
                    <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
                      {todayCheckins.map((x, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <div>
                            {toLower(x.source) === 'airbnb' && <AirbnbIcon size={11} />} {' '}
                            <strong>{x.unitName}</strong>{x.guestName ? ` ${formatGuestName(x.guestName)}` : ''}
                          </div>
                          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
                            <span style={{ fontStyle: x.notes ? 'normal' : 'italic' }}>{x.notes || '-'}</span>
                            <span>{' | '}</span>
                            <span style={{ fontStyle: x.checkInNotes ? 'normal' : 'italic' }}>{x.checkInNotes || '-'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <em style={{ color: '#666' }}>No hay entradas hoy</em>
                  )}
                </div>

                <h4 style={{ margin: '12px 0 6px 0', fontSize: 13, color: '#333' }}>CheckOut</h4>
                <div style={{ minHeight: maxOutRows * ACT_ROW_H }}>
                  {todayCheckouts.length > 0 ? (
                    <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
                      {todayCheckouts.map((x, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <div>
                            {toLower(x.source) === 'airbnb' && <AirbnbIcon size={11} />} {' '}
                            <strong>{x.unitName}</strong>{x.guestName ? ` ${formatGuestName(x.guestName)}` : ''}
                          </div>
                          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
                            <span style={{ fontStyle: x.notes ? 'normal' : 'italic' }}>{x.notes || '-'}</span>
                            <span>{' | '}</span>
                            <span style={{ fontStyle: x.checkOutNotes ? 'normal' : 'italic' }}>{x.checkOutNotes || '-'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <em style={{ color: '#666' }}>No hay salidas hoy</em>
                  )}
                </div>
              </div>

              {/* RIGHT: Tulum */}
              <div style={{ paddingLeft: '12px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'teal', fontWeight: 600 }}>Tulum</h3>

                <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#333' }}>CheckIn</h4>
                <div style={{ minHeight: maxInRows * ACT_ROW_H }}>
                  {todayCheckinsTulum.length > 0 ? (
                    <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
                      {todayCheckinsTulum.map((x, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <div>
                            {toLower(x.source) === 'airbnb' && <AirbnbIcon size={11} />} {' '}
                            <strong>{x.unitName}</strong>{x.guestName ? ` ${formatGuestName(x.guestName)}` : ''}
                          </div>
                          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
                            <span style={{ fontStyle: x.notes ? 'normal' : 'italic' }}>{x.notes || '-'}</span>
                            <span>{' | '}</span>
                            <span style={{ fontStyle: x.checkInNotes ? 'normal' : 'italic' }}>{x.checkInNotes || '-'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <em style={{ color: '#666' }}>No hay entradas hoy</em>
                  )}
                </div>

                <h4 style={{ margin: '12px 0 6px 0', fontSize: 13, color: '#333' }}>CheckOut</h4>
                <div style={{ minHeight: maxOutRows * ACT_ROW_H }}>
                  {todayCheckoutsTulum.length > 0 ? (
                    <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
                      {todayCheckoutsTulum.map((x, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <div>
                            {toLower(x.source) === 'airbnb' && <AirbnbIcon size={11} />} {' '}
                            <strong>{x.unitName}</strong>{x.guestName ? ` ${formatGuestName(x.guestName)}` : ''}
                          </div>
                          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
                            <span style={{ fontStyle: x.notes ? 'normal' : 'italic' }}>{x.notes || '-'}</span>
                            <span>{' | '}</span>
                            <span style={{ fontStyle: x.checkOutNotes ? 'normal' : 'italic' }}>{x.checkOutNotes || '-'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <em style={{ color: '#666' }}>No hay salidas hoy</em>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
