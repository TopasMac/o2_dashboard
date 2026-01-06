import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BookingEditFormRHF from '../components/forms/BookingEditFormRHF';
import AppDrawer from '../components/common/AppDrawer';
import {
  Box,
  Button,
  Typography,
  Stack,
  Alert,
  LinearProgress,
  Divider,
  Drawer,
  Tabs,
  Tab,
  Chip,
  TextField,
  MenuItem,
  Checkbox,
  IconButton,
  Menu,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TableLite from '../components/layout/TableLite';
import PageScaffold from '../components/layout/PageScaffold';

const getJwt = () => {
  return (
    localStorage.getItem('jwt') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('jwt') ||
    ''
  );
};


function pretty(n) {
  if (n === null || n === undefined) return '—';
  if (typeof n === 'number') return n.toLocaleString();
  if (!Number.isNaN(Number(n)) && n !== '') return Number(n).toLocaleString();
  return String(n);
}

// ==== Recon visual helpers (Step 1) ====
const MONEY_TOLERANCE = 1.0; // MXN tolerance for considering payouts matched
const SENT_OFFSET_DAYS = 9; // days before Arrives to display as Sent in Bank Recon

function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10); // keep date part only
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    // Accept either YYYY-MM-DD or DD/MM/YYYY; normalize to DD-MM-YYYY
    let y, m, day;
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      [y, m, day] = parts;
    } else {
      // DD-MM-YYYY or DD/MM/YYYY
      [day, m, y] = parts;
    }
    if (y && m && day) {
      const dd = String(day).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const yyyy = String(y).padStart(4, '0');
      return `${dd}-${mm}-${yyyy}`;
    }
  }
  return s; // fallback
}

function fmtMoney(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isDateMismatch(a, b) {
  if (!a || !b) return true; // if one side missing, flag
  return String(a) !== String(b);
}

function isMoneyMismatch(a, b, tol = MONEY_TOLERANCE) {
  const na = Number(a ?? 0);
  const nb = Number(b ?? 0);
  if (Number.isNaN(na) || Number.isNaN(nb)) return true;
  return Math.abs(na - nb) > tol;
}

/**
 * Renders a two-line comparison block: top value (authoritative), then an arrow and bottom value.
 * Use with dates or money; pass a boolean to control mismatch coloring on the second line.
 */
function renderCompare(top, bottom, { type = 'text', mismatch = false } = {}) {
  const topStr = type === 'money' ? fmtMoney(top) : type === 'date' ? fmtDate(top) : String(top ?? '—');
  const bottomStr = type === 'money' ? fmtMoney(bottom) : type === 'date' ? fmtDate(bottom) : String(bottom ?? '—');
  return (
    <Box sx={{ lineHeight: 1.2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{topStr}</Typography>
      <Typography
        variant="body2"
        sx={{ color: mismatch ? 'warning.main' : 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
      >
        <span style={{ opacity: 0.7 }}>→</span> {bottomStr}
      </Typography>
    </Box>
  );
}
// Minimal upload icon: up arrow into tray
function UploadIcon({ active = false, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle' }}
      aria-hidden
      focusable="false"
    >
      {/* Bottom tray */}
      <path d="M4 19.5h16" stroke={active ? '#008080' : '#9E9E9E'} strokeWidth="1.7" strokeLinecap="round" />
      {/* Up arrow shaft */}
      <path d="M12 17V6" stroke={active ? '#008080' : '#9E9E9E'} strokeWidth="1.7" strokeLinecap="round" />
      {/* Up arrow head */}
      <path d="M8.5 9.5L12 6l3.5 3.5" stroke={active ? '#008080' : '#9E9E9E'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
// ==== ErrorBoundary ====
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[AirbnbPayoutsRecon] ErrorBoundary caught', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">Something went wrong while rendering this view. Try reloading the page.</Alert>
        </Box>
      );
    }
    return this.props.children;
  }
}
// ==== End recon helpers ====

export default function AirbnbPayoutsRecon() {
  const [reportFile, setReportFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [error, setError] = useState(null);

  // Table state
  const [payoutRows, setPayoutRows] = useState([]);
  // Helper to POST the check
  const checkPayout = useCallback(async (payoutId, entryId) => {
    const token = getJwt();
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch('/api/payouts/recon-banks/check', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ payoutId, entryId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to mark as checked');
    return true;
  }, []);

  // Handler for checkbox clicks (allow Espiral and Santander)
  const handleCheckedToggle = useCallback(async (row) => {
    try {
      const method = (row.methodNormalized || '').toLowerCase();
      if (method !== 'espiral' && method !== 'santander') {
        throw new Error('Only Espiral or Santander payouts can be checked.');
      }
      if (!row.entryId) {
        throw new Error('No matching accountant entry to confirm.');
      }
      await checkPayout(row.id, row.entryId);
      // Optimistically mark the row as checked so it renders with the check icon,
      // same behavior for Espiral and Santander
      setPayoutRows(prev =>
        prev.map(r =>
          r.id === row.id
            ? { ...r, isChecked: true, checkedLabel: 'Checked' }
            : r
        )
      );
    } catch (e) {
      setError(e.message || 'Failed to mark as checked');
    }
  }, [checkPayout]);
  const [tableLoading, setTableLoading] = useState(false);
  const [limit] = useState(50);
  const [offset] = useState(0);

  // Summary table state
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  // Unmatched Abonos table state
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);

  // Drawer for items
  const [openDrawer, setOpenDrawer] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState(null); // {id, referenceCode, payoutDate}
  const [itemRows, setItemRows] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [tab, setTab] = useState(0); // 0: Bank Recon (Batches), 1: Reservation Recon
  // Header filter state for Bank Recon: Checked
  const [checkedFilter, setCheckedFilter] = useState('All'); // 'All' | 'Checked' | 'No Match'

  // Booking editor drawer (open from Reservation Recon Code click)
  const [openBookingDrawer, setOpenBookingDrawer] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [bookingProbe, setBookingProbe] = useState(null);
  const [bookingInit, setBookingInit] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  // Memoized unitOptions for BookingEditFormRHF
  const unitOptions = useMemo(() => {
    const id = bookingInit?.unitId ?? bookingInit?.unit?.id ?? null;
    const name = bookingInit?.unitName ?? bookingInit?.unit?.unitName ?? bookingInit?.unit?.name ?? bookingInit?.unit?.listingName ?? null;
    if (!id && !name) return [];
    const label = name || (id ? `Unit #${id}` : '');
    return [{ id, label, unitName: name || label }];
  }, [bookingInit]);




  // Shared Month filter (applies to both tabs)
  const [monthStr, setMonthStr] = useState(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1); // first day of previous month
    const mm = String(prev.getMonth() + 1).padStart(2, '0');
    return `${prev.getFullYear()}-${mm}`; // YYYY-MM (previous month)
  });
  const [monthMenuAnchor, setMonthMenuAnchor] = useState(null);
  const monthMenuOpen = Boolean(monthMenuAnchor);
  const shiftMonth = useCallback((delta) => {
    const [yy, mm] = monthStr.split('-').map(Number);
    const d = new Date(yy, (mm - 1) + delta, 1);
    const m2 = String(d.getMonth() + 1).padStart(2, '0');
    setMonthStr(`${d.getFullYear()}-${m2}`);
  }, [monthStr]);
  const monthOptions = useMemo(() => {
    const [yy, mm] = monthStr.split('-').map(Number);
    const base = new Date(yy, mm - 1, 1);
    const fmtVal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const fmtLabel = (d) => d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
    const opts = [];
    for (let delta = -2; delta <= 2; delta++) {
      const d = new Date(base.getFullYear(), base.getMonth() + delta, 1);
      opts.push({ value: fmtVal(d), label: fmtLabel(d) });
    }
    return opts;
  }, [monthStr]);
  const computeRange = useCallback((m) => {
    // m = 'YYYY-MM'
    const [y, mo] = m.split('-').map(Number);
    const start = new Date(y, mo - 1, 1);
    const end = new Date(y, mo, 0); // last day of month
    const fmt = (dt) => dt.toISOString().slice(0, 10);
    return { from: fmt(start), to: fmt(end) };
  }, []);

  const canUploadReport = useMemo(() => !!reportFile && !loading, [reportFile, loading]);

  const upload = useCallback(async (file, endpoint) => {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = getJwt();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: form,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || `Upload failed (${res.status})`);
      return data;
    } catch (e) {
      setError(e.message || 'Upload failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    setTableLoading(true);
    try {
      const token = getJwt();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { from, to } = computeRange(monthStr);
      const qs = new URLSearchParams({ from, to });
      qs.set('includeChecked', '1'); // always request both checked and unchecked
      qs.set('_', String(Date.now())); // cache buster so we always refetch when filter changes
      const res = await fetch(`/api/payouts/recon-banks?${qs.toString()}`, { headers, credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to load bank recon');
      const rows = (data.data || []).map((r, idx) => {
        const hasMatch = !!r.match;
        const diff = hasMatch ? Number(r.match.diff) : null;
        return {
          id: r.id,
          idx: offset + idx + 1,
          // Sent = Arrives - SENT_OFFSET_DAYS
          sentDate: r.arrivingBy
            ? fmtDate(
                new Date(
                  new Date(r.arrivingBy).setDate(
                    new Date(r.arrivingBy).getDate() - SENT_OFFSET_DAYS
                  )
                )
                  .toISOString()
                  .slice(0, 10)
              )
            : '—',
          arrivingBy: fmtDate(r.arrivingBy || ''),
          referenceCode: r.referenceCode,
          amount: pretty(r.amount),
          currency: r.currency,
          payoutMethod: r.payoutMethod,
          methodNormalized: r.methodNormalized || '',
          matchFechaOn: fmtDate(r.match?.fechaOn || ''),
          matchConcepto: r.match?.concepto || '',
          matchDeposito: r.match?.deposito || '',
          reconCheckedAt: r.reconCheckedAt || null,
          isChecked: !!r.isChecked,
          checkedLabel: r.isChecked ? 'Checked' : 'No Match',
          entryId: r.match?.entryId || r.match?.id || null,
          checkedControl: (
            <Checkbox
              size="small"
              checked={!!r.isChecked}
              disabled={
                !!r.isChecked ||
                !(['espiral', 'santander'].includes((r.methodNormalized || '').toLowerCase())) ||
                !(r.match && (r.match.entryId || r.match.id))
              }
              onChange={() => handleCheckedToggle({
                id: r.id,
                entryId: r.match?.entryId || r.match?.id || null,
                methodNormalized: r.methodNormalized || ''
              })}
            />
          ),
          diffChip: hasMatch ? (
            <Chip size="small" label={(diff ?? 0).toFixed(2)} color={Math.abs(diff ?? 0) <= 1 ? 'success' : 'warning'} variant="outlined" />
          ) : (
            <Chip size="small" label="—" variant="outlined" />
          ),
        };
      });
      setPayoutRows(rows);
    } catch (e) {
      setError(e.message || 'Failed to load payouts');
    } finally {
      setTableLoading(false);
    }
  }, [limit, offset, computeRange, monthStr, handleCheckedToggle, checkedFilter]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const token = getJwt();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { from, to } = computeRange(monthStr);
      const res = await fetch(`/api/payouts/recon-reservations?from=${from}&to=${to}`,
        { headers, credentials: 'include' });
      const data = await res.json();
      if (!res.ok || data.success !== true) throw new Error(data?.error || 'Failed to load recon');

      const rows = (data.data || []).map((r, idx) => {
        const payoutReport = Number(r.payoutReport ?? 0);
        const payoutSystem = Number(r.payoutSystem ?? 0);
        const diff = payoutReport - payoutSystem;
        const startMismatch = isDateMismatch(r.startDate, r.checkIn);
        const endMismatch = isDateMismatch(r.endDate, r.checkOut);
        const payoutMismatch = isMoneyMismatch(payoutReport, payoutSystem);
        const isMatched = !startMismatch && !endMismatch && !payoutMismatch;
        return {
          id: `${r.confirmationCode || 'NA'}-${idx}`,
          unitName: r.unitName || '',
          confirmationCode: r.confirmationCode || '',
          bookingId: r.bookingId || r.booking_id || null,
          // composed compares
          startCompare: renderCompare(r.startDate || '', r.checkIn || '', { type: 'date', mismatch: startMismatch }),
          endCompare: renderCompare(r.endDate || '', r.checkOut || '', { type: 'date', mismatch: endMismatch }),
          payoutCompare: renderCompare(payoutReport, payoutSystem, { type: 'money', mismatch: payoutMismatch }),
          // keep raw values if needed elsewhere
          startDate: r.startDate || '',
          endDate: r.endDate || '',
          checkIn: r.checkIn || '',
          checkOut: r.checkOut || '',
          payoutReport: payoutReport.toFixed(2),
          payoutSystem: payoutSystem.toFixed(2),
          adjAmount: (r.adjAmount ?? '0.00'),
          status: r.status || '',
          currency: r.currency || '',
          diff: diff.toFixed(2),
          diffChip: (
            <Chip size="small" label={diff.toFixed(2)} color={Math.abs(diff) <= 1 ? 'success' : 'warning'} variant="outlined" />
          ),
          isMatched,
        };
      });
      setSummaryRows(rows.filter(r => !r.isMatched));
    } catch (e) {
      setError(e.message || 'Failed to load recon');
    } finally {
      setSummaryLoading(false);
    }
  }, [computeRange, monthStr]);

  // Loader for unmatched abonos (Unmatched Bank Credits)
  const loadUnmatched = useCallback(async () => {
    setUnmatchedLoading(true);
    try {
      const token = getJwt();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { from, to } = computeRange(monthStr);
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/payouts/recon-unmatched-abonos?${qs.toString()}`, { headers, credentials: 'include' });
      const data = await res.json();
      if (!res.ok || data.success !== true) throw new Error(data?.error || 'Failed to load unmatched abonos');
      const rows = (data.data || []).map((r) => ({
        id: r.id,
        fechaOn: fmtDate(r.fechaOn),
        fechaOnRaw: (r.fechaOn || '').slice(0, 10), // keep YYYY-MM-DD for range checks
        windowSentStart: fmtDate(r.windowSentStart),
        deposito: fmtMoney(r.deposito),
        depositoNum: Number(r.deposito) || 0,
        approx: Array.isArray(r.approx) ? r.approx : [],
      }));
      setUnmatchedRows(rows);
    } catch (e) {
      setError(e.message || 'Failed to load unmatched');
    } finally {
      setUnmatchedLoading(false);
    }
  }, [computeRange, monthStr]);

  // Handler for force "Checked" action in booking drawer
  const handleForceChecked = useCallback(async () => {
    if (!selectedBookingId) return;
    try {
      const token = getJwt();
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      // Use PUT to the booking endpoint, sending both camelCase and snake_case for backend compatibility
      const res = await fetch(`/api/bookings/${selectedBookingId}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ isPaid: true, is_paid: 1 })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to mark as paid');
      // Optimistic: remove row, close drawer, and reload Reservation Recon table
      setSummaryRows(prev => prev.filter(r => (r.bookingId || r.booking_id) !== selectedBookingId));
      setOpenBookingDrawer(false);
      await loadSummary();
    } catch (e) {
      setError(e.message || 'Failed to mark as paid');
    }
  }, [selectedBookingId, loadSummary]);

  const handleOpenBookingByCode = useCallback((row) => {
    // Expect bookingId from API join; if missing, show error
    const id = row.bookingId || row.booking_id || null;
    if (!id) {
      setError('No bookingId available for this reservation.');
      return;
    }
    setSelectedBookingId(id);
    setOpenBookingDrawer(true);
  }, []);

  useEffect(() => {
    const probe = async () => {
      if (!openBookingDrawer || !selectedBookingId) return;
      setBookingLoading(true);
      setBookingInit(null);
      try {
        const token = getJwt();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`https://dev.dashboard.owners2.com/api/bookings/${selectedBookingId}`, { headers, credentials: 'include' });
        const json = await res.json().catch(() => null);
        setBookingProbe({ ok: res.ok, status: res.status, data: json });
        setBookingInit(json?.data ?? json ?? null);
      } catch (e) {
        setBookingProbe({ ok: false, status: 0, data: null });
        setBookingInit(null);
      } finally {
        setBookingLoading(false);
      }
    };
    probe();
  }, [openBookingDrawer, selectedBookingId]);

  useEffect(() => {
    loadPayouts();
    loadSummary();
    loadUnmatched();
  }, [loadPayouts, loadSummary, loadUnmatched, checkedFilter]);

  const onImportReport = useCallback(async (fileArg) => {
    const fileToUse = fileArg || reportFile;
    if (!fileToUse) return;
    const data = await upload(fileToUse, '/api/payouts/import-report');
    if (data) {
      setReportResult(data.result || null);
      loadPayouts(); // refresh table
      loadSummary();
    }
  }, [reportFile, upload, loadPayouts, loadSummary]);

  const payoutColumns = useMemo(() => ([
    { header: 'Sent', accessor: 'sentDate', width: 110, disableFilter: true },
    { header: 'Arrives', accessor: 'arrivingBy', width: 110, disableFilter: true },
    { header: 'Amount', accessor: 'amount', width: 120 },
    {
      header: 'Method',
      accessor: 'methodNormalized',
      width: 120,
      // Try multiple keys to accommodate DataTable filter APIs
      filter: 'select',
      filterType: 'select',
      filterOptions: [
        { value: 'Espiral', label: 'Espiral' },
        { value: 'Santander', label: 'Santander' },
      ],
      options: [
        { value: 'Espiral', label: 'Espiral' },
        { value: 'Santander', label: 'Santander' },
      ],
      render: (value, row) => (
        <Button
          size="small"
          variant="text"
          color="inherit"
          onClick={() => handleOpenItems(row)}
          sx={{
            p: 0,
            minWidth: 0,
            textTransform: 'none',
            color: 'text.primary',
            '&:hover': { color: 'teal', backgroundColor: 'transparent' },
          }}
        >
          {value || '—'}
        </Button>
      ),
      // Fallback custom renderer if the table supports a render hook for the filter cell
      headerFilterRender: ({ value, onChange }) => (
        <TextField
          select
          size="small"
          value={value ?? ''}
          onChange={(e) => onChange ? onChange(e.target.value) : null}
          fullWidth
          SelectProps={{
            displayEmpty: true,
            renderValue: (v) => (v ? v : 'All'),
          }}
        >
          {/* No explicit All option to avoid duplication; empty value means All */}
          <MenuItem value="Espiral">Espiral</MenuItem>
          <MenuItem value="Santander">Santander</MenuItem>
        </TextField>
      ),
    },
    { header: 'Match date', accessor: 'matchFechaOn', width: 120 },
    { header: 'Concept', accessor: 'matchConcepto', minWidth: 200, flex: 1 },
    { header: 'Depósito', accessor: 'matchDeposito', width: 120 },
    {
      header: 'Checked',
      accessor: 'checkedLabel',
      width: 130,
      filter: 'select',
      filterType: 'select',
      render: (value, row) => (
        row.isChecked ? (
          <CheckCircleOutlineIcon sx={{ color: 'teal' }} />
        ) : (
          row.checkedControl
        )
      ),
      headerFilterRender: ({ value, onChange }) => (
        <TextField
          select
          size="small"
          value={checkedFilter}
          onChange={(e) => {
            setCheckedFilter(e.target.value);
            // neutralize internal filter so table doesn't double-filter
            if (onChange) onChange('');
          }}
          fullWidth
          SelectProps={{
            displayEmpty: true,
            renderValue: () => (
              checkedFilter === 'Checked' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleOutlineIcon sx={{ color: 'teal' }} />
                  <span>Checked</span>
                </Box>
              ) : checkedFilter === 'No Match' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox size="small" checked={false} disabled sx={{ p: 0 }} />
                  <span>No Match</span>
                </Box>
              ) : (
                <span>All</span>
              )
            ),
          }}
        >
          <MenuItem value="Checked">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlineIcon sx={{ color: 'teal' }} />
              <span>Checked</span>
            </Box>
          </MenuItem>
          <MenuItem value="No Match">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox size="small" checked={false} disabled sx={{ p: 0 }} />
              <span>No Match</span>
            </Box>
          </MenuItem>
        </TextField>
      ),
    }
  ]), [checkedFilter]);

  // Memoized filtered dataset for the bank table (Checked column)
  const filteredPayoutRows = useMemo(() => {
    if (checkedFilter === 'All') return payoutRows;
    const wantChecked = checkedFilter === 'Checked';
    return payoutRows.filter(r => (r.isChecked === true) === wantChecked);
  }, [payoutRows, checkedFilter]);


  const handleOpenItems = useCallback(async (row) => {
    setSelectedPayout({
      id: row.id,
      referenceCode: row.referenceCode,
      payoutDate: row.arrivingBy || '',
      sentDate: row.sentDate || '',
      arrivingBy: row.arrivingBy || '',
    });
    setOpenDrawer(true);
    setItemsLoading(true);
    try {
      const token = getJwt();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/payouts/${row.id}/items`, { headers, credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to load items');

      const raw = (data.data || []);

      // Group items by confirmationCode; fall back to item id when missing
      const byCode = new Map();
      raw.forEach((i) => {
        const key = i.confirmationCode || `item-${i.id}`;
        const g = byCode.get(key) || {
          confirmationCode: key,
          unitName: i.unitName || i.listing || '',
          guestName: i.guestName || '',
          // Dates: default to the first values; we'll also track min/max
          startDate: i.startDate || null,
          endDate: i.endDate || null,
          minStart: i.startDate || null,
          maxEnd: i.endDate || null,
          // Totals
          payoutTotal: 0,
          adjTotal: 0,
        };
        // Update dates
        if (i.startDate && (!g.minStart || i.startDate < g.minStart)) g.minStart = i.startDate;
        if (i.endDate && (!g.maxEnd || i.endDate > g.maxEnd)) g.maxEnd = i.endDate;
        g.startDate = g.minStart;
        g.endDate = g.maxEnd;
        // Sum amounts
        const amt = Number(i.amount ?? 0) || 0;
        g.payoutTotal += amt;
        if (String(i.lineType || '').toLowerCase().includes('adjustment')) {
          g.adjTotal += amt;
        }
        byCode.set(key, g);
      });

      const grouped = Array.from(byCode.values()).map((g, idx) => ({
        id: `${g.confirmationCode}-${idx}`,
        confirmationCode: g.confirmationCode,
        unitName: g.unitName,
        guestName: g.guestName,
        startDate: fmtDate(g.startDate),
        endDate: fmtDate(g.endDate),
        payoutTotal: g.payoutTotal,
        adjTotal: g.adjTotal,
        paymentSent: selectedPayout?.sentDate || '',
        paymentArrives: selectedPayout?.arrivingBy || '',
      }));

      setItemRows(grouped);
    } catch (e) {
      setError(e.message || 'Failed to load items');
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const handleOpenItemsFromCandidate = useCallback((cand) => {
    if (!cand || !cand.payoutId) return;
    const row = {
      id: cand.payoutId,
      referenceCode: cand.reference || '',
      sentDate: cand.sentDate || '',
      arrivingBy: cand.arrives || '',
    };
    handleOpenItems(row);
  }, [handleOpenItems]);

  // Confirm unmatched deposit using the best suggested payout (approx[0])
  const handleUnmatchedChecked = useCallback(async (row) => {
    try {
      const best = Array.isArray(row.approx) && row.approx.length > 0 ? row.approx[0] : null;
      if (!best || !best.payoutId) {
        throw new Error('No suggested payout to confirm for this deposit.');
      }
      await checkPayout(best.payoutId, row.id);
      // Remove this deposit from the unmatched list after confirming
      setUnmatchedRows(prev => prev.filter(r => r.id !== row.id));
    } catch (e) {
      setError(e.message || 'Failed to mark deposit as checked');
    }
  }, [checkPayout]);

  const itemColumns = useMemo(() => ([
    {
      header: 'ID',
      accessor: 'unitName',
      width: 140,
      render: (value, row) => (
        <Box sx={{ lineHeight: 1.1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.unitName || '—'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.confirmationCode || '—'}
          </Typography>
        </Box>
      ),
    },
    {
      header: 'Dates',
      accessor: 'startDate',
      width: 80,
      render: (value, row) => (
        <Box sx={{ lineHeight: 1.1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
            {row.startDate || '—'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {row.endDate || '—'}
          </Typography>
        </Box>
      ),
    },
    {
      header: 'Payout',
      accessor: 'payoutTotal',
      width: 92,
      render: (value, row) => (
        <Box sx={{ lineHeight: 1.1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
            {fmtMoney(row.payoutTotal)}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {row.adjTotal ? fmtMoney(row.adjTotal) : '—'}
          </Typography>
        </Box>
      ),
    },
  ]), []);

  const summaryColumns = useMemo(() => ([
    {
      header: 'Unit',
      accessor: 'unitName',
      width: 220,
      minWidth: 220,
      flex: 1,
      render: (value) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', textAlign: 'center' }}>
          <Typography variant="body2" sx={{ textAlign: 'center' }}>{value || '—'}</Typography>
        </Box>
      ),
    },
    {
      header: 'Code',
      accessor: 'confirmationCode',
      width: 160,
      render: (value, row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => handleOpenBookingByCode(row)}
            sx={{
              p: 0,
              minWidth: 0,
              textTransform: 'none',
              color: 'text.primary',
              '&:hover': { color: 'teal' },
            }}
          >
            {value || '—'}
          </Button>
        </Box>
      ),
    },
    { header: 'Start / Check-in', accessor: 'startCompare', width: 170 },
    { header: 'End / Check-out', accessor: 'endCompare', width: 170 },
    { header: 'Payout (Report → System)', accessor: 'payoutCompare', width: 190 },
    {
      header: 'Adj',
      accessor: 'adjAmount',
      width: 110,
      render: (value) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', textAlign: 'center' }}>
          <Typography variant="body2" sx={{ textAlign: 'center' }}>{value ?? '—'}</Typography>
        </Box>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      width: 110,
      render: (value) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', textAlign: 'center' }}>
          <Typography variant="body2" sx={{ textAlign: 'center' }}>{value || '—'}</Typography>
        </Box>
      ),
    },
    {
      header: 'Δ (Report−System)',
      accessor: 'diffChip',
      width: 160,
      render: (value) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
          {value}
        </Box>
      ),
    },
  ]), [handleOpenBookingByCode]);

const unmatchedColumns = useMemo(() => ([
  { header: 'Abono',         accessor: 'fechaOn',         width: 110, disableFilter: true, type: 'text' },
  { header: 'Window start',  accessor: 'windowSentStart', width: 130, disableFilter: true, type: 'text' },
  { header: 'Amount', accessor: 'deposito', width: 120, disableFilter: true },
  { header: 'Approx', accessor: 'approx', minWidth: 220, flex: 1, disableFilter: true,
    render: (value) => (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {(value || []).slice(0, 3).map((c, idx) => (
          <Chip
            key={idx}
            size="small"
            variant="outlined"
            label={`${fmtMoney(c.amount)} • ${fmtDate(c.sentDate)}`}
            onClick={() => handleOpenItemsFromCandidate(c)}
            title={`Ref ${c.reference || ''} • Arrives ${fmtDate(c.arrives)}`}
            sx={{ cursor: 'pointer' }}
          />
        ))}
        {(!value || value.length === 0) && <Typography variant="caption" color="text.secondary">—</Typography>}
      </Box>
    ),
  },
  {
    header: 'Checked',
    accessor: 'checked',
    width: 90,
    disableFilter: true,
    render: (value, row) => {
      const hasBest = Array.isArray(row.approx) && row.approx.length > 0 && row.approx[0].payoutId;
      return (
        <Checkbox
          size="small"
          checked={false}
          disabled={!hasBest}
          onChange={() => hasBest && handleUnmatchedChecked(row)}
        />
      );
    },
  },
]), [handleOpenItemsFromCandidate, handleUnmatchedChecked]);

  const unmatchedTotal = useMemo(() => {
    // Sum only rows whose fechaOn falls inside the currently selected month
    const { from, to } = computeRange(monthStr); // YYYY-MM-DD bounds
    return unmatchedRows.reduce((sum, r) => {
      const d = r.fechaOnRaw || '';
      if (d && d >= from && d <= to) {
        return sum + (typeof r.depositoNum === 'number' ? r.depositoNum : 0);
      }
      return sum;
    }, 0);
  }, [unmatchedRows, computeRange, monthStr]);

  return (
    <ErrorBoundary>
      <PageScaffold
        title="Airbnb Payouts — Import & Reconciliation"
        layout="table"
        withCard
        headerPlacement="inside"
      >
        <Box
          sx={{
            pb: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {loading && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          {/* Month filter (applies to both tabs), with CSV upload controls */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <TextField
              label="Month"
              type="month"
              size="small"
              value={monthStr}
              onChange={(e) => setMonthStr(e.target.value)}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                    <IconButton size="small" tabIndex={-1} onClick={(e) => setMonthMenuAnchor(e.currentTarget)} aria-label="Choose month">
                      <CalendarMonthIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" tabIndex={-1} onClick={() => shiftMonth(-1)} aria-label="Previous month">
                      <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" tabIndex={-1} onClick={() => shiftMonth(1)} aria-label="Next month">
                      <ChevronRightIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )
              }}
              sx={{
                width: 240,
                '& input::-webkit-calendar-picker-indicator': { display: 'none' },
                '& input[type="month"]::-webkit-inner-spin-button': { display: 'none' },
                '& input[type="month"]': { WebkitAppearance: 'textfield' }
              }}
            />
            <Tabs
              value={tab}
              onChange={(e, v) => setTab(v)}
              sx={{
                ml: 2,
                minHeight: 36,
                '& .MuiTabs-indicator': { backgroundColor: 'teal' },
                '& .MuiTab-root.Mui-selected': { color: 'teal' },
                '& .MuiTab-root:not(:last-of-type)': { position: 'relative', pr: 2, mr: 1 },
                '& .MuiTab-root:not(:last-of-type)::after': {
                  content: '\"|\"',
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'text.disabled',
                  pointerEvents: 'none',
                },
              }}
            >
              <Tab label="Reservation Match" sx={{ minHeight: 36 }} />
              <Tab label="Airbnb Payouts" sx={{ minHeight: 36 }} />
              <Tab label="Unmatched Deposits" sx={{ minHeight: 36 }} />
            </Tabs>
            <Box sx={{ flex: 1 }} />
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: { xs: 1, sm: 0 } }}
            >
              <Button component="label" variant="contained">
                Select CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setReportFile(f);
                    if (f) onImportReport(f);
                  }}
                />
              </Button>
              <Stack direction="row" spacing={1} alignItems="center">
                <UploadIcon active={!!reportFile} />
                <Typography variant="body2" color="text.secondary">
                  {reportFile ? reportFile.name : 'No file selected'}
                </Typography>
              </Stack>
            </Stack>
          </Stack>
          <Menu
            anchorEl={monthMenuAnchor}
            open={monthMenuOpen}
            onClose={() => setMonthMenuAnchor(null)}
          >
            {monthOptions.map((opt) => (
              <MenuItem
                key={opt.value}
                selected={opt.value === monthStr}
                onClick={() => { setMonthStr(opt.value); setMonthMenuAnchor(null); }}
              >
                {opt.label}
              </MenuItem>
            ))}
          </Menu>

          {reportResult && (
            <Box sx={{ mb: 2 }}>
              <Alert severity="success" sx={{ mb: 1 }}>
                Imported batches: <b>{pretty(reportResult.batches)}</b> · Items: <b>{pretty(reportResult.items)}</b> · Created: <b>{pretty(reportResult.created)}</b> · Updated: <b>{pretty(reportResult.updated)}</b>
              </Alert>
              <Typography variant="caption" color="text.secondary">
                Re-run is safe (idempotent by Reference Code). Use Transaction History next to enrich with Payout Method.
              </Typography>
            </Box>
          )}


          {tab === 0 && (
            <TableLite
              rows={summaryRows}
              columns={summaryColumns}
              loading={summaryLoading}
              maxHeight="65vh"
            />
          )}

          {tab === 1 && (
            <>
              <TableLite
                key={`bank-recon-${monthStr}-${checkedFilter}-${filteredPayoutRows.length}`}
                rows={filteredPayoutRows}
                columns={payoutColumns}
                loading={tableLoading}
                maxHeight="65vh"
              />
              <Divider sx={{ my: 3 }} />
            </>
          )}

          {tab === 2 && (
            <TableLite
              rows={unmatchedRows}
              columns={unmatchedColumns}
              loading={unmatchedLoading}
              maxHeight="65vh"
            />
          )}

          {/* Items drawer */}
          <AppDrawer
            open={openDrawer}
            onClose={() => setOpenDrawer(false)}
            title={
              <Box sx={{ lineHeight: 1.2 }}>
                <Typography variant="subtitle1">
                  Payment Sent: {fmtDate(selectedPayout?.sentDate)}
                </Typography>
                <Typography variant="subtitle1">
                  Expected: {fmtDate(selectedPayout?.arrivingBy)}
                </Typography>
              </Box>
            }
            width={900}
          >
            {itemsLoading ? (
              <LinearProgress />
            ) : (
              <Box
                sx={{
                  '& .MuiTableContainer-root': { maxHeight: '65vh', overflowY: 'auto' },
                  '& th.MuiTableCell-stickyHeader': { zIndex: 2, backgroundColor: 'background.paper' },
                  '& th.MuiTableCell-head': { py: 0.5, px: 1, height: 36 },
                  '& td.MuiTableCell-body': { py: 0.25, px: 1, verticalAlign: 'middle' },
                }}
              >
                <TableLite
                  rows={itemRows}
                  columns={itemColumns}
                  loading={itemsLoading}
                />
              </Box>
            )}
          </AppDrawer>

          {/* Booking editor drawer */}
          <AppDrawer
            open={openBookingDrawer}
            onClose={() => setOpenBookingDrawer(false)}
            title="Edit Reservation"
            width={720}
            showActions
            formId="booking-edit-form"
            headerLink={bookingInit?.reservationUrl || (selectedBookingId ? `https://dev.dashboard.owners2.com/api/bookings/${selectedBookingId}` : undefined)}
            extraActions={
              <button type="button" className="btn btn-extra" onClick={handleForceChecked}>Checked</button>
            }
          >
            {selectedBookingId ? (
              bookingLoading ? (
                <LinearProgress />
              ) : (
                <BookingEditFormRHF
                  key={`booking-edit-${selectedBookingId}-${bookingInit?.updatedAt || ''}`}
                  bookingId={selectedBookingId}
                  formId="booking-edit-form"
                  initialValues={bookingInit}
                  unitOptions={unitOptions}
                />
              )
            ) : (
              <Alert severity="warning">No booking selected.</Alert>
            )}
          </AppDrawer>
        </Box>
      </PageScaffold>
    </ErrorBoundary>
  );
}