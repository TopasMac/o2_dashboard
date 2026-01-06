import React, { useEffect, useState } from 'react';
import api from '../../api';
import AppDrawer from '../common/AppDrawer';
import BookingEditFormRHF from '../forms/BookingEditFormRHF';
import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';

const CARD_MAX_WIDTH = 418;

// localStorage helper for safe JSON get/set
const storageSafe = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
};


// Date helpers
const toISO = (d) => (d ? new Date(d) : null);
const pad = (n) => String(n).padStart(2, '0');
const fmtDMY = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
};
const fmtDMYslash = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
};
// Normalize id to string or undefined
const toIdStr = (v) => (v === undefined || v === null || v === '' ? undefined : String(v));

// Mapper for notification items
const mapNotifItem = (it) => ({
  id: it.id ?? it.bookingId ?? Math.random(),
  type: it.type,
  bookingId: it.bookingId ?? it.booking_id,
  unitId: it.unitId ?? it.unit_id ?? it.unit?.id,
  unitName: it.unitName ?? it.unit_name ?? it.unit?.unitName ?? it.unit?.unit_name ?? '',
  guestName: it.guestName ?? it.guest_name ?? it.booking?.guestName ?? '',
  reservationCode: it.reservationCode ?? it.confirmation_code ?? it.booking?.reservationCode ?? '',
  status: it.status,
  diffs: it.diffs || { checkIn: false, checkOut: false },
  proposedCheckIn: it.proposedCheckIn ?? it.proposed_check_in,
  proposedCheckOut: it.proposedCheckOut ?? it.proposed_check_out,
  checkIn: it.checkIn ?? it.check_in,
  checkOut: it.checkOut ?? it.check_out,
  reservationUrl: it.reservationUrl ?? it.reservation_url ?? '',
  bookingReservationUrl: it.bookingReservationUrl ?? it.booking_reservation_url ?? '',
  lastIcalSyncAt: it.lastIcalSyncAt ?? it.last_ical_sync_at ?? '',
  summary: it.summary || [],
  method: it.method ?? it.reconcileMethod ?? it.diffMethod ?? it.diffs?.method ?? '',
  source: it.source ?? it.booking?.source ?? it.Source ?? it.booking?.Source ?? '',
});

const sortNotifs = (arr) => {
  return arr.slice().sort((a, b) => {
    const aSync = a.lastIcalSyncAt ? new Date(a.lastIcalSyncAt).getTime() : null;
    const bSync = b.lastIcalSyncAt ? new Date(b.lastIcalSyncAt).getTime() : null;
    if (aSync !== null && bSync !== null) {
      if (aSync < bSync) return -1;
      if (aSync > bSync) return 1;
      return 0;
    }
    if (aSync !== null) return -1;
    if (bSync !== null) return 1;
    // fallback to checkIn ascending
    const aCheckIn = a.checkIn ? new Date(a.checkIn).getTime() : Infinity;
    const bCheckIn = b.checkIn ? new Date(b.checkIn).getTime() : Infinity;
    return aCheckIn - bCheckIn;
  });
};

const platformIcon = (src) => {
  const s = String(src || '').toLowerCase();
  if (s === 'private' || s === 'owners2' || s === 'o2') return '/images/o2icon-14.png';
  // default to Airbnb icon
  return '/images/airbnb.png';
};

// Status pill to mirror labels/colors used in the Reconcile page with strict mapping
const StatusPill = ({ status, method }) => {
  const s = String(status || '').toLowerCase();
  const m = String(method || '').toLowerCase();
  // Map to requested labels/colors with stricter rules:
  //  - Missing    => when status is 'suspected_cancelled'
  //  - Overlap    => only when status is 'conflict' AND method === 'overlap'
  //  - iCal edit  => only when status is 'conflict' AND method === 'code'
  //  - matched    => when status is 'matched' (or 'linked')
  //  - default    => gray fallback
  let label = 'none';
  let bg = '#f2f2f2';
  let fg = '#333';
  if (s === 'suspected_cancelled') {
    label = 'Missing';
    bg = '#f87171';   // light red
    fg = '#ffffff';
  } else if (s === 'conflict' && m === 'overlap') {
    label = 'Overlap';
    bg = '#fbbf24';   // amber
    fg = '#ffffff';
  } else if (s === 'conflict' && m === 'code') {
    label = 'iCal edit';
    bg = '#FF5A5F';   // Airbnb brand color
    fg = '#ffffff';
  } else if (s === 'matched' || s === 'linked') {
    label = 'matched';
    bg = '#e6ffed';   // ok
    fg = '#0a7a2a';
  } else if (s) {
    // Fallback to showing raw status if present (e.g., 'none')
    label = s;
  }
  return (
    <span style={{
      padding: '1px 8px',
      borderRadius: 6,
      fontSize: 11,
      background: bg,
      color: fg,
      border: '1px solid rgba(0,0,0,0.06)',
      lineHeight: 1.6,
      whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  );
};

export default function NotificationsCard({
  title = 'Notificaciones',
  embedded = false,
  /** which recipient email can open links on THIS page */
  visibleEmail,                   // e.g. "admin@owners2.com" (Dashboard) or "shared@owners2.com" (ManagerDashboard)
  /** hide rows that don’t match visibleEmail (optional) */
  hideNonMatching = false,
  /** max rows to show */
  limit = 10,
  width = 720,
  /** when provided, component hydrates from props and skips internal fetches */
  serverItems = null,
  serverDismissals = null,
  fixedHeight = null,
  minHeight = null,
  maxHeight = null,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const scopeKey = `notif:dismissed:${visibleEmail || 'global'}`;
  const [dismissedIds, setDismissedIds] = useState(() => new Set(storageSafe.get(scopeKey, [])));

  const serverDriven = Array.isArray(serverItems) && serverItems.length > 0;

  const MAX_INNER_WIDTH = CARD_MAX_WIDTH; // clamp inner header/content width
  const innerClampStyle = { maxWidth: MAX_INNER_WIDTH, width: '100%', margin: '0 auto' };
  const bodyMaxH = maxHeight || 360; // ensure internal scroll area exists so sticky can work

  const containerStyle = {
    width,
    maxWidth: CARD_MAX_WIDTH,
    margin: '0 auto',
    overflow: 'visible',
    border: '1px solid #d4e4e1',
    borderBottom: '1px solid #d4e4e1',
    borderRadius: 6,
    boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    position: 'relative',
    ...(fixedHeight ? { height: fixedHeight } : {}),
    ...(minHeight ? { minHeight } : {}),
    ...(maxHeight ? { maxHeight } : {}),
    // Ensure no overflowY: 'auto' or 'scroll' is set here
  };

  // Hydrate from serverItems if provided and non-empty
  useEffect(() => {
    if (!Array.isArray(serverItems) || serverItems.length === 0) return;
    try {
      const mapped = serverItems
        .map(mapNotifItem)
        // keep only problem statuses to match page conflicts-only view
        .filter(n => ['conflict', 'suspected_cancelled'].includes(String(n.status || '').toLowerCase()))
        // drop obviously broken/empty rows to avoid blank bullets
        .filter(n => (n.unitName || n.guestName || n.reservationCode));
      const filteredUndismissed = mapped.filter(n => !dismissedIds.has(n.id));
      const sorted = sortNotifs(filteredUndismissed);
      setRows(sorted);
    } catch (e) {
      // ignore hydration errors
    }
  }, [serverItems, dismissedIds]);

  // Drawer state and helpers
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState(null); // notification item
  const [drawerInit, setDrawerInit] = useState(null); // fetched booking
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleDismiss = (id) => {
    setRows((prevRows) => prevRows.filter(row => row.id !== id));
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      storageSafe.set(scopeKey, Array.from(next));
      return next;
    });
    // Best-effort: persist dismissal on server if endpoint is available
    (async () => {
      try {
        if (!visibleEmail) return;
        await api.post('/api/notification_dismissals', {
          notification: `/api/airbnb_email_notifications/${id}`,
          userEmail: visibleEmail,
        }, {
          headers: { 'Content-Type': 'application/ld+json', Accept: 'application/ld+json' },
        });
      } catch (e) {
        // ignore; localStorage already hides it for this user
      }
    })();
  };



  // Row click handler to open drawer and fetch booking details
  const handleOpen = async (n) => {
    if (!n?.bookingId) return;
    setDrawerRow(n);
    setDrawerLoading(true);
    setDrawerOpen(true);
    try {
      const { data } = await api.get(`/api/bookings/${n.bookingId}`);
      setDrawerInit(data);
    } catch (e) {
      setErr(e?.message || 'No se pudo cargar la reserva');
    } finally {
      setDrawerLoading(false);
    }
  };

  // Compute preferred url for each row
  const getPreferredUrl = (n) => {
    if (!n) return '';
    return n.status === 'suspected_cancelled' ? (n.bookingReservationUrl || n.reservationUrl) : (n.reservationUrl || n.bookingReservationUrl);
  };

  // Embedded mode: simplified visual layout, but still run side effects and use rows/err/loading state.
  if (embedded) {
    return (
      <div style={{ width: '100%', padding: '0 4px' }}>
        {loading && <p style={{ color: '#666', margin: 0 }}>Cargando…</p>}
        {err && <p style={{ color: 'crimson', margin: 0 }}>{err}</p>}
        {!loading && !err && (
          rows.length > 0 ? (
            rows.slice(0, limit).map((n) => (
              <div
                key={`embedded-notif-${n.id || Math.random()}`}
                style={{
                  marginBottom: 10,
                  paddingLeft: 12,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#111',
                      display: 'inline-block',
                    }}
                  />
                  <img
                    src={platformIcon(n.source)}
                    style={{ width: 14, height: 14, objectFit: 'contain' }}
                    alt={n.source || 'Airbnb'}
                  />
                  <strong>{n.unitName || '—'}</strong>
                  <span style={{ color: '#555' }}>{n.guestName || '—'}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginTop: 4,
                  }}
                >
                  <StatusPill status={n.status} method={n.method} />
                  <span
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    }}
                  >
                    {n.reservationCode || '-'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <em style={{ color: '#666' }}>Sin notificaciones</em>
          )
        )}
      </div>
    );
  }
  return (
    <div style={containerStyle}>
      <div style={{ height: 300, overflowY: 'auto' }}>
        {/* Sticky header inside the single scroll container */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#1E6F68', color: '#fff', padding: '6px 10px', borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
          <div style={{ ...innerClampStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontWeight: 600 }}>{title}</strong>
            {(() => {
              const total = rows.length;
              const shown = Math.min(total, limit ?? total);
              const label = `${shown}${shown !== 1 ? ' items' : ' item'}`;
              if (shown < total) {
                return <span style={{ fontSize: 12 }}>{label} of {total}</span>;
              }
              return <span style={{ fontSize: 12 }}>{label}</span>;
            })()}
          </div>
        </div>
        {/* Content */}
        <div style={{ ...innerClampStyle, padding: '6px 10px 8px', overflow: 'visible' }}>
          {loading && <p style={{ color: '#666', margin: 0 }}>Cargando…</p>}
          {err && <p style={{ color: 'crimson', margin: 0 }}>{err}</p>}
          {!loading && !err && (
            rows.length > 0 ? (
              <>
                {rows.slice(0, limit).map((n, idx) => (
                  <div
                    role="listitem"
                    key={`notif-${n.type}-${n.id ?? Math.random()}`}
                    style={{ marginBottom: 10, paddingLeft: 18, ...(idx === 0 ? { marginTop: 10 } : {}) }}
                  >
                    <div onClick={() => handleOpen(n)} style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
                      {/* Line 1: bullet, icon, unit, guest */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: '#111', display: 'inline-block' }} />
                        <img src={platformIcon(n.source)} alt={(n.source || 'Airbnb')} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                        <strong>{n.unitName || '—'}</strong>
                        <span style={{ color: '#555' }}>{n.guestName || '—'}</span>
                      </div>
                      {/* Line 2: status, reservation code */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <StatusPill status={n.status} method={n.method} />
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                          {n.reservationCode || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <em style={{ color: '#666' }}>Sin notificaciones</em>
            )
          )}
        </div>
      </div>
      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Editar reserva #${drawerRow?.bookingId || ''}`}
        showActions
        formId="booking-edit-form"
      >
        {drawerRow && drawerRow.status === 'suspected_cancelled' && (
          <div style={{
            marginBottom: 10,
            padding: 10,
            background: '#FEF3C7',
            color: '#92400E',
            borderRadius: 6,
            fontSize: 13,
            border: '1px solid rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              iCal suggests this reservation was cancelled {drawerRow?.reservationCode || ''}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              {(() => {
                const url = getPreferredUrl(drawerRow);
                return url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid #1E6F68', color: '#1E6F68', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}
                    title="Abrir en Airbnb"
                  >
                    <HiOutlineArrowTopRightOnSquare size={16} /> Open
                  </a>
                ) : null;
              })()}
            </div>
          </div>
        )}
        {/* Warning / diff panel */}
        {drawerRow && (drawerRow.diffs?.checkIn || drawerRow.diffs?.checkOut) && (
          <div style={{ marginBottom: 10, padding: 10, background: '#eef2ff', color: '#1e40af', borderRadius: 6, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Proposed changes from iCal</div>
            {drawerRow.diffs?.checkIn && (
              <div>Check-in: {fmtDMY(drawerRow.checkIn)} → <strong>{fmtDMY(drawerRow.proposedCheckIn)}</strong></div>
            )}
            {drawerRow.diffs?.checkOut && (
              <div>Check-out: {fmtDMY(drawerRow.checkOut)} → <strong>{fmtDMY(drawerRow.proposedCheckOut)}</strong></div>
            )}
            <div style={{ marginTop: 6 }}>⚠️ Remember to update payout if dates changed.</div>
          </div>
        )}

        {/* Open in Airbnb link (teal) — only when not in suspected-cancelled mode (top banner already has a button) */}
        {drawerRow && drawerRow.status !== 'suspected_cancelled' && (() => {
          const url = getPreferredUrl(drawerRow);
          return url ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid #1E6F68', color: '#1E6F68', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}>
                <HiOutlineArrowTopRightOnSquare size={16} /> Open
              </a>
            </div>
          ) : null;
        })()}

        {/* Form */}
        {drawerLoading && <div style={{ color: '#666' }}>Cargando…</div>}
        {!drawerLoading && drawerInit && (() => {
          // Compute original/proposed check-in/out in ISO (YYYY-MM-DD)
          const originalCheckInISO  = drawerInit?.checkIn  ?? drawerInit?.check_in  ?? drawerRow?.checkIn  ?? null;
          const originalCheckOutISO = drawerInit?.checkOut ?? drawerInit?.check_out ?? drawerRow?.checkOut ?? null;
          const applyCheckInISO  = (drawerRow?.diffs?.checkIn  && drawerRow?.proposedCheckIn)
            ? drawerRow.proposedCheckIn
            : originalCheckInISO;
          const applyCheckOutISO = (drawerRow?.diffs?.checkOut && drawerRow?.proposedCheckOut)
            ? drawerRow.proposedCheckOut
            : originalCheckOutISO;

          return (
            <BookingEditFormRHF
              key={`booking-${drawerRow?.bookingId}-${applyCheckInISO || ''}-${applyCheckOutISO || ''}`}
              formId="booking-edit-form"
              initialValues={{
                // Identity / linking
                id: (drawerInit?.id ?? drawerRow?.bookingId ?? drawerInit?.bookingId ?? drawerInit?.booking_id ?? null),

                // Dates: feed both camelCase and snake_case with DD/MM/YYYY strings
                checkIn: applyCheckInISO,     // e.g. "2025-10-04"
                checkOut: applyCheckOutISO,

                // Unit / guest
                unitId: toIdStr(
                  drawerInit?.unitId ?? drawerInit?.unit_id ?? drawerInit?.unit?.id ?? drawerRow?.unitId
                ),
                unit_id: toIdStr(
                  drawerInit?.unitId ?? drawerInit?.unit_id ?? drawerInit?.unit?.id ?? drawerRow?.unitId
                ),
                unitName: drawerInit?.unitName || drawerInit?.unit_name || drawerInit?.unit?.unitName || drawerRow?.unitName || '',
                guestName: drawerInit?.guestName || drawerInit?.guest_name || drawerRow?.guestName || '',
                guests: (drawerInit?.guests ?? drawerInit?.numGuests ?? '') === ''
                  ? ''
                  : Number(drawerInit?.guests ?? drawerInit?.numGuests ?? 0),

                // Money & fees
                payout: drawerRow?.status === 'suspected_cancelled' ? 0 : (drawerInit?.payout ?? ''),
                cleaningFee: drawerRow?.status === 'suspected_cancelled' ? 0 : (drawerInit?.cleaningFee ?? 0),
                commissionPercent: drawerInit?.commissionPercent ?? '',

                // Payment & source
                paymentMethod: drawerInit?.paymentMethod || drawerInit?.payment_method || 'platform',
                source: drawerInit?.source || drawerInit?.Source || '',
                isPaid: drawerInit?.isPaid ?? false,

                // Notes
                notes: drawerInit?.notes || '',
                checkInNotes: drawerInit?.checkInNotes || drawerInit?.check_in_notes || '',
                checkOutNotes: drawerInit?.checkOutNotes || drawerInit?.check_out_notes || '',

                // Status: default to Cancelled in suspected-cancelled context (user can adjust)
                status: drawerRow?.status === 'suspected_cancelled'
                  ? 'Cancelled'
                  : (drawerInit?.status || 'Confirmed'),
              }}
              unitOptions={(() => {
                const rawId =
                  drawerInit?.unitId ?? drawerInit?.unit_id ?? drawerInit?.unit?.id ?? drawerRow?.unitId;
                const id = toIdStr(rawId);
                const label =
                  drawerInit?.unitName || drawerInit?.unit_name || drawerInit?.unit?.unitName || drawerRow?.unitName || '';
                return (id && label) ? [{ id, label }] : [];
              })()}
              submitting={submitting}
              onSubmit={async (payload) => {
                try {
                  setSubmitting(true);
                  await api.put(`/api/bookings/${drawerRow.bookingId}`, payload);
                  setSubmitting(false);
                  setDrawerOpen(false);
                  setDrawerInit(null);
                  setDrawerRow(null);
                } catch (e) {
                  setSubmitting(false);
                  alert(e?.message || 'Error al guardar la reserva');
                }
              }}
            />
          );
        })()}
      </AppDrawer>
    </div>
  );
}