// frontend/src/pages/UnitMonthlyReport.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Divider, Typography, Paper, Chip, Drawer, IconButton, Snackbar, Alert, TextField, Autocomplete, Tooltip } from '@mui/material';
import PreviewOverlay from '../components/layouts/PreviewOverlay';
import UnitReportPayRequestDrawer from '../components/common/UnitReportPayRequestDrawer';
import { alpha } from '@mui/material/styles';
import AppDrawer from '../components/common/AppDrawer';
import api from '../api';
import EditReportCommentsForm from '../components/forms/UnitMonthlyReportPage/UnitMonthlyReportEditCommentForm';
import UnitMonthlyReportNewCommentForm from '../components/forms/UnitMonthlyReportPage/UnitMonthlyReportNewCommentForm';
import OccWNoteModal from '../components/modals/OccWNoteModal';
import UnitMonthlyReportEditBookingForm from '../components/forms/UnitMonthlyReportPage/UnitMonthlyReportEditBookingForm';
import UnitMonthlyEditUnitTransactionForm from '../components/forms/UnitMonthlyReportPage/UnitMonthlyEditUnitTransactionForm';
import HKTransactionEditFormRHF from '../components/forms/HKTransactionEditFormRHF';
import UnitLedgerNewFormRHF from '../components/forms/UnitLedgerNewFormRHF';
import BookingEditFormRHF from '../components/forms/BookingEditFormRHF';
import { PencilSquareIcon, XMarkIcon, DocumentTextIcon, CurrencyDollarIcon, EnvelopeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import EmailSendDrawer from '../components/common/EmailSendDrawer';
import O2ConfirmDialog from '../components/common/O2ConfirmDialog';
import PageScaffold from '../components/layout/PageScaffold';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';

// --- UI helpers ---
const peso = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  try {
    return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
  } catch {
    return `${n}`;
  }
};

const pick = (obj, keys) => keys.find(k => obj && obj[k] !== undefined) ?? null;

const pct = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return '-';
  return `${(x * 100).toFixed(1)}%`;
};
const num = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return '-';
  return x.toLocaleString('en-US');
};

const formatStay = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return '-';
  try {
    const toUtcDate = (s) => {
      if (typeof s !== 'string') return new Date(s);
      // If it's a plain date (YYYY-MM-DD), parse as UTC midnight to avoid TZ shifts
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00Z`);
      return new Date(s);
    };

    const inDate = toUtcDate(checkIn);
    const outDate = toUtcDate(checkOut);

    const opts = { month: 'short', timeZone: 'UTC' };
    const monIn = inDate.toLocaleDateString('es-MX', opts).replace('.', '');
    const monOut = outDate.toLocaleDateString('es-MX', opts).replace('.', '');

    const dIn = inDate.getUTCDate();
    const dOut = outDate.getUTCDate();
    const yIn = inDate.getUTCFullYear();
    const yOut = outDate.getUTCFullYear();

    if (yIn !== yOut) {
      return `${dIn} ${monIn} ${yIn} a ${dOut} ${monOut} ${yOut}`;
    }
    if (monIn !== monOut) {
      return `${dIn} ${monIn} a ${dOut} ${monOut} ${yOut}`;
    }
    return `${dIn} ${monIn} a ${dOut} ${monOut} ${yOut}`;
  } catch {
    return '-';
  }
};

const showPct = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return '-';
  // If value looks like 0..1, treat as fraction; else assume already percent
  const val = x <= 1 ? x * 100 : x;
  return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}%`;
};

// Money formatter: plain, dot thousands, comma decimals, no symbol
const money = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  try {
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return String(n);
  }
};

// Amount color helper: positive=success, negative=error, zero/invalid=text.disabled
const amtColor = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  if (v > 0) return 'success.main';
  if (v < 0) return 'error.main';
  return 'text.disabled';
};


// --- Minimal service layer using shared `api` wrapper ---
const service = {
  async listUnits() {
    const qs = new URLSearchParams({
      pagination: 'false',
      'order[unitName]': 'asc',
    });
    const res = await api.get(`/api/units?${qs.toString()}`);
    const data = res?.data ?? res;
    const items = Array.isArray(data) ? data : (data['hydra:member'] || []);
    const onlyActive = items.filter(u => String(u.status || '').toLowerCase() === 'active');
    return onlyActive.map(u => ({
      id: u.id,
      unitName: u.unitName,
      city: u.city,
      iri: u['@id'],
      paymentType: u.paymentType ?? u.payment_type ?? null,
      bankAccount: u.bankAccount ?? u.bank_account ?? null
    }));
  },

  async searchUnits(q) {
    const trimmed = (q || '').trim();
    if (!trimmed) return this.listUnits();

    try {
      const qs = new URLSearchParams({
        'unitName[partial]': trimmed,
        'order[unitName]': 'asc',
        pagination: 'false',
      });
      const res = await api.get(`/api/units?${qs.toString()}`);
      const data = res?.data ?? res;
      const items = Array.isArray(data) ? data : (data['hydra:member'] || []);
      if (items.length > 0) {
        const onlyActive = items.filter(u => String(u.status || '').toLowerCase() === 'active');
        return onlyActive.map(u => ({ id: u.id, unitName: u.unitName, city: u.city, iri: u['@id'] }));
      }
    } catch (_) {
      // ignore and fallback below
    }

    // Fallback: get all units and filter client-side by unitName
    const all = await this.listUnits();
    const low = trimmed.toLowerCase();
    return all
      .filter(u => u.unitName?.toLowerCase().includes(low)); // listUnits already filters to active
  },

  async fetchUnitMonthly({ unitId, yearMonth }) {
    const res = await api.post('/api/reports/unit-monthly', { unitId, yearMonth });
    return res?.data ?? res;
  },

  async fetchStatus({ unitId, yearMonth }) {
    const res = await api.get('/api/unit-monthly/status', { params: { unitId, yearMonth } });
    return res?.data ?? res;
  }
  ,
  async fetchUnitStatus(unitId, yearMonth) {
    const res = await api.get('/api/unit-monthly/status', { params: { unitId, yearMonth } });
    return res?.data ?? res;
  }
  ,
  async fetchUnitMonthBundle(unitId, yearMonth) {
    const res = await api.post('/api/reports/unit-monthly', { unitId, yearMonth });
    return res?.data ?? res;
  }
  ,
  async fetchMonthWorkflow(yearMonth) {
    const res = await api.get('/api/month-workflow', { params: { yearMonth } });
    return res?.data ?? res;
  }
};

const NotchedCard = ({ label, children, sx, action }) => (
  <Paper
    variant="outlined"
    sx={{
      position: 'relative',
      p: 1.5,
      borderRadius: 1,
      '&': { borderColor: 'divider' },
      width: 220,
      ...(sx || {}),
    }}
  >
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{
        position: 'absolute',
        top: -8,
        left: 12,
        px: 0.5,
        bgcolor: 'background.paper',
        lineHeight: 1,
      }}
    >
      {label}
    </Typography>
    {action && (
      <Box sx={{ position: 'absolute', top: 4, right: 8 }}>
        {action}
      </Box>
    )}
    {children}
  </Paper>
);

export default function UnitMonthlyReport() {
  // Filters
  const now = useMemo(() => new Date(), []);
  const prevMonthDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() - 1, 1), [now]);
  const [year, setYear] = useState(prevMonthDate.getFullYear());
  const [month, setMonth] = useState(prevMonthDate.getMonth() + 1);

  // Unit search & selection
  const [unitQuery, setUnitQuery] = useState('');
  const [unitResults, setUnitResults] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Preview data (for later steps)
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);
  const yearMonth = useMemo(() => `${year}-${String(month).padStart(2, '0')}`, [year, month]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  // PDF preview single source of truth flag
  const [usePdfPreview] = useState(true);
  // Helper to load PDF preview into previewUrl (for inline preview)
  const loadPreviewPdf = async () => {
    const uid = Number(selectedUnit?.id);
    const ym = String(yearMonth || '').trim();
    const ymOk = /^\d{4}-\d{2}$/.test(ym);
    if (!Number.isFinite(uid) || uid <= 0 || !ymOk) return;

    setPreviewBusy(true);
    if (previewUrl && previewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
    }
    setPreviewUrl('');
    try {
      // Updated to use V2 endpoint
      const res = await api.get(`/api/v2/reports/unit/${uid}/${ym}/preview.pdf`, {
        responseType: 'arraybuffer',
      });
      const pdfBlob = new Blob([res?.data || res], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      setPreviewUrl(url);
    } catch (_) {
      setPreviewUrl('');
    } finally {
      setPreviewBusy(false);
    }
  };
  // Workflow/status state
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusData, setStatusData] = useState(null);

  // Generate report state & toast
  const [genBusy, setGenBusy] = useState(false);
  // Confirm dialog for replacing an existing issued report
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [replaceConfirmCtx, setReplaceConfirmCtx] = useState({ uid: null, ym: '' });
  const [emailBusy, setEmailBusy] = useState(false);
  const [toast, setToast] = useState({ open:false, severity:'success', msg:'' });
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailInitial, setEmailInitial] = useState({
    to: '',
    cc: '',
    subject: '',
    htmlBody: '',
    attachments: []
  });
  const handleSendEmail = async () => {
    if (!selectedUnit?.id) return;
    const uid = Number(selectedUnit.id);
    const ym = yearMonth;
    if (!/^\d{4}-\d{2}$/.test(ym)) return;

    // Resolve default recipient (best-effort) from current bundle/status
    const pickEmail = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return v.find(Boolean) || null;
      const s = String(v).trim();
      return s || null;
    };

    const primaryEmail =
      pickEmail(previewData?.client?.email) ||
      pickEmail(previewData?.unit?.client?.email) ||
      pickEmail(previewData?.unit?.clientEmail) ||
      pickEmail(previewData?.unit?.client_email) ||
      null;

    const ccEmail =
      pickEmail(previewData?.client?.cc_email) ||
      pickEmail(previewData?.unit?.client?.cc_email) ||
      null;

    // Try to extract reportUrl from the current bundle (ledger row with a URL)
    const findReportUrl = () => {
      try {
        const ledger = Array.isArray(previewData?.ledger) ? previewData.ledger : [];
        const withUrl = ledger.filter(r => typeof r?.reportUrl === 'string' && r.reportUrl.trim() !== '');
        if (withUrl.length > 0) {
          // prefer the most recent by createdAt or highest id
          withUrl.sort((a, b) => {
            const ta = new Date(a.createdAt || a.txnDate || 0).getTime();
            const tb = new Date(b.createdAt || b.txnDate || 0).getTime();
            if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
            return Number(b.id || 0) - Number(a.id || 0);
          });
          return withUrl[0].reportUrl;
        }
        return null;
      } catch {
        return null;
      }
    };
    // Collect payment attachment as well
    const findPaymentUrl = () => {
      try {
        const ledger = Array.isArray(previewData?.ledger) ? previewData.ledger : [];
        // prefer explicit paymentUrl on payment entries; fallback to attachment shape if ever present
        const paymentRows = ledger.filter(r => {
          const et = String(r?.entryType || r?.entry_type || '').toLowerCase();
          const hasUrl = typeof r?.paymentUrl === 'string' && r.paymentUrl.trim() !== '';
          return hasUrl || et.includes('report payment');
        });
        if (paymentRows.length === 0) return null;
        paymentRows.sort((a, b) => {
          const ta = new Date(a.createdAt || a.txnDate || 0).getTime();
          const tb = new Date(b.createdAt || b.txnDate || 0).getTime();
          if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
          return Number(b.id || 0) - Number(a.id || 0);
        });
        const row = paymentRows[0];
        if (row && typeof row.paymentUrl === 'string' && row.paymentUrl.trim() !== '') {
          return row.paymentUrl;
        }
        // fallback: if a generic url field exists
        if (row && typeof row.reportUrl === 'string' && row.reportUrl.trim() !== '' &&
            String(row.entryType || '').toLowerCase().includes('payment')) {
          return row.reportUrl;
        }
        return null;
      } catch {
        return null;
      }
    };
    const reportUrl = findReportUrl();
    const paymentUrl = findPaymentUrl();
    // derive a filename
    const filename = `Owners2_${uid}_${ym}.pdf`;
    const attachments = [];
    if (reportUrl) attachments.push({ name: filename, url: reportUrl });
    if (paymentUrl) attachments.push({ name: `Owners2_${uid}_${ym}_payment.pdf`, url: paymentUrl });

    try {
      // Ask backend to render the exact email subject/body (includes signature)
      const resp = await api.post('/api/email-preview/report', {
        unitId: uid,
        yearMonth: ym,
        to: primaryEmail || undefined,
        cc: ccEmail || undefined,
      });
      const preview = resp?.data?.preview || {};
      setEmailInitial({
        to: preview.to || primaryEmail || '',
        cc: preview.cc || ccEmail || '',
        subject: preview.subject || '',
        htmlBody: preview.htmlBody || '',
        attachments,
      });
      setEmailOpen(true);
    } catch (e) {
      setToast({ open: true, severity: 'error', msg: e?.response?.data?.error || e?.message || 'Failed to build email preview' });
    }
  };

  const handleEmailSubmit = async (formValues) => {
    const ym = yearMonth;
    const uid = Number(selectedUnit?.id);
    if (!/^\d{4}-\d{2}$/.test(ym) || !Number.isFinite(uid)) return;

    const to = (formValues?.to || '').trim();
    const cc = (formValues?.cc || '').trim();
    const subject = formValues?.subject || '';

    // Collect both report and payment attachments, respecting user edits in the drawer
    const collectAttachments = () => {
      // 1) from form (respect user edits in the drawer)
      const atts = Array.isArray(formValues?.attachments) ? formValues.attachments : [];
      const cleaned = atts
        .map(a => (a && typeof a.url === 'string' && a.url.trim() !== '' ? a : null))
        .filter(Boolean);
      if (cleaned.length > 0) return cleaned;

      // 2) fallback from previewData.ledger (rebuild the same attachments list)
      const out = [];
      try {
        const ledger = Array.isArray(previewData?.ledger) ? previewData.ledger : [];
        // report
        const reports = ledger.filter(r => typeof r?.reportUrl === 'string' && r.reportUrl.trim() !== '');
        if (reports.length > 0) {
          reports.sort((a, b) => {
            const ta = new Date(a.createdAt || a.txnDate || 0).getTime();
            const tb = new Date(b.createdAt || b.txnDate || 0).getTime();
            if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
            return Number(b.id || 0) - Number(a.id || 0);
          });
          out.push({ name: `Owners2_${uid}_${ym}.pdf`, url: reports[0].reportUrl });
        }
        // payment
        const payments = ledger.filter(r => {
          const et = String(r?.entryType || r?.entry_type || '').toLowerCase();
          return (typeof r?.paymentUrl === 'string' && r.paymentUrl.trim() !== '') || et.includes('report payment');
        });
        if (payments.length > 0) {
          payments.sort((a, b) => {
            const ta = new Date(a.createdAt || a.txnDate || 0).getTime();
            const tb = new Date(b.createdAt || b.txnDate || 0).getTime();
            if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
            return Number(b.id || 0) - Number(a.id || 0);
          });
          const p = payments[0];
          const pUrl = (p && typeof p.paymentUrl === 'string' && p.paymentUrl.trim() !== '') ? p.paymentUrl : (p?.reportUrl || null);
          if (pUrl) out.push({ name: `Owners2_${uid}_${ym}_payment.pdf`, url: pUrl });
        }
      } catch {}
      return out;
    };
    const attachments = collectAttachments();
    const primaryAtt = attachments[0] || null;
    setEmailBusy(true);
    try {
      // We use /api/emails/send-report so we can include the attachment URL directly.
      // Body: prefer backend-rendered content from the drawer (subject/htmlBody).
      const body = {
        to,
        cc: cc || undefined,
        subject,
        htmlBody: formValues?.htmlBody || '', // built by backend preview endpoint earlier
        category: 'MONTH_REPORT',
        unitId: uid,
        yearMonth: ym,
        // Backward compatible single-attachment fields
        attach: attachments.length > 0,
        s3Url: primaryAtt ? primaryAtt.url : undefined,
        filename: primaryAtt ? primaryAtt.name : `Owners2_${uid}_${ym}.pdf`,
        // New multi-attachment array (if backend supports it)
        attachments: attachments.length ? attachments : undefined,
      };

      await api.post('/api/emails/send-report', body);

      setToast({ open: true, severity: 'success', msg: 'Email queued' });
      setEmailOpen(false);
      await handleLoadMonth();
    } catch (e) {
      setToast({ open: true, severity: 'error', msg: e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Failed to send email' });
    } finally {
      setEmailBusy(false);
    }
  };

  // --- Month Workflow Drawer state ---
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowSummary, setWorkflowSummary] = useState({ reports: { issued: 0, total: 0 }, o2: { paid: 0, total: 0 }, client: { received: 0, total: 0 } });
  const [workflowRows, setWorkflowRows] = useState([]); // [{ id, name, report, pay, email, order }]
  const [workflowCalcBusy, setWorkflowCalcBusy] = useState(false);
  // Simple cache for month workflow summary/status/bundle
  const statusCacheRef = React.useRef(new Map());   // key: `${unitId}:${ym}` -> status
  const bundleCacheRef = React.useRef(new Map());   // key: `${unitId}:${ym}` -> bundle
  const lastWorkflowYmRef = React.useRef(null);     // remember last yearMonth loaded
  // --- Month Workflow summary loader ---
  const loadMonthWorkflowSummary = async () => {
    try {
      setWorkflowLoading(true);
      const ym = yearMonth;
      const resp = await service.fetchMonthWorkflow(ym);
      const items = Array.isArray(resp?.units) ? resp.units : [];

      // Helper to normalize bank account field
      const normalizeBank = (v) => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s === '-') return null;
        return s;
      };

      let reportsIssued = 0, reportsTotal = 0;
      let o2Paid = 0, o2Total = 0;
      let clientReceived = 0, clientTotal = 0;
      let o2AmountToPay = 0;
      let clientAmountToCharge = 0;
      const rows = [];

      for (const it of items) {
        const id = Number(it.unitId);
        const name = it.unitName || (Number.isFinite(id) ? `#${id}` : '—');
        const paymentType = it.paymentType ?? null;
        const bankResolved = normalizeBank(it.bankAccount ?? null);
        const hasBank = !!bankResolved;

        // Flags from backend summary
        const issued = !!(it.report && it.report.issued);
        const paid = !!(
          (it.payment && (it.payment.issued || ['ISSUED', 'PAID'].includes(String(it.payment.status || '').toUpperCase())) )
        );
        const mailed = !!(it.email && it.email.sent);

        // Closing balance (can be null)
        const closingVal = Number(it.closingBalance);
        const closing = Number.isFinite(closingVal) ? closingVal : null;

        rows.push({
          id,
          name,
          report: issued,
          pay: paid,
          email: mailed,
          paymentType,
          bankAccount: hasBank,
          bankAccountRaw: bankResolved,
          closingBalance: closing,
          order: !issued ? ['report'] : undefined,
        });

        // Counters
        reportsTotal += 1;
        if (issued) reportsIssued += 1;

        const isClient = String(paymentType || '').toUpperCase() === 'CLIENT';
        if (isClient) {
          clientTotal += 1;
          if (paid) clientReceived += 1;
        } else {
          if (hasBank) {
            o2Total += 1;
            if (paid) o2Paid += 1;
          }
        }

        // Amount buckets from closing balance sign
        if (closing !== null) {
          if (closing > 0) o2AmountToPay += closing;
          if (closing < 0) clientAmountToCharge += -closing;
        }
      }

      // Decide the order of steps per row based on closing balance.
      // Rule:
      // - If closingBalance is negative (client owes Owners2): report -> email -> pay
      // - Otherwise: report -> pay -> email
      // - If no bank on file and payment not yet done: report -> email (no pay step)
      setWorkflowCalcBusy(true);
      for (const row of rows) {
        if (!row.report) { row.order = ['report']; continue; }

        const closing = Number.isFinite(Number(row.closingBalance)) ? Number(row.closingBalance) : null;

        // If payment cannot be made (no bank and not already paid), keep pay step out.
        if (!row.bankAccount && !row.pay) {
          row.order = ['report', 'email'];
          continue;
        }

        // Base order depends on closing sign
        row.order = (closing !== null && closing < 0)
          ? ['report', 'email', 'pay']
          : ['report', 'pay', 'email'];

        // Ensure 'pay' present when bank exists or already paid
        if ((row.bankAccount || row.pay) && !row.order.includes('pay')) {
          const idx = row.order.indexOf('email');
          if (idx >= 0) row.order.splice(idx, 0, 'pay');
          else row.order.push('pay');
        }
      }
      setWorkflowCalcBusy(false);

      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setWorkflowRows(rows);
      lastWorkflowYmRef.current = ym;
      setWorkflowSummary({
        reports: { issued: reportsIssued, total: reportsTotal },
        o2: { paid: o2Paid, total: o2Total, amount: o2AmountToPay },
        client: { received: clientReceived, total: clientTotal, amount: clientAmountToCharge },
      });
    } catch (e) {
      setWorkflowSummary({ reports: { issued: 0, total: 0 }, o2: { paid: 0, total: 0, amount: 0 }, client: { received: 0, total: 0, amount: 0 } });
      setWorkflowRows([]);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const openWorkflowDrawer = async () => {
    setWorkflowOpen(true);
    const ym = yearMonth;
    // If we already loaded this month and not invalidated, don't refetch immediately
    if (lastWorkflowYmRef.current === ym && workflowRows.length > 0 && !workflowLoading) return;
    loadMonthWorkflowSummary();
  };

  // Handlers for header filters
  const handleYearMonthChange = (nextYm) => {
    if (typeof nextYm !== 'string') return;
    const match = nextYm.match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return;
    const [, yStr, mStr] = match;
    const nextYear = Number(yStr);
    const nextMonth = Number(mStr);
    if (!Number.isFinite(nextYear) || !Number.isFinite(nextMonth)) return;
    setYear(nextYear);
    setMonth(nextMonth);
  };
  const onUnitQueryChange = (e) => {
    setUnitQuery(e.target.value);
    setSelectedUnit(null); // typing resets selection
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingUnits(true);
        const items = await service.listUnits();
        if (!cancelled) setUnitResults(items);
      } catch (e) {
        if (!cancelled) setUnitResults([]);
      } finally {
        if (!cancelled) setLoadingUnits(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoadingUnits(true);
        const items = (!unitQuery || unitQuery.trim().length < 2)
          ? await service.listUnits()
          : await service.searchUnits(unitQuery.trim());
        if (!cancelled) setUnitResults(items);
      } catch (err) {
        if (!cancelled) setUnitResults([]);
      } finally {
        if (!cancelled) setLoadingUnits(false);
      }
    };

    const id = setTimeout(run, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [unitQuery]);

  const canLoad = Boolean(selectedUnit?.id && year && month);

  const [drawer, setDrawer] = useState(null); // 'comment' | 'comment-edit' | 'booking-edit' | 'unit-transaction-edit' | 'hk-transaction-edit' | 'ledger-new' | 'expense' | 'abono' | null
  const [editCommentValue, setEditCommentValue] = useState(null);
  const [editNoteId, setEditNoteId] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingEditOpen, setBookingEditOpen] = useState(false);
  const [selectedUnitTransactionId, setSelectedUnitTransactionId] = useState(null);
  const [selectedHKTransactionId, setSelectedHKTransactionId] = useState(null);
  const [hkEditOpen, setHkEditOpen] = useState(false);
  const [hkCategories, setHkCategories] = useState([]);
  const [hkCategoriesLoading, setHkCategoriesLoading] = useState(false);
  const openCommentDrawer = () => setDrawer('comment');
  const closeDrawer = () => {
    setDrawer(null);
    setEditNoteId(null);
    setEditCommentValue(null);
    setSelectedBooking(null);
    setSelectedUnitTransactionId(null);
    setSelectedHKTransactionId(null);
    setHkEditOpen(false);
    setBookingEditOpen(false);
  };
  const openEditUnitTransactionDrawer = (row) => {
    if (!row || !row.id) return;
    setSelectedUnitTransactionId(row.id);
    setDrawer('unit-transaction-edit');
  };

  // Fetch all HK categories (allow_hk=1) with robust double-URL fallback
  const fetchHkCategories = async () => {
    try {
      setHkCategoriesLoading(true);
      // Try underscore style first (API Platform often uses underscores)
      let res = await api.get('/api/transaction_categories', { params: { allow_hk: 1, 'order[name]': 'asc', pagination: 'false' } });
      let data = res?.data ?? res;
      let items = Array.isArray(data) ? data : (data['hydra:member'] || []);
      if (!Array.isArray(items) || items.length === 0) {
        // Fallback to hyphen style endpoint if first returns nothing
        res = await api.get('/api/transaction-categories', { params: { allow_hk: 1, 'order[name]': 'asc', pagination: 'false' } });
        data = res?.data ?? res;
        items = Array.isArray(data) ? data : (data['hydra:member'] || []);
      }
      const list = (items || []).filter(Boolean).map(it => ({
        id: it.id,
        name: it.name || it.label || '',
        type: it.type || it.categoryType || 'Gasto',
        allowHk: Boolean(it.allow_hk ?? it.allowHk ?? it.allowHK),
      })).filter(it => it.allowHk);
      setHkCategories(list);
    } catch (e) {
      setHkCategories([]);
    } finally {
      setHkCategoriesLoading(false);
    }
  };

  const openEditHKTransactionDrawer = (row) => {
    if (!row || !row.id) return;
    setSelectedHKTransactionId(row.id);
    setHkEditOpen(true);
    // load categories on demand
    fetchHkCategories();
  };
  const openEditBookingDrawer = (bookingRow) => {
    if (!bookingRow) return;
    // Helper: convert various shapes to boolean
    const toBool = (v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes';
      }
      return false;
    };
    const paidFlag = toBool(bookingRow.isPaid ?? bookingRow.paid);
    // Helper to normalize payment method
    const normalizePaymentMethod = (v) => {
      if (!v && v !== 0) return null;
      try { return String(v).trim().toLowerCase(); } catch { return null; }
    };
    // Build a minimal booking object expected by the form
    const paymentMethod = normalizePaymentMethod(
      bookingRow.paymentMethod ?? bookingRow.bookingPaymentMethod ?? bookingRow.payment_method ?? bookingRow.booking_payment_method ?? null
    );
    const booking = {
      id: bookingRow.bookingId,
      unitId: bookingRow.unitId,
      unitName: selectedUnit?.unitName,
      status: bookingRow.status || 'Active',
      guestName: bookingRow.guestName || '',
      guests: bookingRow.guests ?? undefined,
      checkIn: bookingRow.checkIn || '',
      checkOut: bookingRow.checkOut || '',
      payout: bookingRow.payout,
      cleaningFee: bookingRow.cleaningFee,
      commissionPercent: bookingRow.commissionPercent,
      roomFee: bookingRow.roomFee,
      paymentMethod,
      source: bookingRow.source ?? null,
      // Pass paid state (support both shapes)
      paid: paidFlag,
      isPaid: paidFlag,
    };
    setSelectedBooking(booking);
    setBookingEditOpen(true);
  };
  const openNewLedgerDrawer = () => {
    setDrawer('ledger-new');
  };
  const openEditCommentDrawer = (id, txt) => { setEditNoteId(id); setEditCommentValue(txt); setDrawer('comment-edit'); };

  const afterMutation = async () => {
    closeDrawer();
    await handleLoadMonth();
  };

  const deleteComment = async (noteId) => {
    if (!noteId) return;
    try {
      await api.delete(`/api/client_unit_notes/${noteId}`);
      await handleLoadMonth();
    } catch (e) {
      setError(e?.message || 'Failed to delete comment');
    }
  };

  const extractNoteText = (payload) => {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload;
    if (typeof payload === 'object') {
      if (typeof payload.text === 'string') return payload.text;
      if (typeof payload.note === 'string') return payload.note;
      if (typeof payload.value === 'string') return payload.value;
      if (typeof payload.comment === 'string') return payload.comment;
    }
    return String(payload);
  };

  const saveNote = async (rawPayload, noteId = null) => {
    const txt = extractNoteText(rawPayload).trim();
    if (!txt) {
      closeDrawer();
      return;
    }
    if (!selectedUnit?.id) {
      setError('Missing unit to save comment');
      return;
    }

    const uid = Number(selectedUnit.id);
    const unitIri =
      (previewData?.unit && typeof previewData.unit['@id'] === 'string')
        ? previewData.unit['@id']
        : `/api/units/${uid}`;

    const body = {
      unit: unitIri,
      unitId: uid,
      unit_id: uid,
      entryType: 'REPORT',
      entry_type: 'report',
      // primary fields expected by the API
      yearMonth,
      comment: txt,
      // legacy / denormalized note fields used by existing code
      noteComment: txt,
      note_comment: txt,
      noteYearMonth: yearMonth,
      note_year_month: yearMonth,
    };

    try {
      if (noteId) {
        // Update existing note via PUT (API supports GET, PUT, DELETE)
        await api.put(`/api/client_unit_notes/${noteId}`, body);
      } else {
        // Create new note
        await api.post('/api/client_unit_notes', body);
      }
      await handleLoadMonth();
      closeDrawer();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save comment');
    }
  };

  const handleSaveNewComment = async (payload) => {
    await saveNote(payload, null);
  };

  const handleSaveEditComment = async (payload) => {
    if (!editNoteId) {
      closeDrawer();
      return;
    }
    await saveNote(payload, editNoteId);
  };

  const handleSelectUnit = (u) => {
    setSelectedUnit(u);
    setUnitQuery(u.unitName); // reflect in the header field
    setUnitResults([]);
  };

  const handleClearUnit = () => {
    setSelectedUnit(null);
    setUnitQuery('');
    setUnitResults([]);
  };

  const openPreview = async () => {
    const uid = Number(selectedUnit?.id);
    const ym = String(yearMonth || '').trim();
    const ymOk = /^\d{4}-\d{2}$/.test(ym);
    if (!Number.isFinite(uid) || uid <= 0 || !ymOk) {
      setError('Missing or invalid unit/month to preview');
      return;
    }

    setPreviewBusy(true);
    // Revoke a previous blob URL if any
    if (previewUrl && previewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
    }
    setPreviewUrl('');
    setPreviewHtml('');
    setPreviewOpen(true);
    try {
      // Use the unified V2 loader (same as the auto-preview path)
      await loadPreviewPdf();
    } catch (e) {
      setPreviewUrl('');
      setError('Failed to load PDF preview');
    } finally {
      setPreviewBusy(false);
    }
  };
  const printPreview = () => {
    // Try to print the iframe content
    const iframe = document.querySelector('iframe[title="Report Preview"]');
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        return;
      } catch (_) { /* fallthrough */ }
    }
    // Fallback: open in new tab then print
    if (previewUrl) {
      const w = window.open(previewUrl, '_blank', 'noopener');
      if (w) {
        try { w.focus(); w.print(); } catch (_) {}
      }
    }
  };
  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl && previewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
    }
    setPreviewUrl('');
    setPreviewHtml('');
  };

  // Open preview in new tab, using the already-fetched PDF blob URL if present, or loading it if needed
  const openPreviewNewTab = async () => {
    const uid = Number(selectedUnit?.id);
    const ym = String(yearMonth || '').trim();
    const ymOk = /^\d{4}-\d{2}$/.test(ym);
    if (!Number.isFinite(uid) || uid <= 0 || !ymOk) {
      setError('Missing or invalid unit/month to preview');
      return;
    }

    try {
      if (!previewUrl) {
        setPreviewBusy(true);
        await loadPreviewPdf();
      }
      if (previewUrl) {
        window.open(previewUrl, '_blank', 'noopener');
      }
    } catch (_) {
      setError('Failed to open preview');
    } finally {
      setPreviewBusy(false);
    }
  };

  // Wire the preview call cleanly (results used in later steps)
  const handleLoadMonth = async () => {
    if (!canLoad) return;
    setError(null);
    setPreviewData(null);
    try {
      setLoadingPreview(true);
      const data = await service.fetchUnitMonthly({ unitId: selectedUnit.id, yearMonth });
      setPreviewData(data);
      try {
        setStatusLoading(true);
        const st = await service.fetchStatus({ unitId: selectedUnit.id, yearMonth });
        setStatusData(st);
      } catch (e) {
        setStatusData(null);
      } finally {
        setStatusLoading(false);
      }
      // Load PDF preview if enabled (single source of truth)
      if (usePdfPreview) {
        try { await loadPreviewPdf(); } catch (_) {}
      }
    } catch (err) {
      setError(err?.message || 'Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // --- Report generation helpers ---
  const checkReportStatus = async (uid, ym) => {
    const res = await api.get('/api/unit-monthly/status', { params: { unitId: uid, yearMonth: ym } });
    return res?.data ?? res;
  };

  const generateReport = async (uid, ym, replace) => {
    const res = await api.post('/api/unit-monthly/generate', { unitId: uid, yearMonth: ym, replace: !!replace });
    return res?.data ?? res;
  };

  const handleGenerateReport = async () => {
    if (!selectedUnit?.id) return;
    const uid = Number(selectedUnit.id);
    const ym = yearMonth;
    if (!/^[0-9]{4}-[0-9]{2}$/.test(ym)) return;

    // Helper: perform generation (replace=false/true)
    const runGenerate = async (replace) => {
      setGenBusy(true);
      try {
        const out = await generateReport(uid, ym, replace);
        setToast({ open: true, severity: 'success', msg: `Report saved${out?.replaced ? ' (replaced)' : ''}` });
        await handleLoadMonth();
      } catch (e) {
        setToast({ open:true, severity:'error', msg: e?.response?.data?.message || e?.message || 'Failed to generate report' });
      } finally {
        setGenBusy(false);
      }
    };

    // First check if report exists
    setGenBusy(true);
    try {
      const status = await checkReportStatus(uid, ym);
      const existed = Boolean(
        status?.exists === true ||
        status?.reportIssued === true ||
        (status?.report && (
          status.report.issued === true ||
          String(status.report.state || '').toUpperCase() === 'ISSUED' ||
          (typeof status.report.url === 'string' && status.report.url.trim() !== '')
        ))
      );

      if (existed) {
        // Open confirm dialog instead of window.confirm
        setReplaceConfirmCtx({ uid, ym });
        setReplaceConfirmOpen(true);
        return;
      }

      // No existing report: generate directly
      await runGenerate(false);
    } catch (e) {
      setToast({ open:true, severity:'error', msg: e?.response?.data?.message || e?.message || 'Failed to check report status' });
      setGenBusy(false);
    } finally {
      // If we opened the dialog, we intentionally leave genBusy=false
      setGenBusy(false);
    }
  };

  useEffect(() => {
    if (selectedUnit?.id && year && month) {
      handleLoadMonth();
    }
  }, [selectedUnit?.id, year, month]);

  useEffect(() => {
    if (!selectedUnit?.id || !year || !month) return;
    let cancelled = false;
    (async () => {
      try {
        setStatusLoading(true);
        const st = await service.fetchStatus({ unitId: selectedUnit.id, yearMonth });
        if (!cancelled) setStatusData(st);
      } catch (_) {
        if (!cancelled) setStatusData(null);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedUnit?.id, year, month, yearMonth]);

  // === Derived flags & sums (CLIENT payment type rules) ===
  const unitPaymentType = previewData?.unit?.paymentType || previewData?.unitPaymentType || null;
  const isClientUnit = unitPaymentType ? String(unitPaymentType).toUpperCase() === 'CLIENT' : false;

  const num0 = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const bookingRows = Array.isArray(previewData?.bookings?.rows) ? previewData.bookings.rows : [];
  const utRows = Array.isArray(previewData?.expenses?.rows) ? previewData.expenses.rows : [];
  const hkRows = Array.isArray(previewData?.housekeeping?.rows) ? previewData.housekeeping.rows : [];
  const abonoRows = Array.isArray(previewData?.abonos?.rows) ? previewData.abonos.rows : [];
  const selectedHKRow = useMemo(() => {
    if (!selectedHKTransactionId) return null;
    const rows = Array.isArray(previewData?.housekeeping?.rows) ? previewData.housekeeping.rows : [];
    return rows.find(r => Number(r?.id) === Number(selectedHKTransactionId)) || null;
  }, [selectedHKTransactionId, previewData]);

  // Sums for CLIENT logic
  const clientPayFromPrivate = bookingRows
    .filter(b => String(b?.source || '').toLowerCase() === 'private')
    .reduce((acc, b) => acc + num0(b?.ownerPayoutInMonth ?? b?.owner_payout_in_month), 0);

  const abonosTotal = abonoRows.reduce((acc, r) => acc + num0(r?.amount), 0);

  const airbnbRows = bookingRows.filter(b => String(b?.source || '').toLowerCase() === 'airbnb');
  const airbnbO2Pay = airbnbRows.reduce((acc, b) => acc + num0(b?.o2CommissionInMonth ?? b?.o2_commission_in_month), 0);
  const airbnbCleaning = airbnbRows.reduce((acc, b) => acc + num0(b?.cleaningFeeInMonth ?? b?.cleaning_fee_in_month), 0);

  const gastosUT = utRows.reduce((acc, r) => acc + num0(r?.amount), 0);
  const gastosHK = hkRows.reduce((acc, r) => acc + num0(r?.charged ?? r?.amount), 0);
  const gastosTotal = gastosUT + gastosHK;

  const derivedClientCredit = clientPayFromPrivate + abonosTotal; // (Private Client Pay) + (Abonos)
  const derivedClientDebit = airbnbO2Pay + airbnbCleaning + gastosTotal; // (Airbnb O2 Pay) + (Airbnb Cleaning) + (Gastos)

  const actionsHeader = (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <YearMonthPicker
        value={yearMonth}
        onChange={handleYearMonthChange}
        sx={{ minWidth: 230 }}
      />

      {/* Unit name selector */}
      <Autocomplete
        sx={{ minWidth: 260, maxWidth: 420, flex: '0 0 auto' }}
        loading={loadingUnits}
        options={unitResults}
        getOptionLabel={(o) => o?.unitName || ''}
        value={selectedUnit}
        onChange={(e, val) => { val ? handleSelectUnit(val) : handleClearUnit(); }}
        onInputChange={(e, val) => setUnitQuery(val || '')}
        isOptionEqualToValue={(opt, val) => Number(opt?.id) === Number(val?.id)}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Unit name"
            placeholder="Type to search…"
            size="small"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loadingUnits ? <CircularProgress size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />

      <Button
        variant="outlined"
        size="small"
        onClick={openWorkflowDrawer}
        sx={{ whiteSpace: 'nowrap' }}
      >
        Month Workflow
      </Button>
      <Button
        variant="contained"
        size="small"
        onClick={() => setPayDrawerOpen(true)}
        sx={{ whiteSpace: 'nowrap', bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } }}
      >
        Request Payments
      </Button>
    </Box>
  );

  return (
    <PageScaffold
      title="Unit Monthly Report"
      layout="table"
      withCard
      headerPlacement="inside"
    >
      <Box sx={{ pb: 3 }}>
      {/* Filters inside content card */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Filters
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, flexWrap: 'wrap' }}>
          <YearMonthPicker
            value={yearMonth}
            onChange={handleYearMonthChange}
            sx={{ minWidth: 230 }}
          />

          {/* Unit name */}
          <Autocomplete
            sx={{ minWidth: 260, maxWidth: 420, flex: '0 0 auto' }}
            loading={loadingUnits}
            options={unitResults}
            getOptionLabel={(o) => o?.unitName || ''}
            value={selectedUnit}
            onChange={(e, val) => { val ? handleSelectUnit(val) : handleClearUnit(); }}
            onInputChange={(e, val) => setUnitQuery(val || '')}
            isOptionEqualToValue={(opt, val) => Number(opt?.id) === Number(val?.id)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Unit name"
                placeholder="Type to search…"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingUnits ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />

          <Button
            variant="outlined"
            size="small"
            onClick={openWorkflowDrawer}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Month Workflow
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => setPayDrawerOpen(true)}
            sx={{ whiteSpace: 'nowrap', bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } }}
          >
            Request Payments
          </Button>
        </Box>
      </Paper>

      {/* Placeholder content area (we’ll fill in Steps 3–5) */}
      {/* EmailSendDrawer (drawer for sending email) */}
      <EmailSendDrawer
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        initialValues={emailInitial}
        onSubmit={handleEmailSubmit}
      />
      <O2ConfirmDialog
        open={replaceConfirmOpen}
        title="Replace current report?"
        description="This will overwrite the existing issued report for this unit and month."
        confirmLabel="Replace"
        cancelLabel="Cancel"
        isDanger
        loading={genBusy}
        onClose={() => {
          if (genBusy) return;
          setReplaceConfirmOpen(false);
          setReplaceConfirmCtx({ uid: null, ym: '' });
        }}
        onConfirm={async () => {
          if (genBusy) return;
          const uid = Number(replaceConfirmCtx?.uid);
          const ym = String(replaceConfirmCtx?.ym || '');
          if (!Number.isFinite(uid) || uid <= 0 || !/^[0-9]{4}-[0-9]{2}$/.test(ym)) {
            setReplaceConfirmOpen(false);
            setReplaceConfirmCtx({ uid: null, ym: '' });
            return;
          }
          // close dialog first for snappy UX
          setReplaceConfirmOpen(false);
          setReplaceConfirmCtx({ uid: null, ym: '' });
          // generate with replace=true
          setGenBusy(true);
          try {
            const out = await generateReport(uid, ym, true);
            setToast({ open: true, severity: 'success', msg: `Report saved${out?.replaced ? ' (replaced)' : ''}` });
            await handleLoadMonth();
          } catch (e) {
            setToast({ open:true, severity:'error', msg: e?.response?.data?.message || e?.message || 'Failed to generate report' });
          } finally {
            setGenBusy(false);
          }
        }}
      />
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}
      {loadingPreview && (
        <Box display="flex" alignItems="center" gap={1}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading month data…</Typography>
        </Box>
      )}
      {!loadingPreview && previewData && (
        <>
       {/* KPIs (left) + Sidebar (right) */}
<Box
  sx={{
    display: { xs: 'block', sm: 'flex' },
    alignItems: 'flex-start',
    gap: 3,
    mb: 2,
  }}
>
  {/* LEFT: KPI stacks (unchanged logic/rows) */}
  <Box sx={{ flex: '0 0 auto', minWidth: 'fit-content' }}>
    {/* Opening / Month Result / Closing Balance */}
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, min-content)' },
      justifyItems: 'start',
      columnGap: 0.5,
      rowGap: 2,
      mb: 2,
    }}>
      {/* Opening */}
      <NotchedCard label="Opening Balance">
        {(() => {
          const val =
            Number(previewData?.openingBalance ?? previewData?.opening_balance ?? previewData?.opening);
          const out = Number.isFinite(val) ? val : undefined;
          return (
            <Typography variant="h6" sx={{ mt: 0.5, color: amtColor(out) }}>
              {out === undefined ? '-' : peso(out)}
            </Typography>
          );
        })()}
      </NotchedCard>

      {/* Month Result */}
      <NotchedCard label="Month Result">
        {(() => {
          if (isClientUnit) {
            const mr = Number(derivedClientCredit) - Number(derivedClientDebit);
            return <Typography variant="h6" sx={{ mt: 0.5, color: amtColor(mr) }}>{peso(mr)}</Typography>;
          }
          const k = pick(previewData, ['monthlyResult', 'monthly_result', 'result']);
          const val = k ? previewData[k] : undefined;
          return <Typography variant="h6" sx={{ mt: 0.5, color: amtColor(val) }}>{peso(val)}</Typography>;
        })()}
      </NotchedCard>

      {/* Closing Balance */}
      <NotchedCard label="Closing Balance">
        {(() => {
          // Prefer backend closingBalance to avoid drift with PDF/service rules
          const closingBackend = Number(
            previewData?.closingBalance ?? previewData?.closing_balance ?? previewData?.closing
          );
          if (Number.isFinite(closingBackend)) {
            return (
              <Typography variant="h6" sx={{ mt: 0.5, color: amtColor(closingBackend) }}>
                {peso(closingBackend)}
              </Typography>
            );
          }

          // Fallback: compute locally from backend opening + monthly
          const opening = Number(
            previewData?.openingBalance ?? previewData?.opening_balance ?? previewData?.opening
          );

          let monthVal = NaN;
          if (isClientUnit) {
            monthVal = Number(derivedClientCredit) - Number(derivedClientDebit);
          } else {
            const rk = pick(previewData, ['monthlyResult', 'monthly_result', 'result']);
            monthVal = rk ? Number(previewData[rk]) : NaN;
          }

          const val = (Number.isFinite(opening) && Number.isFinite(monthVal)) ? (opening + monthVal) : undefined;
          return (
            <Typography variant="h6" sx={{ mt: 0.5, color: amtColor(val) }}>
              {val === undefined ? '-' : peso(val)}
            </Typography>
          );
        })()}
      </NotchedCard>
    </Box>

    {/* KPI Row 1: Occ % / Nights / Av Room Fee */}
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, min-content)' },
      justifyItems: 'start',
      columnGap: 0.5,
      rowGap: 2,
      mb: 2,
    }}>
      <NotchedCard label="Occ %">
        <Typography variant="h6" sx={{ mt: 0.5 }}>
          {(() => {
            const occ = previewData?.metrics?.occPct;
            if (occ === null || occ === undefined || Number.isNaN(Number(occ))) return '-';
            const v = Number(occ) <= 1 ? Number(occ) * 100 : Number(occ);
            return `${Math.round(v)}%`;
          })()}
        </Typography>
      </NotchedCard>

      <NotchedCard label="Nights">
        <Typography variant="h6" sx={{ mt: 0.5 }}>
          {(() => {
            const nights = previewData?.bookings?.totals?.nights;
            return num(nights);
          })()}
        </Typography>
      </NotchedCard>

      <NotchedCard label="Av Room Fee">
        <Typography variant="h6" sx={{ mt: 0.5 }}>
          {(() => {
            const avg = previewData?.metrics?.avgRoomFee;
            return peso(avg);
          })()}
        </Typography>
      </NotchedCard>
    </Box>

    {/* KPI Row 2: Client Credit / Client Debit / Total O2 */}
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, min-content)' },
      justifyItems: 'start',
      columnGap: 0.5,
      rowGap: 2,
      mb: 2,
    }}>
      <NotchedCard label="Client Credit">
        {(() => {
          if (isClientUnit) {
            return (
              <>
                <Typography variant="h6" sx={{ mt: 0.5 }}>{peso(derivedClientCredit)}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Private Pay</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(clientPayFromPrivate)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Abonos</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(abonosTotal)}</Typography>
                </Box>
              </>
            );
          }
          const cc = previewData?.clientCredit || {};
          const total = Number(cc.total ?? 0);
          const payouts = Number(cc.payouts ?? 0);
          const credits = Number(cc.credits ?? 0);
          return (
            <>
              <Typography variant="h6" sx={{ mt: 0.5 }}>{peso(total)}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Payouts</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(payouts)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Credits</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(credits)}</Typography>
              </Box>
            </>
          );
        })()}
      </NotchedCard>

      <NotchedCard label="Client Debit">
        {(() => {
          if (isClientUnit) {
            return (
              <>
                <Typography variant="h6" sx={{ mt: 0.5 }}>{peso(derivedClientDebit)}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Airbnb O2 Pay</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(airbnbO2Pay)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Airbnb Cleaning</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(airbnbCleaning)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Gastos</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(gastosTotal)}</Typography>
                </Box>
              </>
            );
          }
          const cd = previewData?.clientDebit || {};
          const total = Number(cd.total ?? 0);
          const o2 = Number(previewData?.expenses?.totals?.amount ?? 0);
          const hk = Number(previewData?.housekeeping?.totals?.charged ?? 0);
          return (
            <>
              <Typography variant="h6" sx={{ mt: 0.5 }}>{peso(total)}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>O2</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(o2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Housekeepers</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(hk)}</Typography>
              </Box>
            </>
          );
        })()}
      </NotchedCard>

      <NotchedCard label="Total O2">
        {(() => {
          const t2 = previewData?.totalO2 || {};
          const total = Number(t2.total ?? 0);
          const commission = Number(t2.commission ?? 0);
          const cleaning = Number(t2.cleaning ?? 0);
          return (
            <>
              <Typography variant="h6" sx={{ mt: 0.5 }}>{peso(total)}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Commission</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(commission)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Cleaning</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, textAlign: 'right' }}>{peso(cleaning)}</Typography>
              </Box>
            </>
          );
        })()}
      </NotchedCard>
    </Box>
  </Box>

  {/* RIGHT: Sidebar with Expected Payments + Unit Report Workflow (side by side) */}
  <Box sx={{ flex: '0 0 auto', width: { xs: '100%', sm: 420 } }}>
    <Box
      sx={{
        display: { xs: 'block', sm: 'grid' },
        gridTemplateColumns: { sm: '1fr 1fr' },
        columnGap: 2,
        rowGap: 2,
      }}
    >
      <NotchedCard label="Expected Payments" sx={{ width: 280, height: 165, py: 1, px: 1 }}>
        {(() => {
          const ep = previewData?.expectedPayments || {};
          const rows = [
            { key: 'HOA', data: ep.hoa },
            { key: 'Internet', data: ep.internet },
            { key: 'Agua', data: ep.water },
            { key: 'CFE', data: ep.cfe },
          ];
  
          const renderChip = (status) => {
            switch (status) {
              case 'OK': return <Chip label="OK" size="small" sx={{ bgcolor: 'success.light', color: 'success.dark', fontWeight: 700, borderRadius: 999, px: 0.5 }} />;
              case 'OK_MISMATCH': return <Chip label="OK" size="small" sx={{ bgcolor: 'warning.light', color: 'warning.dark', fontWeight: 700, borderRadius: 999, px: 0.5 }} />;
              case 'OK_NOT_EXPECTED': return <Chip label="OK" size="small" sx={{ bgcolor: 'success.light', color: 'success.dark', fontWeight: 700, borderRadius: 999, px: 0.5 }} />;
              case 'MISSING':
                return <Chip label="Missing" size="small" sx={{ bgcolor: (theme) => alpha(theme.palette.error.light, 0.25), color: 'error.dark', fontWeight: 700, borderRadius: 999, px: 0.5 }} />;
              case 'NOT_OUR_RESPONSIBILITY':
                return <Chip label="-" size="small" sx={{ bgcolor: 'grey.200', color: 'grey.700', fontWeight: 700, borderRadius: 999, px: 0.5 }} />;
              default: return <Chip label="-" size="small" />;
            }
          };
  
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'stretch', height: '100%', gap: 1, py: 0 }}>
              {rows.map(({ key, data }) => {
                if (!data) return (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', m: 0 }}>
                    <Typography variant="body2" sx={{ width: 80, flexShrink: 0 }}>{key}</Typography>
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="-" size="small" />
                    </Box>
                    <Box sx={{ minWidth: 8 }} />
                  </Box>
                );

                // Custom message logic
                let message;
                if (data.status === 'OK_MISMATCH' && (data.expectedAmount != null || data.amount != null)) {
                  const amt = (data.expectedAmount != null ? data.expectedAmount : data.amount);
                  const formatted = `$${money(amt)}`;
                  message = `${formatted} expected`;
                } else if (data.status === 'OK_NOT_EXPECTED') {
                  message = 'Not expected';
                } else if (data.status === 'NOT_OUR_RESPONSIBILITY') {
                  message = null;
                } else {
                  message = data.message || undefined;
                }
                const noteColor =
                  data.status === 'MISSING' ? 'error.main'
                  : data.status === 'OK_MISMATCH' ? 'warning.dark'
                  : data.status === 'NOT_OUR_RESPONSIBILITY' ? 'grey.600'
                  : 'success.main';

                return (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', m: 0 }}>
                    <Typography variant="body2" sx={{ width: 80, flexShrink: 0 }}>{key}</Typography>
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      {renderChip(data.status)}
                      {!!message && (
                        <Typography variant="body2" sx={{ color: noteColor }}>{message}</Typography>
                      )}
                    </Box>
                    <Box sx={{ minWidth: 8 }} />
                  </Box>
                );
              })}
            </Box>
          );
        })()}
      </NotchedCard>
  
      {/* Unit Report Workflow */}
      <NotchedCard label="Unit Report Workflow" sx={{ width: '100%', height: 165, py: 1, px: 1 }}>
        {(() => {
          const src = (statusData && statusData.workflow) ? statusData.workflow : (statusData || {});
          const issued = Boolean(
            src.reportIssued ??
            src.report?.issued ??
            src.exists ??
            src.reportExists ??
            false
          );
          const paid = !!(
            src.paymentIssued ||
            src.payment?.issued ||
            ['ISSUED', 'PAID'].includes(src.paymentStatus) ||
            ['ISSUED', 'PAID'].includes(src.paymentState) ||
            ['ISSUED', 'PAID'].includes(src.payment?.status) ||
            ['ISSUED', 'PAID'].includes(src.payment?.state) ||
            src.paymentDone
          );
          const mailed = (() => {
            const sentBool = src.emailSent ?? src.email?.sent ?? false;
            const statusStr = String(src.email?.status || src.emailStatus || '').toUpperCase();
            const stateStr = String(src.email?.state || '').toUpperCase();
            return Boolean(
              sentBool ||
              statusStr === 'SENT' ||
              stateStr === 'SENT'
            );
          })();
  
          const computeClosingLocal = (bundle) => {
            if (!bundle) return null;
            const ck = ['closingBalance','closing_balance','closing'].find(k => bundle[k] !== undefined);
            if (ck) { const v = Number(bundle[ck]); if (Number.isFinite(v)) return v; }
            const ok = ['openingBalance','opening_balance','opening'].find(k => bundle[k] !== undefined);
            const opening = ok ? Number(bundle[ok]) : NaN;
            const rk = ['monthlyResult','monthly_result','result'].find(k => bundle[k] !== undefined);
            let monthVal = rk ? Number(bundle[rk]) : NaN;
            if (!Number.isFinite(monthVal)) {
              const ep = bundle?.clientCredit || {};
              const ed = bundle?.clientDebit || {};
              monthVal = Number(ep.total ?? NaN) - Number(ed.total ?? NaN);
            }
            if (Number.isFinite(opening) && Number.isFinite(monthVal)) return opening + monthVal;
            return null;
          };
          const closing = computeClosingLocal(previewData || {});
          // Allow Mark Paid without bank when:
          // - closing is negative (client owes Owners2), OR
          // - unit is CLIENT and closing is positive (Owners2 owes client)
          const allowPayWithoutBank =
            Number.isFinite(closing) &&
            (closing < 0 || (isClientUnit && closing > 0));
  
          let steps = ['report'];
          if (issued) {
            if (Number.isFinite(closing)) {
              steps = (closing < 0) ? ['report','email','pay'] : ['report','pay','email'];
            } else {
              steps = ['report','pay','email'];
            }
          }
  
          const badge = (label, ok, opts = {}) => {
            const { step } = opts;
            const isDone = !!ok;
            const outlinedSx = {
              width: 180,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              borderRadius: 1,
              px: 1,
              bgcolor: 'transparent',
              border: '1px solid',
              borderColor: isDone ? 'success.main' : 'grey.400',
              color: isDone ? 'success.main' : 'grey.700',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { bgcolor: isDone ? 'success.light' : 'grey.100' },
            };

            // Robust bank account detection: check previewData.client, previewData.unit, previewData.unit.client
            const normalizeStr = (v) => {
              if (v === null || v === undefined) return '';
              const s = String(v).trim();
              const low = s.toLowerCase();
              if (!s || low === 'null' || low === 'undefined' || s === '-') return '';
              return s;
            };
            const bankFrom = (obj) => (obj ? (normalizeStr(obj.bank_account) || normalizeStr(obj.bankAccount)) : '');
            const hasBank = !!(bankFrom(previewData?.client) || bankFrom(previewData?.unit) || bankFrom(previewData?.unit?.client));

            if (step === 'pay') {
              // Show Mark Paid button if report is issued and client has a bank account (either field name)
              if (issued && (hasBank || allowPayWithoutBank)) {
                return (
                  <Tooltip title={isDone ? 'Payment registered' : 'Mark paid'}>
                    <Button size="small" onClick={openNewLedgerDrawer} sx={outlinedSx}
                      startIcon={<Box sx={{ pr: 2, display: 'flex', alignItems: 'center' }}><CurrencyDollarIcon width={16} height={16} /></Box>}>
                      Mark Paid
                    </Button>
                  </Tooltip>
                );
              }
              // Otherwise, render nothing (no button)
              return null;
            }
            if (step === 'report') {
              return (
                <Tooltip title={isDone ? 'Report issued' : 'Issue report'}>
                  <Button size="small" onClick={handleGenerateReport} sx={outlinedSx}
                    startIcon={<DocumentTextIcon width={16} height={16} />}>
                    Issue Report
                  </Button>
                </Tooltip>
              );
            }
            if (step === 'email') {
              // Always show Send Email button after reportIssued
              if (issued) {
                const sxEmail = {
                  ...outlinedSx,
                  borderColor: isDone ? 'success.main' : outlinedSx.borderColor,
                  color: isDone ? 'success.main' : outlinedSx.color,
                  '&:hover': { bgcolor: isDone ? 'success.light' : 'grey.100' },
                };
                return (
                  <Tooltip title={isDone ? 'Email sent' : 'Send email'}>
                    <Button
                      size="small"
                      onClick={handleSendEmail}
                      sx={sxEmail}
                      startIcon={
                        <Box sx={{ pr: 1, display: 'flex', alignItems: 'center' }}>
                          <EnvelopeIcon width={16} height={16} />
                        </Box>
                      }
                    >
                      Send Email
                    </Button>
                  </Tooltip>
                );
              }
              // Otherwise, render nothing
              return null;
            }
            return (
              <Chip label={label} size="small"
                sx={{ width: 180, justifyContent: 'center', borderRadius: 1, fontWeight: 700, px: 1,
                  ...(ok ? { bgcolor: 'success.light', color: 'success.dark' } : { bgcolor: 'grey.200', color: 'grey.700' }) }} />
            );
          };
  
          const statusMap = { report: issued, pay: paid, email: mailed };
          const labelMap = { report: 'Report', pay: 'Payment', email: 'Email' };
  
          if (statusLoading) {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 72 }}>
                <CircularProgress size={18} />
              </Box>
            );
          }
  
          const previewBtnSx = {
            width: 180,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
            borderRadius: 999,
            px: 1,
            bgcolor: 'primary.light',
            color: 'primary.contrastText',
            textTransform: 'none',
            fontWeight: 600,
            '&:hover': { bgcolor: 'primary.main' },
            mb: 1,
            mt: 1,
          };
  
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
              <Button size="small" onClick={openPreview} sx={previewBtnSx}
                startIcon={<MagnifyingGlassIcon width={16} height={16} />}>
                Preview
              </Button>
              {steps.map((step) => (
                <Box key={step} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                  {badge(labelMap[step], !!statusMap[step], { step })}
                </Box>
              ))}
            </Box>
          );
        })()}
      </NotchedCard>
    </Box>
  </Box>
</Box>

        {/* Comments block */}
        <NotchedCard
          label="Comments"
          sx={{ width: '100%', maxWidth: 670, mb: 2 }}
          action={
            <Button
              size="small"
              onClick={openCommentDrawer}
              sx={{
                minWidth: 28,
                width: 28,
                height: 28,
                p: 0,
                borderRadius: '999px',
                bgcolor: 'success.main',
                color: 'common.white',
                fontWeight: 800,
                lineHeight: 1,
                '&:hover': { bgcolor: 'success.dark' },
              }}
              aria-label="Add comment"
            >
              +
            </Button>
          }
        >
          {(() => {
            const notes = previewData?.notes || {};
            const report = Array.isArray(notes.report) ? notes.report : [];

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1, pr: 6 }}>
                {report.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No comments.</Typography>
                ) : (
                  report.map((item, idx) => {
                    const text = (item && typeof item === 'object') ? (item.note_comment ?? item.comment ?? '') : item;
                    const noteId = (item && typeof item === 'object') ? item.id : undefined;
                    return (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', flex: 1 }}>
                          • {text}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <IconButton size="small" aria-label="Edit comment" onClick={() => openEditCommentDrawer(noteId, text)}>
                            <PencilSquareIcon width={18} height={18} />
                          </IconButton>
                          {noteId && (
                            <IconButton
                              size="small"
                              aria-label="Delete comment"
                              onClick={() => deleteComment(noteId)}
                              sx={{ '&:hover': { color: 'error.main' } }}
                            >
                              <XMarkIcon width={18} height={18} />
                            </IconButton>
                          )}
                        </Box>
                      </Box>
                    );
                  })
                )}
              </Box>
            );
          })()}
        </NotchedCard>

        {/* Report Preview (single source of truth = PDF) */}
        {previewOpen && (
          <NotchedCard
            label={usePdfPreview ? 'Report (PDF Preview)' : 'Reservas'}
            sx={{ width: '100%', maxWidth: '100%', mb: 2 }}
            action={
              <IconButton
                size="small"
                onClick={closePreview}
                aria-label="Close preview"
                sx={{
                  color: 'common.white',
                  bgcolor: 'grey.700',
                  '&:hover': { bgcolor: 'grey.800' },
                  mt: 1  // push it slightly down
                }}
              >
                <XMarkIcon width={18} height={18} />
              </IconButton>
            }
          >
            {usePdfPreview ? (
              <Box sx={{ width: '100%', height: 720 }}>
                {previewBusy ? (
                  <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress />
                  </Box>
                ) : previewUrl ? (
                  <iframe
                    title="Report PDF"
                    src={previewUrl}
                    style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  />
                ) : (
                  <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">No preview available.</Typography>
                    <Button size="small" variant="outlined" onClick={loadPreviewPdf}>Reload preview</Button>
                  </Box>
                )}
              </Box>
            ) : (
              // fallback grid remains here unchanged if ever needed
              <></>
            )}
          </NotchedCard>
        )}
        {/* Reservas (frontend view) */}
        <NotchedCard label="Reservas" sx={{ width: 'fit-content', maxWidth: '100%', mb: 2 }}>
          {(() => {
            const rows = Array.isArray(previewData?.bookings?.rows) ? previewData.bookings.rows : [];

            // Always sort by: non-cancelled bookings first, then by check-in date
            const isCancelled = (r) => {
              const s = String(r?.status || '').toLowerCase();
              return s === 'cancelled' || s === 'canceled';
            };
            const sortedRows = rows.slice().sort((a, b) => {
              const ac = isCancelled(a);
              const bc = isCancelled(b);

              // Non-cancelled bookings first
              if (ac !== bc) return ac ? 1 : -1;

              // Same cancellation status → sort by check-in date
              const ai = a.checkIn || a.check_in || a.checkin || null;
              const bi = b.checkIn || b.check_in || b.checkin || null;
              const ta = ai ? new Date(ai).getTime() : Number.POSITIVE_INFINITY;
              const tb = bi ? new Date(bi).getTime() : Number.POSITIVE_INFINITY;
              return ta - tb;
            });
            if (!sortedRows || sortedRows.length === 0) {
              return <Typography variant="body2" color="text.secondary">No bookings.</Typography>;
            }

            const headerSx = { color: 'text.secondary', fontSize: '0.75rem' };
            const right = { textAlign: 'right' };

            return (
              <Box sx={{ width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '90px 110px 160px 160px 120px 120px 110px 80px 80px 120px 120px',
                    columnGap: 0,
                    rowGap: 1,
                    alignItems: 'center',
                    '& > *': {
                      borderLeft: '1px solid',
                      borderColor: 'divider',
                      paddingLeft: 1,
                      paddingRight: 1,
                    },
                    '& > *:nth-of-type(11n+1)': { borderLeft: 'none' },
                  }}
                >
                  {/* header */}
                  <Typography sx={headerSx}>Source</Typography>
                  <Typography sx={headerSx}>Payment</Typography>
                  <Typography sx={headerSx}>Guest</Typography>
                  <Typography sx={headerSx}>Stay</Typography>
                  <Typography sx={{ ...headerSx, ...right }}>Payout</Typography>
                  <Typography sx={{ ...headerSx, ...right }}>Net Pay</Typography>
                  <Typography sx={{ ...headerSx, ...right }}>Cleaning</Typography>
                  <Typography sx={{ ...headerSx, ...right }}>Tax %</Typography>
                  <Typography sx={{ ...headerSx, ...right }}>O2 %</Typography>
                  <Typography sx={{ ...headerSx, ...right }}>O2 Pay</Typography>
                  <Typography sx={{ ...headerSx, ...right }}>Client Pay</Typography>

                  {/* rows */}
                  {sortedRows.map((r, i) => {
                    const guest = r.guestName || r.guest_name || r.guest || '';
                    const ci = r.checkIn || r.check_in || null;
                    const co = r.checkOut || r.check_out || null;
                    const stay = formatStay(ci, co);

                    const payout = r.payout; // from all_bookings
                    const net = r.commissionBaseInMonth ?? r.commission_base_in_month;
                    const cleaning = r.cleaningFeeInMonth ?? r.cleaning_fee_in_month;
                    const taxPct = r.taxPercent ?? r.tax_percent ?? null; // from all_bookings
                    const o2Pct = r.commissionPercent ?? r.commission_percent ?? null; // from all_bookings
                    const o2Pay = r.o2CommissionInMonth ?? r.o2_commission_in_month;
                    const clientPay = r.ownerPayoutInMonth ?? r.owner_payout_in_month;
                    const rawPayment = r.paymentMethod || r.bookingPaymentMethod || r.payment_method || r.booking_payment_method || '-';
                    const normalizedPayment = rawPayment && typeof rawPayment === 'string'
                      ? rawPayment.charAt(0).toUpperCase() + rawPayment.slice(1).toLowerCase()
                      : rawPayment;

                    // Conditional row color: red for unpaid bookings
                    const rowColor = r.isPaid === false ? { color: 'error.main' } : {};

                    return (
                      <React.Fragment key={`${r.sliceId || r.bookingId || i}-${i}`}>
                        <Typography variant="body2" sx={{ ...rowColor }}>{r.source || '-'}</Typography>
                        <Typography variant="body2" sx={{ ...rowColor }}>{normalizedPayment || '-'}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography variant="body2" sx={{ flex: 1, ...rowColor }}>{guest || '-'}</Typography>
                          <IconButton
                            size="small"
                            aria-label="Edit booking"
                            onClick={() => openEditBookingDrawer(r)}
                            sx={{ ml: 1, '&:hover': { color: 'primary.main' } }}
                          >
                            <PencilSquareIcon width={16} height={16} />
                          </IconButton>
                        </Box>
                        <Typography variant="body2" sx={{ ...rowColor }}>{stay || '-'}</Typography>
                        <Typography variant="body2" sx={{ ...right, ...rowColor }}>{payout === undefined ? '-' : money(payout)}</Typography>
                        <Typography variant="body2" sx={{ ...right, ...rowColor }}>{net === undefined ? '-' : money(net)}</Typography>
                        <Typography variant="body2" sx={{ ...right, ...rowColor }}>{cleaning === undefined ? '-' : money(cleaning)}</Typography>
                        <Typography variant="body2" sx={{ ...right, ...rowColor }}>{taxPct === null || taxPct === undefined || taxPct === '' ? '-' : showPct(taxPct)}</Typography>
                        <Typography variant="body2" sx={{ ...right, ...rowColor }}>{o2Pct === null || o2Pct === undefined || o2Pct === '' ? '-' : showPct(o2Pct)}</Typography>
                        <Typography variant="body2" sx={{ ...right, ...rowColor }}>{o2Pay === undefined ? '-' : money(o2Pay)}</Typography>
                        <Typography variant="body2" sx={{ ...right, ...rowColor }}>{clientPay === undefined ? '-' : money(clientPay)}</Typography>
                      </React.Fragment>
                    );
                  })}
                </Box>
              </Box>
            );
          })()}
        </NotchedCard>
        {/* Gastos */}
        <NotchedCard label="Gastos" sx={{ width: '50%', maxWidth: '50%', mb: 2 }}>
          {(() => {
            const ut = Array.isArray(previewData?.expenses?.rows) ? previewData.expenses.rows : [];
            const hk = Array.isArray(previewData?.housekeeping?.rows) ? previewData.housekeeping.rows : [];

            // Normalize into common shape, preserving category info
            const norm = [
              ...ut.map(r => ({
                id: r.id,
                date: r.date || null,
                description: r.description || '',
                comments: r.comments ?? null,
                amount: Number(r.amount ?? 0),
                source: 'UT',
                categoryId: r.categoryId ?? null,
                categoryName: r.categoryName ?? null,
              })),
              ...hk.map(r => ({
                id: r.id,
                date: r.date || null,
                description: r.description || '',
                comments: r.notes ?? null,
                amount: Number(r.charged ?? 0),
                source: 'HK',
                categoryId: r.categoryId ?? null,
                categoryName: r.categoryName ?? null,
              })),
            ];

            // Group by category. Null/empty categories go to "Otros" (id 15)
            const CAT_OTROS_ID = 15;
            const CAT_OTROS_NAME = 'Otros';

            const buckets = new Map(); // key: categoryId, val: { id, name, rows: [] }
            for (const r of norm) {
              const id = (r.categoryId ?? CAT_OTROS_ID);
              const name = (r.categoryName && String(r.categoryName).trim()) || (id === CAT_OTROS_ID ? CAT_OTROS_NAME : CAT_OTROS_NAME);
              const key = id;
              if (!buckets.has(key)) buckets.set(key, { id, name, rows: [] });
              buckets.get(key).rows.push(r);
            }

            // Keep only categories that actually have rows
            let categories = Array.from(buckets.values()).filter(c => c.rows.length > 0);

            // Sort: alphabetical by name (case-insensitive), but keep "Otros" (id 15) last
            categories.sort((a, b) => {
              if (a.id === CAT_OTROS_ID && b.id !== CAT_OTROS_ID) return 1;
              if (b.id === CAT_OTROS_ID && a.id !== CAT_OTROS_ID) return -1;
              return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });

            // Date formatter for Gastos
            const formatExpenseDate = (d) => {
              if (!d) return '-';
              if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
                const [y, m, day] = d.split('-');
                return `${day}/${m}/${y}`;
              }
              try {
                const dt = new Date(d);
                if (Number.isNaN(dt.getTime())) return String(d);
                return dt.toLocaleDateString('es-MX');
              } catch {
                return String(d);
              }
            };

            // Helper to render a category section
            const CategorySection = ({ cat }) => (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{cat.name}</Typography>
                <Box sx={{ width: '100%', overflowX: 'auto' }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 1fr 120px',
                      columnGap: 0,
                      rowGap: 1,
                      alignItems: 'center',
                      '& > *': {
                        borderLeft: '1px solid',
                        borderColor: 'divider',
                        paddingLeft: 1,
                        paddingRight: 1,
                      },
                      '& > *:nth-of-type(4n+1)': { borderLeft: 'none' },
                    }}
                  >
                    {/* header */}
                    <Typography variant="caption" color="text.secondary">Date</Typography>
                    <Typography variant="caption" color="text.secondary">Description</Typography>
                    <Typography variant="caption" color="text.secondary">Comments</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Amount</Typography>

                    {/* rows */}
                    {cat.rows
                      .slice()
                      .sort((a, b) => {
                        const da = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
                        const db = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
                        return da - db;
                      })
                      .map((r, i) => (
                        <React.Fragment key={`${r.source}-${r.id}-${i}`}>
                          <Typography variant="body2">
                            {formatExpenseDate(r.date)}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography variant="body2" sx={{ flex: 1 }}>{r.description || '-'}</Typography>
                            {r.source === 'UT' && (
                              <IconButton size="small" aria-label="Edit transaction" onClick={() => openEditUnitTransactionDrawer(r)} sx={{ ml: 1, '&:hover': { color: 'primary.main' } }}>
                                <PencilSquareIcon width={16} height={16} />
                              </IconButton>
                            )}
                            {r.source === 'HK' && (
                              <IconButton size="small" aria-label="Edit HK transaction" onClick={() => openEditHKTransactionDrawer(r)} sx={{ ml: 1, '&:hover': { color: 'primary.main' } }}>
                                <PencilSquareIcon width={16} height={16} />
                              </IconButton>
                            )}
                          </Box>
                          <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>{r.comments ? r.comments : '-'}</Typography>
                          <Typography variant="body2" sx={{ textAlign: 'right' }}>{money(r.amount)}</Typography>
                        </React.Fragment>
                      ))}
                  </Box>
                </Box>
              </Box>
            );

            if (categories.length === 0) {
              return <Typography variant="body2" color="text.secondary">No records.</Typography>;
            }

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {categories.map((cat) => (
                  <CategorySection key={cat.id} cat={cat} />
                ))}
              </Box>
            );
          })()}
        </NotchedCard>
        {/* Abonos */}
        <NotchedCard label="Abonos" sx={{ width: '50%', maxWidth: '50%', mb: 2 }}>
          {(() => {
            const rows = Array.isArray(previewData?.abonos?.rows) ? previewData.abonos.rows : [];

            // Normalize: ensure we have a consistent shape
            const norm = rows.map(r => ({
              id: r.id,
              date: r.date || null,
              description: r.description || '',
              comments: r.comments ?? null,
              amount: Number(r.amount ?? 0),
              categoryId: r.categoryId ?? null,
              categoryName: r.categoryName ?? null,
            }));

            // Date formatter for Abonos
            const formatAbonoDate = (d) => {
              if (!d) return '-';
              if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
                const [y, m, day] = d.split('-');
                return `${day}/${m}/${y}`;
              }
              try {
                const dt = new Date(d);
                if (Number.isNaN(dt.getTime())) return String(d);
                return dt.toLocaleDateString('es-MX');
              } catch {
                return String(d);
              }
            };

            // Group by category; null/empty => "Otros" (id 15)
            const CAT_OTROS_ID = 15;
            const CAT_OTROS_NAME = 'Otros';
            const buckets = new Map(); // id -> { id, name, rows }
            for (const r of norm) {
              const id = r.categoryId ?? CAT_OTROS_ID;
              const name = (r.categoryName && String(r.categoryName).trim()) || (id === CAT_OTROS_ID ? CAT_OTROS_NAME : CAT_OTROS_NAME);
              if (!buckets.has(id)) buckets.set(id, { id, name, rows: [] });
              buckets.get(id).rows.push(r);
            }

            let categories = Array.from(buckets.values()).filter(c => c.rows.length > 0);
            categories.sort((a, b) => {
              if (a.id === CAT_OTROS_ID && b.id !== CAT_OTROS_ID) return 1;
              if (b.id === CAT_OTROS_ID && a.id !== CAT_OTROS_ID) return -1;
              return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });

            const CategorySection = ({ cat }) => (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{cat.name}</Typography>
                <Box sx={{ width: '100%', overflowX: 'auto' }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 1fr 120px',
                      columnGap: 0,
                      rowGap: 1,
                      alignItems: 'center',
                      '& > *': {
                        borderLeft: '1px solid',
                        borderColor: 'divider',
                        paddingLeft: 1,
                        paddingRight: 1,
                      },
                      '& > *:nth-of-type(4n+1)': { borderLeft: 'none' },
                    }}
                  >
                    {/* header */}
                    <Typography variant="caption" color="text.secondary">Date</Typography>
                    <Typography variant="caption" color="text.secondary">Description</Typography>
                    <Typography variant="caption" color="text.secondary">Comments</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Amount</Typography>

                    {/* rows */}
                    {cat.rows
                      .slice()
                      .sort((a, b) => {
                        const da = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
                        const db = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
                        return da - db;
                      })
                      .map((r, i) => (
                        <React.Fragment key={`${r.id}-${i}`}>
                          <Typography variant="body2">
                            {formatAbonoDate(r.date)}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography variant="body2" sx={{ flex: 1 }}>{r.description || '-'}</Typography>
                            <IconButton size="small" aria-label="Edit transaction" onClick={() => openEditUnitTransactionDrawer(r)} sx={{ ml: 1, '&:hover': { color: 'primary.main' } }}>
                              <PencilSquareIcon width={16} height={16} />
                            </IconButton>
                          </Box>
                          <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>{r.comments ? r.comments : '-'}</Typography>
                          <Typography variant="body2" sx={{ textAlign: 'right' }}>{money(r.amount)}</Typography>
                        </React.Fragment>
                      ))}
                  </Box>
                </Box>
              </Box>
            );

            if (categories.length === 0) {
              return <Typography variant="body2" color="text.secondary">No records.</Typography>;
            }

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {categories.map((cat) => (
                  <CategorySection key={cat.id} cat={cat} />
                ))}
              </Box>
            );
          })()}
        </NotchedCard>
        </>
      )}
      {!loadingPreview && !previewData && (
        <Typography variant="body2" color="text.secondary">
          Select a unit to load the month.
        </Typography>
      )}
      <PreviewOverlay
        open={overlayOpen}
        onClose={closePreview}
        title="Report Preview"
        newTabHref={previewUrl || 'print'}
        onOpenNewTab={printPreview}
      >
        {previewBusy ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : previewUrl ? (
          <iframe
            title="Report Preview"
            src={previewUrl}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        ) : previewHtml ? (
          <iframe
            title="Report Preview"
            srcDoc={previewHtml}
            sandbox="allow-same-origin allow-scripts allow-forms"
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        ) : (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">No preview available.</Typography>
          </Box>
        )}
      </PreviewOverlay>
      <AppDrawer
        open={hkEditOpen}
        onClose={closeDrawer}
        title="Edit HK Transaction"
        showActions
        formId="hk-tx-form-edit"
        actions={{ saveLabel: 'Save', cancelLabel: 'Cancel', showDelete: true }}
        onDelete={async () => {
          try {
            if (!selectedHKTransactionId) return;
            const ok = window.confirm('Delete this HK transaction? This cannot be undone.');
            if (!ok) return;
            await api.delete(`/api/hk-transactions/${selectedHKTransactionId}`);
            await afterMutation();
          } catch (e) {
            console.error('Failed to delete HK transaction:', e);
            alert('Could not delete the transaction. Please try again.');
          }
        }}
      >
        {selectedHKRow ? (
          <HKTransactionEditFormRHF
            formId="hk-tx-form-edit"
            initialValues={selectedHKRow}
            unitOptions={unitResults}
            categoryOptions={hkCategories}
            loadingCategories={hkCategoriesLoading}
            onSave={async (payload) => {
              try {
                await api.put(`/api/hk-transactions/${payload.id}`, payload);
                await afterMutation();
              } catch (e) {
                console.error('Failed to update HK transaction:', e);
                alert('Could not update the transaction. Please review the fields and try again.');
              }
            }}
          />
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Loading…</Typography>
          </Box>
        )}
      </AppDrawer>
      <AppDrawer
        open={bookingEditOpen}
        onClose={closeDrawer}
        title="Edit Booking"
        showActions
        formId="booking-edit-form"
        actions={{ saveLabel: 'Save', cancelLabel: 'Cancel', showDelete: false }}
      >
        {selectedBooking ? (
          <BookingEditFormRHF
            formId="booking-edit-form"
            initialValues={selectedBooking}
            unitOptions={unitResults}
            onSave={async (payload) => {
              try {
                await api.put(`/api/bookings/${payload.id}`, payload);
                await afterMutation();
              } catch (e) {
                console.error('Failed to update booking:', e);
                alert('Could not update the booking. Please review the fields and try again.');
              }
            }}
          />
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Loading…</Typography>
          </Box>
        )}
      </AppDrawer>
      <AppDrawer
        open={drawer === 'ledger-new'}
        onClose={closeDrawer}
        title="Record Payment"
        showActions
        formId="unit-ledger-new-form"
        width={360}
      >
        {previewData && selectedUnit ? (
          <UnitLedgerNewFormRHF
            formId="unit-ledger-new-form"
            unitId={selectedUnit?.id}
            unitNamePreset={selectedUnit?.unitName}
            yearMonth={yearMonth}
            closingBalance={(function () {
              if (!previewData) return 0;
              const ok = pick(previewData, ['openingBalance', 'opening_balance', 'opening']);
              const opening = ok ? Number(previewData[ok]) : NaN;
              let monthVal = NaN;
              if (isClientUnit) {
                monthVal = Number(derivedClientCredit) - Number(derivedClientDebit);
              } else {
                const rk = pick(previewData, ['monthlyResult', 'monthly_result', 'result']);
                monthVal = rk ? Number(previewData[rk]) : NaN;
              }
              if (Number.isFinite(opening) && Number.isFinite(monthVal)) return opening + monthVal;
              return 0;
            })()}
            defaultType={(function () {
              if (!previewData) return 'O2 Payment';
              const ok = pick(previewData, ['openingBalance', 'opening_balance', 'opening']);
              const opening = ok ? Number(previewData[ok]) : NaN;
              let monthVal = NaN;
              if (isClientUnit) {
                monthVal = Number(derivedClientCredit) - Number(derivedClientDebit);
              } else {
                const rk = pick(previewData, ['monthlyResult', 'monthly_result', 'result']);
                monthVal = rk ? Number(previewData[rk]) : NaN;
              }
              const closing = (Number.isFinite(opening) && Number.isFinite(monthVal)) ? opening + monthVal : 0;
              return closing < 0 ? 'Client Payment' : 'O2 Payment';
            })()}
            defaultAmount={(function () {
              if (!previewData) return '';
              const ok = pick(previewData, ['openingBalance', 'opening_balance', 'opening']);
              const opening = ok ? Number(previewData[ok]) : NaN;
              let monthVal = NaN;
              if (isClientUnit) {
                monthVal = Number(derivedClientCredit) - Number(derivedClientDebit);
              } else {
                const rk = pick(previewData, ['monthlyResult', 'monthly_result', 'result']);
                monthVal = rk ? Number(previewData[rk]) : NaN;
              }
              const closing = (Number.isFinite(opening) && Number.isFinite(monthVal)) ? opening + monthVal : NaN;
              return Number.isFinite(closing) ? Math.abs(closing).toFixed(2) : '';
            })()}
            defaultPaymentMethod="Transfer"
            defaultDescription={(() => {
              const ym = String(yearMonth || '').trim();
              return /^\d{4}-\d{2}$/.test(ym)
                ? `Pago reporte ${ym.slice(2).replace('-', '')}`
                : 'Pago reporte';
            })()}
            onSave={afterMutation}
            onClose={closeDrawer}
          />
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Select a unit and load the month first.
            </Typography>
          </Box>
        )}
      </AppDrawer>
      <AppDrawer
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        title="Month Workflow"
        width={420}
      >
        <Box
          sx={{
            pl: 1.5,
            pr: 1,
            py: 2,
            maxWidth: '100%',
            height: '120vh',   // fits within drawer
            overflowY: 'auto',               // enables vertical scroll
          }}
        >
          <NotchedCard label="Summary" sx={{ width: 270 }}>
            {workflowLoading ? (
              <Box sx={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:72 }}>
                <CircularProgress size={18} />
              </Box>
            ) : (
              <Box sx={{ display:'flex', flexDirection:'column', gap:1, mt:0.5 }}>
                <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <Typography variant="body2">Reports</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{`${workflowSummary.reports.issued} / ${workflowSummary.reports.total}`}</Typography>
                </Box>
                <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <Typography variant="body2">O2 Payments</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{`${workflowSummary.o2.paid} / ${workflowSummary.o2.total} — ${peso(workflowSummary.o2.amount)}`}</Typography>
                </Box>
                <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <Typography variant="body2">Client Payments</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{`${workflowSummary.client.received} / ${workflowSummary.client.total} — ${peso(workflowSummary.client.amount)}`}</Typography>
                </Box>
              </Box>
            )}
          </NotchedCard>
          <Box sx={{ mt: 1.5 }} />
         <NotchedCard label="Units" sx={{ width: 270 }}>
           {workflowLoading ? (
             <Box sx={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:72 }}>
               <CircularProgress size={18} />
             </Box>
           ) : (
             // Make the card itself the scroll container so sticky header works within it
             <Box sx={{ maxHeight: '60vh', overflowY: 'auto', mt: 0.5 }}>
               {/* Sticky Header */}
               <Box
                 sx={{
                   display:'grid',
                   gridTemplateColumns:'minmax(0, 1fr) 140px',
                   alignItems:'center',
                   px: 0.5,
                   position: 'sticky',
                   top: 0,
                   zIndex: 1,
                   bgcolor: 'background.paper',
                   borderBottom: '1px solid',
                   borderColor: 'divider',
                   py: 0.5,
                 }}
               >
                 <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>Unit</Typography>
                 <Typography variant="caption" color="text.secondary" sx={{ textAlign:'right', minWidth:0 }}>Workflow</Typography>
               </Box>

               {/* Rows */}
               {workflowRows.length === 0 ? (
                 <Typography variant="body2" color="text.secondary" sx={{ px: 0.5, py: 1 }}>No units.</Typography>
               ) : (
                 <Box sx={{ display:'flex', flexDirection:'column', gap:0.75 }}>
                   {workflowRows.map(row => {
                     // Defensive: guarantee 'pay' renders whenever report is true and bankAccount is present
                     let steps;
                     if (!row.report) {
                       steps = ['report'];
                     } else {
                       const base = (row.order && Array.isArray(row.order) && row.order.length > 0)
                         ? row.order.slice()
                         : (row.bankAccount ? ['report','pay','email'] : ['report','email']);
                       // Guarantee 'report' is first
                       if (base[0] !== 'report') {
                         const filtered = base.filter(s => s !== 'report');
                         steps = ['report', ...filtered];
                       } else {
                         steps = base;
                       }
                       // If bank account is present, force include 'pay' (grey until issued)
                       if (row.bankAccount && !steps.includes('pay')) {
                         const idxEmail = steps.indexOf('email');
                         if (idxEmail > 0) {
                           steps.splice(idxEmail, 0, 'pay'); // insert before email
                         } else {
                           steps.push('pay');
                         }
                       }
                       // If no bank, ensure 'pay' is not shown
                       if (!row.bankAccount) {
                         steps = steps.filter(s => s !== 'pay');
                       }
                     }
                     return (
                       <Box key={row.id} sx={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr) 85px', alignItems:'center', px: 0.5, gap: 0.5 }}>
                         <Typography
                           component="a"
                           href="#"
                           role="link"
                           tabIndex={0}
                           variant="body2"
                           noWrap
                           title={row.name}
                           onClick={(e) => { e.preventDefault(); handleSelectUnit({ id: row.id, unitName: row.name }); setWorkflowOpen(false); }}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter' || e.key === ' ') {
                               e.preventDefault();
                               handleSelectUnit({ id: row.id, unitName: row.name });
                               setWorkflowOpen(false);
                             }
                           }}
                           sx={{
                             pr: 0.5,
                             minWidth: 0,
                             cursor: 'pointer',
                             color: 'text.primary',
                             textDecoration: 'none',
                             '&:hover': { color: '#00897B' } // teal hover
                           }}
                         >
                           {row.name}
                         </Typography>
                         <Box sx={{ display:'flex', alignItems:'center', gap: 0.5, justifyContent:'flex-start', pl: 0, flexWrap: 'wrap', rowGap: 0.25 }}>
                           {steps.map((step, idx) => {
                             let active = false;
                             let IconCmp = null;
                             let title = '';
                             if (step === 'report') {
                               active = !!row.report;
                               IconCmp = DocumentTextIcon;
                               title = 'PDF';
                             } else if (step === 'pay') {
                               active = !!row.pay;
                               IconCmp = CurrencyDollarIcon;
                               title = 'Pay';
                             } else if (step === 'email') {
                               active = !!row.email;
                               IconCmp = EnvelopeIcon;
                               title = 'Mail';
                             } else {
                               return null;
                             }
                             return (
                               <Box
                                 key={`${row.id}-${step}-${idx}`}
                                 component="span"
                                 title={title}
                                 sx={{
                                   display: 'inline-flex',
                                   alignItems: 'center',
                                   justifyContent: 'center',
                                   width: 22,
                                   height: 22,
                                   color: active ? 'success.main' : 'grey.500',
                                 }}
                               >
                                 <IconCmp width={18} height={18} />
                               </Box>
                             );
                           })}
                         </Box>
                       </Box>
                     );
                   })}
                 </Box>
               )}
             </Box>
           )}
         </NotchedCard>
        </Box>
      </AppDrawer>
      {/* Comment and comment-edit modals (OccWNoteModal handles the editor; we handle API) */}
      {drawer === 'comment' && (
        <OccWNoteModal
          open
          onClose={closeDrawer}
          onSave={handleSaveNewComment}
          minWidth={420}
          headerText="Add comment"
        />
      )}

      {drawer === 'comment-edit' && (
        <OccWNoteModal
          open
          onClose={closeDrawer}
          onSave={handleSaveEditComment}
          note={editCommentValue || ''}
          initialNoteText={editCommentValue || ''}
          noteText={editCommentValue || ''}
          hasNote={false}
          noteId={null}
          minWidth={420}
          headerText="Edit comment"
          key={editNoteId || 'edit-comment'}
        />
      )}

      {/* Drawer only for unit-transaction-edit */}
      <Drawer anchor="right" open={drawer === 'unit-transaction-edit'} onClose={closeDrawer}>
        <Box sx={{ width: 420, p: 2 }}>
          {selectedUnitTransactionId && (
            <UnitMonthlyEditUnitTransactionForm
              transactionId={selectedUnitTransactionId}
              unitName={selectedUnit?.unitName}
              onClose={async () => {
                closeDrawer();
                await handleLoadMonth();
              }}
            />
          )}
        </Box>
     </Drawer>
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(v => ({ ...v, open: false }))}
      >
        <Alert
          onClose={() => setToast(v => ({ ...v, open: false }))}
          severity={toast.severity}
          sx={{ width: '100%' }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>

      {/* Request Payments Drawer */}
      <UnitReportPayRequestDrawer
        open={payDrawerOpen}
        onClose={() => setPayDrawerOpen(false)}
        yearMonth={yearMonth}
      />
    </Box>
  </PageScaffold>
);
}

