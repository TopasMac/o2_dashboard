import React from 'react';
import api from '../../api';
import { CANCUN_TZ } from '../../utils/dateTimeCancun';

export default function AlertCenter({ alerts, dismissAlert, embedded = false }) {
  const handleServiceDismiss = async (alert) => {
    if (
      alert.type !== 'service-payment-overdue' &&
      alert.type !== 'service-payment-due-soon' &&
      alert.type !== 'service-payment-mismatch'
    ) {
      // Fallback: just call dismissAlert if provided
      if (dismissAlert) {
        dismissAlert(alert.id);
      }
      return;
    }

    const alertType =
      alert.type === 'service-payment-overdue'
        ? 'overdue'
        : alert.type === 'service-payment-due-soon'
        ? 'due_soon'
        : 'mismatch';

    const payload = {
      alertType,
      service: alert.service || null,
      monthYear: alert.yearMonth || null,
      unitId: alert.unitId ?? null,
    };

    try {
      await api.post('/api/service-alert-dismissals', payload);
    } catch (e) {
      // Log and continue with local dismissal so UI doesn't get stuck
      // eslint-disable-next-line no-console
      console.error('Failed to persist service alert dismissal', e);
    }

    if (dismissAlert) {
      dismissAlert(alert.id);
    }
  };
  const getCancunYmd = (dateObj) => {
    if (!dateObj) return null;
    const stamp = dateObj.toLocaleString('sv-SE', { timeZone: CANCUN_TZ });
    // sv-SE gives "YYYY-MM-DD HH:mm:ss"; we only need the date part.
    return stamp.slice(0, 10);
  };
  const renderContent = () => {
    if (alerts.length > 0) {
      const sortedAlerts = [...alerts].sort((a, b) => {
        if (a.severity === 'danger' && b.severity !== 'danger') return -1;
        if (a.severity !== 'danger' && b.severity === 'danger') return 1;
        return 0;
      });
      return (
        <ul style={{ margin: 0, padding: 0 }}>
          {sortedAlerts.map((a) => {
            const hasCustom = typeof a.message === 'string' && a.message.trim().length > 0;
            const guestLabel = a.guestName || a.guest_name || 'Guest';
            const unitLabel = a.unitName || 'unit';
            const fallbackMsg = `Reservation — ${guestLabel} @ ${unitLabel} not paid`;
            const msg = hasCustom ? a.message : fallbackMsg;
            const suppressLinkTypes = new Set([
              'cfe-missing-payment',
              'internet-missing-payment',
              'water-missing-payment',
              'hoa-missing-payment',
            ]);
            const href = suppressLinkTypes.has(a.type)
              ? undefined
              : a.link ||
                (a.bookingId != null
                  ? `/bookings?view=basic&focus=${encodeURIComponent(a.bookingId)}`
                  : undefined);
            const color = a.severity === 'danger' ? 'red' : '#4B4F56'; // grey for warning and default

            // Special layout for unpaid private bookings
            if (a.type === 'booking-unpaid') {
              const payout =
                typeof a.payout === 'number'
                  ? a.payout
                  : a.payout != null
                  ? Number(a.payout)
                  : null;

              const normalizeDateLabel = (value) => {
                if (!value) return null;

                // If backend already sent a simple string, normalize that
                const extractDatePart = (raw) => {
                  if (!raw) return null;
                  const str = String(raw);
                  // Handle "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD HH:MM:SS.ffffff"
                  const mainPart = str.split('T')[0].split(' ')[0] || str;
                  const [yyyy, mm, dd] = mainPart.split('-');
                  if (yyyy && mm && dd) {
                    return `${dd}-${mm}-${yyyy}`;
                  }
                  return mainPart;
                };

                if (typeof value === 'string') {
                  return extractDatePart(value);
                }

                if (typeof value === 'object' && value.date) {
                  return extractDatePart(value.date);
                }

                return String(value);
              };

              const formatPayout = (amount) => {
                if (amount == null || Number.isNaN(amount)) return null;
                // European-style formatting: 16.000,00
                const formatted = Number(amount).toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
                return `$ ${formatted}`;
              };

              const checkInLabel = normalizeDateLabel(a.checkIn);
              const checkOutLabel = normalizeDateLabel(a.checkOut);

              return (
                <li
                  key={a.id}
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Left side: two-row content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: bullet + O2 icon + unit + guest + unpaid label */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ color: '#4B4F56' }}>•</span>
                      <img
                        src="/images/o2icon.png"
                        alt="O2"
                        style={{
                          width: 18,
                          height: 18,
                          objectFit: 'contain',
                          display: 'inline-block',
                          marginRight: 2,
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          color: '#000',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {unitLabel}
                      </span>
                      <span
                        style={{
                          color: '#4B4F56',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {guestLabel}
                      </span>
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                          color: '#b71c1c',
                        }}
                      >
                        unpaid
                      </span>
                      {href && (
                        <a
                          href={href}
                          style={{
                            marginLeft: 'auto',
                            color: '#1E6F68',
                            textDecoration: 'underline',
                            fontSize: '0.8rem',
                          }}
                        >
                          Open
                        </a>
                      )}
                    </div>

                    {/* Bottom row: arrows + dates + payout */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: '0.8rem',
                        color: '#4B4F56',
                        flexWrap: 'wrap',
                        paddingLeft: 40,
                      }}
                    >

                      {checkInLabel && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              color: '#1E6F68',
                              fontSize: '0.85rem',
                            }}
                          >
                            ↓
                          </span>
                          <span>{checkInLabel}</span>
                        </span>
                      )}

                      {checkOutLabel && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              color: '#d32f2f',
                              fontSize: '0.85rem',
                            }}
                          >
                            ↑
                          </span>
                          <span>{checkOutLabel}</span>
                        </span>
                      )}

                      {payout != null && !Number.isNaN(payout) && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontWeight: 500,
                          }}
                        >
                          {formatPayout(payout)}
                        </span>
                      )}
                    </div>
                  </div>

                </li>
              );
            }

            // Special layout for iCal booking conflicts
            if (a.type === 'booking-ical-conflict') {
              const normalizeDateLabel = (value) => {
                if (!value) return null;

                const extractDatePart = (raw) => {
                  if (!raw) return null;
                  const str = String(raw);
                  const mainPart = str.split('T')[0].split(' ')[0] || str;
                  const [yyyy, mm, dd] = mainPart.split('-');
                  if (yyyy && mm && dd) {
                    return `${dd}-${mm}-${yyyy}`;
                  }
                  return mainPart;
                };

                if (typeof value === 'string') {
                  return extractDatePart(value);
                }

                if (typeof value === 'object' && value.date) {
                  return extractDatePart(value.date);
                }

                return String(value);
              };

              const bookingCheckInLabel = normalizeDateLabel(a.bookingCheckIn || a.checkIn);
              const bookingCheckOutLabel = normalizeDateLabel(a.bookingCheckOut || a.checkOut);

              const icalRawStart = a.icalCheckIn || a.eventDtStart || a.dtstart;
              const icalRawEnd = a.icalCheckOut || a.eventDtEnd || a.dtend;
              const icalCheckInLabel = normalizeDateLabel(icalRawStart);
              const icalCheckOutLabel = normalizeDateLabel(icalRawEnd);

              // Map conflictType to a human label
              const conflictLabel = (() => {
                if (a.conflictType === 'date_mismatch') return 'DATE MISMATCH';
                if (a.conflictType === 'missing_in_ical') return 'MISSING IN ICAL';
                if (a.conflictType === 'overlap') return 'OVERLAP';
                if (a.conflictType === 'suspected_cancelled' || a.dateSyncStatus === 'suspected_cancelled') {
                  return 'SUSPECTED CANCELLED';
                }
                return 'ICAL CONFLICT';
              })();
              const conflictColor =
                conflictLabel === 'SUSPECTED CANCELLED'
                  ? '#FF5A5F' // Airbnb-like coral red
                  : '#8d6e00'; // existing amber for other conflict types

              const sourceLabel = (() => {
                if (!a.bookingSource) return 'O2';
                if (String(a.bookingSource).toLowerCase() === 'airbnb') return 'Airbnb';
                return 'O2';
              })();

              const isAirbnbSource =
                a.bookingSource &&
                String(a.bookingSource).toLowerCase() === 'airbnb';

              const isPrivateSource =
                a.bookingSource &&
                String(a.bookingSource).toLowerCase() === 'private';

              const isSuspectedCancelled =
                a.conflictType === 'suspected_cancelled' ||
                a.dateSyncStatus === 'suspected_cancelled';

              const shouldShowDismissX =
                isPrivateSource &&
                a.conflictType === 'date_mismatch' &&
                !icalCheckInLabel &&
                !icalCheckOutLabel;

              const displayReservationCode = a.reservationCode || a.code || null;

              const airbnbConflictHref =
                isAirbnbSource && a.bookingId != null
                  ? `/bookings-ical?bookingId=${encodeURIComponent(
                      a.bookingId
                    )}&from=${encodeURIComponent('/manager-dashboard')}`
                  : null;

              const primaryHref =
                airbnbConflictHref ||
                a.bookingReservationUrl ||
                a.reservationUrl ||
                href;

              return (
                <li
                  key={a.id}
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: bullet + source tag + unit + guest + conflict label */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ color: '#4B4F56' }}>•</span>
                      {/* Source tag: Airbnb logo, O2 icon for private, or simple O2 tag */}
                      {sourceLabel === 'Airbnb' ? (
                        <img
                          src="/images/airbnb.png"
                          alt="Airbnb"
                          style={{
                            width: 18,
                            height: 18,
                            objectFit: 'contain',
                            display: 'inline-block',
                            marginRight: 2,
                          }}
                        />
                      ) : isPrivateSource ? (
                        <img
                          src="/images/o2icon.png"
                          alt="Private"
                          style={{
                            width: 18,
                            height: 18,
                            objectFit: 'contain',
                            display: 'inline-block',
                            marginRight: 2,
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            padding: '1px 4px',
                            borderRadius: 4,
                            border: '1px solid rgba(255,255,255,0.4)',
                            background: '#1E6F68',
                            color: '#fff',
                          }}
                        >
                          O2
                        </span>
                      )}
                      <span
                        style={{
                          fontWeight: 600,
                          color: '#000',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {unitLabel}
                      </span>
                      <span
                        style={{
                          color: '#4B4F56',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {guestLabel}
                      </span>
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                          color: conflictColor,
                        }}
                      >
                        {conflictLabel}
                      </span>
                      {shouldShowDismissX ? (
              <button
                onClick={() => dismissAlert && dismissAlert(a.id)}
                style={{
                  marginLeft: 'auto',
                  border: 'none',
                  background: 'transparent',
                  color: '#d32f2f',
                  borderRadius: 0,
                  padding: '0 16px 0 0',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  lineHeight: 1,
                }}
                aria-label="Dismiss alert"
                title="Dismiss"
              >
                ×
              </button>
                      ) : (
                        primaryHref && (
                          <a
                            href={primaryHref}
                            style={{
                              marginLeft: 'auto',
                              color: '#1E6F68',
                              textDecoration: 'underline',
                              fontSize: '0.8rem',
                            }}
                          >
                            Open
                          </a>
                        )
                      )}
                    </div>

                    {/* Bottom row */}
                    {isSuspectedCancelled ? (
                      // Suspected cancelled: reservation not found in iCal + booking dates
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: '#4B4F56',
                          paddingLeft: 40,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>
                          {displayReservationCode ? (
                            <strong>{displayReservationCode}</strong>
                          ) : null}{' '}
                          not found in iCal
                        </span>
                        {(bookingCheckInLabel || bookingCheckOutLabel) && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            {bookingCheckInLabel && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    color: '#1E6F68',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  ↓
                                </span>
                                <span>{bookingCheckInLabel}</span>
                              </span>
                            )}
                            {bookingCheckOutLabel && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    color: '#d32f2f',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  ↑
                                </span>
                                <span>{bookingCheckOutLabel}</span>
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    ) : (
                      // Booking vs iCal dates comparison
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          fontSize: '0.8rem',
                          color: '#4B4F56',
                          paddingLeft: 40,
                        }}
                      >
                        {/* Booking row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 500,
                              minWidth: 40,
                              marginRight: 2,
                            }}
                          >
                            Table:
                          </span>
                          {bookingCheckInLabel && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span
                                style={{
                                  color: '#1E6F68',
                                  fontSize: '0.85rem',
                                }}
                              >
                                ↓
                              </span>
                              <span>{bookingCheckInLabel}</span>
                            </span>
                          )}
                          {bookingCheckOutLabel && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span
                                style={{
                                  color: '#d32f2f',
                                  fontSize: '0.85rem',
                                }}
                              >
                                ↑
                              </span>
                              <span>{bookingCheckOutLabel}</span>
                            </span>
                          )}
                        </div>

                        {/* iCal / Airbnb row (only if we have at least one date) */}
                        {(icalCheckInLabel || icalCheckOutLabel) && (
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
                                fontWeight: 500,
                                minWidth: 60,
                              }}
                            >
                              Airbnb:
                            </span>
                            {icalCheckInLabel && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    color: '#1E6F68',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  ↓
                                </span>
                                <span>{icalCheckInLabel}</span>
                              </span>
                            )}
                            {icalCheckOutLabel && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    color: '#d32f2f',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  ↑
                                </span>
                                <span>{icalCheckOutLabel}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            }

            // Special layout for service payment alerts (HOA / Internet / Water / CFE)
            if (
              a.type === 'service-payment-overdue' ||
              a.type === 'service-payment-due-soon' ||
              a.type === 'service-payment-mismatch'
            ) {
              const serviceLabel = a.service || 'Service';
              const yearMonth = a.yearMonth || '';
              const deadlineDay = a.deadline != null ? Number(a.deadline) : null;

              // Build deep-link for mismatch alerts into Unit Transactions
              const fromPath = '/manager-dashboard';
              const txIds = Array.isArray(a.transactionIds) ? a.transactionIds : [];
              const primaryTxId =
                a.primaryTransactionId != null && Number.isFinite(Number(a.primaryTransactionId))
                  ? Number(a.primaryTransactionId)
                  : null;

              let mismatchHref = null;
              if (a.type === 'service-payment-mismatch') {
                if (primaryTxId && txIds.length === 1) {
                  // Single transaction: open edit drawer directly
                  mismatchHref = `/unit-transactions?txId=${encodeURIComponent(
                    primaryTxId
                  )}&from=${encodeURIComponent(fromPath)}`;
                } else {
                  // Multiple (or unknown) transactions: jump to unit transactions context
                  const params = new URLSearchParams();
                  if (a.unitId != null) params.set('unit', String(a.unitId));
                  if (serviceLabel) params.set('service', serviceLabel);
                  if (yearMonth) params.set('period', yearMonth);
                  params.set('from', fromPath);
                  mismatchHref = `/unit-transactions?${params.toString()}`;
                }
              }

              const [periodYear, periodMonth] = yearMonth && yearMonth.includes('-')
                ? yearMonth.split('-')
                : [null, null];

              const dueDateLabel =
                periodYear && periodMonth && deadlineDay
                  ? `${String(deadlineDay).padStart(2, '0')}-${String(periodMonth).padStart(2, '0')}-${periodYear}`
                  : null;

              // Compute daysUntil for due-soon alerts (based on Cancun calendar dates)
              let daysUntil = null;
              if (
                a.type === 'service-payment-due-soon' &&
                periodYear &&
                periodMonth &&
                deadlineDay
              ) {
                // Build deadline date as YYYY-MM-DD in Cancun
                const deadlineYmd = `${String(periodYear)}-${String(periodMonth).padStart(
                  2,
                  '0'
                )}-${String(deadlineDay).padStart(2, '0')}`;

                const today = new Date();
                const todayYmd = getCancunYmd(today);

                if (todayYmd && deadlineYmd) {
                  const [ty, tm, td] = todayYmd.split('-').map(Number);
                  const [dy, dm, dd] = deadlineYmd.split('-').map(Number);

                  const todayLocal = new Date(ty, tm - 1, td);
                  const deadlineDate = new Date(dy, dm - 1, dd);

                  const diffMs = deadlineDate.getTime() - todayLocal.getTime();
                  daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
                }
              }

              let statusLabel = '';
              let statusColor = '#8d6e00'; // amber by default

              if (a.type === 'service-payment-overdue') {
                statusLabel = 'OVERDUE';
                statusColor = '#b71c1c';
              } else if (a.type === 'service-payment-due-soon') {
                statusLabel = 'DUE SOON';
                statusColor = '#8d6e00';
              } else if (a.type === 'service-payment-mismatch') {
                statusLabel = 'MISMATCH';
                statusColor = '#F57C4D';
              }

              const formatMoney = (value) => {
                if (value == null || Number.isNaN(Number(value))) return null;
                return `$ ${Number(value).toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`;
              };

              const expectedAmount = formatMoney(a.expected);
              const paidAmount = formatMoney(a.paid);

              return (
                <li
                  key={a.id}
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: bullet + unit + service + status label + Open */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ color: '#4B4F56' }}>•</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: '#000',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {unitLabel}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          marginLeft: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#6b7280',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.7rem',
                            textTransform: 'uppercase',
                            letterSpacing: 0.4,
                            color: '#1E6F68',
                          }}
                        >
                          {serviceLabel}
                        </span>
                      </span>
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                          color: statusColor,
                        }}
                      >
                        {statusLabel}
                      </span>
                      {a.type === 'service-payment-mismatch' && mismatchHref && (
                        <a
                          href={mismatchHref}
                          style={{
                            marginLeft: 'auto',
                            color: '#1E6F68',
                            textDecoration: 'underline',
                            fontSize: '0.8rem',
                          }}
                        >
                          Open
                        </a>
                      )}
                    </div>

                    {/* Bottom row: deadline and amounts */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        fontSize: '0.8rem',
                        color: '#4B4F56',
                        paddingLeft: 40,
                      }}
                    >
                      {a.type === 'service-payment-mismatch' ? (
                        // For mismatches, render (year-month) and amounts on a single row
                        (yearMonth || expectedAmount || paidAmount) && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              flexWrap: 'wrap',
                            }}
                          >
                            {yearMonth ? (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  color: '#6b7280',
                                }}
                              >
                                ({yearMonth})
                              </span>
                            ) : null}
                            {expectedAmount && (
                              <span>
                                Esperado: <strong>{expectedAmount}</strong>
                              </span>
                            )}
                            {paidAmount && (
                              <span>
                                Pagado: <strong>{paidAmount}</strong>
                              </span>
                            )}
                          </div>
                        )
                      ) : (
                        <>
                          {/* Deadline / period row */}
                          {(dueDateLabel || yearMonth) && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexWrap: 'wrap',
                              }}
                            >
                              {dueDateLabel ? (
                                <span>
                                  Vencimiento {dueDateLabel}
                                </span>
                              ) : null}
                              {a.type === 'service-payment-due-soon' && daysUntil !== null ? (
                                <span
                                  style={{
                                    fontSize: '0.8rem',
                                    color: '#4B4F56',
                                    fontWeight: 600,
                                  }}
                                >
                                  {daysUntil === 0
                                    ? 'Hoy'
                                    : daysUntil === 1
                                    ? '1 día'
                                    : `${daysUntil} días`}
                                </span>
                              ) : yearMonth ? (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#6b7280',
                                  }}
                                >
                                  ({yearMonth})
                                </span>
                              ) : null}
                            </div>
                          )}

                          {/* Amount row (if available) */}
                          {(expectedAmount || paidAmount) && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                flexWrap: 'wrap',
                              }}
                            >
                              {expectedAmount && (
                                <span>
                                  Esperado: <strong>{expectedAmount}</strong>
                                </span>
                              )}
                              {paidAmount && (
                                <span>
                                  Pagado: <strong>{paidAmount}</strong>
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleServiceDismiss(a)}
                    style={{
                      marginLeft: 'auto',
                      border: 'none',
                      background: 'transparent',
                      color: '#d32f2f',
                      borderRadius: 0,
                      padding: '0 16px 0 0',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      lineHeight: 1,
                    }}
                    aria-label="Dismiss alert"
                    title="Dismiss"
                  >
                    ×
                  </button>
                </li>
              );
            }

            // Default layout for all other alert types
            return (
              <li
                key={a.id}
                style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}
              >
                <span style={{ color }}>{msg}</span>
                {a.dueDay && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: '0.75rem',
                      background: '#eee',
                      borderRadius: 4,
                      padding: '1px 4px',
                      color: '#333',
                    }}
                  >
                    Día {a.dueDay}
                  </span>
                )}
                {href && (
                  <a href={href} style={{ color: '#1E6F68', textDecoration: 'underline' }}>
                    Open
                  </a>
                )}
                <button
                  onClick={() => dismissAlert(a.id)}
                  style={{
                    marginLeft: 'auto',
                    border: 'none',
                    background: 'transparent',
                    color: '#d32f2f',
                    borderRadius: 0,
                    padding: '0 16px 0 0',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    lineHeight: 1,
                  }}
                  aria-label="Dismiss alert"
                  title="Dismiss"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    return (
      <div
        style={{
          marginTop: '0.5rem',
          color: '#4B4F56',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        No warnings
      </div>
    );
  };

  if (embedded) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.75rem 0',
          }}
        >
          {renderContent()}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #d4e4e1',
        borderLeft: '1px solid #d4e4e1',
        borderRadius: 6,
        backgroundColor: '#fff',
        height: '250px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          backgroundColor: '#1E6F68',
          color: '#fff',
          padding: '6px 10px',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <strong>Alerts</strong>
        <span style={{ fontSize: 12 }}>
          {alerts.length} item{alerts.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div
        style={{
          borderTop: '1px solid #d4e4e1',
          background: '#fff',
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 6,
          padding: '0.75rem 1rem',
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}
