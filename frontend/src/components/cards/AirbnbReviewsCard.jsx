import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@mui/material';
import api from '../../api';

// --- Date helpers (unchanged from original) ---
const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDdMm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDdMonYy = (d) => `${String(d.getDate()).padStart(2,'0')}-${MONTH_ABBR[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;

const fmtIso = (d, end = false) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${end ? '23:59:59' : '00:00:00'}`;

const REVIEW_CARD_HEIGHT = 250;
const REVIEW_HEADER_H = 40;
const REVIEW_BODY_PAD_V = 24;
const VISIBLE_ROWS = 5;
const ROW_HEIGHT = Math.floor((REVIEW_CARD_HEIGHT - REVIEW_HEADER_H - REVIEW_BODY_PAD_V) / VISIBLE_ROWS);

const toLower = (v) => (v == null ? '' : String(v).toLowerCase());

function parseYmd(input) {
  if (!input) return null;
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const m = String(input).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dt = new Date(input);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function formatGuestName(name) {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function buildReviewText(guestName) {
  const formatted = formatGuestName(guestName || '');
  const parts = formatted.split(' ').filter(Boolean);
  const firstName = parts.length ? parts[0] : 'the guest';

  return `It was a pleasure to welcome ${firstName}. Communication was always easy, and the apartment was left in great condition. We would happily host again!`;
}

function buildGuestMessage(guestName, reviewText) {
  const firstName = formatGuestName(guestName).split(' ')[0];
  const greeting = firstName ? `Hello ${firstName}!` : 'Hello!';

  return `${greeting}

Thank you again for choosing to stay with us! We hope you had a wonderful time.

I've just left you the following review:

"${reviewText}"

In case you haven't left us a review yet, we'd really appreciate it if you could take a moment to share your experience. Your feedback means a lot to us and helps future guests feel confident when booking.

Thank you again, and we hope to welcome you back someday!

Best regards,
Antonio Pedro
HausIn`;
}

// --- Backend review queue helper ---
async function fetchReviewQueue() {
  const { data } = await api.get('/api/dashboard/airbnb-review-queue');
  return data;
}

// --- API helpers (unchanged) ---
async function fetchBookingsByCheckout(startDate, endDate) {
  const afterIso = fmtIso(startDate, false);
  const beforeIso = fmtIso(endDate, true);
  const url = `/api/bookings?pagination=false&checkOut[after]=${afterIso}&checkOut[before]=${beforeIso}&source=Airbnb`;

  const { data } = await api.get(url);
  const list =
    data?.member ??
    data?.['hydra:member'] ??
    (Array.isArray(data) ? data : []);

  return list
    .map((b) => ({
      reservationId: b.reservationId ?? b.id,
      checkoutDate: b.checkOut,
      unitName: b.unitName || b.unit?.name || b.listing?.name,
    }))
    .filter((x) => x.reservationId && x.checkoutDate);
}

async function fetchReviewActionsInRange(startYmd, endYmd) {
  const url = `/api/review_actions?pagination=false&checkoutDate[after]=${startYmd}&checkoutDate[before]=${endYmd}&source=Airbnb`;

  const { data } = await api.get(url);
  const list =
    data?.member ??
    data?.['hydra:member'] ??
    (Array.isArray(data) ? data : []);

  return list.map((a) => ({
    id: a.id,
    reservationId: a.reservationId,
    status: a.status,
  }));
}

async function getReviewActionByReservation(resId) {
  const { data } = await api.get(`/api/review_actions?pagination=false&reservationId=${resId}`);
  const list =
    data?.member ??
    data?.['hydra:member'] ??
    (Array.isArray(data) ? data : []);
  return list.length ? list[0] : null;
}

async function createReviewAction(payload) {
  const { data } = await api.post('/api/review_actions', payload);
  return data;
}

async function patchReviewAction(id, payload) {
  const { data } = await api.patch(`/api/review_actions/${id}`, payload, {
    headers: { 'Content-Type': 'application/merge-patch+json' },
  });
  return data;
}

// ===================================================================
// 📌 MAIN COMPONENT: AirbnbReviewsCard
// ===================================================================
export default function AirbnbReviewsCard({ embedded = false, onPendingCountChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [monthStats, setMonthStats] = useState(null);
  const [copiedDrafts, setCopiedDrafts] = useState({});

  async function copyDraft(key, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDrafts((previous) => ({ ...previous, [key]: true }));
    } catch {
      alert('No se pudo copiar el texto al portapapeles.');
    }
  }

  // Only show items that are still actionable (not made/skipped/timeout)
  const visibleItems = useMemo(
    () =>
      items.filter(
        (x) =>
          x.currentStatus !== 'made' &&
          x.currentStatus !== 'skipped' &&
          x.currentStatus !== 'timeout'
      ),
    [items]
  );

  useEffect(() => {
    if (!loading) {
      onPendingCountChange?.(error ? null : visibleItems.length);
    }
  }, [error, loading, onPendingCountChange, visibleItems.length]);

  // We keep "today" only for local fallback/formatting where needed.
  const today = toDateOnly(new Date());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReviewQueue();

      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setMonthStats(data.monthStats || null);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Error loading reseñas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Stats
  const todayStats = useMemo(() => {
    const total = items.length;
    const made = items.filter((x) => x.currentStatus === 'made').length;
    const skipped = items.filter((x) => x.currentStatus === 'skipped').length;
    const timeout = items.filter((x) => x.currentStatus === 'timeout').length;
    const pending = items.filter((x) => x.currentStatus === 'pending').length;
    return { total, made, skipped, timeout, pending };
  }, [items]);

  async function markMade(row) {
    try {
      if (row.reviewActionId) {
        await patchReviewAction(row.reviewActionId, { status: 'made' });
      } else {
        const existing = await getReviewActionByReservation(row.bookingId);
        if (existing) {
          await patchReviewAction(existing.id, { status: 'made' });
        } else {
          await createReviewAction({
            reservationId: row.bookingId,
            status: 'made',
            source: 'Airbnb',
            unitId: row.unitId ?? null,
            unitName: row.unitName ?? null,
            checkoutDate: fmtYmd(parseYmd(row.checkoutDate)),
          });
        }
      }

      load();
    } catch (e) {
      alert('No se pudo marcar como hecha.');
    }
  }

  async function markSkipped(row) {
    try {
      if (row.reviewActionId) {
        await patchReviewAction(row.reviewActionId, { status: 'skipped' });
      } else {
        const existing = await getReviewActionByReservation(row.bookingId);
        if (existing) {
          await patchReviewAction(existing.id, { status: 'skipped' });
        } else {
          await createReviewAction({
            reservationId: row.bookingId,
            status: 'skipped',
            source: 'Airbnb',
            unitId: row.unitId ?? null,
            unitName: row.unitName ?? null,
            checkoutDate: fmtYmd(parseYmd(row.checkoutDate)),
          });
        }
      }

      load();
    } catch (e) {
      alert('No se pudo omitir.');
    }
  }

  return (
    <div
      style={embedded ? undefined : {
        minWidth: 360,
        maxWidth: 720,
        height: REVIEW_CARD_HEIGHT,
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {!embedded && (
        <div
          style={{
            backgroundColor: '#1E6F68',
            color: '#fff',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Reseñas Airbnb</h2>
          <div style={{ display: 'flex', gap: 10, fontSize: 12, opacity: 0.9 }}>
            <span>
              Total Mes: {monthStats?.total ?? todayStats.total}
            </span>
            <span>
              <span style={{ color: '#b2f5ea', fontWeight: 600 }}>✔</span>
              <span style={{ color: '#b2f5ea', opacity: 0.7, marginLeft: 3 }}>
                {monthStats?.made ?? todayStats.made}
              </span>
            </span>
            <span>
              <span style={{ color: '#ffdddd', fontWeight: 600 }}>✖</span>
              <span style={{ color: '#ffdddd', opacity: 0.7, marginLeft: 3 }}>
                {monthStats?.skipped ?? todayStats.skipped}
              </span>
            </span>
            <span>
              <span style={{ color: '#ffb347', fontWeight: 600 }}>⏱</span>
              <span style={{ color: '#ffb347', opacity: 0.7, marginLeft: 3 }}>
                {monthStats?.timeout ?? todayStats.timeout}
              </span>
            </span>
            <span>
              Pendientes: {todayStats.pending}
            </span>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: embedded ? '4px 0 0' : '12px', flexGrow: 1 }}>
        {loading && <p>Cargando…</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        {!loading && !error && (
          <div style={embedded ? undefined : { maxHeight: ROW_HEIGHT * VISIBLE_ROWS, overflowY: 'auto' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {visibleItems.map((row) => {
                const co = parseYmd(row.checkoutDate);
                const plazo = row.reviewDeadline
                  ? parseYmd(row.reviewDeadline)
                  : addDays(co, 12);

                const reviewText = embedded ? buildReviewText(row.guestName) : null;

                return (
                  <li
                    key={`${row.bookingId}-${row.reviewActionId ?? 'new'}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: embedded ? 'minmax(0, 1fr)' : '1fr 120px',
                      columnGap: 12,
                      alignItems: 'center',
                      padding: '6px 0',
                      borderBottom: '1px solid #eee',
                      minHeight: ROW_HEIGHT,
                    }}
                  >
                    <div style={{ fontSize: 14 }}>
                      {/* Guest name → clickable if reservationUrl */}
                      {!embedded && row.reservationUrl ? (
                        <a
                          href={row.reservationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontWeight: 600,
                            color: '#1E6F68',
                            textDecoration: 'none'
                          }}
                          title="Abrir reserva en Airbnb (texto de reseña copiado al portapapeles)"
                          onMouseEnter={(e) => (e.target.style.color = '#FF7A00')}
                          onMouseLeave={(e) => (e.target.style.color = '#1E6F68')}
                          onClick={() => {
                            try {
                              if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                                const text = buildReviewText(row.guestName || '');
                                navigator.clipboard.writeText(text).catch(() => {});
                              }
                            } catch (e) {
                              // ignore clipboard errors silently
                            }
                          }}
                        >
                          {formatGuestName(row.guestName || '')}
                        </a>
                      ) : (
                        <strong style={{ color: '#1E6F68' }}>{formatGuestName(row.guestName || '')}</strong>
                      )}

                      {/* Unit name (grey) */}
                      {row.unitName ? (
                        <span style={{ color: '#666', marginLeft: 6 }}>
                          ({row.unitName})
                        </span>
                      ) : null}

                      {/* Checkout + plazo */}
                      <span style={{ marginLeft: 8 }}>
                        checkOut {fmtDdMm(co)}{' '}
                        {(() => {
                          const todayLocal = toDateOnly(new Date());
                          const diffMs = plazo - todayLocal;
                          const daysLeftFloat = diffMs / (1000 * 60 * 60 * 24);
                          const urgent = daysLeftFloat < 3;
                          // Round up so e.g. 1.2 days becomes 2 days left
                          const daysLeft = Math.max(0, Math.ceil(daysLeftFloat));

                          const label = urgent
                            ? (daysLeft === 0 ? 'last day!' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`)
                            : `plazo ${fmtDdMm(plazo)}`;

                          let color = '#666';
                          let fontWeight = 400;

                          if (urgent) {
                            if (daysLeft === 0) {
                              // last day -> red
                              color = '#cc0000';
                              fontWeight = 600;
                            } else {
                              // X days left (1 or 2 days) -> amber
                              color = '#FF7A00';
                              fontWeight = 600;
                            }
                          }

                          return (
                            <span
                              style={{
                                fontSize: '12px',
                                color,
                                fontWeight,
                              }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </span>
                      {embedded && !row.reservationUrl && (
                        <span style={{ marginLeft: 8, color: '#925400', fontSize: 12, fontWeight: 600 }}>
                          Sin enlace de Airbnb
                        </span>
                      )}
                    </div>

                    {embedded ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {[
                          {
                            type: 'review',
                            label: row.reservationUrl ? 'Escribir reseña' : 'Copiar reseña',
                            text: reviewText,
                          },
                          {
                            type: 'message',
                            label: row.reservationUrl ? 'Enviar mensaje' : 'Copiar mensaje',
                            text: buildGuestMessage(row.guestName, reviewText),
                          },
                        ].map(({ type, label, text }) => {
                          const key = `${row.bookingId}-${type}`;
                          const copied = copiedDrafts[key];

                          return (
                            <Button
                              key={type}
                              size="small"
                              href={row.reservationUrl || undefined}
                              target={row.reservationUrl ? '_blank' : undefined}
                              rel={row.reservationUrl ? 'noopener noreferrer' : undefined}
                              title={copied ? 'Texto copiado. Puedes copiarlo de nuevo.' : undefined}
                              onClick={() => copyDraft(key, text)}
                              sx={{ textTransform: 'none', color: copied ? '#65717b' : '#087f80' }}
                            >
                              {label}
                            </Button>
                          );
                        })}
                        <Button
                          size="small"
                          onClick={() => markMade(row)}
                          sx={{ textTransform: 'none', color: '#087f80', ml: 'auto' }}
                        >
                          Marcar completada
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => markSkipped(row)}
                          sx={{ textTransform: 'none' }}
                        >
                          Omitir
                        </Button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => markMade(row)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#1E6F68',
                            fontSize: 20,
                            opacity: 1,
                          }}
                          title="Marcar hecha"
                        >
                          ✔
                        </button>
                        <button
                          onClick={() => markSkipped(row)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#cc0000',
                            fontSize: 20,
                            opacity: 1,
                          }}
                          title="Omitir"
                        >
                          ✖
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              {visibleItems.length === 0 && (
                <li style={{ color: '#666' }}>No hay reservas con checkout recientes.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}