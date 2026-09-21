import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  SparklesIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';
import api from '../../api';
import { getCleaningTypeLabel } from '../../mobile/cleaningsModel';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_ABBR = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
const ACTIVITY_ROW_STYLE = {
  background: '#fbfdfd',
  border: '1px solid #dce6e7',
  borderRadius: 10,
  padding: '8px 10px',
  overflowWrap: 'anywhere',
};

const toDateOnly = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const formatYmdInCancun = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Cancun',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);
const formatShortDate = (date) => `${String(date.getDate()).padStart(2, '0')}-${MONTH_ABBR[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
const toLower = (value) => (value == null ? '' : String(value).toLowerCase());

function parseYmd(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatYmd(value) {
  const date = parseYmd(value);
  return date ? formatShortDate(date) : '-';
}

function calculateNights(checkIn, checkOut) {
  const start = parseYmd(checkIn);
  const end = parseYmd(checkOut);
  if (!start || !end) return null;
  const nights = Math.round((end.getTime() - start.getTime()) / 86400000);
  return nights >= 0 ? nights : null;
}

function normalizeCityBucket(city) {
  const normalized = toLower(city);
  if (normalized.includes('playa')) return 'playa';
  if (normalized.includes('tulum')) return 'tulum';
  return null;
}

function deriveUnitName(row) {
  return row.unit_name
    || row.unitName
    || row.unit?.name
    || row.listingName
    || row.propertyName
    || '';
}

function formatGuestName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function isPrivateReservation(source) {
  return ['private', 'owners2'].includes(toLower(source));
}

function isManualCleaning(row) {
  const cleaningType = toLower(row.hk_cleaning_type ?? row.hk?.cleaningType).replaceAll('_', '-');
  return Boolean(row.event_cleaning_only && row.service_date && !['checkout', 'owner'].includes(cleaningType));
}

function AirbnbIcon() {
  return <img src="/images/airbnb.png" alt="Airbnb" title="Airbnb" style={{ width: 20, height: 20, objectFit: 'contain' }} />;
}

function HausInIcon() {
  return <img src="/branding/hausin/icon-512x512.png" alt="HausIn" title="HausIn" style={{ width: 20, height: 20, objectFit: 'contain' }} />;
}

function ReservationSourceIcon({ source }) {
  if (toLower(source) === 'airbnb') return <AirbnbIcon />;
  if (isPrivateReservation(source)) return <HausInIcon />;
  return null;
}

function CleaningStatusIcon({ status }) {
  const normalizedStatus = toLower(status || 'pending');
  if (normalizedStatus === 'cancelled') {
    return <XCircleIcon title="Cancelled" style={{ width: 24, height: 24, color: '#ef5565' }} />;
  }
  if (normalizedStatus === 'done') {
    return <CheckCircleIcon title="Done" style={{ width: 24, height: 24, color: '#2f8f62' }} />;
  }
  return <ClockIcon title="Pending" style={{ width: 24, height: 24, color: '#e99b00' }} />;
}

function ActivitySection({ icon, iconColor, title, items, emptyMessage, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#061825' }}>
        <span style={{ width: 24, height: 24, color: iconColor, display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
        <strong style={{ fontSize: 15 }}>{title}</strong>
        <span style={{ color: '#65717b', fontSize: 14 }}>({items.length})</span>
      </div>
      {items.length > 0 ? children : (
        <div style={{ ...ACTIVITY_ROW_STYLE, color: '#7b858d', fontSize: 13, fontStyle: 'italic', minHeight: 42, display: 'flex', alignItems: 'center' }}>
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

function ReservationRow({ item, type }) {
  return (
    <div style={{ ...ACTIVITY_ROW_STYLE, display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 8 }}>
      <div style={{ paddingTop: 2 }}><ReservationSourceIcon source={item.source} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#071825', fontSize: 14, lineHeight: 1.25 }}>
          <strong>{item.unitName}</strong>
        </div>
        <div style={{ color: '#4c5964', fontSize: 13, marginTop: 2 }}>{formatGuestName(item.guestName) || '-'}</div>
        {type === 'checkIn' ? (
          <>
            <div style={{ color: '#65717b', fontSize: 12, marginTop: 4 }}>
              Check-out: {formatYmd(item.checkOut)}{item.nights != null ? ` (${item.nights} noches)` : ''}
            </div>
            <div style={{ color: '#65717b', fontSize: 12, marginTop: 4 }}><strong>Notas:</strong> {item.notes || '-'}</div>
            <div style={{ color: '#65717b', fontSize: 12, marginTop: 2 }}><strong>Notas CheckIn:</strong> {item.checkInNotes || '-'}</div>
          </>
        ) : (
          <>
            <div style={{ color: '#65717b', fontSize: 12, marginTop: 4 }}><strong>Notas CheckOut:</strong> {item.checkOutNotes || '-'}</div>
            <div style={{ color: '#65717b', fontSize: 12, marginTop: 2 }}><strong>Notas Limpieza:</strong> {item.cleanerNotes || '-'}</div>
          </>
        )}
      </div>
    </div>
  );
}

function CleaningRow({ item }) {
  return (
    <div style={{ ...ACTIVITY_ROW_STYLE, display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 8 }}>
      <div style={{ paddingTop: 1 }}><CleaningStatusIcon status={item.status} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#071825', fontSize: 14, lineHeight: 1.25 }}>
          <strong>{item.unitName}</strong>{item.cleaningType ? <span style={{ color: '#4c5964', marginLeft: 8 }}>{item.cleaningType}</span> : null}
        </div>
        <div style={{ color: '#65717b', fontSize: 12, marginTop: 4 }}>{item.notes || '-'}</div>
        <div style={{ color: '#65717b', fontSize: 12, marginTop: 2 }}><strong>Notas:</strong> {item.cleanerNotes || '-'}</div>
      </div>
    </div>
  );
}

function CityActivityPanel({ cityName, activity }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h3 style={{ margin: 0, color: '#087f80', fontSize: 17 }}>{cityName}</h3>
      <ActivitySection
        icon={<ArrowRightIcon style={{ width: 24, height: 24 }} />}
        iconColor="#087f80"
        title="CheckIn"
        items={activity.checkIns}
        emptyMessage="No hay entradas hoy"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activity.checkIns.map((item) => <ReservationRow key={`in-${item.id}`} item={item} type="checkIn" />)}
        </div>
      </ActivitySection>
      <ActivitySection
        icon={<ArrowLeftIcon style={{ width: 24, height: 24 }} />}
        iconColor="#ef5565"
        title="CheckOut"
        items={activity.checkOuts}
        emptyMessage="No hay salidas hoy"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activity.checkOuts.map((item) => <ReservationRow key={`out-${item.id}`} item={item} type="checkOut" />)}
        </div>
      </ActivitySection>
      <ActivitySection
        icon={<SparklesIcon style={{ width: 24, height: 24 }} />}
        iconColor="#e99b00"
        title="Limpiezas"
        items={activity.cleanings}
        emptyMessage="No hay limpiezas manuales hoy"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activity.cleanings.map((item) => <CleaningRow key={`cleaning-${item.id}`} item={item} />)}
        </div>
      </ActivitySection>
    </div>
  );
}

export default function ActivityCard() {
  const today = useMemo(() => toDateOnly(new Date()), []);
  const windowFrom = useMemo(() => addDays(today, -1), [today]);
  const windowTo = useMemo(() => addDays(today, 3), [today]);
  const dateOptions = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(windowFrom, index)), [windowFrom]);
  const [day, setDay] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupedDays, setGroupedDays] = useState({});

  const currentKey = formatYmdInCancun(day);
  const isToday = formatYmdInCancun(day) === formatYmdInCancun(today);
  const canGoPrevious = day.getTime() > windowFrom.getTime();
  const canGoNext = day.getTime() < windowTo.getTime();

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get('/api/bookings/check-activity', {
          params: { start: formatYmdInCancun(windowFrom), end: formatYmdInCancun(windowTo) },
        });
        if (cancelled) return;

        const days = {};
        dateOptions.forEach((date) => {
          days[formatYmdInCancun(date)] = {
            playa: { checkIns: [], checkOuts: [], cleanings: [] },
            tulum: { checkIns: [], checkOuts: [], cleanings: [] },
          };
        });

        (Array.isArray(data) ? data : []).forEach((row) => {
          const cityKey = normalizeCityBucket(row.city || row.unitCity);
          if (!cityKey) return;

          if (row.event_check_in && row.check_in) {
            const key = String(row.check_in).slice(0, 10);
            if (days[key]) {
              days[key][cityKey].checkIns.push({
                id: row.id,
                unitName: deriveUnitName(row),
                guestName: row.guest || row.guest_name || '',
                source: row.source || '',
                checkIn: row.check_in,
                checkOut: row.check_out,
                nights: calculateNights(row.check_in, row.check_out),
                notes: row.notes || '',
                checkInNotes: row.check_in_notes || row.checkInNotes || '',
              });
            }
          }

          if (row.event_check_out && row.check_out) {
            const key = String(row.check_out).slice(0, 10);
            if (days[key]) {
              days[key][cityKey].checkOuts.push({
                id: row.id,
                unitName: deriveUnitName(row),
                guestName: row.guest || row.guest_name || '',
                source: row.source || '',
                checkOut: row.check_out,
                checkOutNotes: row.check_out_notes || row.checkOutNotes || '',
                cleanerNotes: row.cleaner_notes ?? row.checklist_cleaning_notes ?? '',
              });
            }
          }

          if (isManualCleaning(row)) {
            const key = String(row.service_date).slice(0, 10);
            if (days[key]) {
              days[key][cityKey].cleanings.push({
                id: row.hk_cleaning_id ?? row.hk?.id,
                unitName: deriveUnitName(row),
                cleaningType: getCleaningTypeLabel(row.hk_cleaning_type ?? row.hk?.cleaningType ?? ''),
                notes: row.cleaning_notes ?? row.hk?.cleaningNotes ?? '',
                cleanerNotes: row.cleaner_notes ?? row.checklist_cleaning_notes ?? '',
                status: row.hk_status ?? row.hk?.status ?? 'pending',
              });
            }
          }
        });

        Object.values(days).forEach((cityDays) => {
          Object.values(cityDays).forEach((cityActivity) => {
            Object.values(cityActivity).forEach((items) => {
              items.sort((a, b) => (a.unitName || '').localeCompare(b.unitName || '', undefined, { sensitivity: 'base' }));
            });
          });
        });

        setGroupedDays(days);
      } catch (requestError) {
        console.error(requestError);
        setError(requestError?.message || 'Error cargando actividad.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadActivity();
    return () => { cancelled = true; };
  }, [dateOptions, windowFrom, windowTo]);

  const emptyActivity = { checkIns: [], checkOuts: [], cleanings: [] };
  const current = groupedDays[currentKey] || { playa: emptyActivity, tulum: emptyActivity };
  const totalCheckIns = current.playa.checkIns.length + current.tulum.checkIns.length;
  const totalCheckOuts = current.playa.checkOuts.length + current.tulum.checkOuts.length;
  const totalCleanings = current.playa.cleanings.length + current.tulum.cleanings.length;
  const turnoverUnits = new Set(
    ['playa', 'tulum'].flatMap((city) => {
      const checkIns = new Set(current[city].checkIns.map((item) => item.unitName));
      return current[city].checkOuts.filter((item) => checkIns.has(item.unitName)).map((item) => `${city}-${item.unitName}`);
    }),
  ).size;

  const goPrevious = () => canGoPrevious && setDay((currentDay) => addDays(currentDay, -1));
  const goNext = () => canGoNext && setDay((currentDay) => addDays(currentDay, 1));

  return (
    <div style={{ width: '100%', border: '1px solid #dce6e7', borderRadius: 16, background: '#fff', boxShadow: '0 2px 8px rgba(6, 24, 37, 0.06)', padding: 14, boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ margin: 0, color: '#061825', fontSize: 21, lineHeight: 1.1 }}>
          {isToday ? 'Actividad hoy' : 'Actividad'} <span style={{ color: '#087f80' }}>{formatShortDate(day)}</span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: '1 1 325px', justifyContent: 'center' }}>
          <button type="button" onClick={goPrevious} disabled={!canGoPrevious || loading} aria-label="Día anterior" style={{ ...dateButtonStyle, opacity: canGoPrevious ? 1 : 0.4 }}><ArrowLeftIcon style={{ width: 18, height: 18 }} /></button>
          {dateOptions.map((date) => {
            const selected = formatYmdInCancun(date) === currentKey;
            return (
              <button
                key={formatYmdInCancun(date)}
                type="button"
                onClick={() => setDay(date)}
                disabled={loading}
                style={{ ...dateButtonStyle, width: 49, height: 49, flexDirection: 'column', background: selected ? '#087f80' : '#f7fafa', color: selected ? '#fff' : '#4c5964', borderColor: selected ? '#087f80' : '#dce6e7' }}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>{WEEKDAY_ABBR[date.getDay()]}</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{date.getDate()}</span>
              </button>
            );
          })}
          <button type="button" onClick={goNext} disabled={!canGoNext || loading} aria-label="Día siguiente" style={{ ...dateButtonStyle, opacity: canGoNext ? 1 : 0.4 }}><ArrowRightIcon style={{ width: 18, height: 18 }} /></button>
        </div>
        <button type="button" onClick={() => setDay(today)} disabled={loading || isToday} aria-label="Ir a hoy" title="Ir a hoy" style={{ ...dateButtonStyle, borderRadius: '50%', borderColor: '#087f80', color: '#087f80', opacity: isToday ? 0.4 : 1 }}><ArrowPathIcon style={{ width: 19, height: 19 }} /></button>
      </header>

      {loading && <p style={{ color: '#65717b', margin: 0 }}>Cargando actividad...</p>}
      {error && <p style={{ color: '#c62828', margin: 0 }}>{error}</p>}

      {!loading && !error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(80px, 1fr))', border: '1px solid #dce6e7', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
            <ActivityTotal icon={<ArrowPathIcon />} color="#087f80" value={turnoverUnits} label="Cambios" />
            <ActivityTotal icon={<ArrowRightIcon />} color="#087f80" value={totalCheckIns} label="Entradas" />
            <ActivityTotal icon={<ArrowLeftIcon />} color="#ef5565" value={totalCheckOuts} label="Salidas" />
            <ActivityTotal icon={<SparklesIcon />} color="#e99b00" value={totalCleanings} label="Limpiezas" />
          </div>
          <div style={{ border: '1px solid #dce6e7', borderRadius: 12, padding: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
              <CityActivityPanel cityName="Playa del Carmen" activity={current.playa} />
              <div style={{ minWidth: 0, borderLeft: '2px solid #8bcacb', paddingLeft: 20 }}>
                <CityActivityPanel cityName="Tulum" activity={current.tulum} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ActivityTotal({ icon, color, value, label }) {
  return (
    <div style={{ minWidth: 0, padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #dce6e7' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color }}>
        <span style={{ width: 21, height: 21 }}>{React.cloneElement(icon, { style: { width: 21, height: 21 } })}</span>
        <strong style={{ color: '#061825', fontSize: 20 }}>{value}</strong>
      </div>
      <div style={{ color: '#65717b', fontSize: 12, marginTop: 3 }}>{label}</div>
    </div>
  );
}

const dateButtonStyle = {
  width: 38,
  height: 38,
  border: '1px solid #dce6e7',
  borderRadius: 9,
  background: '#fff',
  color: '#061825',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
