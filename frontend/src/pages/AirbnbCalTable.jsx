// frontend/src/pages/AirbnbCalTable.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import AppDrawer from '../components/common/AppDrawer';
import BookingEditFormRHF from '../components/forms/BookingEditFormRHF';
import { fetchIcalReconcile } from '../api/ical';
import { getBooking, updateBooking } from '../api/bookings';
import TableLite from '../components/layout/TableLite';
import '../components/layouts/DataTable.css';
import { buildBanner, buildInitialValues, buildFormUXFlags } from '../adapters/bookingEdit.ts';
import PageScaffold from '../components/layout/PageScaffold';
import { Button, Stack, Typography, TextField, FormControlLabel, Switch, MenuItem } from '@mui/material';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';
import { useLocation, useNavigate } from 'react-router-dom';

// Retrieve JWT from local/session storage for API calls
function getAuthToken() {
  const keys = ['jwt', 'token', 'authToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

function Pill({ label, value, tone = 'default' }) {
  const bg = tone === 'ok' ? '#e6ffed' : tone === 'warn' ? '#fff4e5' : tone === 'info' ? '#e5f0ff' : '#f2f2f2';
  const color = tone === 'ok' ? '#0a7a2a' : tone === 'warn' ? '#8a4d00' : tone === 'info' ? '#0b4bb3' : '#333';
  const style = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: bg, color, fontSize: 13, fontWeight: 600 };
  return (
    <span style={style}>
      <span>{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function SummaryBar({ data, lastSync }) {
  const { processed = 0, matched = 0, conflicts = 0, suspected_cancelled = 0 } = data || {};
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 16px' }}>
      <Pill label="Processed" value={processed} tone="info" />
      <Pill label="Matched" value={matched} tone="ok" />
      <Pill label="Conflicts" value={conflicts} tone="warn" />
      <Pill label="Suspected cancelled" value={suspected_cancelled} tone="warn" />
      {lastSync ? (
        <span
          style={{
            padding: '6px 10px',
            background: '#eef2ff',
            color: '#1e40af',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1
          }}
        >
          {lastSync}
        </span>
      ) : null}
    </div>
  );
}

export default function AirbnbCalTable() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const minYearMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // previous month
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`; // YYYY-MM
  }, []);
  const location = useLocation();
  const navigate = useNavigate();

  const [deepLinkBookingId, setDeepLinkBookingId] = useState(null);
  const [backPath, setBackPath] = useState('');
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [unit, setUnit] = useState('');
  // Year-month filter in the form 'YYYY-MM'; empty string means no month selected
  const [yearMonth, setYearMonth] = useState('');
  const [dry, setDry] = useState(false);
  const [onlyConflicts, setOnlyConflicts] = useState(true);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'recent'

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resp, setResp] = useState(null);
  const [meta, setMeta] = useState(null);
  const [applying, setApplying] = useState({}); // id => boolean
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState(null); // holds the selected row for edit
  const [drawerInit, setDrawerInit] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Read deep-link parameters from query string (e.g. ?bookingId=123&from=/manager-dashboard)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || '');
      const bookingIdParam = params.get('bookingId');
      const fromParam = params.get('from');

      if (bookingIdParam) {
        setDeepLinkBookingId(bookingIdParam);
        setDeepLinkHandled(false);
      }
      if (fromParam) {
        setBackPath(fromParam);
      }
    } catch {
      // ignore parsing errors
    }
  }, [location.search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const json = await fetchIcalReconcile({
        unit: unit || undefined,
        dry,
        hideAck: 1, // exclude previously acknowledged items
      });
      setResp(json?.data || null);
      setMeta(json?.meta || null);
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [unit, dry]);

  // --- Robust drawer transition and scroll/refresh fixes ---
  const prevDrawerOpenRef = React.useRef(false);
  const bodyOverflowRef = React.useRef({ overflow: '', overflowX: '', overflowY: '' });

  // Watch drawer open -> close transitions to force a reload even if AppDrawer doesn't call onClose
  useEffect(() => {
    const prev = prevDrawerOpenRef.current;
    if (prev === true && drawerOpen === false) {
      // Drawer was closed — refresh table just in case
      load();
    }
    prevDrawerOpenRef.current = drawerOpen;
  }, [drawerOpen, load]);

  // Defensive: some drawers set body overflow hidden and fail to restore; ensure we restore on close
  useEffect(() => {
    const b = document.body.style;
    if (drawerOpen) {
      // Save current values
      bodyOverflowRef.current = { overflow: b.overflow, overflowX: b.overflowX, overflowY: b.overflowY };
      // Let the drawer manage vertical, but never kill horizontal for the table view
      b.overflowX = 'auto';
    } else {
      // Restore previous values
      const prev = bodyOverflowRef.current;
      if (prev) {
        b.overflow = prev.overflow || '';
        b.overflowX = prev.overflowX || '';
        b.overflowY = prev.overflowY || '';
      } else {
        b.overflow = '';
        b.overflowX = '';
        b.overflowY = '';
      }
    }
    return () => {
      // On unmount, restore
      const prev = bodyOverflowRef.current;
      const b2 = document.body.style;
      b2.overflow = prev.overflow || '';
      b2.overflowX = prev.overflowX || '';
      b2.overflowY = prev.overflowY || '';
    };
  }, [drawerOpen]);
  useEffect(() => {
    let cancelled = false;
    async function fetchOne() {
      if (!drawerOpen || !drawerRow?.bookingId) return;
      try {
        setDrawerLoading(true);
        const data = await getBooking(drawerRow.bookingId);
        if (!cancelled) setDrawerInit(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to fetch booking');
      } finally {
        if (!cancelled) setDrawerLoading(false);
      }
    }
    fetchOne();
    return () => { cancelled = true; };
  }, [drawerOpen, drawerRow]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerRow(null);
    if (backPath) {
      navigate(backPath);
    } else {
      load();
    }
  }, [backPath, navigate, load]);


  const onApply = useCallback((row) => {
    // Always open the drawer for review, regardless of status
    setDrawerRow(row);
    setDrawerOpen(true);
  }, []);

  const acknowledgeAndRefresh = useCallback(async (row) => {
    try {
      if (!row?.bookingId) return;
      const token = getAuthToken();
      const res = await fetch(`/api/ical/ack/${row.bookingId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fingerprint: row?.fingerprint || null }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Failed to acknowledge');
      }
      toast.success('Marked as checked');

      // Close and either navigate back or refresh, depending on deep-link context
      handleCloseDrawer();
    } catch (e) {
      toast.error(e?.message || 'Failed to acknowledge');
    }
  }, [handleCloseDrawer]);

  useEffect(() => {
    load();
  }, [load]);

  const rowsRaw = resp?.items || [];
  const rows = useMemo(() => {
    let working = rowsRaw;

    // Client-side month filter: keep rows whose stay overlaps the selected month
    if (yearMonth) {
      const [yStr, mStr] = yearMonth.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      if (y && m) {
        const monthStart = new Date(y, m - 1, 1).getTime();
        const monthEnd = new Date(y, m, 0).getTime(); // last day of month
        working = rowsRaw.filter((r) => {
          const inTs = parseIsoDate(r.checkIn);
          const outTs = parseIsoDate(r.checkOut);
          if (!inTs || !outTs) return false;
          // overlap logic: stay intersects [monthStart, monthEnd]
          return !(outTs < monthStart || inTs > monthEnd);
        });
      }
    }

    const mapped = working.map((r) => ({
      id: `${r.bookingId}-${r.icalEventId || r.linkedEventId || 'x'}`,
      bookingId: r.bookingId,
      unitId: r.unitId,
      unitName: r.unitName || String(r.unitId || ''),
      city: r.city || '',
      reservationCode: r.reservationCode || '',
      confirmationCode: r.confirmationCode || '',
      matchMethod: r.matchMethod || 'none',
      warnings: Array.isArray(r.warnings) ? r.warnings : [],
      summaryCombined: [...(Array.isArray(r.summary) ? r.summary : []), ...(Array.isArray(r.warnings) ? r.warnings : [])],
      reservationUrl: r.reservationUrl || r.reservation_url || '',
      bookingReservationUrl: r.bookingReservationUrl || r.booking_reservation_url || '',
      icalEventId: r.icalEventId || r.linkedEventId || null,
      guestName: r.guestName || '',
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      // Defensive mapping for iCal dates (handle possible key variants)
      eventDtStart: r.eventDtStart || r.event_start || r.eventDtstart || null,
      eventDtEnd:   r.eventDtEnd   || r.event_end   || r.eventDtend   || null,
      proposedCheckIn: r.proposedCheckIn,
      proposedCheckOut: r.proposedCheckOut,
      diffs: r.diffs || { checkIn: false, checkOut: false },
      summary: Array.isArray(r.summary) ? r.summary : [],
      nights: diffDays(r.checkIn, r.checkOut),
      payout: r.payout ?? null,
      source: r.source || '',
      dateSyncStatus: r.dateSyncStatus || null,
      bookingStatus: r.status || null,
      // Status used by the badge/table filtering:
      // - prioritize bookings that require manual completion (created from iCal with missing details)
      // - otherwise fall back to the reconcile status
      status:
        (String(r.status || '').toLowerCase() === 'needs_details' || String(r.guestName || '') === 'Missing email')
          ? 'needs_details'
          : (r.dateSyncStatus || r.status || 'none'),
      isBlock: !!r.isBlock,
      lastUpdated: r.lastUpdated || r.lastIcalSyncAt || r.bookingUpdatedAt || '',
      lastUpdatedVia: r.lastUpdatedVia || '',
      fingerprint: r.fingerprint || r.fp || null,
    }));
    const base = onlyConflicts
      ? mapped.filter((x) =>
          x.status === 'conflict' ||
          x.status === 'suspected_cancelled' ||
          x.status === 'needs_details'
        )
      : mapped;

    // Sorting by view mode
    const sorted = [...base].sort((a, b) => {
      if (viewMode === 'recent') {
        const ad = parseIsoDate(a.lastUpdated);
        const bd = parseIsoDate(b.lastUpdated);
        return compareDesc(ad || 0, bd || 0);
      }
      // 1) Issues first (conflict, suspected_cancelled, needs_details)
      const aRank = (a.status === 'conflict' || a.status === 'suspected_cancelled' || a.status === 'needs_details') ? 0 : 1;
      const bRank = (b.status === 'conflict' || b.status === 'suspected_cancelled' || b.status === 'needs_details') ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;

      // 2) Selected-month check-ins next
      const aCurr = isInCurrentMonth(a.checkIn, yearMonth) ? 0 : 1;
      const bCurr = isInCurrentMonth(b.checkIn, yearMonth) ? 0 : 1;
      if (aCurr !== bCurr) return aCurr - bCurr;

      // 2a) Within current-month subset: lastUpdated DESC
      if (aCurr === 0 && bCurr === 0) {
        const ad = parseIsoDate(a.lastUpdated);
        const bd = parseIsoDate(b.lastUpdated);
        const p = compareDesc(ad || 0, bd || 0);
        if (p !== 0) return p;
      }

      // 3) Then check-in ASC
      const aIn = parseIsoDate(a.checkIn) || Number.MAX_SAFE_INTEGER;
      const bIn = parseIsoDate(b.checkIn) || Number.MAX_SAFE_INTEGER;
      const p1 = compareAsc(aIn, bIn);
      if (p1 !== 0) return p1;

      // Tie-breakers
      return compareAsc((a.unitName || '').toLowerCase(), (b.unitName || '').toLowerCase());
    });

    return sorted;
  }, [rowsRaw, onlyConflicts, viewMode, yearMonth]);

  // When deep-linked with ?bookingId=..., auto-open the drawer for that row once
  useEffect(() => {
    if (!deepLinkBookingId || deepLinkHandled || !rows || rows.length === 0) return;
    const target = rows.find((r) => String(r.bookingId) === String(deepLinkBookingId));
    if (target) {
      setDrawerRow(target);
      setDrawerOpen(true);
      setDeepLinkHandled(true);
    }
  }, [rows, deepLinkBookingId, deepLinkHandled]);

  const columns = useMemo(() => [
    {
      key: 'unit',
      header: 'Unit',
      title: 'Unit',
      accessor: 'unitName',
      getFilterValue: (row) => {
        const name = row?.unitName || '';
        const city = row?.city || '';
        const cityAlias = city === 'Playa del Carmen' ? 'Playa' : city;
        // Include both full and short city to match either in the autocomplete filter
        return `${name} ${city} ${cityAlias}`.trim();
      },
      width: 140,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.unitName}</div>
          <div style={{ fontSize: 12, color: '#888' }}>#{row.unitId}{row.city ? ` • ${row.city === 'Playa del Carmen' ? 'Playa' : row.city}` : ''}</div>
        </div>
      ),
    },
    {
      key: 'reservation',
      header: 'Reservation',
      title: 'Reservation',
      accessor: 'reservationCode',
      width: 260,
      headerProps: { align: 'center' },
      headerStyle: {
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
      },
      render: (_, row) => {
        const code = row.reservationCode || row.confirmationCode || '';
        const source = row.source || '';
        const sourceLower = String(source).toLowerCase();
        const isAirbnb = sourceLower === 'airbnb';
        const isPrivate = sourceLower === 'private';

        let iconSrc = '/images/o2icon.png';
        let iconAlt = 'Owners2';
        if (isAirbnb) {
          iconSrc = '/images/airbnb.png';
          iconAlt = 'Airbnb';
        } else if (isPrivate) {
          iconSrc = '/images/o2icon.png';
          iconAlt = 'Private';
        }

        const iconSize = 10;
        return (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontWeight: 600 }}>{row?.guestName || '-'}</div>
              <div style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <img
                  src={iconSrc}
                  alt={iconAlt}
                  style={{ width: iconSize, height: iconSize, objectFit: 'contain' }}
                />
                {code ? (
                  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{code}</span>
                ) : '—'}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'dates',
      header: 'Check-In / Out',
      title: 'Check-In / Out',
      accessor: 'checkIn',
      width: 150,
      minWidth: 150,
      align: 'center',
      headerProps: { align: 'center' },
      cellStyle: { textAlign: 'center' },
      render: (_, row) => (
        <div style={{ width: '100%', textAlign: 'center' }}>
          <div>
            {fmtDMY(row.checkIn)}
            {row.diffs?.checkIn && row.proposedCheckIn && (
              <span style={{ marginLeft: 6, color: '#8a4d00' }}>→ {fmtDMY(row.proposedCheckIn)}</span>
            )}
          </div>
          <div style={{ color: '#666', fontSize: 12 }}>
            {fmtDMY(row.checkOut)}
            {row.diffs?.checkOut && row.proposedCheckOut && (
              <span style={{ marginLeft: 6, color: '#8a4d00' }}>→ {fmtDMY(row.proposedCheckOut)}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'ical',
      header: 'iCal Start / End',
      title: 'iCal Start / End',
      accessor: 'eventDtStart',
      width: 150,
      minWidth: 150,
      align: 'center',
      headerProps: { align: 'center' },
      cellStyle: { textAlign: 'center' },
      render: (_, row) => (
        <div style={{ width: '100%', textAlign: 'center' }}>
          <div>{fmtDMY(row.eventDtStart)}</div>
          <div style={{ color: '#666', fontSize: 12 }}>{fmtDMY(row.eventDtEnd)}</div>
        </div>
      ),
    },
    {
      key: 'payout',
      header: 'Payout',
      title: 'Payout',
      accessor: 'payout',
      type: 'currency',
      width: 150,
      minWidth: 150,
      align: 'right',
      headerProps: { align: 'center' },
      headerStyle: {
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
      },
      render: (_, row) => row?.payout != null ? (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(row.payout)}</span>
      ) : '—',
    },
    {
      key: 'status',
      header: 'Status',
      title: 'Status',
      accessor: 'status',
      width: 110,
      headerProps: { align: 'center' },
      headerStyle: {
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
      },
      render: (_, row) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: 0,
            boxSizing: 'border-box',
          }}
        >
          <StatusBadge
            status={row?.status}
            method={row?.matchMethod}
            isBlock={row?.isBlock}
            onClick={() => onApply(row)}
          />
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Summary',
      title: 'Summary',
      accessor: 'summary',
      width: 260,
      render: (_, row) => (
        row.summaryCombined && row.summaryCombined.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {row.summaryCombined.map((line, idx) => (
              <div key={idx} style={{ fontSize: 12, color: '#444' }}>{line}</div>
            ))}
          </div>
        ) : '—'
      ),
    },
    {
      key: 'updated',
      header: 'Last updated',
      title: 'Last updated',
      accessor: 'lastUpdated',
      width: 160,
      render: (_, row) => (
        <div>
          <div style={{ color: '#555', fontVariantNumeric: 'tabular-nums' }}>{fmtDMY(row.lastUpdated)}</div>
          {row.lastUpdatedVia && (
            <div style={{ marginTop: 2, fontSize: 12, background: '#f1f5f9', color: '#334155', display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              {row.lastUpdatedVia}
            </div>
          )}
        </div>
      ),
    },
  ], []);

  const lastSyncLabel = useMemo(() => {
    const m = meta?.icalSyncLastRun;
    if (!m) return null;
    const when = fmtPrettyLocalIso(m.lastRunAtLocal || m.lastRunAt);
    const errs = (typeof m.errors === 'number') ? m.errors : null;
    return `Last iCal Sync: ${when}${errs !== null ? `, ${errs} errors` : ''}`;
  }, [meta]);

  const stickyHeader = (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        px: 2,
        py: 1.5,
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        alignItems: 'center',
        flexWrap: 'nowrap',
        minWidth: 'max-content',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <YearMonthPicker
          label="Month"
          value={yearMonth || ''}
          onChange={(next) => {
            if (!next) {
              setYearMonth('');
              return;
            }
            // Clamp to previous month as the earliest allowed filter
            if (minYearMonth && next < minYearMonth) {
              setYearMonth(minYearMonth);
            } else {
              setYearMonth(next);
            }
          }}
          sx={{ width: 200 }}
        />
        {yearMonth && (
          <Button
            variant="text"
            size="small"
            onClick={() => setYearMonth('')}
          >
            Clear
          </Button>
        )}
      </Stack>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ flexWrap: 'nowrap', alignItems: 'center' }}
      >
        <TextField
          select
          size="small"
          label="View mode"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          sx={{ width: 260 }}
        >
          <MenuItem value="timeline">Timeline (Check-in ASC)</MenuItem>
          <MenuItem value="recent">Recent changes (Last updated DESC)</MenuItem>
        </TextField>
        <FormControlLabel
          control={(
            <Switch
              size="small"
              checked={onlyConflicts}
              onChange={(e) => setOnlyConflicts(e.target.checked)}
            />
          )}
          label="Only conflicts"
        />
        <FormControlLabel
          control={(
            <Switch
              size="small"
              checked={dry}
              onChange={(e) => setDry(e.target.checked)}
            />
          )}
          label="Dry mode"
        />
        <Button
          variant="outlined"
          size="small"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <PageScaffold
      title="Reconcile iCal ↔ Bookings"
      sectionKey="bookings"
      currentPath="/bookings-ical"
      layout="table"
      stickyHeader={stickyHeader}
    >
      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
        {error && (
          <Typography
            component="div"
            sx={{
              padding: 1.5,
              borderRadius: 1,
              backgroundColor: '#ffecec',
              color: '#a40000',
              fontSize: 14,
            }}
          >
            {error}
          </Typography>
        )}
        {resp && (
          <SummaryBar
            data={resp}
            lastSync={lastSyncLabel}
          />
        )}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <TableLite
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            height={575}
          />
        </div>
      </Stack>
      {/* Drawer for suspected-cancelled: edit booking (set Status=Cancelled, adjust payout) */}
      {drawerOpen && (
        <AppDrawer
          open={drawerOpen}
          title={`Edit Booking ${drawerRow?.reservationCode || drawerRow?.confirmationCode || '—'}`}
          onClose={handleCloseDrawer}
          showActions
          formId="booking-edit-form"
        >
          {(() => {
            const banner = buildBanner(drawerRow, fmtDMY);
            if (!banner) return null;
            const bg = banner.tone === 'warn' ? '#fff4e5' : banner.tone === 'info' ? '#eef2ff' : '#f2f2f2';
            const color = banner.tone === 'warn' ? '#8a4d00' : banner.tone === 'info' ? '#1e40af' : '#333';
            return (
              <div style={{ marginBottom: 12, padding: 12, background: bg, color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  {banner.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{banner.title}</div>}
                  {banner.text && <div>{banner.text}</div>}
                  {Array.isArray(banner.lines) && banner.lines.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {banner.lines.map((ln, i) => (<div key={i}>{ln}</div>))}
                    </div>
                  )}
                  {banner.note && <div style={{ marginTop: 6 }}>{banner.note}</div>}
                </div>
                {/* CTA link removed from banner */}
              </div>
            );
          })()}
          {(() => {
            const ux = buildFormUXFlags(drawerRow);
            if (!ux.showCheckedButton) return null;
            const bannerForCta = buildBanner(drawerRow, fmtDMY);
            const code = drawerRow?.reservationCode || drawerRow?.confirmationCode || '';
            const isAirbnb = /^HM[0-9A-Z]{7,}$/.test(code);
            const openUrl =
              drawerRow?.reservationUrl ||
              (bannerForCta && bannerForCta.ctaUrl) ||
              drawerRow?.bookingReservationUrl ||
              (isAirbnb ? `https://www.airbnb.com/hosting/reservations/details/${code}` : null);

            return (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                {openUrl && (
                  <a
                    href={openUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={bannerForCta?.ctaLabel || 'Open'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #1E6F68',
                      background: 'transparent',
                      color: '#1E6F68',
                      textDecoration: 'none'
                    }}
                  >
                    <ArrowTopRightOnSquareIcon style={{ width: 18, height: 18 }} />
                    {bannerForCta?.ctaLabel || 'Open'}
                  </a>
                )}
                <button
                  onClick={() => acknowledgeAndRefresh(drawerRow)}
                  title={'Mark as checked (will hide from notifications)'}
                  disabled={false}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#e6ffed',
                    color: '#0a7a2a',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Checked
                </button>
              </div>
            );
          })()}
          {drawerLoading && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#64748b' }}>Loading booking…</div>
          )}
          {(() => {
            // Build banner/initial values/UX flags via adapter helpers
            const banner = buildBanner(drawerRow, fmtDMY);
            const initValues = buildInitialValues({ row: drawerRow, init: drawerInit, fmtDMYslash });
            const ux = buildFormUXFlags(drawerRow);

            return (
              <>
                {/* If banner includes lines/title (conflict case), it was already rendered above.
                    We keep just the form here. */}
                <BookingEditFormRHF
                  bookingId={drawerRow?.bookingId}
                  formId="booking-edit-form"
                  initialValues={initValues}
                  unitOptions={[
                    {
                      id: (drawerInit && (drawerInit.unitId ?? drawerInit.unit_id ?? drawerInit.unit?.id)) ?? drawerRow?.unitId ?? null,
                      label: (drawerInit && (drawerInit.unit?.unitName ?? drawerInit.unitName)) ?? drawerRow?.unitName ?? '',
                      unitName: (drawerInit && (drawerInit.unit?.unitName ?? drawerInit.unitName)) ?? drawerRow?.unitName ?? '',
                    },
                  ]}
                  onSubmit={async (payload) => {
                    try {
                      await updateBooking(drawerRow?.bookingId, payload || {});
                      const msg = (payload?.status === 'Cancelled') ? 'Reservation cancelled' : 'Booking updated';
                      toast.success(msg);
                      handleCloseDrawer();
                    } catch (e) {
                      setError(e?.message || 'Failed to update booking');
                    }
                  }}
                />
              </>
            );
          })()}
        </AppDrawer>
      )}
    </PageScaffold>
  );
}

function diffDays(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}


function fmtPrettyLocalIso(iso) {
  if (!iso) return '-';
  try {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return String(iso);
    const yyyy = m[1], mm = m[2], dd = m[3], HH = m[4], MM = m[5];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[parseInt(mm, 10) - 1] || mm;
    return `${dd} ${mon} ${yyyy}, ${HH}:${MM}`;
  } catch {
    return String(iso);
  }
}

function fmtDMY(raw) {
  if (!raw) return '-';
  try {
    let s = typeof raw === 'string' ? raw : new Date(raw).toISOString().slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // matches 'YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS'
    if (!m) return s;
    return `${m[3]}-${m[2]}-${m[1]}`; // dd-mm-yyyy
  } catch (e) {
    return String(raw);
  }
}

function fmtDMYslash(raw) {
  if (!raw) return '';
  try {
    let s = typeof raw === 'string' ? raw : new Date(raw).toISOString().slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD
    if (!m) return '';
    return `${m[2]}/${m[3]}/${m[1]}`; // DD/MM/YYYY
  } catch (e) {
    return '';
  }
}

function parseIsoDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getTime();
}

function isInCurrentMonth(raw, yearMonth) {
  if (!raw || !yearMonth) return false;
  const m = String(raw).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  const ym = `${m[1]}-${m[2]}`; // YYYY-MM
  return ym === yearMonth;
}

function compareAsc(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function compareDesc(a, b) { return a > b ? -1 : a < b ? 1 : 0; }

function StatusBadge({ status, method, isBlock, onClick }) {
  const [hover, setHover] = React.useState(false);
  if (isBlock) {
    const color = hover ? '#1E6F68' : '#555';
    return (
      <span
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        style={{
          background: '#f2f2f2',
          color,
          borderRadius: 6,           // less rounded
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',     // center text inside
          alignItems: 'center',
          justifyContent: 'center',
          height: 24,                 // fixed height
          width: 84,                  // fixed width for uniform size
          lineHeight: '24px',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        block
      </span>
    );
  }

  // Map to requested labels/colors with stricter rules:
  //  - Missing    => when status is 'suspected_cancelled'
  //  - Overlap    => only when status is 'conflict' AND method === 'overlap'
  //  - iCal edit  => only when status is 'conflict' AND method === 'code'
  //  - matched    => when status is 'matched' (or anything non-problematic)
  //  - default    => gray fallback
  let label = 'none';
  let bg = '#f2f2f2';
  let color = '#333';

  if (status === 'suspected_cancelled') {
    label = 'Missing';
    bg = '#f87171';   // light red
    color = '#ffffff';
  } else if (status === 'needs_details') {
    label = 'Details';
    bg = '#fbbf24';   // amber
    color = '#ffffff';
  } else if (status === 'conflict' && method === 'overlap') {
    label = 'Overlap';
    bg = '#fbbf24';   // amber
    color = '#ffffff';
  } else if (status === 'conflict' && method === 'code') {
    label = 'iCal edit';
    bg = '#FF5A5F';   // Airbnb brand color
    color = '#ffffff';
  } else if (status === 'matched' || status === 'linked') {
    label = 'matched';
    bg = '#e6ffed';   // ok
    color = '#0a7a2a';
  } else if (status) {
    // Fallback to showing raw status if present (e.g., 'none')
    label = status;
  }
  if (hover) { color = '#1E6F68'; }

  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: bg,
        color,
        borderRadius: 6,           // less rounded
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',     // center text inside
        alignItems: 'center',
        justifyContent: 'center',
        height: 24,                 // fixed height
        width: 84,                  // fixed width for uniform size
        lineHeight: '24px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {label}
    </span>
  );
}

function formatMoney(amount) {
  if (typeof amount !== 'number') return '';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
