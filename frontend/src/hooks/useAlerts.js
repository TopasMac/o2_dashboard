import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../api';

// ---- DEBUG TOGGLE (console.debug logs) ----
const DEBUG_ALERTS = false;
const dbg = (...args) => { if (DEBUG_ALERTS && typeof console !== 'undefined' && console.debug) console.debug('[useAlerts]', ...args); };

// Local helpers kept here so both dashboards share identical behavior
const parseYmd = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(s);
  // construct local date without TZ shift
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const daysBetween = (a, b) => {
  const ONE = 24 * 60 * 60 * 1000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / ONE);
};

const LS_KEY = 'dashboard:dismissedAlerts';

const loadDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
  catch { return new Set(); }
};

const saveDismissed = (setObj) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(setObj))); } catch {}
};

// Normalize API Platform collection

const ymToken = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // yyyy-mm
const sameYm = (iso, ymtok) => {
  if (!iso) return false;
  const m = String(iso).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return `${m[1]}-${m[2]}` === ymtok;
};

// Text normalization: lowercase, trim, remove accents
const normText = (s) => {
  const base = String(s ?? '').toLowerCase().trim();
  // strip diacritics
  return base.normalize ? base.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : base;
};
// Check if a transaction is a "Pago de Servicios" for any of the provided keywords
const isServicePayment = (t, keywords = []) => {
  const cat = normText(t?.categoryName ?? t?.category?.name ?? t?.category ?? '');
  if (cat !== 'pago de servicios') return false;
  const text = normText((t?.description ?? t?.notes ?? ''));
  return keywords.some((kw) => text.includes(normText(kw)));
};

// --- CFE billing helpers ---
const normalizeCfePeriod = (p) => {
  const s = String(p ?? '').trim().toLowerCase();
  if (s === '2' || s === 'bimonthly' || s === 'bi-monthly' || s === 'bimonth' || s === 'bimestral' || s === 'bi') return 2;
  if (s === '1' || s === 'monthly' || s === 'mensual' || s === '') return 1;
  const n = Number.isFinite(Number(s)) ? Number(s) : NaN;
  return n === 2 ? 2 : 1; // default monthly
};

// month: 1-12, startingMonth: 1-12
const isCfeBillingMonth = (year, month, startingMonth, period) => {
  const per = normalizeCfePeriod(period);
  if (per === 1) return true; // monthly → every month is billing
  const start = Math.min(12, Math.max(1, Number(startingMonth || 1)));
  // Bimonthly: bill on months congruent to starting month modulo 2
  const diff = ((month - start) % 2 + 2) % 2;
  return diff === 0;
};

/**
 * useAlerts
 *
 * If `serverAlerts` is provided (e.g., from /api/month-summary), the hook will
 * use that list and skip all internal fetching/computation.
 * Otherwise, it falls back to the legacy flow (may fetch bookings/units/transactions).
 *
 * @param {Object} options
 * @param {Array}  [options.bookings]      Optional array of booking objects.
 * @param {boolean}[options.autoFetch=true] If true and bookings not provided, fetch from API
 * @param {Array}  [options.serverAlerts]  Optional precomputed alerts from server.
 * @returns {{ alerts: Array, dismissAlert: Function, count: number, refresh: Function, loading: boolean, error: any, refreshGlobalDismissals: Function }}
 */
export default function useAlerts({ bookings, autoFetch = true, serverAlerts } = {}) {
  const [internalBookings, setInternalBookings] = useState(null);
  const [internalUnits, setInternalUnits] = useState(null);
  const [internalU2Tx, setInternalU2Tx] = useState(null);
  const [internalCondos, setInternalCondos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [internalServerAlerts, setInternalServerAlerts] = useState(null);

  // ---- If serverAlerts provided, we still keep hooks order; switch behavior via a flag ----
  const alertsFromServer = useMemo(() => {
    if (Array.isArray(serverAlerts)) {
      return serverAlerts;
    }
    if (Array.isArray(internalServerAlerts)) {
      return internalServerAlerts;
    }
    return null;
  }, [serverAlerts, internalServerAlerts]);
  const hasServer = alertsFromServer !== null;
  dbg('init', { hasServer, usingServerAlerts: !!alertsFromServer });

  // Fetch bookings only when not provided and autoFetch enabled
  const refresh = useCallback(async () => {
    if (hasServer || bookings || !autoFetch) return;
    dbg('refresh:start', { hasServer, hasBookingsProp: !!bookings, autoFetch });
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/dashboard/alerts');
      const service = Array.isArray(data?.serviceAlerts) ? data.serviceAlerts : [];
      const reservations = Array.isArray(data?.reservationAlerts) ? data.reservationAlerts : [];
      const flat = [...service, ...reservations];

      dbg('refresh:data', {
        serviceAlerts: service.length,
        reservationAlerts: reservations.length,
        total: flat.length,
      });

      setInternalServerAlerts(flat);
    } catch (e) {
      dbg('refresh:error', e?.message || e);
      setError(e);
    } finally {
      dbg('refresh:done');
      setLoading(false);
    }
  }, [hasServer, bookings, autoFetch]);

  useEffect(() => { refresh(); }, [refresh]);


  const source = useMemo(() => bookings ?? internalBookings ?? [], [bookings, internalBookings]);

  const units = useMemo(() => internalUnits ?? [], [internalUnits]);
  const u2tx  = useMemo(() => internalU2Tx ?? [], [internalU2Tx]);
  const condos = useMemo(() => internalCondos ?? [], [internalCondos]);

  const alerts = useMemo(() => {
    dbg('compute:start', { hasServer, sourceCount: Array.isArray(source) ? source.length : 0 });
    if (hasServer) {
      const allDismissed = new Set(dismissed);
      return alertsFromServer.filter(a => !allDismissed.has(a?.id));
    }
    if (!Array.isArray(source) || !source.length) return [];

    const today = new Date();
    const year = today.getFullYear();
    const monthNum = today.getMonth() + 1; // 1-12
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    dbg('compute:context', { ym: ymToken(today), year, monthNum });

    // Build map: condo_id -> { hoa_due_day }
    const condoDueMap = new Map();
    for (const c of condos) {
      const cid = c.id ?? parseInt(String(c['@id'] || '').split('/').pop(), 10);
      if (!cid) continue;
      const due = Number(c.hoa_due_day ?? c.hoaDueDay ?? c.hoa_payment_day ?? 0);
      condoDueMap.set(String(cid), Number.isFinite(due) ? due : 0);
    }

    const raw = [];
    for (const b of source) {
      const statusNorm = String(b.status || '').toLowerCase();
      if (statusNorm.startsWith('cancel')) {
        continue; // skip cancelled bookings for all booking-based alerts
      }

      const sourcePrivate = String(b.source || '').toLowerCase() === 'private';
      // Prefer explicit isPaid / is_paid, fallback to legacy paid flag
      const paid = Boolean(
        b.isPaid ??
        b.is_paid ??
        b.paid
      );
      const isOngoing = statusNorm === 'ongoing';
      const isPast = statusNorm === 'past';

      // Unpaid private bookings (both ongoing and past) should always raise an alert
      if (sourcePrivate && !paid && (isOngoing || isPast)) {
        const id = `booking-unpaid-${b.id}`;
        const codeRaw = (b.confirmationCode || b.confirmation_code || b.code || (b.id != null ? String(b.id) : ''));
        const codeLabel = codeRaw ? `#${codeRaw}` : '';
        const unitName = (b.unitName || b.unit_name || b.unit || 'unit');
        const message = codeLabel
          ? `Reservation ${codeLabel} — ${unitName || 'unit'} not paid`
          : `Reservation — ${unitName || 'unit'} not paid`;
        raw.push({
          id,
          type: 'booking-unpaid',
          severity: 'warning',
          bookingId: b.id ?? b.bookingId ?? codeRaw ?? '',
          code: codeRaw,
          unitName,
          message,
          link: `/bookings?view=basic&focus=${encodeURIComponent(b.id ?? '')}`,
        });
      }
    }
    dbg('compute:bookingsAlertsCount', raw.filter(a => a.type === 'booking-unpaid').length);

    // ——— CFE missing-payment alerts (current month) ———
    const ym = ymToken(today); // yyyy-mm of now

    // Build a fast index of transactions by unit and ym
    const txIndex = new Map();
    for (const t of u2tx) {
      const dateIso = t.date || t.transactionDate || t.createdAt || t.created_at || '';
      if (!sameYm(dateIso, ym)) continue;
      const unitId = (t.unit && (t.unit.id || t.unitId)) || t.unitId || t.unit_id || null;
      if (unitId == null) continue;
      const key = String(unitId);
      const arr = txIndex.get(key) || [];
      arr.push(t);
      txIndex.set(key, arr);
    }
    let txMonthTotal = 0;
    for (const arr of txIndex.values()) txMonthTotal += arr.length;
    dbg('compute:txIndex', { unitsWithTxThisMonth: txIndex.size, txMonthTotal });

    // CFE
    let cfeCandidates = 0, cfeAlerts = 0;
    for (const u of units) {
      // Normalize fields from various shapes
      const id = u.id ?? parseInt(String(u['@id'] || '').split('/').pop(), 10);
      const cfeEnabled = Number(u.cfe ?? u.cfe_enabled ?? u.cfeFlag ?? u.cfe_flag ?? 0) === 1;
      if (!id || !cfeEnabled) continue;
      if (id && cfeEnabled) cfeCandidates++;

      const cfePeriod = u.cfe_period ?? u.cfePeriod ?? u.cfe_cycle ?? null;
      const cfeStartMonth = u.cfe_starting_month ?? u.cfeStartingMonth ?? u.cfe_start_month ?? null;
      const isBilling = isCfeBillingMonth(year, monthNum, cfeStartMonth, cfePeriod);
      if (!isBilling) continue; // skip non-billing months

      // Only trigger within 3 days before due date (or any time after due) for this billing month
      const dueDay = Number(u.cfe_payment_day ?? u.cfePaymentDay ?? u.cfe_due_day ?? 1);
      const dueDate = new Date(year, monthNum - 1, Math.min(28, Math.max(1, dueDay))); // cap to 28 to avoid DST/overflow
      const daysToDue = daysBetween(today, dueDate); // positive = days until due; negative = overdue
      if (daysToDue > 3) {
        continue; // too early; skip alert for now
      }

      // Check if there is a transaction with category = "Pago de Servicios" and description contains "CFE"
      const txList = txIndex.get(String(id)) || [];
      const hasCfePaymentInMonth = txList.some((t) => isServicePayment(t, ['cfe']));
      // Grace window: allow matches within ±5 days of due date even if recorded in adjacent month
      let hasCfePaymentNearDue = false;
      if (!hasCfePaymentInMonth) {
        const ALL_FOR_UNIT = (Array.isArray(u2tx) ? u2tx : []).filter((t) => {
          const unitId = (t.unit && (t.unit.id || t.unitId)) || t.unitId || t.unit_id || null;
          return String(unitId) === String(id);
        });
        const due = new Date(year, monthNum - 1, Math.min(28, Math.max(1, dueDay)));
        const from = new Date(due.getTime() - 5 * 24 * 60 * 60 * 1000);
        const to   = new Date(due.getTime() + 5 * 24 * 60 * 60 * 1000);
        hasCfePaymentNearDue = ALL_FOR_UNIT.some((t) => {
          const dIso = t.date || t.transactionDate || t.createdAt || t.created_at || '';
          const d = parseYmd(dIso);
          if (!(d instanceof Date) || isNaN(d)) return false;
          return d >= from && d <= to && isServicePayment(t, ['cfe']);
        });
      }
      const hasCfePayment = hasCfePaymentInMonth || hasCfePaymentNearDue;

      if (!hasCfePayment) {
        const serviceLabel = 'CFE';
        const unitLabel = (u.unitName || u.name || id);
        const overdue = daysToDue < 0;
        raw.push({
          id: `cfe-missing-${id}-${ym}`,
          type: 'cfe-missing-payment',
          severity: overdue ? 'danger' : 'warning',
          unitId: id,
          message: `${serviceLabel} ${unitLabel} - ${overdue ? 'Pago vencido' : 'Pago pendiente'}`,
          dueDay: Number(dueDay),
          link: '/o2-transactions',
        });
        cfeAlerts++;
      }
    }
    dbg('compute:cfe', { candidates: cfeCandidates, alerts: cfeAlerts });

    // Internet
    let netCandidates = 0, netAlerts = 0;
    for (const u of units) {
      const id = u.id ?? parseInt(String(u['@id'] || '').split('/').pop(), 10);
      const internetEnabled = Number(u.internet ?? u.internet_enabled ?? u.internetFlag ?? u.internet_flag ?? 0) === 1;
      if (!id || !internetEnabled) continue;
      if (id && internetEnabled) netCandidates++;

      // Due-day logic (assume monthly cycle)
      const dueDayInt = Number(u.internet_deadline ?? u.internetDeadline ?? u.internet_payment_day ?? 0);
      if (!Number.isFinite(dueDayInt) || dueDayInt <= 0) {
        // No due day configured → skip alerting
        continue;
      }
      const internetDueDate = new Date(year, monthNum - 1, Math.min(28, Math.max(1, dueDayInt)));
      const daysToInternetDue = daysBetween(today, internetDueDate);
      if (daysToInternetDue > 3) {
        continue; // too early; only within 3 days or overdue
      }

      // Check if there is a transaction with category = "Pago de Servicios" and description contains "Internet"
      const txList = txIndex.get(String(id)) || [];
      const hasInternetPaymentInMonth = txList.some((t) => isServicePayment(t, ['internet']));
      // Grace window: allow matches within ±5 days of due date even if recorded in adjacent month
      let hasInternetPaymentNearDue = false;
      if (!hasInternetPaymentInMonth) {
        const ALL_FOR_UNIT = (Array.isArray(u2tx) ? u2tx : []).filter((t) => {
          const unitId = (t.unit && (t.unit.id || t.unitId)) || t.unitId || t.unit_id || null;
          return String(unitId) === String(id);
        });
        const due = new Date(year, monthNum - 1, Math.min(28, Math.max(1, dueDayInt)));
        const from = new Date(due.getTime() - 5 * 24 * 60 * 60 * 1000);
        const to   = new Date(due.getTime() + 5 * 24 * 60 * 60 * 1000);
        hasInternetPaymentNearDue = ALL_FOR_UNIT.some((t) => {
          const dIso = t.date || t.transactionDate || t.createdAt || t.created_at || '';
          const d = parseYmd(dIso);
          if (!(d instanceof Date) || isNaN(d)) return false;
          return d >= from && d <= to && isServicePayment(t, ['internet']);
        });
      }
      const hasInternetPayment = hasInternetPaymentInMonth || hasInternetPaymentNearDue;

      if (!hasInternetPayment) {
        const serviceLabel = 'Internet';
        const unitLabel = (u.unitName || u.name || id);
        const overdue = daysToInternetDue < 0;
        raw.push({
          id: `internet-missing-${id}-${ym}`,
          type: 'internet-missing-payment',
          severity: overdue ? 'danger' : 'warning',
          unitId: id,
          message: `${serviceLabel} ${unitLabel} - ${overdue ? 'Pago vencido' : 'Pago pendiente'}`,
          dueDay: Number(dueDayInt),
          // no link required
        });
        netAlerts++;
      }
    }
    dbg('compute:internet', { candidates: netCandidates, alerts: netAlerts });

    // HOA
    let hoaCandidates = 0, hoaAlerts = 0;
    for (const u of units) {
      const id = u.id ?? parseInt(String(u['@id'] || '').split('/').pop(), 10);
      const hoaRaw = (u.hoa ?? u.hoa_enabled ?? u.hoaFlag ?? u.hoa_flag ?? 0);
      const hoaEnabled = (Number(hoaRaw) === 1) || (String(hoaRaw).toLowerCase() === 'yes' || String(hoaRaw).toLowerCase() === 'true');
      if (!id || !hoaEnabled) continue;
      if (id && hoaEnabled) hoaCandidates++;

      // Due-day logic (monthly) — fallback to condo.hoa_due_day when missing on unit
      let hoaDueDay = Number(u.hoa_due_day ?? u.hoaDueDay ?? u.hoa_payment_day ?? 0);
      if (!Number.isFinite(hoaDueDay) || hoaDueDay <= 0) {
        const condoId = u.condo_id ?? u.condoId ?? u.condo?.id ?? parseInt(String(u.condo || '').split('/').pop(), 10);
        const fromCondo = condoDueMap.get(String(condoId)) || 0;
        hoaDueDay = Number(fromCondo);
      }
      if (!Number.isFinite(hoaDueDay) || hoaDueDay <= 0) {
        // No due day configured anywhere → skip alerting
        continue;
      }
      const hoaDueDate = new Date(year, monthNum - 1, Math.min(28, Math.max(1, hoaDueDay)));
      const daysToHoaDue = daysBetween(today, hoaDueDate);
      if (daysToHoaDue > 3) {
        continue; // too early; only within 3 days or overdue
      }

      // Check if there is a transaction with category = "Pago de Servicios" and description contains "HOA"
      const txList = txIndex.get(String(id)) || [];
      const hasHoaPayment = txList.some((t) => {
        const cat = (t.categoryName || t.category?.name || t.category || '').toString().toLowerCase();
        const desc = (t.description || t.notes || '').toString().toLowerCase();
        return cat === 'pago de servicios' && desc.includes('hoa');
      });

      if (!hasHoaPayment) {
        const serviceLabel = 'HOA';
        const unitLabel = (u.unitName || u.name || id);
        const overdue = daysToHoaDue < 0;
        raw.push({
          id: `hoa-missing-${id}-${ym}`,
          type: 'hoa-missing-payment',
          severity: overdue ? 'danger' : 'warning',
          unitId: id,
          message: `${serviceLabel} ${unitLabel} - ${overdue ? 'Pago vencido' : 'Pago pendiente'}`,
          dueDay: Number(hoaDueDay),
          // no link required
        });
        hoaAlerts++;
      }
    }
    dbg('compute:hoa', { candidates: hoaCandidates, alerts: hoaAlerts });

    // Water (Aguakan)
    let waterCandidates = 0, waterAlerts = 0;
    for (const u of units) {
      const id = u.id ?? parseInt(String(u['@id'] || '').split('/').pop(), 10);
      const waterEnabled = Number(u.water ?? u.water_enabled ?? u.waterFlag ?? u.water_flag ?? 0) === 1;
      if (!id || !waterEnabled) continue;
      if (id && waterEnabled) waterCandidates++;

      // Due-day logic (monthly)
      const waterDueDay = Number(u.water_deadline ?? u.waterDeadline ?? u.water_payment_day ?? 0);
      if (!Number.isFinite(waterDueDay) || waterDueDay <= 0) {
        // No due day configured → skip alerting
        continue;
      }
      const waterDueDate = new Date(year, monthNum - 1, Math.min(28, Math.max(1, waterDueDay)));
      const daysToWaterDue = daysBetween(today, waterDueDate);
      if (daysToWaterDue > 3) {
        continue; // too early; only within 3 days or overdue
      }

      // Check if there is a transaction with category = "Pago de Servicios" and description contains "Aguakan" (with accent/spacing variants)
      const txList = txIndex.get(String(id)) || [];
      // Match "Aguakan" with accent/spacing variants
      const waterKeywords = ['aguakan', 'agüakan', 'agua kan', 'agua-kan'];
      const hasWaterPaymentInMonth = txList.some((t) => isServicePayment(t, waterKeywords));
      // Grace window: allow matches within ±5 days of due date even if they fall in adjacent month
      let hasWaterPaymentNearDue = false;
      if (!hasWaterPaymentInMonth) {
        const ALL_FOR_UNIT = (Array.isArray(u2tx) ? u2tx : []).filter((t) => {
          const unitId = (t.unit && (t.unit.id || t.unitId)) || t.unitId || t.unit_id || null;
          return String(unitId) === String(id);
        });
        const due = new Date(year, monthNum - 1, Math.min(28, Math.max(1, waterDueDay)));
        const from = new Date(due.getTime() - 5 * 24 * 60 * 60 * 1000);
        const to   = new Date(due.getTime() + 5 * 24 * 60 * 60 * 1000);
        hasWaterPaymentNearDue = ALL_FOR_UNIT.some((t) => {
          const dIso = t.date || t.transactionDate || t.createdAt || t.created_at || '';
          const d = parseYmd(dIso);
          if (!(d instanceof Date) || isNaN(d)) return false;
          return d >= from && d <= to && isServicePayment(t, waterKeywords);
        });
      }
      const hasWaterPayment = hasWaterPaymentInMonth || hasWaterPaymentNearDue;

      if (!hasWaterPayment) {
        const serviceLabel = 'Aguakan';
        const unitLabel = (u.unitName || u.name || id);
        const overdue = daysToWaterDue < 0;
        raw.push({
          id: `water-missing-${id}-${ym}`,
          type: 'water-missing-payment',
          severity: overdue ? 'danger' : 'warning',
          unitId: id,
          message: `${serviceLabel} ${unitLabel} - ${overdue ? 'Pago vencido' : 'Pago pendiente'}`,
          dueDay: Number(waterDueDay),
          // no link required
        });
        waterAlerts++;
      }
    }
    dbg('compute:water', { candidates: waterCandidates, alerts: waterAlerts });

    const allDismissed = new Set(dismissed);
    const filtered = raw.filter(a => !allDismissed.has(a.id));
    dbg('compute:final', { rawCount: raw.length, filteredCount: filtered.length, dismissedLocal: dismissed.size });
    return filtered;
  }, [hasServer, alertsFromServer, source, dismissed, units, u2tx, condos]);

  const dismissAlert = useCallback((id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  const refreshGlobalDismissals = useCallback(async () => {
    // No-op: global server-side alert_dismissals are deprecated; kept for API compatibility.
    return;
  }, []);

  return {
    alerts,
    dismissAlert,
    count: alerts.length,
    refresh,
    refreshGlobalDismissals,
    loading: hasServer ? false : loading,
    error,
  };
}