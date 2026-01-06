// frontend/src/components/cards/MonthSummaryCard.jsx
//
// Standalone card that fetches and renders the "Month Summary" section
// for the manager dashboard.
//
// It calls /api/month-summary?yearMonth=YYYY-MM (current month by default)
// and displays the returned periods horizontally (e.g. previous, current,
// next, YTD). This isolates all Month Summary UI logic into a reusable card.

import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api';

// --- Helpers ---------------------------------------------------------------

const TEAL = '#1E6F68';

function getCurrentYearMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return '$0';
  try {
    return Number(value).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  } catch (e) {
    return `$${Number(value).toFixed(0)}`;
  }
}

/**
 * Returns true if the period represents a YTD (Year-to-date) period.
 */
function isYtdPeriod(period) {
  if (!period || typeof period !== 'object') return false;
  if (period.isYtd || period.ytd) return true;
  const rawLabel =
    period.label ||
    period.title ||
    period.name ||
    '';
  return /ytd/i.test(rawLabel);
}

/**
 * Tries to infer a human label for a period.
 * The backend usually sends something like { label: "November 2025" },
 * but we fall back to year_month/baseMonth if needed.
 */
function getPeriodLabel(period, fallbackBaseMonth) {
  if (!period) return '';

  // Prefer explicit labels/titles/names, but we'll still normalize plain YYYY-MM.
  const rawLabel =
    period.label ||
    period.title ||
    period.name ||
    '';

  // Normalize YTD labels like "2025-YTD" -> "2025"
  if (/^\d{4}-?ytd$/i.test(rawLabel)) {
    return rawLabel.slice(0, 4);
  }

  // Determine the best candidate for a YYYY-MM month key.
  const ym = period.year_month || period.yearMonth || rawLabel;

  // If we have something like 2025-09, render it as "September".
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [, month] = ym.split('-');
    const d = new Date(2000, Number(month) - 1, 1); // year doesn't matter for month name
    return d.toLocaleString('en-US', { month: 'long' });
  }

  // Otherwise fall back to whatever label we had, or the backend baseMonth.
  if (rawLabel) return rawLabel;

  return fallbackBaseMonth || '';
}

// Extract stats with sensible fallbacks so we survive minor backend changes.
function mapStats(period) {
  if (!period || typeof period !== 'object') {
    return {
      units: null,
      clients: null,
      commissions: null,
      reservations: null,
      guests: null,
      reviewsMade: null,
      reviewsTotal: null,
      unitsPlaya: null,
      unitsTulum: null,
      commissionsPlaya: null,
      commissionsTulum: null,
      reservationsAirbnb: null,
      reservationsPrivate: null,
      reviewsSkipped: null,
      reviewsTimeout: null,
      netResult: null,
    };
  }

  const units =
    period.units ??
    period.unitCount ??
    period.unitsCount ??
    null;

  const clients =
    period.clients ??
    period.clientCount ??
    period.clientsCount ??
    null;

  const commissions =
    period.commissions ??
    period.commission ??
    period.o2Commission ??
    period.o2_commission_in_month ??
    null;

  const commissionsPlaya =
    period.commissionsPlaya ??
    period.commissions_playa ??
    null;

  const commissionsTulum =
    period.commissionsTulum ??
    period.commissions_tulum ??
    null;

  const reservations =
    period.reservations ??
    period.bookingCount ??
    period.reservationCount ??
    null;

  const reservationsAirbnb =
    period.reservationsAirbnb ??
    period.reservations_airbnb ??
    null;

  const reservationsPrivate =
    period.reservationsPrivate ??
    period.reservations_private ??
    null;

  const guests =
    period.guests ??
    period.guestCount ??
    null;

  // --- Net Result logic ---
  const netResult =
    period.netResult ??
    period.net_result ??
    null;

  // --- Reviews logic ---
  const reviews =
    period.reviews && typeof period.reviews === 'object'
      ? period.reviews
      : {};

  const reviewsTotal =
    period.reviewsTotal ??
    period.reviews_total ??
    reviews.total ??
    null;

  const reviewsMade =
    period.reviewsMade ??
    period.reviews_made ??
    period.reviews_done ??
    reviews.made ??
    null;

  const reviewsSkipped =
    reviews.skipped ?? null;

  const reviewsTimeout =
    reviews.timeout ?? null;

  const unitsPlaya =
    period.unitsPlaya ??
    period.units_playa ??
    null;

  const unitsTulum =
    period.unitsTulum ??
    period.units_tulum ??
    null;

  return {
    units,
    clients,
    commissions,
    reservations,
    guests,
    reviewsMade,
    reviewsTotal,
    unitsPlaya,
    unitsTulum,
    commissionsPlaya,
    commissionsTulum,
    reservationsAirbnb,
    reservationsPrivate,
    reviewsSkipped,
    reviewsTimeout,
    netResult,
  };
}

// --- Component -------------------------------------------------------------

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 1,
  gap: 8,
};

const labelStyle = {
  color: '#6b7280',
};

const valueContainerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const valueStyle = {
  fontWeight: 400,
  color: '#374151',
};

const MonthSummaryCard = ({ yearMonth: propsYearMonth }) => {
  const [yearMonth, setYearMonth] = useState(
    propsYearMonth || getCurrentYearMonth()
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openUnitsKey, setOpenUnitsKey] = useState(null);
  const [openCommissionsKey, setOpenCommissionsKey] = useState(null);
  const [openReservationsKey, setOpenReservationsKey] = useState(null);
  const [openOccupancyKey, setOpenOccupancyKey] = useState(null);
  const [openReviewsKey, setOpenReviewsKey] = useState(null);

  // If parent ever passes a different yearMonth, sync it.
  useEffect(() => {
    if (propsYearMonth) {
      setYearMonth(propsYearMonth);
    }
  }, [propsYearMonth]);

  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      setLoading(true);
      setError(null);
      try {
        const { data: resp } = await api.get(
          `/api/month-summary?yearMonth=${encodeURIComponent(yearMonth)}`
        );
        if (!cancelled) {
          setData(resp || null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load month summary', err);
          setError('No se pudo cargar el resumen.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();

    return () => {
      cancelled = true;
    };
  }, [yearMonth]);

  const periods = useMemo(() => {
    if (!data || !data.periods) return [];
    const raw = data.periods;
    if (Array.isArray(raw)) return raw;
    // If backend sends an object like { prev: {...}, base: {...}, next: {...} }
    return Object.values(raw);
  }, [data]);

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 8,
        padding: '12px 16px 16px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.12)',
        border: '1px solid #e5e7eb',
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: TEAL,
          marginBottom: 8,
        }}
      >
        Month Summary
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Cargando…</div>
      )}

      {error && !loading && (
        <div style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>
      )}

      {!loading && !error && periods.length === 0 && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          No hay información disponible.
        </div>
      )}

      {!loading && !error && periods.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 24,
            overflowX: 'auto',
            paddingTop: 4,
          }}
        >
          {periods.map((period, idx) => {
            const label = getPeriodLabel(period, data?.baseMonth);
            const isYtd = isYtdPeriod(period);

            // Try to infer a YYYY-MM key for this period to compare with the current yearMonth.
            const rawKey =
              period.year_month ||
              period.yearMonth ||
              period.label ||
              period.title ||
              period.name ||
              null;

            const isCurrentMonth =
              !!rawKey &&
              (rawKey === yearMonth ||
                // also handle cases like "2025-12-01" or "2025-12 something"
                String(rawKey).startsWith(`${yearMonth}`));

            const {
              units,
              clients,
              commissions,
              reservations,
              guests,
              reviewsMade,
              reviewsTotal,
              unitsPlaya,
              unitsTulum,
              commissionsPlaya,
              commissionsTulum,
              reservationsAirbnb,
              reservationsPrivate,
              reviewsSkipped,
              reviewsTimeout,
              netResult,
            } = mapStats(period);

            const occupancy =
              period.occupancy && typeof period.occupancy === 'object'
                ? period.occupancy
                : {};

            const occupancyOverall =
              occupancy.overall !== undefined && occupancy.overall !== null
                ? Number(occupancy.overall)
                : null;
            const occupancyPlaya =
              occupancy.playa !== undefined && occupancy.playa !== null
                ? Number(occupancy.playa)
                : null;
            const occupancyTulum =
              occupancy.tulum !== undefined && occupancy.tulum !== null
                ? Number(occupancy.tulum)
                : null;

            const formatOccupancyPct = (v) => {
              if (v === null || Number.isNaN(Number(v))) return null;
              const pct = Math.round(Number(v) * 100);
              return `${pct}%`;
            };

            const occupancyOverallLabel = formatOccupancyPct(occupancyOverall);
            const occupancyPlayaLabel = formatOccupancyPct(occupancyPlaya);
            const occupancyTulumLabel = formatOccupancyPct(occupancyTulum);

            const netResultPct =
              commissions != null &&
              Number(commissions) !== 0 &&
              netResult != null
                ? Math.round((Number(netResult) / Number(commissions)) * 100)
                : null;

            const rowKey = period.key || period.id || period.year_month || idx;

            return (
              <div
                key={rowKey}
                style={{
                  minWidth: 210,
                  fontSize: 13,
                  borderRadius: 8,
                  padding: '8px 10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: isCurrentMonth ? '#F0F9F9' : '#ffffff',
                }}
              >
                <div
                  style={{
                    fontWeight: isYtd || isCurrentMonth ? 700 : 500,
                    marginBottom: 4,
                    color: isYtd ? '#ffffff' : isCurrentMonth ? TEAL : '#111827',
                    textAlign: isYtd ? 'right' : 'left',
                    backgroundColor: isYtd ? TEAL : 'transparent',
                    padding: isYtd ? '4px 0' : 0,
                    borderRadius: 0,
                  }}
                >
                  {label}
                </div>

                <div>
                  {units != null && (
                    <>
                      <div style={rowStyle}>
                        <span
                          style={{
                            ...labelStyle,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Units
                          {(unitsPlaya != null || unitsTulum != null) && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenUnitsKey(
                                  openUnitsKey === rowKey ? null : rowKey
                                )
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 10,
                                lineHeight: 1,
                                color: TEAL,
                              }}
                              aria-label="Toggle units by city"
                            >
                              {openUnitsKey === rowKey ? '▴' : '▾'}
                            </button>
                          )}
                        </span>
                        <span style={valueStyle}>{units}</span>
                      </div>
                      {openUnitsKey === rowKey &&
                        (unitsPlaya != null || unitsTulum != null) && (
                          <div
                            style={{
                              marginTop: 1,
                              marginLeft: 12,
                              fontSize: 12,
                              color: '#4b5563',
                            }}
                          >
                            {unitsPlaya != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Playa: </span>
                                <span>{unitsPlaya}</span>
                              </div>
                            )}
                            {unitsTulum != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Tulum: </span>
                                <span>{unitsTulum}</span>
                              </div>
                            )}
                          </div>
                        )}
                    </>
                  )}
                  {clients != null && (
                    <div style={rowStyle}>
                      <span style={labelStyle}>Clients</span>
                      <span style={valueStyle}>{clients}</span>
                    </div>
                  )}
                  {period.grossEarnings != null && (
                    <div style={rowStyle}>
                      <span style={labelStyle}>Gross Earnings</span>
                      <span style={valueStyle}>
                        {formatMoney(period.grossEarnings)}
                      </span>
                    </div>
                  )}
                  {commissions != null && (
                    <>
                      <div style={rowStyle}>
                        <span
                          style={{
                            ...labelStyle,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Commissions
                          {(commissionsPlaya != null || commissionsTulum != null) && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCommissionsKey(
                                  openCommissionsKey === rowKey ? null : rowKey
                                )
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 10,
                                lineHeight: 1,
                                color: TEAL,
                              }}
                              aria-label="Toggle commissions by city"
                            >
                              {openCommissionsKey === rowKey ? '▴' : '▾'}
                            </button>
                          )}
                        </span>
                        <span
                          style={{
                            ...valueStyle,
                            color: '#111827',
                            fontWeight: 500,
                          }}
                        >
                          {formatMoney(commissions)}
                        </span>
                      </div>
                      {openCommissionsKey === rowKey &&
                        (commissionsPlaya != null || commissionsTulum != null) && (
                          <div
                            style={{
                              marginTop: 1,
                              marginLeft: 12,
                              fontSize: 12,
                              color: '#4b5563',
                            }}
                          >
                            {commissionsPlaya != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Playa: </span>
                                <span>
                                  {formatMoney(commissionsPlaya)}{' '}
                                  {commissions > 0 && (
                                    <span>
                                      (
                                      {Math.round(
                                        (Number(commissionsPlaya) /
                                          Number(commissions)) *
                                          100
                                      )}
                                      %)
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {commissionsTulum != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Tulum: </span>
                                <span>
                                  {formatMoney(commissionsTulum)}{' '}
                                  {commissions > 0 && (
                                    <span>
                                      (
                                      {Math.round(
                                        (Number(commissionsTulum) /
                                          Number(commissions)) *
                                          100
                                      )}
                                      %)
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                    </>
                  )}
                  {netResult != null && (
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        Net Result
                        {netResultPct != null ? ` (${netResultPct}%)` : ''}
                      </span>
                      <span
                        style={{
                          ...valueStyle,
                          color: '#0F172A', // darker emphasis
                          fontWeight: 600,
                        }}
                      >
                        {formatMoney(netResult)}
                      </span>
                    </div>
                  )}
                  {reservations != null && (
                    <>
                      <div style={rowStyle}>
                        <span
                          style={{
                            ...labelStyle,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Reservations
                          {(reservationsAirbnb != null || reservationsPrivate != null) && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenReservationsKey(
                                  openReservationsKey === rowKey ? null : rowKey
                                )
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 10,
                                lineHeight: 1,
                                color: TEAL,
                              }}
                              aria-label="Toggle reservations by source"
                            >
                              {openReservationsKey === rowKey ? '▴' : '▾'}
                            </button>
                          )}
                        </span>
                        <span style={valueStyle}>{reservations}</span>
                      </div>
                      {openReservationsKey === rowKey &&
                        (reservationsAirbnb != null ||
                          reservationsPrivate != null) && (
                          <div
                            style={{
                              marginTop: 1,
                              marginLeft: 12,
                              fontSize: 12,
                              color: '#4b5563',
                            }}
                          >
                            {reservationsAirbnb != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Airbnb: </span>
                                <span>
                                  {reservationsAirbnb}{' '}
                                  {reservations > 0 && (
                                    <span>
                                      (
                                      {Math.round(
                                        (Number(reservationsAirbnb) /
                                          Number(reservations)) *
                                          100
                                      )}
                                      %)
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {reservationsPrivate != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Private: </span>
                                <span>
                                  {reservationsPrivate}{' '}
                                  {reservations > 0 && (
                                    <span>
                                      (
                                      {Math.round(
                                        (Number(reservationsPrivate) /
                                          Number(reservations)) *
                                          100
                                      )}
                                      %)
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                    </>
                  )}
                  {occupancyOverallLabel != null && (
                    <>
                      <div style={rowStyle}>
                        <span
                          style={{
                            ...labelStyle,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Occupancy
                          {(occupancyPlayaLabel != null ||
                            occupancyTulumLabel != null) && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenOccupancyKey(
                                  openOccupancyKey === rowKey ? null : rowKey
                                )
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 10,
                                lineHeight: 1,
                                color: TEAL,
                              }}
                              aria-label="Toggle occupancy by city"
                            >
                              {openOccupancyKey === rowKey ? '▴' : '▾'}
                            </button>
                          )}
                        </span>
                        <span style={valueStyle}>{occupancyOverallLabel}</span>
                      </div>
                      {openOccupancyKey === rowKey &&
                        (occupancyPlayaLabel != null ||
                          occupancyTulumLabel != null) && (
                          <div
                            style={{
                              marginTop: 1,
                              marginLeft: 12,
                              fontSize: 12,
                              color: '#4b5563',
                            }}
                          >
                            {occupancyPlayaLabel != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Playa: </span>
                                <span>{occupancyPlayaLabel}</span>
                              </div>
                            )}
                            {occupancyTulumLabel != null && (
                              <div>
                                <span style={{ fontWeight: 500 }}>Tulum: </span>
                                <span>{occupancyTulumLabel}</span>
                              </div>
                            )}
                          </div>
                        )}
                    </>
                  )}
                  {guests != null && (
                    <div style={rowStyle}>
                      <span style={labelStyle}>Guests</span>
                      <span style={valueStyle}>{guests}</span>
                    </div>
                  )}
                  {(reviewsTotal != null ||
                    reviewsMade != null ||
                    reviewsSkipped != null ||
                    reviewsTimeout != null) && (
                    <>
                      <div style={rowStyle}>
                        <span
                          style={{
                            ...labelStyle,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Reviews
                          {(reviewsMade != null ||
                            reviewsSkipped != null ||
                            reviewsTimeout != null) && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenReviewsKey(
                                  openReviewsKey === rowKey ? null : rowKey
                                )
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 10,
                                lineHeight: 1,
                                color: TEAL,
                              }}
                              aria-label="Toggle reviews breakdown"
                            >
                              {openReviewsKey === rowKey ? '▴' : '▾'}
                            </button>
                          )}
                        </span>
                        <span style={valueStyle}>
                          {reviewsTotal != null ? reviewsTotal : 0}
                        </span>
                      </div>
                      {openReviewsKey === rowKey &&
                        (reviewsMade != null ||
                          reviewsSkipped != null ||
                          reviewsTimeout != null) && (
                          <div
                            style={{
                              marginTop: 1,
                              marginLeft: 12,
                              fontSize: 12,
                              color: '#4b5563',
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center',
                            }}
                          >
                            {reviewsMade != null && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 2,
                                }}
                              >
                                <span
                                  style={{
                                    color: '#1E6F68',
                                    fontSize: 12,
                                  }}
                                >
                                  ✓
                                </span>
                                <span>{reviewsMade}</span>
                              </span>
                            )}
                            {reviewsSkipped != null && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 2,
                                }}
                              >
                                <span
                                  style={{
                                    color: '#E11D48',
                                    fontSize: 12,
                                  }}
                                >
                                  ✕
                                </span>
                                <span>{reviewsSkipped}</span>
                              </span>
                            )}
                            {reviewsTimeout != null && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 2,
                                }}
                              >
                                <span
                                  style={{
                                    color: '#B45309',
                                    fontSize: 12,
                                  }}
                                >
                                  ⏱
                                </span>
                                <span>{reviewsTimeout}</span>
                              </span>
                            )}
                          </div>
                        )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MonthSummaryCard;
