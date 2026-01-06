import React, { useRef } from 'react';
import { applyFilters, getFilterType, getOptions } from '../../adapters/datatableFilters';
import { fmtDMY, fmtDMYslash, fmtMoney, fmtPercent, fmtCityAndUnit } from '../../adapters/datatableFormatters';
import './DataTable.css';
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  TextField,
  Select,
  MenuItem,
  Box,
  Autocomplete,
  FormControl,
  InputLabel,
} from '@mui/material';

const MONTH_OPTIONS = [
  { v: '', l: 'All' },
  { v: '01', l: '1. Jan' }, { v: '02', l: '2. Feb' }, { v: '03', l: '3. Mar' }, { v: '04', l: '4. Apr' },
  { v: '05', l: '5. May' }, { v: '06', l: '6. Jun' }, { v: '07', l: '7. Jul' }, { v: '08', l: '8. Aug' },
  { v: '09', l: '9. Sep' }, { v: '10', l: '10. Oct' }, { v: '11', l: '11. Nov' }, { v: '12', l: '12. Dec' },
];

const buildMonthYearOptions = () => {
  const opts = [{ value: '', label: 'All' }];
  const now = new Date();
  // Generate current month and previous 11 months (total 12), most recent first
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const yy = String(y).slice(-2);
    const mNum = d.getMonth() + 1; // 1..12
    const m = String(mNum).padStart(2, '0');
    const monthAbbr = d.toLocaleString('en-US', { month: 'short' }); // e.g., "Aug"
    const label = `${mNum}.${monthAbbr} ${yy}`; // e.g., "8.Aug 25"
    opts.push({ value: `${y}-${m}`, label });
  }
  return opts;
};

const toYearMonthToken = (raw) => {
  if (!raw) return '';
  try {
    if (typeof raw === 'string') {
      const m = raw.match(/^(\d{4})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}`;
    }
    const d = new Date(raw);
    if (!isNaN(d)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  } catch {}
  return '';
};

// Shared style for centered floating labels
const FLOAT_LABEL_SX = {
  // Center the label vertically when not shrunk
  '& .MuiInputLabel-root': {
    top: '50%',
    transform: 'translate(14px, -50%) scale(1)',
    pointerEvents: 'none',
  },
  // When shrunk (focused or has value), move label into the notch
  '& .MuiInputLabel-root.MuiInputLabel-shrink': {
    top: 0,
    transform: 'translate(14px, -11px) scale(0.75)',
  },
  // Keep the outline's notch CLOSED in natural state (label not shrunk)
  '& .MuiInputLabel-root + .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline legend': {
    maxWidth: 0,
    width: 0,
    padding: 0,
  },
  // OPEN the notch only when the label shrinks (focused or has value)
  '& .MuiInputLabel-root.MuiInputLabel-shrink + .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline legend': {
    maxWidth: '100%',
    width: 'auto',
    padding: '',
  },
};

// MUI-based DataTable
// Props:
//  - columns: [{ header, accessor, type?, width?, cell?(row)?, render?(value, row)? }]
//      * If `render` is provided, it receives (value, row) and its return is used verbatim.
//      * If `cell` is provided, it receives (row) and its return is used.
//      * Otherwise, the raw value is formatted based on `type` (e.g., 'currency') or printed as text.
//  - data: array of plain objects
//  - rowProps: function(row) -> props for <TableRow>
//  - stickyHeaderTop: number (optional) - offset for sticky header (px, default 0)
//  - stickyHeader: boolean (optional) - enable sticky header (default true)
//  - headerZIndex: number (optional) - z-index for sticky header (default 2)
//  - containerProps: object (optional) - props to spread on TableContainer
export default function DataTable({
  columns = [],
  data = [],
  rowProps,
  // External/controlled pagination props (optional)
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  // NEW: optional uniform width to apply to all columns unless a column defines its own width
  uniformColWidth,
  // NEW: stable identifier to persist widths across reloads/sessions
  tableKey,
  // NEW: expose final visible rows (after filters/sorts, before pagination)
  onVisibleDataChange,
  // Sticky header config
  stickyHeaderTop = 0,
  stickyHeader = true,
  headerZIndex = 2,
  containerProps = {},
}) {
  const notifyVisible = (typeof onVisibleDataChange === 'function') ? onVisibleDataChange : () => {};
  const rows = Array.isArray(data) ? data : [];
  // --- Row ID helpers and container ref for highlight ---
  const tableRef = React.useRef(null);

  // Column <col> refs for live width updates during resize
  const colRefs = React.useRef([]);
  const resizingRef = React.useRef({ active: false, colIdx: -1, startX: 0, startW: 0 });

  // --- Persistence: compute a stable key and apply saved widths on mount ---
  const persistKey = React.useMemo(() => {
    try {
      const path = typeof window !== 'undefined' && window.location ? window.location.pathname : 'unknown';
      // Use accessors/headers signature to avoid collisions across tables
      const sig = Array.isArray(columns) ? columns.map(c => (typeof c?.accessor === 'string' ? c.accessor : (c?.header || ''))).join('|') : 'cols';
      const base = tableKey ? String(tableKey) : `${path}:${sig}`;
      return `o2dt:colwidths:${base}`;
    } catch {
      return 'o2dt:colwidths:default';
    }
  }, [tableKey, columns]);

  React.useEffect(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(persistKey) : null;
      if (!raw) return;
      const map = JSON.parse(raw);
      if (!map || typeof map !== 'object') return;
      // Apply after first paint so <col> refs exist
      setTimeout(() => {
        Object.entries(map).forEach(([k, v]) => {
          const idx = Number(k);
          const px = Number(v);
          const colEl = colRefs.current[idx];
          if (!colEl || !Number.isFinite(px) || px <= 0) return;
          const w = `${px}px`;
          colEl.style.width = w;
          colEl.style.minWidth = w;
          colEl.style.maxWidth = w;
        });
      }, 0);
    } catch {
      // ignore
    }
  }, [persistKey, columns.length]);

  const getTableElm = () => {
    try {
      const root = tableRef.current;
      if (!root) return null;
      return root.querySelector && root.querySelector('table.custom-data-table');
    } catch { return null; }
  };

  // Persist current header widths to localStorage
  const saveColWidths = React.useCallback(() => {
    try {
      const tableEl = getTableElm();
      if (!tableEl) return;
      const headers = tableEl.querySelectorAll('thead .MuiTableCell-root');
      const map = {};
      headers.forEach((th, idx) => {
        const w = Math.round(th.getBoundingClientRect().width);
        if (Number.isFinite(w) && w > 0) map[idx] = w;
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(persistKey, JSON.stringify(map));
      }
    } catch {
      // ignore
    }
  }, [persistKey, columns]);

  const handleResizeStart = (idx, ev) => {
    try {
      const e = ev?.touches ? ev.touches[0] : ev;
      const tableEl = getTableElm();
      const colEl = colRefs.current[idx];
      if (!tableEl || !colEl) return;

      // Measure current header cell width as baseline
      const headerCells = tableEl.querySelectorAll('thead .MuiTableCell-root');
      const th = headerCells && headerCells[idx];
      const startW = th ? th.getBoundingClientRect().width : parseFloat((colEl.style.width || '').replace('px','')) || 120;

      resizingRef.current = { active: true, colIdx: idx, startX: e.clientX, startW };

      tableEl.classList.add('is-resizing');

      const move = (evt) => {
        const p = evt?.touches ? evt.touches[0] : evt;
        if (!resizingRef.current.active) return;
        const dx = p.clientX - resizingRef.current.startX;
        const isDate = isDateColumn(columns[idx]);
        const unclamped = Math.max(40, resizingRef.current.startW + dx);
        const newW = isDate ? Math.min(unclamped, 120) : unclamped;
// Apply to the <col> so header and body sync
        colEl.style.width = `${newW}px`;
        colEl.style.minWidth = `${newW}px`;
        colEl.style.maxWidth = `${newW}px`;
        // Prevent text selection on aggressive drags
        if (evt.cancelable) evt.preventDefault();
      };

      const up = () => {
        resizingRef.current.active = false;
        // Persist the final widths after resizing stops
        saveColWidths();
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.removeEventListener('touchmove', move, { passive: false });
        document.removeEventListener('touchend', up);
        tableEl.classList.remove('is-resizing');
      };

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', up);

      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
    } catch {}
  };

  const getRowIdFromRow = (rowObj) => {
    if (!rowObj || typeof rowObj !== 'object') return null;
    const tryKeys = [
      'id', 'ID', 'Id',
      'bookingId', 'booking_id',
      'transactionId', 'transaction_id',
      'unitTransactionId', 'unit_transaction_id',
      'ledgerId', 'ledger_id', 'unitLedgerId', 'unit_ledger_id',
      'o2TransactionId', 'o2_transaction_id',
      'documentId', 'document_id'
    ];
    for (const k of tryKeys) {
      if (rowObj[k] != null && rowObj[k] !== '') return String(rowObj[k]);
    }
    // Fallback: try nested @id like "/api/resource/123"
    const atId = rowObj['@id'];
    if (typeof atId === 'string') {
      const m = atId.match(/\/(\d+)(?:$|\b)/);
      if (m) return m[1];
    }
    return null;
  };
  const logged = useRef(false);
  const [pageState, setPageState] = React.useState(0); // zero-based internal page
  const isExternal = typeof total === 'number';
  const rowsPerPage = isExternal ? (pageSize || 50) : 50; // default 50 per page; parent can override

  const [filters, setFilters] = React.useState({});           // immediate input values
  const [debounced, setDebounced] = React.useState(filters);  // debounced values used for filtering
  // Row highlight state (persists across re-renders)
  const [highlightId, setHighlightId] = React.useState(null);
  const [highlightAt, setHighlightAt] = React.useState(0);
  // Track whether auto-year is active for date filters
  const [autoYear, setAutoYear] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 250);   // 250ms debounce
    return () => clearTimeout(t);
  }, [filters]);

  React.useEffect(() => {
    const now = new Date();
    const yearFull = String(now.getFullYear());
    const yy = yearFull.slice(-2);
    setFilters(prev => {
      const next = { ...prev };
      columns.forEach(col => {
        if (isDateColumn(col)) {
          const key = getAccessorKey(col);
          if (next[`${key}__yearFull`] == null || next[`${key}__yearFull`] === '') next[`${key}__yearFull`] = yearFull;
          if (next[`${key}__year`] == null || next[`${key}__year`] === '') next[`${key}__year`] = yy;
          if (next[`${key}__month`] == null) next[`${key}__month`] = '';
        }
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAccessorString = (col) => (typeof col?.accessor === 'string' ? col.accessor : (typeof col?.header === 'string' ? col.header : ''));

  const guessKeyFromHeader = (hdr) => {
    const norm = String(hdr || '').replace(/\s+/g, '').toLowerCase();
    if (norm === 'category') return 'category';
    if (norm === 'costcenter') return 'costCenter';
    if (norm === 'unit') return 'unitName';
    if (norm === 'type') return 'type';
    if (norm === 'description') return 'description';
    return null;
  };

  const normKey = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const isDateColumn = (col) => {
    const acc = getAccessorString(col);
    const hdr = typeof col?.header === 'string' ? col.header : '';
    const a = normKey(acc);
    const h = normKey(hdr);
    return (
      a === 'date' ||
      h === 'date' ||
      h === 'fecha' ||
      h === 'bookingdate' ||
      h === 'checkin' ||
      h === 'checkout'
    );
  };
  // --- City column helpers ---
  const isCityColumn = (col) => {
    const acc = getAccessorString(col);
    const hdr = typeof col?.header === 'string' ? col.header : '';
    const a = normKey(acc);
    const h = normKey(hdr);
    return a === 'city' || h === 'city';
  };
  // Detect Unit column by accessor/header
  const isUnitColumn = (col) => {
    const acc = getAccessorString(col);
    const hdr = typeof col?.header === 'string' ? col.header : '';
    const a = normKey(acc);
    const h = normKey(hdr);
    return a === 'unitname' || a === 'unit' || h === 'unitname' || h === 'unit';
  };
  const displayCity = (raw) => {
    const s = String(raw ?? '');
    if (s.trim().toLowerCase() === 'playa del carmen') return 'Playa';
    return s;
  };
  // Extract YYYY-MM-DD from any string that starts with a date (e.g. "2025-08-01T00:00:00Z")
  const extractYmd = (raw) => {
    if (typeof raw !== 'string') return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); // capture leading date only
    if (!m) return null;
    return { y: m[1], mm: m[2], dd: m[3] };
  };

  const toMonthToken = (raw) => {
    if (!raw) return '';
    try {
      if (typeof raw === 'string') {
        const m = raw.match(/^(\d{4})-(\d{2})/);
        if (m) {
          const mm = m[2];
          const yy = m[1].slice(-2);
          return `${mm}/${yy}`;
        }
      }
      const d = new Date(raw);
      if (!isNaN(d)) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${mm}/${yy}`;
      }
    } catch {}
    return '';
  };

  const formatDDMMYYYY = (raw) => {
    if (!raw) return '';
    try {
      if (typeof raw === 'string') {
        // Prefer pure string reformatting to avoid timezone shifts
        const p = extractYmd(raw);
        if (p) {
          return `${p.dd}-${p.mm}-${p.y}`;
        }
      }
      // Fallbacks: if it's a Date or a non-standard string, try Date
      const d = (raw instanceof Date) ? raw : new Date(raw);
      if (!isNaN(d)) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        return `${dd}-${mm}-${yyyy}`;
      }
    } catch {}
    return String(raw);
  };

  // Format date as "M. MonthName YYYY", e.g., "8. August 2025"
  const formatMonthNumNameYear = (raw) => {
    if (!raw) return '';
    try {
      let d;
      if (typeof raw === 'string') {
        const p = extractYmd(raw);
        d = p ? new Date(Number(p.y), Number(p.mm) - 1, Number(p.dd || 1)) : new Date(raw);
      } else {
        d = (raw instanceof Date) ? raw : new Date(raw);
      }
      if (isNaN(d)) return String(raw);
      const y = d.getFullYear();
      const monthNum = d.getMonth() + 1; // 1..12
      const monthName = d.toLocaleString('en-US', { month: 'long' });
      return `${monthNum}. ${monthName} ${y}`;
    } catch {
      return String(raw);
    }
  };

  // Detect monetary/amount-like columns by accessor/header keywords
  const isMonetaryColumn = (col) => {
    try {
      const acc = getAccessorString(col);
      const hdr = typeof col?.header === 'string' ? col.header : '';
      const norm = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const a = norm(acc);
      const h = norm(hdr);
      const keys = ['amount','fee','total','income','payout','price','rate','commission','tax','balance','charged','paid','cost'];
      return keys.some(k => a.endsWith(k) || h.endsWith(k) || a.includes(k) || h.includes(k));
    } catch { return false; }
  };

  // Format money using European separators: "." thousands, "," decimals; force 2 decimals
  const formatMoneyEU = (val) => {
    if (val == null || val === '') return '';
    let num;
    if (typeof val === 'number') {
      num = val;
    } else {
      let s = String(val).trim();
      // If looks like "1.234,56" (EU), drop thousands dots and replace decimal comma with dot
      if (/,(\d{1,2})$/.test(s)) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Otherwise assume "1,234.56" (US) or plain "1234.56": drop commas
        s = s.replace(/,/g, '');
      }
      num = parseFloat(s);
    }
    if (Number.isNaN(num)) return String(val);
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatCurrency = (val) => {
    if (val == null || val === '') return '';
    let num;
    if (typeof val === 'number') {
      num = val;
    } else {
      // Normalize strings like "3,638.61" → 3638.61 for parsing
      const cleaned = String(val).replace(/,/g, '');
      num = parseFloat(cleaned);
    }
    if (Number.isNaN(num)) return String(val);
    // Use Intl with currency style to ensure $ prefix and proper grouping
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const AUTO_FILTERABLE = new Set(['unitName', 'description', 'type', 'costCenter', 'category']);
  // We will detect select columns by normalized key (accessor or header)
  const isAutoSelectKey = (col) => {
    const key = getAccessorString(col);
    const norm = String(key).replace(/\s+/g, '').toLowerCase();
    return norm === 'type' || norm === 'category' || norm === 'costcenter' || isDateColumn(col);
  };

  // Resolve primitive or dotted accessors, and support function accessors
  const getRaw = (row, accessor) => {
    if (!row || accessor == null) return '';
    if (typeof accessor === 'function') {
      try { return accessor(row); } catch { return ''; }
    }
    if (typeof accessor !== 'string') return '';
    try {
      if (!accessor.includes('.')) return row?.[accessor];
      return accessor.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), row);
    } catch {
      return '';
    }
  };

  const isFilterable = (_col) => true;

  const getFilterType = (col) => {
    if (col?.filterType === 'monthYear') return 'monthYear';
    if (col?.filterType) return col.filterType;
    if (isDateColumn(col)) return 'date';
    const key = String(getAccessorString(col));
    // normalize by removing spaces and non-alphanumerics so 'unit_name' → 'unitname'
    const norm = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (norm === 'unit' || norm === 'unitname') return 'autocomplete';
    return isAutoSelectKey(col) ? 'select' : 'text';
  };

  const getOptions = (col) => {
    if (Array.isArray(col?.filterOptions)) return col.filterOptions;
    const values = new Set();
    const acc = (typeof col?.accessor === 'string') ? col.accessor : (guessKeyFromHeader(col?.header) || getAccessorString(col));

    rows.forEach((row) => {
      // Prefer a column-supplied filter string if present
      let baseVal;
      if (typeof col?.getFilterValue === 'function') {
        try { baseVal = col.getFilterValue(row); } catch { baseVal = undefined; }
      }
      const raw = (baseVal != null && baseVal !== '') ? baseVal : getRaw(row, acc);
      const val = isDateColumn(col) ? toMonthToken(raw) : raw;
      if (val != null && val !== '') values.add(String(val));

      // Special case: for the Unit column, also surface City values as distinct suggestions
      if (isUnitColumn(col)) {
        const cityRaw = row?.city;
        if (cityRaw != null && String(cityRaw).trim() !== '') {
          values.add(String(cityRaw));                  // full city
          values.add(displayCity(String(cityRaw)));     // friendly alias (e.g., "Playa")
        }
      }
    });

    // Return alpha-sorted unique suggestions
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  };

  const getAccessorKey = (col) => (typeof col?.accessor === 'string' ? col.accessor : (col?.header || `col-${Math.random()}`));

  // Helpers for column widths and cell/header props
  const getColWidth = (col) => {
    if (!col) return undefined;
    // 1) Explicit per-column overrides win
    if (col.width != null) return col.width; // number (px) or string
    if (col.minWidth != null) return col.minWidth; // legacy support

    // 2) If a uniform width was provided at the component level, use it
    //    This lets each page decide a global default without changing this file again.
    if (uniformColWidth != null) return uniformColWidth;

    // 3) Otherwise, keep the existing sensible defaults for certain semantic columns
    const acc = getAccessorString(col);
    const hdr = typeof col?.header === 'string' ? col.header : '';
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    const a = norm(acc);
    const h = norm(hdr);
    if (isDateColumn(col)) return 120; // fits dd-mm-yyyy comfortably
    if (a === 'category' || h === 'category') return 150;
    if (a === 'costcentre' || a === 'costcenter' || h === 'costcentre' || h === 'costcenter') return 150;
    if (a === 'city' || h === 'city') return 120;
    return undefined; // allow auto-table-layout to decide
  };
  const getHeaderProps = (col) => (col && col.headerProps ? col.headerProps : {});
  const getCellProps = (col) => (col && col.cellProps ? col.cellProps : {});

  // One-time debug for quick verification
  if (!logged.current && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[DataTable:MUI] columns=', columns.map(c => c.header || c.accessor), 'rows=', rows.length, 'sample=', rows[0]);
    logged.current = true;
  }

  const filtered = rows.filter((row) => {
    // apply AND across all columns that have a non-empty filter value
    return columns.every((col) => {
      const key = getAccessorKey(col);
      const fval = debounced[key];
      const type = getFilterType(col);
      const acc = (typeof col?.accessor === 'string') ? col.accessor : (guessKeyFromHeader(col?.header) || getAccessorString(col));
      const raw = getRaw(row, acc);
      if (fval == null || fval === '') {
        // For monthYear and other simple filters, empty means no filtering
        if (type !== 'date') return true;
        // For legacy date filters, also consider month/year subfields
        const fMonth = debounced[`${key}__month`] ?? '';
        const fYear = debounced[`${key}__year`] ?? '';
        return !fMonth && !fYear;
      }
      if (type === 'monthYear') {
        const left = toYearMonthToken(raw); // 'YYYY-MM'
        return String(left) === String(fval);
      }
      if (type === 'date') {
        const keyBase = getAccessorKey(col);
        const fMonth = debounced[`${keyBase}__month`] ?? '';
        const fYear = debounced[`${keyBase}__year`] ?? '';
        if (!fMonth && !fYear) return true; // no active filter
        const left = toMonthToken(raw); // mm/yy
        if (!left) return false;
        const [mm, yy] = left.split('/');
        if (fMonth && fYear) return (mm === fMonth && yy === fYear);
        if (fMonth) return (mm === fMonth);
        if (fYear) return (yy === fYear);
        return true;
      }
      if (type === 'select') {
        const left = isDateColumn(col) ? toMonthToken(raw) : raw;
        return String(left) === String(fval);
      }
      // default text: case-insensitive "includes"
      // Support optional per-column override via getFilterValue(row)
      let hay;
      if (typeof col?.getFilterValue === 'function') {
        hay = String(col.getFilterValue(row) ?? '');
      } else if (isUnitColumn(col)) {
        const unit = String(row?.unitName ?? '');
        const cityFull = String(row?.city ?? '');
        const cityAlias = displayCity(row?.city);
        hay = [unit, cityFull, cityAlias].filter(Boolean).join(' ');
      } else {
        hay = String(raw ?? '');
      }
      return hay.toLowerCase().includes(String(fval).toLowerCase());
    });
  });

  // --- If any header filters are active, and a "Check In" column exists, sort by that date ascending (earliest first)
  const hasActiveFilters = (() => {
    try {
      // If autoYear is still true, ignore the defaulted date fields (month/year)
      return columns.some((col) => {
        const key = getAccessorKey(col);
        if (isDateColumn(col)) {
          // When autoYear is on, treat default month/year as NOT active
          if (!autoYear) {
            const fMonth = debounced[`${key}__month`] ?? '';
            const fYear = debounced[`${key}__year`] ?? '';
            if (fMonth || fYear) return true;
          }
        }
        const v = debounced[key];
        return v != null && String(v).trim() !== '';
      });
    } catch { return false; }
  })();

  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const checkInAccessor = (() => {
    for (const col of columns) {
      const a = typeof col?.accessor === 'string' ? col.accessor : '';
      const h = typeof col?.header === 'string' ? col.header : '';
      if (norm(a) === 'checkin' || norm(h) === 'checkin') return (a || guessKeyFromHeader(h) || 'checkIn');
      if (a === 'check_in') return a;
    }
    // fallback keys commonly used
    return null;
  })();

  const parseDateToTs = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const p = extractYmd(raw);
      if (p) {
        const y = Number(p.y), m = Number(p.mm), d = Number(p.dd);
        return new Date(y, m - 1, d).getTime();
      }
    }
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? null : t;
  };

  const working = (() => {
    if (hasActiveFilters && checkInAccessor) {
      try {
        const copy = [...filtered];
        copy.sort((ra, rb) => {
          const ta = parseDateToTs(getRaw(ra, checkInAccessor));
          const tb = parseDateToTs(getRaw(rb, checkInAccessor));
          if (ta == null && tb == null) return 0;
          if (ta == null) return 1; // nulls last
          if (tb == null) return -1;
          return ta - tb; // earliest first
        });
        return copy;
      } catch {
        return filtered;
      }
    }
    return filtered;
  })();

  // Rows visible after filters/sorts (before pagination)
  const visibleRows = working;

  // Build a stable signature (length + first/last id + first/last date) to avoid noisy updates
  const visSig = React.useMemo(() => {
    if (!Array.isArray(visibleRows) || visibleRows.length === 0) return '0:';
    const first = visibleRows[0] || {};
    const last = visibleRows[visibleRows.length - 1] || {};
    const firstKey = `${first.id ?? ''}|${first.date ?? ''}`;
    const lastKey  = `${last.id ?? ''}|${last.date ?? ''}`;
    return `${visibleRows.length}:${firstKey}:${lastKey}`;
  }, [visibleRows]);

  React.useEffect(() => {
    try {
      notifyVisible(Array.isArray(visibleRows) ? visibleRows : []);
    } catch {}
    // Only fire when signature changes
  }, [visSig]);

  const paginated = isExternal ? rows : working.slice(pageState * rowsPerPage, pageState * rowsPerPage + rowsPerPage);

  React.useEffect(() => {
    const handler = (ev) => {
      try {
        const wantedId = String(ev?.detail?.id || '');
        if (!wantedId) return;

        // Find index of the row with this id in the filtered dataset (not just paginated)
        const all = working;
        let rowIndex = -1;
        for (let i = 0; i < all.length; i++) {
          const rid = getRowIdFromRow(all[i]);
          if (rid && String(rid) === wantedId) { rowIndex = i; break; }
        }
        if (rowIndex < 0) return;

        // Remember which row to highlight (persist through re-renders)
        setHighlightId(wantedId);
        setHighlightAt(Date.now());

        // Jump to the page containing that row
        const targetPage = Math.floor(rowIndex / rowsPerPage);
        const currentPage = isExternal ? Math.max(0, (page || 1) - 1) : pageState;
        if (currentPage !== targetPage) {
          if (isExternal && typeof onPageChange === 'function') {
            onPageChange(targetPage + 1); // parent expects 1-based pages
          } else {
            setPageState(targetPage);
          }
        }

        // After pagination re-renders, scroll & ensure the CSS class is applied
        setTimeout(() => {
          const host = tableRef.current || document;
          const el = host.querySelector?.(`[data-row-id="${CSS.escape(wantedId)}"]`);
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            try {
              // Restart CSS animation by toggling class directly (in case it's already on)
              el.classList.remove('row-highlight');
              // force reflow to restart animation if needed
              // eslint-disable-next-line no-unused-expressions
              void el.offsetWidth;
              el.classList.add('row-highlight');
            } catch {}
          }
        }, 120);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('datatable:highlight handler error', e);
      }
    };
    window.addEventListener('datatable:highlight', handler);
    return () => window.removeEventListener('datatable:highlight', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, page, pageState, rowsPerPage, isExternal, onPageChange]);

  React.useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => {
      setHighlightId(null);
    }, 2000); // slightly longer than CSS animation to ensure visibility
    return () => clearTimeout(t);
  }, [highlightId, highlightAt]);

  React.useEffect(() => {
    const onDrawerClosed = () => {
      try {
        // If focus is inside the table, blur it to avoid scroll jumps
        const root = tableRef.current;
        if (root && root.contains(document.activeElement)) {
          try { document.activeElement.blur(); } catch {}
        }
        // Ensure any local scrollable container also resets
        try { if (root && typeof root.scrollTop === 'number') root.scrollTop = 0; } catch {}
      } catch {}
    };
    window.addEventListener('app:drawerClosed', onDrawerClosed);
    return () => window.removeEventListener('app:drawerClosed', onDrawerClosed);
  }, []);

  // Helper: clear default year if needed when another filter field is used (autoYear only)
  const clearDefaultYearIfNeeded = (updaterFn) => {
    const primaryDateCol = columns.find(isDateColumn);
    if (!primaryDateCol) {
      // No date columns in this table: still apply the updater so filters update
      setFilters(prev => (typeof updaterFn === 'function' ? updaterFn(prev) : prev));
      return;
    }
    const key = getAccessorKey(primaryDateCol);
    if (autoYear) {
      setFilters(prev => {
        const base = typeof updaterFn === 'function' ? updaterFn(prev) : { ...prev };
        if (!base) return prev;
        return {
          ...base,
          [`${key}__yearFull`]: '',
          [`${key}__year`]: '',
        };
      });
      setAutoYear(false);
    } else {
      if (typeof updaterFn === 'function') {
        setFilters(prev => updaterFn(prev));
      }
    }
  };

  return (
    <div
      ref={tableRef}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* Scrollable body area; header stays sticky inside the table */}
      <TableContainer
        component="div"
        sx={{
          flex: '1 1 auto',
          overflow: 'auto',
          maxHeight: containerProps?.maxHeight || '65vh',
        }}
        {...containerProps}
      >
        <Table
          size="small"
          aria-label="data table"
          className="custom-data-table"
          stickyHeader={stickyHeader}
          sx={{ tableLayout: 'fixed', width: '100%' }}
        >
          <TableHead>
            <TableRow>
              {columns.map((col, idx) => (
                <TableCell
                  key={idx}
                  align="center"
                  sx={{
                    position: stickyHeader ? 'sticky' : 'static',
                    top: stickyHeaderTop || 0,
                    zIndex: headerZIndex || 2,
                    backgroundColor: '#fff',
                    width: getColWidth(col),
                    minWidth: getColWidth(col),
                    maxWidth: getColWidth(col),
                  }}
                >
                  {String(col?.header || getAccessorString(col))}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.map((row, rIdx) => (
              <TableRow key={rIdx}>
                {columns.map((col, cIdx) => (
                  <TableCell
                    key={cIdx}
                    sx={{ width: getColWidth(col), minWidth: getColWidth(col), maxWidth: getColWidth(col) }}
                  >
                    {getRaw(row, col?.accessor)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Sticky footer with pagination */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          borderTop: '1px solid #eee',
        }}
      >
        <TablePagination
          component="div"
          count={isExternal ? total : working.length}
          page={isExternal ? Math.max(0, (page || 1) - 1) : pageState}
          onPageChange={(_e, newPage) => {
            if (isExternal && typeof onPageChange === 'function') {
              onPageChange(newPage + 1);
            } else {
              setPageState(newPage);
            }
          }}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            const newSize = Number(e.target.value) || rowsPerPage;
            if (isExternal && typeof onPageSizeChange === 'function') {
              onPageSizeChange(newSize);
            }
          }}
          rowsPerPageOptions={[50]}
        />
      </Box>
    </div>
  );
}