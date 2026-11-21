import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import PageScaffold from '../components/layout/PageScaffold';
import AppDrawer from '../components/common/AppDrawer';
import HKCleaningsEditFormRHF from '../components/forms/HKCleaningsEditFormRHF';
import TableLiteTwoLineCell from '../components/layout/TableLiteTwoLineCell';
import api from '../api';
import HKReconMonthNotesDrawer from '../components/drawers/HKReconMonthNotesDrawer';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Popover,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import TextField from '@mui/material/TextField';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';
import IconButton from '@mui/material/IconButton';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  HK_STATUS_COLORS,
  HK_STATUS_LABELS,
  displayStatusAfterChoice,
  reportStatusFromChoice,
  resolveHkStatus,
} from '../utils/hkStatus';


function ymNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthLabel(ym) {
  const raw = (ym ?? '').toString().trim();
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return raw;
  const y = m[1];
  const mm = m[2];
  return `${mm}-${y}`;
}

function formatMoneyEU(n) {
  const num = Number(n ?? 0);
  if (!Number.isFinite(num)) return '0,00';
  return num.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const REPORT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reported', label: 'Reported' },
  { value: 'needs_review', label: 'Needs review' },
];

function normalizeReportStatus(v) {
  const raw = (v ?? '').toString().trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'pending') return 'pending';
  if (lower === 'reported') return 'reported';
  if (lower === 'needs_review' || lower === 'needs review') return 'needs_review';
  return ''; // unknown -> empty
}



const statusColor = (v) => HK_STATUS_COLORS[v] || HK_STATUS_COLORS.pending;

const FILTER_STATUS_VALUES = ['pending', 'done', 'reported', 'needs_review'];

// Helper to normalize booking fields
const normalizeBookingField = (b, keys, fallback = '') => {
  for (const k of keys) {
    const v = b?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') return v;
  }
  return fallback;
};

const RECON_CITIES = ['Tulum', 'Playa del Carmen'];
const PLAYA_LAUNDRY_RATE_PER_KG = 18;

const isPlayaCleaning = (row) =>
  String(row?.city ?? row?.unit_city ?? row?.unitCity ?? '')
    .toLowerCase()
    .includes('playa');

const moneyToNum = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Tulum: paid above the expected rate. Playa: total paid (cleaning + laundry) above what was charged.
const isOverExpected = (r) =>
  isPlayaCleaning(r)
    ? moneyToNum(r.cleaning_cost) + moneyToNum(r.laundry_cost) > moneyToNum(r.charged_cost)
    : moneyToNum(r.cleaning_cost) > moneyToNum(r.expected_cost);

const laundryWeightFromCost = (value) => {
  const raw = (value ?? '').toString().trim();
  if (raw === '') return '';
  const cost = Number(raw.replace(',', '.'));
  if (!Number.isFinite(cost)) return '';
  return String(Number((cost / PLAYA_LAUNDRY_RATE_PER_KG).toFixed(6)));
};

const laundryCostFromWeight = (value) => {
  const raw = (value ?? '').toString().trim();
  if (raw === '') return '';
  const weight = Number(raw.replace(',', '.'));
  if (!Number.isFinite(weight) || weight < 0) return null;
  return (weight * PLAYA_LAUNDRY_RATE_PER_KG).toFixed(2);
};

export default function HKCleaningsRecon() {
  const [month, setMonth] = useState(ymNow());
  const city = RECON_CITIES[0];

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [savingStatusRowId, setSavingStatusRowId] = useState(null);

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState(null);
  const [cityFilter, setCityFilter] = useState(''); // '' = All
  const [statusFilter, setStatusFilter] = useState(''); // '' = All

  const [unitFilter, setUnitFilter] = useState(null); // string unit_name or null
  const [overExpectedOnly, setOverExpectedOnly] = useState(false);

  const [monthNotesOpen, setMonthNotesOpen] = useState(false);
  const [monthNotesLoading, setMonthNotesLoading] = useState(false);
  const [monthNotesHasValue, setMonthNotesHasValue] = useState(false);
  const [monthNotesAllDone, setMonthNotesAllDone] = useState(false);
  const [monthNotesOpenCount, setMonthNotesOpenCount] = useState(0);
  const [monthNotesFocusCleaningId, setMonthNotesFocusCleaningId] = useState(null);
  const [monthNotesCity, setMonthNotesCity] = useState(city);

  const [rowNotesByCleaningId, setRowNotesByCleaningId] = useState({}); // { [hk_cleaning_id]: resolution }

  // Month bookings popover (per unit)
  const [bookingsByKey, setBookingsByKey] = useState({}); // { ["YYYY-MM::unitId"]: [] }
  const [bookingsLoadingByKey, setBookingsLoadingByKey] = useState({});
  const [bookingsErrorByKey, setBookingsErrorByKey] = useState({});
  const [bookingsAnchorEl, setBookingsAnchorEl] = useState(null);
  const [bookingsOpenKey, setBookingsOpenKey] = useState(null);
  const [bookingsOpenUnitName, setBookingsOpenUnitName] = useState('');

  const makeBookingsKey = (m, unitId) => `${m}::${unitId}`;

  const fetchUnitMonthBookings = useCallback(async (m, unitId) => {
    if (!m || !unitId) return;
    const key = makeBookingsKey(m, unitId);

    // Cache hit: do not refetch.
    if (Array.isArray(bookingsByKey[key])) return;
    if (bookingsLoadingByKey[key]) return;

    setBookingsLoadingByKey((p) => ({ ...p, [key]: true }));
    setBookingsErrorByKey((p) => ({ ...p, [key]: '' }));

    try {
      const q = new URLSearchParams({ mode: 'recon', month: m, unitId: String(unitId) }).toString();
      const res = await api.get(`/api/bookings?${q}`);
      const json = res?.data;
      const arr = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.rows)
          ? json.rows
          : Array.isArray(json)
            ? json
            : [];
      setBookingsByKey((p) => ({ ...p, [key]: arr }));
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      setBookingsErrorByKey((p) => ({ ...p, [key]: msg }));
      setBookingsByKey((p) => ({ ...p, [key]: [] }));
    } finally {
      setBookingsLoadingByKey((p) => ({ ...p, [key]: false }));
    }
  }, [bookingsByKey, bookingsLoadingByKey]);

  const closeBookingsPopover = () => {
    setBookingsAnchorEl(null);
    setBookingsOpenKey(null);
    setBookingsOpenUnitName('');
  };

  // Renders the content of the bookings popover
  const renderBookingsPopoverContent = () => {
    if (!bookingsOpenKey) return null;

    const isLoading = !!bookingsLoadingByKey[bookingsOpenKey];
    const errMsg = bookingsErrorByKey[bookingsOpenKey];
    const items = bookingsByKey[bookingsOpenKey] || [];

    const status = (b) => normalizeBookingField(b, ['status', 'booking_status', 'bookingStatus'], '').toString();
    const source = (b) => normalizeBookingField(b, ['source', 'channel'], '').toString();
    const url = (b) => normalizeBookingField(b, ['reservation_url', 'reservationUrl', 'url', 'link'], '').toString();

    const formatShortDate = (d) => {
      const s = (d ?? '').toString().trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return s;
      return `${m[3]}/${m[2]}`;
    };

    const fmtRange = (b) => {
      const ci = normalizeBookingField(b, ['check_in', 'checkIn', 'check_in_date', 'start_date', 'startDate'], '');
      const co = normalizeBookingField(b, ['check_out', 'checkOut', 'check_out_date', 'end_date', 'endDate'], '');
      const ciF = ci ? formatShortDate(ci) : '';
      const coF = co ? formatShortDate(co) : '';
      if (ciF && coF) return `${ciF} - ${coF}`;
      return ciF || coF || '—';
    };

    const formatStatusLabel = (s) => {
      const raw = (s ?? '').toString().trim();
      if (!raw) return '';
      const t = raw.replace(/_/g, ' ');
      return t.charAt(0).toUpperCase() + t.slice(1);
    };

    const isCancelled = (b) => {
      const s = status(b).toLowerCase();
      return s.includes('cancel');
    };

    const guestLine = (b) => {
      const guest = normalizeBookingField(b, ['guest_name', 'guestName', 'guest'], '').toString();
      const st = formatStatusLabel(status(b));
      return `${guest || 'Reservation'}${st ? ` * (${st})` : ''}`;
    };

    const sortedItems = [...items].sort((a, b) => {
      const ac = isCancelled(a) ? 1 : 0;
      const bc = isCancelled(b) ? 1 : 0;
      return ac - bc;
    });

    return (
      <Box sx={{ width: 420, p: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>
            {bookingsOpenUnitName || 'Unit'} • {formatMonthLabel(month)}
          </Typography>
          <IconButton
            size="small"
            aria-label="Close"
            onClick={closeBookingsPopover}
            sx={{
              p: 0.25,
              color: '#6b7280',
              '&:hover': { color: '#111827', backgroundColor: 'rgba(17, 24, 39, 0.06)' },
              flex: '0 0 auto',
            }}
          >
            <CloseIcon fontSize="small" sx={{ display: 'block' }} />
          </IconButton>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Month bookings
        </Typography>

        <Divider sx={{ my: 1 }} />

        {isLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">Loading…</Typography>
          </Box>
        ) : errMsg ? (
          <Typography variant="body2" sx={{ color: 'error.main', py: 1 }}>
            {errMsg}
          </Typography>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No bookings in this month.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sortedItems.slice(0, 10).map((b, idx) => (
              <Box
                key={normalizeBookingField(b, ['id', 'booking_id', 'confirmation_code'], idx)}
                sx={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 1,
                  p: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {guestLine(b)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {fmtRange(b)}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: '0 0 auto' }}>
                    {source(b) ? (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {source(b)}
                      </Typography>
                    ) : null}

                    {url(b) ? (
                      <Tooltip title="Open in new tab">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => window.open(url(b), '_blank', 'noopener,noreferrer')}
                            sx={{ p: 0.25, color: '#1e6f68' }}
                            aria-label="Open reservation"
                          >
                            <OpenInNewIcon fontSize="small" sx={{ display: 'block' }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : null}
                  </Box>
                </Box>
              </Box>
            ))}

            {items.length > 10 ? (
              <Typography variant="caption" color="text.secondary">
                Showing 10 of {items.length}
              </Typography>
            ) : null}
          </Box>
        )}
      </Box>
    );
  };


  const unitOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      const name = (r.unit_name ?? '').toString().trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    const s = String(v).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const rowsToRender = useMemo(() => {
    let out = rows;

    if (cityFilter) {
      out = out.filter((r) => (r.city ?? '').toString() === cityFilter);
    }

    if (statusFilter) {
      out = out.filter((r) => {
        return resolveHkStatus(r) === statusFilter;
      });
    }

    if (unitFilter) {
      const needle = unitFilter.toString().trim().toLowerCase();
      out = out.filter((r) => (r.unit_name ?? '').toString().toLowerCase() === needle);
    }

    if (overExpectedOnly) {
      out = out.filter(isOverExpected);
    }

    return out;
  }, [rows, cityFilter, statusFilter, unitFilter, overExpectedOnly]);

  const canSave = useMemo(() => rows.length > 0, [rows.length]);

  const headerStats = useMemo(() => {
    const toNum = (v) => {
      const n = Number(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };

    // Only cleanings marked as reported count towards Charged, Cost and Net.
    const summarize = (list) => {
      let charged = 0;
      let cost = 0;
      let savedRows = 0;
      for (const r of list) {
        if (resolveHkStatus(r) !== 'reported') continue;
        savedRows += 1;
        charged += toNum(r.charged_cost);
        cost += toNum(r.cleaning_cost) + toNum(r.laundry_cost);
      }
      return { totalRows: list.length, savedRows, charged, cost, net: charged - cost };
    };

    const inCity = (name) => rows.filter((r) => (r.city ?? '').toString() === name);
    const scoped = cityFilter ? inCity(cityFilter) : rows;
    const byCity = cityFilter
      ? null
      : ['Playa del Carmen', 'Tulum'].map((name) => ({ city: name, ...summarize(inCity(name)) }));

    return {
      ...summarize(scoped),
      byCity,
      fmt: (n) => formatMoneyEU(n),
    };
  }, [rows, cityFilter]);

 const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({ month, cities: RECON_CITIES.join(',') }).toString();
      const res = await api.get(`/api/hk-reconcile?${q}`);
      const json = res?.data;
      const arr = Array.isArray(json?.data) ? json.data : [];
      setRows(
        arr.map((r) => {
          const n = (r?.notes ?? '').toString();
          const cc = (r?.cleaning_cost ?? '').toString();
          const lc = (r?.laundry_cost ?? '').toString();
          const rs = normalizeReportStatus(r?.report_status ?? r?.reportStatus) || 'pending';
          const laundryWeight = isPlayaCleaning(r) ? laundryWeightFromCost(lc) : '';

          return {
            ...r,
            __laundryWeight: laundryWeight,
            __notesSaved: n,
            __notesDirty: false,
            __cleaningCostSaved: cc,
            __laundryCostSaved: lc,
            __reportStatusSaved: rs,
            __rowDirty: false,
          };
        })
      );
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [month]);

  const refreshMonthNotesSummary = useCallback(async () => {
    setMonthNotesLoading(true);
    try {
      const responses = await Promise.all(
        RECON_CITIES.map((noteCity) => {
          const q = new URLSearchParams({ month, city: noteCity }).toString();
          return api.get(`/api/hk-reconcile/notes?${q}`);
        }),
      );
      const items = responses.flatMap((res) => {
        const data = res?.data?.data;
        return Array.isArray(data) ? data : [];
      });
      // Build a quick lookup of resolution text per hk_cleaning_id
      // If multiple notes exist for the same cleaning, prefer the most recent (last in list)
      const byId = {};
      for (const it of items) {
        const hkId = it?.hk_cleaning_id ?? it?.hkCleaningId;
        if (!hkId) continue;
        const resolution = (it?.resolution ?? '').toString();
        if (resolution.trim() !== '') {
          byId[String(hkId)] = resolution;
        }
      }
      setRowNotesByCleaningId(byId);

      const hasAny = items.length > 0;
      const openCount = items.filter((it) => String(it?.status ?? '').toLowerCase() === 'open').length;
      const allDone = hasAny && openCount === 0;

      setMonthNotesHasValue(hasAny);
      setMonthNotesAllDone(allDone);
      setMonthNotesOpenCount(openCount);
    } catch (e) {
      // Non-blocking: don't break page load if notes fail.
      setErr((prev) => prev || (e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e)));
      setMonthNotesHasValue(false);
      setMonthNotesAllDone(false);
      setMonthNotesOpenCount(0);
      setRowNotesByCleaningId({});
    } finally {
      setMonthNotesLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
    refreshMonthNotesSummary();
  }, [load, refreshMonthNotesSummary]);


  const updateRow = (id, patch) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        next.__rowDirty = computeRowDirty(next);
        return next;
      }),
    );
  };

  const recomputeTotal = (row) => {
    const c = parseFloat(String(row.cleaning_cost ?? '0').replace(',', '.')) || 0;
    const l = parseFloat(String(row.laundry_cost ?? '0').replace(',', '.')) || 0;
    return (c + l).toFixed(2);
  };

  const computeRowDirty = (row) => {
    const cc = (row.cleaning_cost ?? '').toString();
    const lc = (row.laundry_cost ?? '').toString();
    const rs = normalizeReportStatus(row.report_status ?? row.reportStatus) || 'pending';
    const notes = (row.notes ?? '').toString();

    const ccSaved = (row.__cleaningCostSaved ?? '').toString();
    const lcSaved = (row.__laundryCostSaved ?? '').toString();
    const rsSaved = (row.__reportStatusSaved ?? 'pending').toString();
    const notesSaved = (row.__notesSaved ?? '').toString();

    const sameMoney = (a, b) => (parseFloat(String(a).replace(',', '.')) || 0) === (parseFloat(String(b).replace(',', '.')) || 0);

    return !sameMoney(cc, ccSaved) || !sameMoney(lc, lcSaved) || rs !== rsSaved || notes !== notesSaved;
  };


  const normalizeNoteStatus = (v) => {
    const raw = (v ?? '').toString().toLowerCase().trim();
    if (raw === 'open') return 'open';
    if (raw === 'done') return 'done';
    return '';
  };

  const deriveReportStatusForSave = (row) => {
    const noteStatus = normalizeNoteStatus(row.resolution_status ?? row.resolutionStatus);
    // Highest precedence: open notes => needs_review
    if (noteStatus === 'open') return 'needs_review';

    // Reporting is explicit: entering costs alone must not mark the row as reported.
    return normalizeReportStatus(row.report_status ?? row.reportStatus) || 'pending';
  };

  // Helper to create a row-level note after reconcile save
  const createRowNote = async (row) => {
    const hkCleaningId = row.hk_cleaning_id ?? row.hkCleaningId;
    if (!hkCleaningId) return; // cannot create row note without a cleaning id

    const unitName = (row.unit_name ?? '').toString().trim() || 'Unit';
    const rawDate = (row.service_date || '').toString().trim();
    const ddmmyyyy = rawDate && rawDate.includes('-') ? rawDate.split('-').reverse().join('-') : rawDate;

    const ctRaw = (row.cleaning_type ?? row.cleaningType ?? '').toString().trim();
    const ctLabel = ctRaw ? (ctRaw.charAt(0).toUpperCase() + ctRaw.slice(1)) : '';

    const title = `${unitName} • ${ddmmyyyy}${ctLabel ? ` * (${ctLabel})` : ''}`.trim();
    const content = (row.notes ?? '').toString();
    if (!content.trim()) return;

    const unitId = row.unit_id ?? row.unitId ?? null;

    const rowCity = row.city || city;

    await api.post('/api/hk-reconcile/notes', {
      city: rowCity,
      month,
      hk_cleaning_id: Number(hkCleaningId),
      unit_id: unitId != null ? Number(unitId) : null,
      text: title,
      resolution: content,
      status: 'open',
    });
  };

  const saveRow = async (row, { autosave = false } = {}) => {
    const toMoneyStr = (v) => {
      if (v === '' || v === null || v === undefined) return '0';
      const s = String(v).trim();
      if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '0';
      return s;
    };
    const rowCity = row.city || city;
    const laundryCost = isPlayaCleaning(row)
      ? laundryCostFromWeight(row.__laundryWeight ?? laundryWeightFromCost(row.laundry_cost))
      : row.laundry_cost;
    if (laundryCost === null) {
      throw new Error('Laundry weight must be a valid non-negative number.');
    }

    const payload = {
      month,
      city: rowCity,
      unit_id: Number(row.unit_id),
      service_date: row.service_date,
      cleaning_cost: toMoneyStr(row.cleaning_cost),
      laundry_cost: toMoneyStr(laundryCost),
      report_status: deriveReportStatusForSave(row) || null,
      notes: row.notes ?? null,
    };

    if (!payload.unit_id || Number.isNaN(payload.unit_id)) {
      throw new Error('Unit ID is required');
    }
    if (!payload.service_date) {
      throw new Error('Service date is required');
    }

    const q = new URLSearchParams({ month, city: rowCity }).toString();
    if (row.__isNew) {
      await api.post(`/api/hk-reconcile?${q}`, payload);
      await load();
      return;
    }

    await api.put(`/api/hk-reconcile/${row.id}?${q}`, payload);

    if (autosave) {
      // Patch in place (no reload) so fields the user is still typing in are not overwritten.
      const savedStatus = deriveReportStatusForSave(row) || 'pending';
      updateRow(row.id, {
        report_status: savedStatus,
        display_status: row.display_status,
        __cleaningCostSaved: (row.cleaning_cost ?? '').toString(),
        __laundryCostSaved: (laundryCost ?? '').toString(),
        __reportStatusSaved: savedStatus,
      });
      return;
    }

   // If NOTES changed, create a row-level note item (history)
   const notesChanged = (row.notes ?? '').toString() !== (row.__notesSaved ?? '').toString();
   const hasText = ((row.notes ?? '').toString().trim() !== '');
   if (notesChanged && hasText) {
      try {
        await createRowNote(row);
        // Optimistically mark as saved (load() will refresh anyway)
        updateRow(row.id, {
          __notesSaved: (row.notes ?? '').toString(),
        });
      } catch (e) {
        // Non-blocking: keep reconcile save successful, but show error
        setErr((prev) => prev || (e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e)));
      }
    }

    // Snapshot saved values so row becomes clean immediately
    const derivedStatus = deriveReportStatusForSave(row) || 'pending';

    updateRow(row.id, {
      // reflect derived status in UI immediately
      report_status: derivedStatus,
      laundry_cost: laundryCost,
      __cleaningCostSaved: (row.cleaning_cost ?? '').toString(),
      __laundryCostSaved: (laundryCost ?? '').toString(),
      __reportStatusSaved: derivedStatus,
      __rowDirty: false,
    });

    await load();
  };

  // Entering costs on a Pending Playa cleaning reports it automatically.
  const withAutoReport = (row) => {
    if (resolveHkStatus(row) !== 'pending') return row;
    const laundryCost = isPlayaCleaning(row)
      ? laundryCostFromWeight(row.__laundryWeight ?? laundryWeightFromCost(row.laundry_cost))
      : row.laundry_cost;
    const hasData = toNum(row.cleaning_cost) > 0 || toNum(laundryCost) > 0;
    if (!hasData) return row;
    return {
      ...row,
      report_status: 'reported',
      display_status: row.display_status ? 'reported' : row.display_status,
    };
  };

  // Saves a row when a Paid/Laundry field loses focus; skips rows with no changes.
  const autoSaveRow = async (row) => {
    if (row.__isNew || !computeRowDirty(row)) return;
    try {
      await saveRow(withAutoReport(row), { autosave: true });
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e));
    }
  };

  const changeReportStatus = async (row, reportStatus) => {
    const nextReportStatus = reportStatusFromChoice(reportStatus);
    const nextRow = { ...row, report_status: nextReportStatus };
    const nextDisplay = row.display_status ? displayStatusAfterChoice(row, reportStatus) : row.display_status;
    updateRow(row.id, { report_status: nextReportStatus, display_status: nextDisplay });
    setSavingStatusRowId(row.id);
    setErr(null);

    try {
      await saveRow(nextRow);
    } catch (e) {
      const message = e?.response?.data?.message
        || e?.response?.data?.error
        || e?.message
        || String(e);
      await load();
      setErr(message);
    } finally {
      setSavingStatusRowId(null);
    }
  };

  const deleteRow = async (row) => {
    if (row.__isNew) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    const rowCity = row.city || city;
    const q = new URLSearchParams({ month, city: rowCity }).toString();
    await api.delete(`/api/hk-reconcile/${row.id}?${q}`);
    await load();
  };

  const openCleaning = async (hkCleaningId) => {
    if (!hkCleaningId) return;
    setErr(null);
    try {
      // Try to fetch the full HK cleaning record (same object shape as HKCleaningsView expects)
      const res = await api.get(`/api/hk-cleanings/${hkCleaningId}`);
      const json = res?.data;
      const rec = json?.data ?? json;
      setEditingCleaning(rec);
    } catch (e) {
      // Fallback: open with minimal data so user can at least see something
      setEditingCleaning({ id: hkCleaningId });
    }
    setEditDrawerOpen(true);
  };

  // Sum of fixed column widths below (120*9 + 240 = 1320)
  const BASE_TABLE_MIN_WIDTH = 1320;
  const NOTES_DRAWER_WIDTH = 500;

  return (
    <PageScaffold
      title="HK Reconciliation"
      subtitle="Manual housekeeper report (cleaning + laundry) for monthly reconciliation"
      layout="table"
      stickyHeader={
        <Box sx={{ width: '100%' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <YearMonthPicker
              value={month}
              onChange={setMonth}
              label="Month"
              size="small"
              sx={{ width: 180 }}
            />

            <FormControl size="small" sx={{ width: 180 }}>
              <InputLabel id="hk-recon-city">City</InputLabel>
              <Select
                labelId="hk-recon-city"
                value={cityFilter}
                label="City"
                onChange={(e) => setCityFilter(e.target.value)}
              >
                <MenuItem value="">
                  <Typography variant="body2" color="text.secondary">All</Typography>
                </MenuItem>
                {RECON_CITIES.map((cityOption) => (
                  <MenuItem key={cityOption} value={cityOption}>
                    <Typography variant="body2">{cityOption}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ width: 160 }}>
              <InputLabel id="hk-recon-status">Status</InputLabel>
              <Select
                labelId="hk-recon-status"
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">
                  <Typography variant="body2" color="text.secondary">All</Typography>
                </MenuItem>
                {FILTER_STATUS_VALUES.map((value) => (
                  <MenuItem key={value} value={value}>
                    <Typography variant="body2" sx={{ color: statusColor(value) }}>{HK_STATUS_LABELS[value]}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              variant={overExpectedOnly ? 'contained' : 'outlined'}
              onClick={() => setOverExpectedOnly((v) => !v)}
              sx={{ textTransform: 'none' }}
            >
              Over expected
            </Button>

            {/* Summary metrics block */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                  Rows: <b>{headerStats.totalRows}</b>&nbsp;&nbsp; Charged: <b>{headerStats.fmt(headerStats.charged)}</b>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                  Saved: <b>{headerStats.savedRows}</b>&nbsp;&nbsp; Cost: <b>{headerStats.fmt(headerStats.cost)}</b>
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 0 }}>
                {(headerStats.byCity
                  ? [...headerStats.byCity.map((c) => ({ ...c, city: c.city.startsWith('Playa') ? 'Playa' : c.city })),
                      { city: 'Net Total', net: headerStats.net, total: true }]
                  : [{ city: 'Net', net: headerStats.net, plain: true }]
                ).map((item) => (
                  <Typography
                    key={item.city}
                    variant="body2"
                    sx={{
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                      fontWeight: item.total ? 700 : 400,
                      color: item.net > 0 ? '#1e6f68' : item.net < 0 ? '#dc2626' : 'text.secondary',
                    }}
                  >
                    {item.plain ? 'Net' : item.city}:{' '}
                    <b>{item.net >= 0 ? '+' : ''}{headerStats.fmt(item.net)}</b>
                  </Typography>
                ))}
              </Box>
            </Box>

            <Box sx={{ flex: 1 }} />

            <Button
              variant={monthNotesHasValue ? 'contained' : 'outlined'}
              size="small"
              onClick={async () => {
                setMonthNotesCity(city);
                await refreshMonthNotesSummary();
                setMonthNotesOpen(true);
              }}
              disabled={monthNotesLoading}
              sx={{ textTransform: 'none' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>Month notes</span>
                {monthNotesHasValue ? (
                  monthNotesAllDone ? (
                    <Box
                      sx={{
                        px: 0.75,
                        borderRadius: 1,
                        fontSize: 11,
                        fontWeight: 700,
                        bgcolor: '#1e6f68',
                        color: '#fff',
                        lineHeight: 1.6,
                      }}
                    >
                      ✓
                    </Box>
                  ) : monthNotesOpenCount > 0 ? (
                    <Box
                      sx={{
                        minWidth: 18,
                        px: 0.75,
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        bgcolor: '#f97316',
                        color: '#fff',
                        textAlign: 'center',
                        lineHeight: 1.6,
                      }}
                    >
                      {monthNotesOpenCount > 9 ? '9+' : monthNotesOpenCount}
                    </Box>
                  ) : null
                ) : null}
              </Box>
            </Button>

          </Box>

          {err ? (
            <Typography sx={{ mt: 1, color: 'error.main' }}>
              {err}
            </Typography>
          ) : null}
        </Box>
      }
    >

      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          height: 'calc(100vh - 260px)',
          width: '100%',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            // Let the TableContainer own scrolling; don't clip horizontal scrollbar.
            overflow: 'visible',
            display: 'flex',
            flex: 1,
            minWidth: 0,
            flexDirection: 'column',
            transition: 'width 150ms ease',
          }}
        >
          <Divider />
          <TableContainer
            sx={{
              width: '100%',
              minWidth: 0,
              flex: 1,
              maxHeight: '100%',
              // Ensure horizontal + vertical scrollbars appear when needed
              overflowX: 'auto',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
              <Table
                size="small"
                stickyHeader
                sx={{
                  // Fill available width (removes the right-side gap)
                  width: '100%',
                  // But never shrink below the base width (enables horizontal scroll when drawer reduces space)
                  minWidth: `${BASE_TABLE_MIN_WIDTH}px`,
                  tableLayout: 'fixed',
                }}
              >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700 }}>Cleaning</TableCell>
                <TableCell sx={{ width: 140, minWidth: 140, maxWidth: 140, fontWeight: 700 }}>
                  <Autocomplete
                    size="small"
                    options={unitOptions}
                    value={unitFilter}
                    onChange={(_e, v) => setUnitFilter(v)}
                    clearOnEscape
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        variant="standard"
                        placeholder="Unit"
                        InputProps={{
                          ...params.InputProps,
                          style: { fontWeight: 700 },
                        }}
                      />
                    )}
                  />
                </TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Type</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Paid</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Laundry</TableCell>
                {/* <TableCell sx={{ width: 100, minWidth: 100, maxWidth: 100, fontWeight: 700, textAlign: 'center' }}>Total</TableCell> */}
                <TableCell sx={{ width: 140, minWidth: 140, maxWidth: 140, fontWeight: 700, textAlign: 'center' }}>Result</TableCell>
                <TableCell sx={{ width: 240, minWidth: 240, maxWidth: 240, fontWeight: 700 }}>Notes</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                  <Select
                    variant="standard"
                    size="small"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    displayEmpty
                    renderValue={(v) => {
                      if (!v) return 'Status';
                      return HK_STATUS_LABELS[v] || 'Status';
                    }}
                    sx={{
                      minWidth: 90,
                      fontWeight: 700,
                      '& .MuiSelect-select': {
                        textAlign: 'center',
                        paddingRight: '20px',
                      },
                    }}
                  >
                    <MenuItem value="">
                      <Typography variant="body2" color="text.secondary">All</Typography>
                    </MenuItem>
                    {FILTER_STATUS_VALUES.map((value) => (
                      <MenuItem key={value} value={value}>
                        <Typography variant="body2" sx={{ color: statusColor(value) }}>{HK_STATUS_LABELS[value]}</Typography>
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rowsToRender.map((r) => {
                const total = recomputeTotal(r);
                const dirtyTotal = r.total_cost !== total;
                const cleaningCode = r.hk_cleaning_id ? `HK-${r.hk_cleaning_id}` : '—';
                const noteStatusRaw = (r.resolution_status ?? r.resolutionStatus ?? '').toString().toLowerCase().trim();
                const noteBorderColor = noteStatusRaw === 'done'
                  ? '#1e6f68' // teal
                  : noteStatusRaw === 'open'
                    ? '#f59e0b' // amber
                    : null;

                const noteBorderSx = noteBorderColor
                  ? {
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: noteBorderColor },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: noteBorderColor },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: noteBorderColor },
                    }
                  : {};
                // Format date as dd-mm-yyyy
                const formattedDate = r.service_date
                  ? r.service_date.split('-').reverse().join('-')
                  : '—';
                const playaLaundryByWeight = isPlayaCleaning(r);
                const rowStatus = resolveHkStatus(r);
                const rowAutoStatus = r.display_status && String(r.status).toLowerCase() === 'done' ? 'done' : 'pending';

                // Compute charged, total, diff, and color
                const chargedVal = Number(r.charged_cost ?? (dirtyTotal ? total : (r.total_cost ?? total)) ?? 0);
                const totalVal = Number(total ?? 0);
                const diffVal = chargedVal - totalVal;
                const diffColor =
                  diffVal > 0 ? '#1e6f68' : diffVal < 0 ? '#dc2626' : '#6b7280';

                const overExpected = isOverExpected(r);
                const overExpectedSx = overExpected
                  ? {
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#dc2626' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#dc2626' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#dc2626' },
                    }
                  : {};

                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120 }}>
                      <TableLiteTwoLineCell
                        className="o2-two-line-click"
                        main={formattedDate}
                        sub={
                          r.hk_cleaning_id ? (
                            <span
                              className="o2-cell-meta"
                              onClick={() => openCleaning(r.hk_cleaning_id)}
                            >
                              {cleaningCode}
                            </span>
                          ) : (
                            cleaningCode
                          )
                        }
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 140, minWidth: 140, maxWidth: 140, overflow: 'visible' }}>
                      <Box
                        sx={{
                          width: 140,
                          minWidth: 0,
                          minHeight: 40,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 0.5,
                          overflow: 'visible',
                        }}
                      >
                        <Typography
                          variant="body2"
                          color="text.primary"
                          sx={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: '1 1 auto',
                            minWidth: 0,
                          }}
                        >
                          {r.unit_name ?? ''}
                        </Typography>

                        {(r.unit_id ?? r.unitId) ? (
                          <Tooltip title="Month bookings">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Show month bookings"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const unitId = r.unit_id ?? r.unitId;
                                  if (!unitId) return;
                                  const key = makeBookingsKey(month, unitId);
                                  setBookingsAnchorEl(e.currentTarget);
                                  setBookingsOpenKey(key);
                                  setBookingsOpenUnitName((r.unit_name ?? '').toString());
                                  await fetchUnitMonthBookings(month, unitId);
                                }}
                                sx={{
                                  p: 0.1,
                                  flex: '0 0 auto',
                                  color: '#6b7280',
                                  '&:hover': {
                                    color: '#111827',
                                    backgroundColor: 'rgba(17, 24, 39, 0.06)',
                                  },
                                }}
                              >
                                <ExpandMoreIcon fontSize="small" sx={{ display: 'block' }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : null}
                      </Box>
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <Box
                        sx={{
                          width: 120,
                          minHeight: 40,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {r.cleaning_type
                            ? r.cleaning_type.charAt(0).toUpperCase() + r.cleaning_type.slice(1)
                            : '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {(() => {
                            const raw = (r.bill_to ?? '').toString().trim().toUpperCase();
                            if (raw === 'OWNERS2') return 'O2';
                            if (raw === 'CLIENT') return 'Client';
                            if (raw === 'GUEST') return 'Guest';
                            return raw || '—';
                          })()}
                          {r.expected_cost != null ? (
                            <>
                              {' '}•{' '}
                              {formatMoneyEU(r.expected_cost)}
                            </>
                          ) : null}
                        </Typography>
                      </Box>
                    </TableCell>


                    {/* Cleaning cost */}
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <TextField
                        value={r.cleaning_cost ?? ''}
                        onChange={(e) => updateRow(r.id, { cleaning_cost: e.target.value })}
                        onBlur={() => autoSaveRow(r)}
                        size="small"
                        variant="outlined"
                        sx={{ width: 96, mx: 'auto', ...overExpectedSx }}
                        inputProps={{ inputMode: 'decimal', style: { textAlign: 'center' } }}
                      />
                    </TableCell>

                    {/* Laundry */}
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <TextField
                        value={playaLaundryByWeight
                          ? (r.__laundryWeight ?? laundryWeightFromCost(r.laundry_cost))
                          : (r.laundry_cost ?? '')}
                        onChange={(e) => {
                          if (playaLaundryByWeight) {
                            updateRow(r.id, { __laundryWeight: e.target.value });
                          } else {
                            updateRow(r.id, { laundry_cost: e.target.value });
                          }
                        }}
                        onBlur={() => {
                          if (!playaLaundryByWeight) {
                            autoSaveRow(r);
                            return;
                          }
                          const laundryCost = laundryCostFromWeight(r.__laundryWeight);
                          if (laundryCost === null) {
                            setErr('Laundry weight must be a valid non-negative number.');
                            return;
                          }
                          updateRow(r.id, { laundry_cost: laundryCost });
                          autoSaveRow({ ...r, laundry_cost: laundryCost });
                        }}
                        size="small"
                        variant="outlined"
                        sx={{ width: playaLaundryByWeight ? 110 : 96, mx: 'auto' }}
                        InputProps={playaLaundryByWeight ? {
                          endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                        } : undefined}
                        inputProps={{ inputMode: 'decimal', style: { textAlign: 'center' } }}
                      />
                    </TableCell>

                    {/* Result (Paid + Charged + Diff) */}
                    <TableCell sx={{ py: 0.5, width: 140, minWidth: 140, maxWidth: 140, textAlign: 'center' }}>
                      <Box
                        sx={{
                          width: '100%',
                          minHeight: 40,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          gap: 0.25,
                        }}
                      >
                        {/* Paid (Total) */}
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography component="span" variant="caption" sx={{ mr: 0.5, color: '#6b7280' }}>
                            P
                          </Typography>
                          <Typography component="span" variant="body2" color="text.primary">
                            {formatMoneyEU(dirtyTotal ? total : (r.total_cost ?? total))}
                          </Typography>
                        </Box>

                        {/* Charged + Diff */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography component="span" variant="caption" sx={{ mr: 0.5, color: '#6b7280' }}>
                              C
                            </Typography>
                            <Typography component="span" variant="body2" color="text.secondary">
                              {formatMoneyEU(chargedVal)}
                            </Typography>
                          </Box>

                          <Typography
                            component="span"
                            variant="caption"
                            sx={{
                              color:
                                diffVal > 0
                                  ? '#1e6f68'
                                  : diffVal < 0
                                    ? '#dc2626'
                                    : '#6b7280',
                            }}
                          >
                            {diffVal >= 0 ? '+' : ''}{formatMoneyEU(diffVal)}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 240, minWidth: 240, maxWidth: 240 }}>
                      {(() => {
                        const hkId = r.hk_cleaning_id ?? r.hkCleaningId;
                        const resolutionText = hkId ? (rowNotesByCleaningId[String(hkId)] ?? '') : '';

                        if (resolutionText.toString().trim() !== '') {
                          return (
                            <TextField
                              value={resolutionText}
                              size="small"
                              variant="outlined"
                              sx={{ width: '100%', cursor: 'pointer', ...noteBorderSx }}
                              placeholder="Optional"
                              InputProps={{ readOnly: true }}
                              onClick={async () => {
                                setMonthNotesFocusCleaningId(hkId ? Number(hkId) : null);
                                setMonthNotesCity(r.city || city);
                                await refreshMonthNotesSummary();
                                setMonthNotesOpen(true);
                              }}
                            />
                          );
                        }

                        return (
                          <TextField
                            value={r.notes ?? ''}
                            onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                            size="small"
                            variant="outlined"
                            sx={{ width: '100%', ...noteBorderSx }}
                            placeholder="Optional"
                          />
                        );
                      })()}
                    </TableCell>
                    
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <Box sx={{ width: 120, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Select
                          size="small"
                          value={rowStatus}
                          onChange={(e) => changeReportStatus(r, e.target.value)}
                          disabled={loading || savingStatusRowId === r.id}
                          sx={{
                            width: 110,
                            color: statusColor(rowStatus),
                            '& .MuiSelect-icon': { color: statusColor(rowStatus) },
                          }}
                        >
                          {[rowAutoStatus, 'reported', 'needs_review'].map((value) => (
                            <MenuItem key={value} value={value}>
                              <Typography variant="body2" sx={{ color: statusColor(value) }}>
                                {HK_STATUS_LABELS[value]}
                              </Typography>
                            </MenuItem>
                          ))}
                        </Select>
                      </Box>
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <IconButton
                        title={r.__rowDirty ? 'Save pending changes (notes, or retry)' : 'Saved'}
                        size="small"
                        type="button"
                        onClick={async () => {
                          try {
                            await saveRow(withAutoReport(r));
                          } catch (e) {
                            setErr(e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e));
                          }
                        }}
                        disabled={loading}
                      >
                        <SaveIcon fontSize="small" sx={{ color: r.__rowDirty ? '#1e6f68' : 'inherit' }} />
                      </IconButton>

                    </TableCell>
                  </TableRow>
                );
              })}

              {rowsToRender.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 4 }}>
                    <Typography sx={{ color: 'text.secondary', textAlign: 'center' }}>
                      No lines for this month yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
              </Table>
          </TableContainer>
        </Paper>
        {monthNotesOpen ? (
          <Box
            sx={{
              width: `${NOTES_DRAWER_WIDTH}px`,
              flex: `0 0 ${NOTES_DRAWER_WIDTH}px`,
              minWidth: `${NOTES_DRAWER_WIDTH}px`,
              borderLeft: '1px solid #e5e7eb',
              background: '#fff',
            }}
          >
            <HKReconMonthNotesDrawer
              open={monthNotesOpen}
              onClose={async () => {
                setMonthNotesOpen(false);
                setMonthNotesFocusCleaningId(null);
                setMonthNotesCity(city);
                await refreshMonthNotesSummary();
              }}
              title="Month notes"
              city={monthNotesCity}
              month={month}
              focusHkCleaningId={monthNotesFocusCleaningId}
              onChanged={async () => {
                await refreshMonthNotesSummary();
              }}
            />
          </Box>
        ) : null}
      </Box>

      {canSave ? null : (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          Tip: select a month and city to review reconciliation lines.
        </Typography>
      )}

      <Popover
        open={Boolean(bookingsAnchorEl) && Boolean(bookingsOpenKey)}
        anchorEl={bookingsAnchorEl}
        onClose={closeBookingsPopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        {renderBookingsPopoverContent()}
      </Popover>

      <AppDrawer
        open={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setEditingCleaning(null);
        }}
        title="Edit Cleaning"
        width={520}
      >
        {editingCleaning ? (
          <HKCleaningsEditFormRHF
            cleaning={editingCleaning}
            onSuccess={async () => {
              setEditDrawerOpen(false);
              setEditingCleaning(null);
              await load();
            }}
            onCancel={() => {
              setEditDrawerOpen(false);
              setEditingCleaning(null);
            }}
          />
        ) : null}
      </AppDrawer>
    </PageScaffold>
  );
}