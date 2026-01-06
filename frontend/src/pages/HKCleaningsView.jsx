import React, { useEffect, useMemo, useState } from 'react';
import { Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, IconButton, CircularProgress, Link as MuiLink, Box, Autocomplete, Tabs, Tab, Typography, Divider } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import TableLite from '../components/layout/TableLite';
import api from '../api';
import AppDrawer from '../components/common/AppDrawer';
import NewHKCleaningsForm from '../components/forms/HKCleaningsTablePage/NewHKCleaningsForm';
import HKCleaningsRateForm from '../components/forms/HKCleaningsTablePage/HKCleaningsRateForm';
import EditHKCleaningsForm from '../components/forms/HKCleaningsTablePage/EditHKCleaningsForm';
import PageScaffold from '../components/layout/PageScaffold';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (isNaN(number)) return value;
  return number.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


const fmtDateDMY = (v) => {
  if (!v) return '';
  const s = String(v);
  // Accept YYYY-MM-DD or ISO-ish; take first 10 chars as date part
  const datePart = s.slice(0, 10);
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return datePart;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const fmtTsDMY = (v) => {
  if (!v) return '';
  const s = String(v);
  const datePart = fmtDateDMY(s);
  // Try to keep HH:MM if present
  const timePart = s.length >= 16 ? s.slice(11, 16) : '';
  return timePart ? `${datePart} ${timePart}` : datePart;
};

const pick = (obj, keys) => keys.find(k => obj && obj[k] !== undefined) ?? null;

// Helper: parse Y-M-D to UTC Date, and compute month index
const parseYmd = (ymd) => {
  if (!ymd) return null;
  const [y,m,d] = String(ymd).split('-').map(n => parseInt(n,10));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m-1, d));
};

const monthIndex = (dt) => dt.getUTCFullYear()*12 + dt.getUTCMonth();

// Month options 1..12
const MONTH_OPTIONS = [
  { value: 1,  label: '1. Jan' },
  { value: 2,  label: '2. Feb' },
  { value: 3,  label: '3. Mar' },
  { value: 4,  label: '4. Apr' },
  { value: 5,  label: '5. May' },
  { value: 6,  label: '6. Jun' },
  { value: 7,  label: '7. Jul' },
  { value: 8,  label: '8. Aug' },
  { value: 9,  label: '9. Sep' },
  { value: 10, label: '10. Oct' },
  { value: 11, label: '11. Nov' },
  { value: 12, label: '12. Dec' },
];

// Cancun current year/month for sensible defaults
const currentYearCancun = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric' }).format(new Date()));
const currentMonthCancun = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', month: '2-digit' }).format(new Date()));
const YEAR_OPTIONS = [currentYearCancun - 1, currentYearCancun, currentYearCancun + 1];

// Fallback month list (latest → earliest) for Date filter when API months are not yet loaded
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const makeMonthList = (count = 24, tz = 'America/Cancun') => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(now);
  let y = Number(parts.find(p => p.type === 'year')?.value);
  let m = Number(parts.find(p => p.type === 'month')?.value);
  const list = [];
  for (let i = 0; i < count; i++) {
    const ym = `${y}-${String(m).padStart(2,'0')}`;
    const label = `${m}.${MONTH_ABBR[m - 1]} ${String(y).slice(-2)}`;
    list.push({ value: ym, label });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return list;
};
const MONTH_FILTER_OPTIONS = makeMonthList(24);

const HKCleaningsView = () => {
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);

  const applyMonthYearFilter = (data, year, month) => {
    const yNum = year ? Number(year) : null;
    const mNum = month ? Number(month) : null;
    if (!yNum && !mNum) return data;

    // If only month is given, assume current Cancun year
    let assumedYear = null;
    if (!yNum && mNum) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric' }).formatToParts(new Date());
      assumedYear = Number(parts.find(p => p.type === 'year')?.value);
    }

    return data.filter(r => {
      const dt = parseYmd(r.checkout_date || r.checkoutDate);
      if (!dt) return false;
      const dy = dt.getUTCFullYear();
      const dm = dt.getUTCMonth() + 1;
      const yrOk = yNum ? (dy === yNum) : (assumedYear ? dy === assumedYear : true);
      const moOk = mNum ? (dm === mNum) : true;
      return yrOk && moOk;
    });
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    start: '',
    end: '',
    city: '',
    status: 'any',
    cleaning_type: '',
    checkout_date: `${currentYearCancun}-${String(currentMonthCancun).padStart(2, '0')}`,
    month: currentMonthCancun,
    year: currentYearCancun,
    search: '',
    unit_name: '',
    completed_cleaner: '',
    page: 1,
    pageSize: 25,
    sort: 'checkout_date',
    dir: 'asc',
  });
  const [total, setTotal] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeView, setActiveView] = useState('completed'); // 'all' | 'completed'

  // On mount: default Month/Year to current Cancun month so the page loads with data
  useEffect(() => {
    if (filters.month != null && filters.year != null && filters.month !== '' && filters.year !== '') return; // already set
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Cancun',
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(new Date());
      const y = Number(parts.find(p => p.type === 'year')?.value);
      const m = Number(parts.find(p => p.type === 'month')?.value);
      if (y && m) {
        setFilters(prev => ({ ...prev, month: m, year: y, checkout_date: `${y}-${String(m).padStart(2,'0')}`, page: 1 }));
      }
    } catch (_) {
      // Fallback to local current month/year
      const now = new Date();
      setFilters(prev => ({ ...prev, month: now.getMonth() + 1, year: now.getFullYear(), checkout_date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, page: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [unitsDrawerOpen, setUnitsDrawerOpen] = useState(false);
  const [unitsRows, setUnitsRows] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [rateFormOpen, setRateFormOpen] = useState(false);
  const [rateFormUnit, setRateFormUnit] = useState(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState(null);
  const [unitFilterOptions, setUnitFilterOptions] = useState([]); // [{label, value}]
  const [unitFilterLoading, setUnitFilterLoading] = useState(false);
  const [unitFilterInput, setUnitFilterInput] = useState('');
  // Month filter dynamic options state
  const [monthOptions, setMonthOptions] = useState([]);
  const [monthOptionsLoading, setMonthOptionsLoading] = useState(false);

  // Helper to load server-side unit suggestions (graceful fallback to current rows)
  const loadUnitSuggestions = async (query) => {
    setUnitFilterLoading(true);
    try {
      // Try a dedicated units endpoint first (if available)
      const res = await api.get('/api/units', { params: { search: query, page: 1, pageSize: 20 } });
      const items = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      if (items.length) {
        const opts = items.map(u => ({ label: u.unit_name || u.unitName || u.name || String(u.id), value: u.unit_name || u.unitName || u.name || String(u.id) }));
        setUnitFilterOptions(opts);
        return;
      }
    } catch (e) {
      // ignore and fallback below
    } finally {
      setUnitFilterLoading(false);
    }
    // Fallback: derive from current rows
    const uniq = Array.from(new Set(rows.map(r => r.unit_name).filter(Boolean)));
    setUnitFilterOptions(uniq.map(n => ({ label: n, value: n })));
  };

  // Fetch available months for filter dropdown
  const fetchAvailableMonths = async () => {
    setMonthOptionsLoading(true);
    try {
      // Fetch months that actually have data (global, not conditioned by city/status to avoid shrinking options)
      const res = await api.get('/api/hk-cleanings/months', { params: { limit: 36 } });
      const arr = (res.data && (res.data.data || res.data)) || [];
      if (Array.isArray(arr) && arr.length) {
        setMonthOptions(arr);
      }
    } catch (e) {
      console.error('Failed to fetch months', e);
      // keep silent; fallback to local MONTH_FILTER_OPTIONS
    } finally {
      setMonthOptionsLoading(false);
    }
  };
  useEffect(() => {
    fetchAvailableMonths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Only fetch when a Month or Year filter is selected
      if (!filters.month && !filters.year) {
        setAllRows([]);
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      const { year, month, ...rest } = filters;
      // Build params WITHOUT city/status/search so server returns the full month slice.
      const params = { page: 1, pageSize: 500, sort: 'checkout_date', dir: 'asc' };

      const y = Number(year) || new Date().getFullYear();
      const m = Number(month) || 1;
      const mm = String(m).padStart(2, '0');
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

      // Some backends filter by checkout_date = YYYY-MM; also keep start/end for range-based filtering.
      params.checkout_date = `${y}-${mm}`;
      params.start = `${y}-${mm}-01`;
      params.end   = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;

      const res = await api.get('/api/hk-cleanings', { params });
      if (res.data?.ok) {
        const raw = res.data.data || [];
        setAllRows(raw);
        // Server already filtered by month; no extra client filter necessary
        setRows(raw);
        setTotal(res.data.total ?? raw.length);
      } else {
        setError(res.data?.error || 'Unknown error');
      }
    } catch (e) {
      console.error(e);
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveUnits = async () => {
    setUnitsLoading(true);
    setUnitsError(null);
    try {
      const res = await api.get('/api/hk-cleanings', {
        params: {
          start: '',
          end: '',
          city: '',
          status: 'any',
          search: '',
          page: 1,
          pageSize: 25,
          sort: 'checkout_date',
          dir: 'asc',
        },
      });
      const list = Array.isArray(res.data?.units) ? res.data.units : [];
      const normalized = list.map(r => ({
        raw: r,
        id: r.id ?? r.unit_id ?? r.unitId ?? null,
        unitName: r.unit_name ?? r.unitName ?? r.name ?? '',
        city: r.city ?? '',
        cleaningFee: r.cleaning_fee ?? r.unit_cleaning_fee ?? null,
        unitRateAmount: r.unit_rate_amount ?? null,
      })).filter(r => r.id != null);
      setUnitsRows(normalized);
    } catch (e) {
      console.error(e);
      setUnitsError('Failed to load units');
    } finally {
      setUnitsLoading(false);
    }
  };

  const saveUnitRateAmount = async (rowId) => {
    if (editingRowId !== rowId) return;
    try {
      const payload = { unit_rate_amount: editingValue };
      await api.patch(`/api/units/${rowId}`, payload);
      setUnitsRows(prev => prev.map(r => r.id === rowId ? { ...r, unitRateAmount: editingValue } : r));
      setEditingRowId(null);
      setEditingValue('');
    } catch (e) {
      console.error(e);
      alert('Failed to save unit rate amount'); // can be replaced by toast
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      fetchData();
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.month, filters.year, filters.city, filters.status, filters.search, filters.page, filters.pageSize, filters.sort, filters.dir]);

  // Seed initial options from current rows and update when data changes (if no active input)
  useEffect(() => {
    if (!unitFilterInput) {
      const uniq = Array.from(new Set(rows.map(r => r.unit_name).filter(Boolean)));
      setUnitFilterOptions(uniq.map(n => ({ label: n, value: n })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // When user types into the unit autocomplete input, fetch suggestions (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      const q = (unitFilterInput || '').trim();
      if (!q) {
        // if input cleared, seed from rows (handled by other effect) but also clear loading
        setUnitFilterLoading(false);
        return;
      }
      loadUnitSuggestions(q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitFilterInput]);

  useEffect(() => {
    if (unitsDrawerOpen) {
      fetchActiveUnits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitsDrawerOpen]);



  // Compute the maximum ID length for padding
  const maxIdLength = rows.length > 0 ? Math.max(...rows.map(r => String(r.id || '').length)) : 1;


  const columns = [
    {
      header: 'ID',
      accessor: 'id',
      width: 75,
      align: 'center',
      cellStyle: { py: 0.75 },
      render: (value, row) => (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', py: 0.75 }}>
          <MuiLink
            component="button"
            type="button"
            underline="hover"
            sx={{
              color: '#1E6F68',
              fontWeight: 600,
              lineHeight: 1.4,
              '&:hover': { color: 'orange' }
            }}
            onClick={() => {
              setEditingCleaning(row);
              setEditDrawerOpen(true);
            }}
          >
            {String(value).padStart(maxIdLength, '0')}
          </MuiLink>
        </Box>
      ),
    },
    { header: 'Reservation',    accessor: 'reservation_code', width: 130, cellStyle: { py: 1, px: 1.5 } },
    {
      header: 'Date',
      accessor: 'checkout_date',
      width: 130,
      cellStyle: { py: 1, px: 1.5 },
      render: (value) => fmtDateDMY(value),
    },
    {
      header: 'Unit',
      accessor: 'unit_name',
      width: 200,
      cellStyle: { py: 1, px: 1.5 },
      filterable: true,
      inlineFilter: true,
      filter: {
        type: 'autocomplete',
        inline: true,
        options: unitFilterOptions,
        placeholder: 'Unit',
        getOptionLabel: (o) => (o && typeof o === 'object' ? (o.label ?? String(o.value ?? '')) : String(o ?? '')),
        // Allow parent view to control loading and input change (for async suggestions)
        autocompleteProps: {
          freeSolo: true,
          loading: unitFilterLoading,
          onInputChange: (_e, v) => setUnitFilterInput(v),
        },
      },
    },
    {
      header: 'City',
      accessor: 'city',
      width: 140,
      cellStyle: { py: 1, px: 1.5 },
      filterable: true,
      filterType: 'select',
      inlineFilter: true,
    },
    {
      header: 'Status',
      accessor: 'status',
      width: 110,
      cellStyle: { py: 1, px: 1.5, maxWidth: 110 },
      render: (value) => {
        if (!value) return '';
        const v = String(value).toLowerCase();
        if (v === 'pending') {
          return <span style={{ color: 'orange' }}>Pending</span>;
        }
        if (v === 'done') {
          return <span style={{ color: '#1E6F68' }}>Done</span>; // teal
        }
        if (v === 'cancelled') {
          return <span style={{ color: '#e57373' }}>Cancelled</span>; // light red
        }
        return value;
      },
      filterType: 'select',
      filterOptions: [
        { label: 'All', value: '' },
        { label: 'Pending', value: 'pending' },
        { label: 'Done', value: 'done' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      inlineFilter: true,
    },
    {
      header: 'Type',
      accessor: 'cleaning_type',
      format: 'capitalize',
      width: 110,
      cellStyle: { py: 1, px: 1.5, maxWidth: 110 },
      filter: {
        type: 'select',
        inline: true,
        placeholder: 'Type',
      },
    },
    {
      header: 'Paid',
      accessor: 'unit_rate_amount',
      format: 'money',
      width: 90,
      type: 'currency',
      align: 'right',
      cellStyle: { py: 1, px: 1.5, maxWidth: 90 },
    },
    {
      header: 'Charged',
      accessor: 'unit_cleaning_fee',
      format: 'money',
      width: 90,
      type: 'currency',
      align: 'right',
      cellStyle: { py: 1, px: 1.5, maxWidth: 90 },
    },
    { header: 'Notes', accessor: 'notes', width: 220, cellStyle: { py: 1, px: 1.5 } },
  ];

  const completedCleanerOptions = useMemo(() => {
    const base = (Array.isArray(allRows) ? allRows : [])
      .map(r => (r?.checklist_cleaner_short_name || r?.checklistCleanerShortName || '').trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(base)).sort((a, b) => a.localeCompare(b));
    return [{ label: 'All', value: '' }, ...uniq.map(n => ({ label: n, value: n }))];
  }, [allRows]);

  const completedRows = useMemo(() => {
    // Consider a cleaning "completed" if status is done OR there is a submitted checklist
    return (Array.isArray(allRows) ? allRows : [])
      .filter(r => {
        const status = String(r?.status || '').toLowerCase();
        return status === 'done' || !!r?.checklist_submitted_at;
      })
      .filter(r => {
        const q = (filters.unit_name || '').trim().toLowerCase();
        if (!q) return true;
        const name = String(r?.unit_name || r?.unitName || '').toLowerCase();
        return name.includes(q);
      })
      .filter(r => {
        const sel = (filters.completed_cleaner || '').trim().toLowerCase();
        if (!sel) return true;
        const name = String(r?.checklist_cleaner_short_name || r?.checklistCleanerShortName || '').toLowerCase();
        return name === sel;
      })
      .sort((a, b) => {
        // Sort by last submitted checklist DESC (nulls last)
        const ta = a?.checklist_submitted_at ? Date.parse(a.checklist_submitted_at.replace(' ', 'T')) : 0;
        const tb = b?.checklist_submitted_at ? Date.parse(b.checklist_submitted_at.replace(' ', 'T')) : 0;
        return tb - ta;
      })
      .map(r => ({
        ...r,
        completed_date: r.checkout_date || r.checkoutDate || '',
        completed_unit: r.unit_name || r.unitName || '',
        completed_cleaner: r.checklist_cleaner_short_name || r.checklistCleanerShortName || '',
        completed_notes: r.checklist_cleaning_notes || r.cleaning_notes || r.notes || '',
        completed_issues: r.checklist_issues || r.issues || '',
      }));
  }, [allRows, filters.unit_name, filters.completed_cleaner]);

  const completedColumns = useMemo(() => ([
    {
      header: 'Date',
      accessor: 'completed_date',
      width: 170,
      cellStyle: { py: 0.75, px: 1.5 },
      render: (_value, row) => {
        const submitted = row?.checklist_submitted_at;
        const checkout = row?.checkout_date || row?.completed_date;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <Typography variant="caption" sx={{ color: '#111827', fontWeight: 700 }}>
              {fmtTsDMY(submitted) || '—'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>
              {`checkOut: ${fmtDateDMY(checkout) || '—'}`}
            </Typography>
          </Box>
        );
      },
    },
    {
      header: 'Unit',
      accessor: 'completed_unit',
      width: 240,
      cellStyle: { py: 0.75, px: 1.5 },
      render: (_value, row) => {
        const unit = row?.completed_unit || row?.unit_name || '';
        const tRaw = String(row?.cleaning_type || row?.cleaningType || '').toLowerCase();
        const typeLabel = tRaw === 'checkout' ? 'Normal' : (tRaw ? (tRaw.charAt(0).toUpperCase() + tRaw.slice(1)) : '');
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <Typography variant="caption" sx={{ color: '#111827', fontWeight: 700 }}>
              {unit || '—'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>
              {typeLabel || '—'}
            </Typography>
          </Box>
        );
      },
      filterable: true,
      inlineFilter: true,
      filter: {
        type: 'autocomplete',
        inline: true,
        options: unitFilterOptions,
        placeholder: 'Unit',
        getOptionLabel: (o) =>
          (o && typeof o === 'object'
            ? (o.label ?? String(o.value ?? ''))
            : String(o ?? '')),
        autocompleteProps: {
          freeSolo: true,
          loading: unitFilterLoading,
          onInputChange: (_e, v) => setUnitFilterInput(v),
        },
      },
    },
    {
      header: 'Cleaner',
      accessor: 'completed_cleaner',
      width: 160,
      cellStyle: { py: 1, px: 1.5 },
      filterable: true,
      inlineFilter: true,
      filterType: 'select',
      filterOptions: completedCleanerOptions,
    },
    {
      header: 'Notes',
      accessor: 'completed_notes',
      width: 260,
      cellStyle: { py: 1, px: 1.5 },
    },
    {
      header: 'Issues',
      accessor: 'completed_issues',
      width: 220,
      cellStyle: { py: 1, px: 1.5 },
    },
  ]), [unitFilterOptions, unitFilterLoading, completedCleanerOptions]);

  return (
    <PageScaffold
      title="Housekeeper Cleanings"
      layout="table"
      stickyHeader={
        <Stack spacing={1.25} sx={{ width: '100%' }}>
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Left: Month picker */}
            <Box sx={{ width: 240 }}>
              <YearMonthPicker
                // Support both APIs: (year, month) OR value="YYYY-MM"
                year={filters.year || ''}
                month={filters.month || ''}
                value={filters.year && filters.month ? `${filters.year}-${String(filters.month).padStart(2, '0')}` : ''}
                onChange={(a, b) => {
                  // Support signatures:
                  // 1) onChange('YYYY-MM')
                  // 2) onChange({ value: 'YYYY-MM' })
                  // 3) onChange({ year, month })
                  // 4) onChange(year, month)

                  let y = '';
                  let m = '';

                  if (typeof a === 'string') {
                    const [yy, mm] = a.split('-');
                    y = yy || '';
                    m = mm || '';
                  } else if (a && typeof a === 'object') {
                    if (a.value && typeof a.value === 'string') {
                      const [yy, mm] = String(a.value).split('-');
                      y = yy || '';
                      m = mm || '';
                    } else {
                      y = a.year ?? a.y ?? '';
                      m = a.month ?? a.m ?? '';
                    }
                  } else {
                    y = a ?? '';
                    m = b ?? '';
                  }

                  const yNum = Number(y) || '';
                  const mNum = Number(m) || '';
                  if (!yNum || !mNum) {
                    setFilters(prev => ({ ...prev, year: yNum || '', month: mNum || '', checkout_date: '', page: 1 }));
                    return;
                  }
                  setFilters(prev => ({
                    ...prev,
                    year: yNum,
                    month: mNum,
                    checkout_date: `${yNum}-${String(mNum).padStart(2, '0')}`,
                    page: 1,
                  }));
                }}
              />
            </Box>

            {/* Center: Tabs */}
            <Tabs
              value={activeView}
              onChange={(_e, v) => {
                if (!v) return;
                setActiveView(v);
              }}
              variant="standard"
              sx={{
                minHeight: 34,
                '& .MuiTabs-indicator': {
                  backgroundColor: '#1E6F68',
                  height: 2,
                },
              }}
            >
              <Tab
                value="all"
                label="ALL CLEANINGS"
                disableRipple
                sx={{
                  minHeight: 34,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  fontSize: 12,
                  color: '#6b7280',
                  px: 1.75,
                  position: 'relative',
                  '&.Mui-selected': {
                    color: '#1E6F68',
                  },
                  '&::after': {
                    content: '"|"',
                    position: 'absolute',
                    right: -4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#d1d5db',
                    fontWeight: 400,
                  },
                }}
              />
              <Tab
                value="completed"
                label="COMPLETED"
                disableRipple
                sx={{
                  minHeight: 34,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  fontSize: 12,
                  color: '#6b7280',
                  px: 1.75,
                  '&.Mui-selected': {
                    color: '#1E6F68',
                  },
                }}
              />
            </Tabs>

            {/* Right: Buttons */}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="outlined"
                color="success"
                onClick={() => setDrawerOpen(true)}
                disabled={activeView !== 'all'}
              >
                + Add
              </Button>
              <Button
                variant="outlined"
                onClick={() => setUnitsDrawerOpen(true)}
                disabled={activeView !== 'all'}
              >
                Units & Fees
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  setFilters({
                    start: '',
                    end: '',
                    city: '',
                    status: 'any',
                    cleaning_type: '',
                    search: '',
                    unit_name: '',
                    completed_cleaner: '',
                    page: 1,
                    pageSize: 25,
                    sort: 'checkout_date',
                    dir: 'asc',
                    month: '',
                    year: '',
                  });
                }}
                disabled={activeView !== 'all'}
              >
                Reset filters
              </Button>
            </Stack>
          </Stack>
        </Stack>
      }
    >

        <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Add Cleaning">
          <NewHKCleaningsForm
            onSuccess={() => {
              setDrawerOpen(false);
              fetchData();
            }}
            onCancel={() => setDrawerOpen(false)}
          />
        </AppDrawer>

        <AppDrawer open={unitsDrawerOpen} onClose={() => setUnitsDrawerOpen(false)} title="Active Units &amp; Fees">
          <Box sx={{ width: 'fit-content', maxWidth: '100%', overflow: 'visible', display: 'inline-block' }}>
            {unitsLoading ? (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2 }}>
                <CircularProgress size={20} />
                <span>Loading units…</span>
              </Stack>
            ) : unitsError ? (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2 }}>
                <span style={{ color: 'crimson' }}>{unitsError}</span>
                <IconButton size="small" onClick={fetchActiveUnits} aria-label="refresh">
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Stack>
            ) : (
              <>
                {/* Tulum Box */}
                <Box sx={{ position: 'relative', overflow: 'visible', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5, pt: 3.25, mb: 2 }}>
                  <Box component="span"
                       sx={{
                         position: 'absolute',
                         top: -10,
                         left: 12,
                         px: 0.75,
                         bgcolor: 'background.paper',
                         fontSize: '0.75rem',
                         fontWeight: 600,
                         zIndex: 2,
                         pointerEvents: 'none'
                       }}>
                    Tulum
                  </Box>
                  <Table
                    size="small"
                    sx={{
                      minWidth: 170,
                      width: 'fit-content',
                      tableLayout: 'fixed',
                      borderCollapse: 'collapse',
                      '& th, & td': {
                        fontSize: '0.75rem',
                        borderBottom: 'none',
                        borderRight: '1px solid rgba(224,224,224,1)',
                        paddingTop: 0.1,
                        paddingBottom: 0.1
                      },
                      '& td': { whiteSpace: 'nowrap' },
                      '& thead th': {
                        borderBottom: '1px solid rgba(224, 224, 224, 1)',
                        paddingTop: 0.75,
                        paddingBottom: 0.75
                      },
                      '& th:last-child, & td:last-child': { borderRight: 'none' },
                      '& thead th:nth-of-type(1), & tbody td:nth-of-type(1)': { width: 90, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' },
                      '& thead th:nth-of-type(2), & tbody td:nth-of-type(2)': { width: 40, maxWidth: 40 },
                      '& thead th:nth-of-type(3), & tbody td:nth-of-type(3)': { width: 40, maxWidth: 40 }
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>Unit</TableCell>
                        <TableCell align="right" width={40}>Fee</TableCell>
                        <TableCell align="right" width={40}>Cost</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {unitsRows.filter(r => String(r.city || '').toLowerCase().includes('tulum')).map(row => {
                        const isEditing = editingRowId === row.id;
                        return (
                          <TableRow key={row.id}>
                            <TableCell>
                              <MuiLink
                                component="button"
                                type="button"
                                onClick={() => {
                                  setRateFormUnit(row);
                                  setRateFormOpen(true);
                                }}
                                underline="hover"
                                sx={{ fontWeight: 600 }}
                              >
                                {row.unitName}
                              </MuiLink>
                            </TableCell>
                            <TableCell align="right" sx={{ textAlign: 'right' }}>
                              {formatCurrency(row.cleaningFee)}
                            </TableCell>
                            <TableCell align="right">
                              {isEditing ? (
                                <TextField
                                  size="small"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  placeholder="Enter rate"
                                  inputProps={{ inputMode: 'decimal' }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      saveUnitRateAmount(row.id);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      setEditingRowId(null);
                                      setEditingValue('');
                                    }
                                  }}
                                  onBlur={() => saveUnitRateAmount(row.id)}
                                  sx={{ width: 60 }}
                                />
                              ) : (
                                formatCurrency(row.unitRateAmount)
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {unitsRows.filter(r => String(r.city || '').toLowerCase().includes('tulum')).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                            No Tulum units.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Box>
                {/* Playa del Carmen Box */}
                <Box sx={{ position: 'relative', overflow: 'visible', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5, pt: 3.25, mb: 2 }}>
                  <Box component="span"
                       sx={{
                         position: 'absolute',
                         top: -10,
                         left: 12,
                         px: 0.75,
                         bgcolor: 'background.paper',
                         fontSize: '0.75rem',
                         fontWeight: 600,
                         zIndex: 2,
                         pointerEvents: 'none'
                       }}>
                    Playa del Carmen
                  </Box>
                  <Table
                    size="small"
                    sx={{
                      minWidth: 170,
                      width: 'fit-content',
                      tableLayout: 'fixed',
                      borderCollapse: 'collapse',
                      '& th, & td': {
                        fontSize: '0.75rem',
                        borderBottom: 'none',
                        borderRight: '1px solid rgba(224,224,224,1)',
                        paddingTop: 0.1,
                        paddingBottom: 0.1
                      },
                      '& td': { whiteSpace: 'nowrap' },
                      '& thead th': {
                        borderBottom: '1px solid rgba(224, 224, 224, 1)',
                        paddingTop: 0.75,
                        paddingBottom: 0.75
                      },
                      '& th:last-child, & td:last-child': { borderRight: 'none' },
                      '& thead th:nth-of-type(1), & tbody td:nth-of-type(1)': { width: 90, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' },
                      '& thead th:nth-of-type(2), & tbody td:nth-of-type(2)': { width: 80, maxWidth: 80 },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>Unit</TableCell>
                        <TableCell align="right" width={80}>Fee</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {unitsRows.filter(r => String(r.city || '').toLowerCase().includes('playa del carmen')).map(row => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <MuiLink
                              component="button"
                              type="button"
                              onClick={() => {
                                setRateFormUnit(row);
                                setRateFormOpen(true);
                              }}
                              underline="hover"
                              sx={{ fontWeight: 600 }}
                            >
                              {row.unitName}
                            </MuiLink>
                          </TableCell>
                          <TableCell align="right" sx={{ textAlign: 'right' }}>
                            {formatCurrency(row.cleaningFee)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {unitsRows.filter(r => String(r.city || '').toLowerCase().includes('playa del carmen')).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                            No Playa del Carmen units.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Box>
              </>
            )}
          </Box>
        </AppDrawer>

        <AppDrawer open={editDrawerOpen} onClose={() => setEditDrawerOpen(false)} title="Edit Cleaning">
          {editingCleaning && (
            <EditHKCleaningsForm
              cleaning={editingCleaning}
              onSuccess={() => {
                setEditDrawerOpen(false);
                fetchData();
              }}
              onCancel={() => setEditDrawerOpen(false)}
            />
          )}
        </AppDrawer>

        <HKCleaningsRateForm
          open={rateFormOpen}
          onClose={() => setRateFormOpen(false)}
          unit={rateFormUnit}
          onSaved={() => {
            setRateFormOpen(false);
            fetchActiveUnits();
          }}
        />
        {/* Table area in scaffold's scroll */}
        {activeView === 'all' ? (
          <Box sx={{ display: 'flex', flex: 1, minHeight: 0, height: 'calc(100vh - 260px)' }}>
            <TableLite
              columns={columns}
              rows={allRows}
              loading={loading}
              error={error}
              useParentScroll={false}
              height="100%"
              defaultStringTransform={null}
              enableFilters
              filterValues={{
                city: filters.city,
                status: filters.status === 'any' ? '' : filters.status,
                unit_name: filters.unit_name || '',
                cleaning_type: filters.cleaning_type || '',
              }}
              onFilterChange={(key, value) => {
                if (key === 'unit_name') {
                  setFilters(prev => ({ ...prev, unit_name: value || '' }));
                  return;
                }
                if (key === 'status') {
                  setFilters(prev => ({ ...prev, status: value || 'any' }));
                } else if (key === 'city') {
                  setFilters(prev => ({ ...prev, city: value || '' }));
                } else if (key === 'cleaning_type') {
                  setFilters(prev => ({ ...prev, cleaning_type: value || '' }));
                } else {
                  setFilters(prev => ({ ...prev, [key]: value }));
                }
              }}
              optionsSourceRows={allRows}
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flex: 1, minHeight: 0, height: 'calc(100vh - 260px)' }}>
            <TableLite
              columns={completedColumns}
              rows={completedRows}
              loading={loading}
              error={error}
              useParentScroll={false}
              height="100%"
              defaultStringTransform={null}
              enableFilters
              filterValues={{
                unit_name: filters.unit_name || '',
                completed_unit: filters.unit_name || '',
                completed_cleaner: filters.completed_cleaner || '',
              }}
              onFilterChange={(key, value) => {
                if (key === 'unit_name' || key === 'completed_unit') {
                  setFilters(prev => ({ ...prev, unit_name: value || '' }));
                  return;
                }
                if (key === 'completed_cleaner') {
                  setFilters(prev => ({ ...prev, completed_cleaner: value || '' }));
                }
              }}
            />
          </Box>
        )}
      </PageScaffold>
  );
};

export default HKCleaningsView;
