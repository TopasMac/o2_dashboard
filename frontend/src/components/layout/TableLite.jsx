import React, { forwardRef, useMemo, useRef, useLayoutEffect, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './TableLite.css';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableBody from '@mui/material/TableBody';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import Autocomplete from '@mui/material/Autocomplete';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import { PaperClipIcon } from '@heroicons/react/24/outline';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

import { formatDateDMY, formatMoney, capitalizeFirst } from '../../utils/formatters';
import DocumentPreview from '../common/DocumentPreview';
import O2Tooltip from '../common/O2Tooltip';

// Compact select with placeholder-like label (matches our DataTable look)

const URL_FIELD_CANDIDATES = ['url', 'href', 'link', 'documentUrl', 'document_url', 's3Url', 's3_url', 'publicUrl'];
const LABEL_FIELD_CANDIDATES = ['title', 'label', 'fileName', 'filename', 'name', 'documentName'];

const isUrlLikeString = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|\/|blob:|data:)/i.test(trimmed);
};

const pickFirstKey = (obj, candidates) => {
  if (!obj) return undefined;
  for (const key of candidates) {
    if (obj[key] != null) return obj[key];
  }
  return undefined;
};

const normalizeUrlEntries = (rawValue) => {
  if (!rawValue) return [];
  const toEntry = (url, label = '') => {
    if (!isUrlLikeString(url)) return null;
    return { url: url.trim(), label: (label || '').trim() };
  };
  if (Array.isArray(rawValue)) {
    const out = [];
    rawValue.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const entry = toEntry(item);
        if (entry) out.push(entry);
      } else if (typeof item === 'object') {
        const urlCandidate = pickFirstKey(item, URL_FIELD_CANDIDATES);
        const labelCandidate = pickFirstKey(item, LABEL_FIELD_CANDIDATES);
        const entry = toEntry(urlCandidate, labelCandidate);
        if (entry) out.push(entry);
      }
    });
    return out;
  }
  if (typeof rawValue === 'object') {
    const urlCandidate = pickFirstKey(rawValue, URL_FIELD_CANDIDATES);
    const labelCandidate = pickFirstKey(rawValue, LABEL_FIELD_CANDIDATES);
    const entry = toEntry(urlCandidate, labelCandidate);
    return entry ? [entry] : [];
  }
  if (typeof rawValue === 'string') {
    const entry = toEntry(rawValue);
    return entry ? [entry] : [];
  }
  return [];
};

const getAccessorValue = (row, accessor) => {
  if (!row || accessor == null) return undefined;
  if (typeof accessor === 'function') {
    try {
      return accessor(row);
    } catch {
      return undefined;
    }
  }
  if (typeof accessor === 'string' && accessor.length > 0) {
    if (accessor.includes('.')) {
      try {
        return accessor.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), row);
      } catch {
        return undefined;
      }
    }
    return row?.[accessor];
  }
  return undefined;
};

const resolveFilterAccessor = (col) =>
  col?.filter?.valueAccessor
  ?? col?.filter?.accessor
  ?? col?.accessor
  ?? col?.key;

const ensureFilterKey = (key, fallback) => {
  if (key != null && key !== '') {
    return typeof key === 'string' ? key : String(key);
  }
  if (fallback != null) {
    return typeof fallback === 'string' ? fallback : String(fallback);
  }
  return undefined;
};

const resolveFilterKey = (col, fallback) =>
  ensureFilterKey(
    col?.filter?.key
      ?? col?.filter?.filterKey
      ?? (typeof col?.accessor === 'string' ? col.accessor : undefined)
      ?? (typeof col?.key === 'string' ? col.key : undefined)
      ?? (typeof col?.header === 'string' ? col.header : undefined),
    fallback
  );

const getColumnFilterKey = (col) =>
  col?.__filterKey
  ?? resolveFilterKey(col);

/**
 * TableLite
 * A lightweight data table that does NOT render its own Card/Paper.
 * - Sticky header
 * - Scrollable body contained within this component
 * - Optional sticky footer for simple pagination controls
 *
 * Props
 *  - columns: [{ header, accessor, render?, width?, align?, cellStyle?, truncate? }]
 *  - rows: array of data items
 *  - loading: boolean
 *  - error: string | null
 *  - height: CSS height/maxHeight for the scroll area (default: calc(100vh - 280px))
 *  - dense: boolean (smaller row height)
 *  - page, pageSize, total: numbers for simple paging display
 *  - onPageChange: (nextPage) => void
 *  - autoFilter: boolean (default true) — if true, TableLite filters rows internally based on header filters
 *  - optionsSourceRows: array — optional master dataset to derive filter option lists from
 */
const TableLite = forwardRef(function TableLite(
  {
    columns = [],
    rows = [],
    loading = false,
    error = null,
    height = 'calc(100vh - 280px)',
    useParentScroll = false,
    dense = false,
    page = 0,
    pageSize = 50,
    total = 0,
    onPageChange,
    enableFilters = false,
    filterValues = {},
    onFilterChange,
    autoFilter = true,
    optionsSourceRows = null,
    defaultStringTransform = 'capitalizeFirst',
  },
  ref
)
{
  // If parent does not control filters, keep a local copy
  const [localFilterValues, setLocalFilterValues] = useState({});
  const effectiveFilterValues = onFilterChange ? (filterValues || {}) : localFilterValues;
  const [previewState, setPreviewState] = useState({ open: false, url: '', title: '' });

  const [colWidths, setColWidths] = useState({});
  const resizeStateRef = useRef(null);

  const [highlightId, setHighlightId] = useState(null);
  const highlightRowRef = useRef(null);

  const handleFilterChange = (key, value) => {
    if (key == null || key === '') return;
    if (onFilterChange) {
      onFilterChange(key, value);
    } else {
      setLocalFilterValues((prev) => {
        const next = { ...prev };
        if (value === '' || value === null || value === undefined) {
          delete next[key];
        } else {
          next[key] = value;
        }
        return next;
      });
    }
  };

  const handleResizeStart = (e, colId) => {
    const th = e.currentTarget.closest('th');
    const startWidth = th?.offsetWidth || 0;
    const fallback = 120;
    resizeStateRef.current = { colId, startX: e.clientX, startWidth: startWidth || fallback };
    e.preventDefault();
    e.stopPropagation();
  };

  const normalizedColumns = useMemo(() => {
    const seen = new Set();
    return (columns || [])
      .map((col, idx) => {
        if (!col) return col;
        const id = col.accessor || col.key;
        if (id && seen.has(id)) return null;
        if (id) seen.add(id);

        let nextCol = col;

        // Normalize legacy filter props into the new `filter` shape
        if (!col.filter) {
          const legacyProps = col.filterProps || {};
          const hasLegacyFilter = col.filterable
            || col.filterType
            || col.filterOptions
            || col.inlineFilter
            || col.filterPlaceholder
            || Object.keys(legacyProps).length > 0;
          if (hasLegacyFilter) {
            const {
              sx: legacySx,
              inline: legacyInline,
              placeholder: legacyPlaceholder,
              type: legacyType,
              inputMode: legacyInputMode,
              ...restLegacyProps
            } = legacyProps;
            let mappedType = col.filterType || legacyType;
            if (!mappedType) {
              mappedType = Array.isArray(col.filterOptions) ? 'select' : 'text';
            }
            let inputMode = legacyInputMode || col.filterInputMode;
            if (mappedType === 'number') {
              inputMode = inputMode || 'numeric';
              mappedType = 'text';
            }
            const isMonthYear = mappedType === 'monthYear';
            nextCol = {
              ...col,
              filter: {
                type: isMonthYear ? 'select' : mappedType,
                monthYear: isMonthYear,
                options: col.filterOptions,
                inline: col.inlineFilter ?? (legacyInline ?? false),
                placeholder: col.filterPlaceholder || legacyPlaceholder || col.header,
                getOptionLabel: col.getOptionLabel,
                sx: legacySx,
                inputMode,
                ...restLegacyProps,
              },
            };
          } else {
            nextCol = col;
          }
        } else {
          nextCol = col;
        }

        // Normalize money columns:
        // - type: 'currency' | 'money' or isMoney: true or format: 'money'
        // - default format to 'money' if not provided
        // - default align to 'right' if not provided
        // - default width/minWidth to 110px if not provided
        // - disable default string transform so numbers are not capitalized/etc.
        const isMoneyCol =
          nextCol.format === 'money'
          || nextCol.type === 'currency'
          || nextCol.type === 'money'
          || nextCol.isMoney;

        if (isMoneyCol) {
          nextCol = { ...nextCol };
          if (!nextCol.format) {
            nextCol.format = 'money';
          }
          if (!nextCol.align) {
            nextCol.align = 'right';
          }
          if (nextCol.width == null) {
            nextCol.width = 110;
          }
          if (nextCol.minWidth == null) {
            nextCol.minWidth = 110;
          }
          if (nextCol.disableDefaultStringTransform == null) {
            nextCol.disableDefaultStringTransform = true;
          }
        }

        const filterKey = resolveFilterKey(nextCol, `col-${idx}`);
        return {
          ...nextCol,
          __filterKey: filterKey,
        };
      })
      .filter(Boolean);
  }, [columns]);


  const canPrev = page > 0;
  const canNext = (page + 1) * pageSize < total;

  // Measure the footer so we always reserve the exact space at the bottom
  const footerRef = useRef(null);
  const [footerReserve, setFooterReserve] = useState(44); // px fallback

  // how much of the measured footer height we "give back" to move closer to the card bottom
  const FOOTER_TRIM_PX = 20; // tune globally from here
  const reservePad = Math.max(0, footerReserve - FOOTER_TRIM_PX);

  useLayoutEffect(() => {
    if (!footerRef.current) return;

    const el = footerRef.current;
    const update = () => {
      const h = el.offsetHeight || 0;
      // add a tiny breathing room (2px) so the last row never touches the footer
      setFooterReserve(h + 2);
    };

    update();

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } else {
      // fallback: update on window resize
      window.addEventListener('resize', update);
    }

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const handleMove = (e) => {
      const st = resizeStateRef.current;
      if (!st) return;
      const delta = e.clientX - st.startX;
      const next = Math.max(60, st.startWidth + delta);
      setColWidths((prev) => ({ ...prev, [st.colId]: next }));
    };
    const handleUp = () => {
      resizeStateRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!e || !e.detail) return;
      const rawId = e.detail.id;
      if (rawId === undefined || rawId === null) return;
      setHighlightId(rawId);
    };

    window.addEventListener('datatable:highlight', handler);
    return () => {
      window.removeEventListener('datatable:highlight', handler);
    };
  }, []);

  useEffect(() => {
    if (!highlightRowRef.current) return;
    if (highlightId === null || highlightId === undefined) return;

    try {
      highlightRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    } catch (e) {
      // fail silently if scrollIntoView is not available
    }
  }, [highlightId]);

  // --- Date utilities for global date-like filter options (YYYY-MM or YYYY-MM-DD) ---
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const ISO_DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

  const parseIsoDateLike = (s) => {
    if (typeof s !== 'string') return null;
    const m = s.match(ISO_DATE_RE);
    if (!m) return null;
    const y = Number(m[1]);
    const mm = Math.max(1, Math.min(12, Number(m[2] || '1')));
    const dd = Number(m[3] || '1'); // default to 1 for YYYY-MM
    // Use UTC to avoid TZ shifts
    const date = new Date(Date.UTC(y, mm - 1, dd));
    return { y, m: mm, d: dd, date };
  };

  const isDateLikeArray = (arr) => {
    if (!arr || arr.length === 0) return false;
    let checked = 0;
    let matched = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v === undefined || v === null) continue;
      checked++;
      if (parseIsoDateLike(String(v))) matched++;
      // quick exit if we have enough evidence
      if (checked >= 6) break;
    }
    return checked > 0 && matched === checked;
  };

  const formatDateLabel = ({ y, m /*, d */ }) => {
    // "11.Nov 25" style → <monthNumber>.<MonAbbr> <YY>
    const monNum = String(m); // no leading zero
    const monAbbr = MONTH_ABBR[m - 1] || String(m).padStart(2, '0');
    const yy = String(y).slice(-2);
    return `${monNum}.${monAbbr} ${yy}`;
  };

  const deriveDateOptions = (values) => {
    // values: array of raw strings like "2025-11" or "2025-11-03"
    const uniq = new Map(); // key = original string; val = parsed
    values.forEach((raw) => {
      const str = String(raw);
      if (uniq.has(str)) return;
      const parsed = parseIsoDateLike(str);
      if (parsed) uniq.set(str, parsed);
    });
    // sort DESC by date
    const sorted = Array.from(uniq.entries()).sort((a, b) => b[1].date - a[1].date);
    return sorted.map(([raw, parsed]) => ({ value: raw, label: formatDateLabel(parsed) }));
  };

  // Normalize select options: accepts ["A","B"] or [{label, value}]
  const toSelectOptions = (opts) =>
    (opts || []).map((o) =>
      typeof o === 'string'
        ? { label: o, value: o }
        : { label: o?.label ?? String(o?.value ?? ''), value: o?.value ?? o?.label ?? '' }
    );

  // Derive options for a column if not explicitly provided (for Select)
  const getFilterOptionsForColumn = (col) => {
    if (!col?.filter) return [];
    if (Array.isArray(col.filter.options) && col.filter.options.length) {
      return toSelectOptions(col.filter.options);
    }
    // Fallback: derive unique values from the full, unfiltered dataset (if provided), else from current rows
    const baseRows = optionsSourceRows || rows || [];
    const accessor = resolveFilterAccessor(col);
    const rawArr = (baseRows || []).map((r) => getAccessorValue(r, accessor))
      .filter((v) => v !== undefined && v !== null);
    const isMonthFilter = col.filter?.type === 'monthYear' || col.filter?.subtype === 'monthYear' || col.filter?.monthYear;
    if (isMonthFilter) {
      // Normalize to YYYY-MM keys, unique, and sort DESC
      const byMonth = new Map();
      rawArr.forEach((raw) => {
        const parsed = parseIsoDateLike(String(raw));
        if (!parsed) return;
        const key = `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
        if (!byMonth.has(key)) byMonth.set(key, parsed);
      });
      const sorted = Array.from(byMonth.entries()).sort((a, b) => b[1].date - a[1].date);
      return sorted.map(([ym, parsed]) => ({ value: ym, label: formatDateLabel(parsed) }));
    }
    // If this looks like a date column (ISO-like strings), format & sort (latest → earliest)
    if (isDateLikeArray(rawArr)) {
      return deriveDateOptions(rawArr);
    }
    const values = new Set(rawArr.map((v) => String(v)));
    return Array.from(values).sort().map((v) => ({ label: v, value: v }));
  };

  // Derive options for Autocomplete (prefer raw options if provided; else strings)
  const getAutocompleteOptionsForColumn = (col) => {
    if (!col?.filter) return [];
    if (Array.isArray(col.filter.options) && col.filter.options.length) {
      return col.filter.options;
    }
    const baseRows = optionsSourceRows || rows || [];
    const accessor = resolveFilterAccessor(col);
    const values = new Set(
      baseRows.map((r) => getAccessorValue(r, accessor))
        .filter((v) => v !== undefined && v !== null)
        .map((v) => String(v))
    );
    return Array.from(values).sort();
  };

  // Apply AND-style filters across all active header filters
  const applyFilters = (inputRows) => {
    if (!enableFilters) return inputRows || [];
    const active = Object.keys(effectiveFilterValues || {}).filter(
      (k) =>
        effectiveFilterValues[k] !== '' &&
        effectiveFilterValues[k] !== null &&
        effectiveFilterValues[k] !== undefined
    );
    if (!active.length) return inputRows || [];
    return (inputRows || []).filter((row) =>
      active.every((key) => {
        const col = normalizedColumns.find((c) => getColumnFilterKey(c) === key);
        if (!col) return true;
        const rawVal = getAccessorValue(row, resolveFilterAccessor(col));
        const fv = effectiveFilterValues[key];
        const type = col.filter?.type || 'select';
        const isMonthYear = !!col.filter?.monthYear;
        if (type === 'text' || type === 'autocomplete') {
          const hay = rawVal == null ? '' : String(rawVal).toLowerCase();
          const needle = String(fv).toLowerCase();
          return hay.includes(needle);
        }
        if (isMonthYear) {
          // Compare by YYYY-MM key regardless of raw day component
          const parsed = parseIsoDateLike(String(rawVal));
          if (!parsed) return false;
          const ym = `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
          return ym === String(fv);
        }
        // select -> exact match on stringified value
        return String(rawVal) === String(fv);
      })
    );
  };

  const filteredRows = useMemo(
    () => (autoFilter ? applyFilters(rows) : (rows || [])),
    [rows, autoFilter, enableFilters, effectiveFilterValues, normalizedColumns]
  );
  const displayRows = filteredRows;

  const rangeText = useMemo(() => {
    if (typeof onPageChange === 'function') {
      if (total <= 0) return '0 of 0';
      const start = page * pageSize + 1;
      const end = Math.min(total, (page + 1) * pageSize);
      return `${start}–${end} of ${total}`;
    }
    const baseCount = Array.isArray(optionsSourceRows) ? optionsSourceRows.length : (Array.isArray(rows) ? rows.length : 0);
    return `Showing ${displayRows.length} of ${baseCount}`;
  }, [onPageChange, total, page, pageSize, optionsSourceRows, rows, displayRows.length]);

  // --- Cell value formatting helpers (global rules) ---
  const ISO_DATE_FULL_RE = /^\d{4}-\d{2}(-\d{2})?(?:[T\s].*)?$/;
  const formatCellValue = (col, value, row) => {
    let v = value;
    // 1) Per-column formatter
    if (col && col.format) {
      if (typeof col.format === 'function') {
        v = col.format(value, row);
      } else {
        const kind = String(col.format);
        if (kind === 'date' || kind === 'dmy') v = formatDateDMY(value);
        else if (kind === 'money') v = formatMoney(value);
        else if (kind === 'capitalize') v = capitalizeFirst(value);
      }
    } else {
      // 2) Auto-date: ISO-like strings get dd-mm-yyyy
      if (typeof v === 'string' && ISO_DATE_FULL_RE.test(v)) {
        v = formatDateDMY(v);
      }
    }
    // 3) Default string transform (global), unless the column opts out
    if (
      typeof v === 'string'
      && defaultStringTransform
      && !col?.disableDefaultStringTransform
    ) {
      if (defaultStringTransform === 'capitalizeFirst') {
        v = capitalizeFirst(v);
      } else if (typeof defaultStringTransform === 'function') {
        v = defaultStringTransform(v, row, col);
      }
    }
    return v ?? '';
  };

  const openPreview = (url, title) => {
    if (!url) return;
    setPreviewState({ open: true, url, title: title || 'Document Preview' });
  };

  const closePreview = () => setPreviewState({ open: false, url: '', title: '' });

  return (
    <>
      <Box ref={ref} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, width: '100%', maxWidth: '100%', flex: 1, height: '100%' }}>
      {/* Scroll container that holds the table and provides the only scrollbar */}
      <Box
        sx={{
          position: 'relative',
          display: 'block',
          overflowY: useParentScroll ? 'visible' : 'auto',
          overflowX: 'auto',
          overscrollBehavior: 'contain',
          maxWidth: '100%',
          width: '100%',
          // when we own the scroll, constrain height so the header/footer can stick
          flex: useParentScroll ? '0 1 auto' : '1 1 auto',
          height: useParentScroll ? 'auto' : height,
          maxHeight: useParentScroll ? undefined : height,
          minHeight: 0,
          backgroundColor: 'transparent',
          boxSizing: 'border-box',
          borderRadius: 0,
          // reserve space under the table so the sticky footer never overlaps last row
          '--table-footer-offset': '2px', // visual overlap toward the card border
          paddingBottom: `calc(var(--page-content-padding-bottom, 0px) + ${reservePad}px)`,
          scrollPaddingBottom: `calc(var(--page-content-padding-bottom, 0px) + ${reservePad}px)`,
        }}
      >
        <Table
          size={dense ? 'small' : 'medium'}
          stickyHeader
          sx={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}
        >
          <TableHead
            sx={{
              position: 'sticky',
              top: useParentScroll ? 'var(--page-sticky-offset, 0px)' : 0,
              zIndex: 3,
              backgroundColor: (theme) => theme.palette.background.paper,
            }}
          >
            <TableRow sx={{ minWidth: 'auto' }}>
              {normalizedColumns.map((col, idx) => {
                const headerProps = col.headerProps || {};
                const { sx: headerSx, ...restHeaderProps } = headerProps;
                const widthValue = col.width != null
                  ? (typeof col.width === 'number' ? `${col.width}px` : col.width)
                  : undefined;
                const minWidthValue = col.minWidth != null
                  ? (typeof col.minWidth === 'number' ? `${col.minWidth}px` : col.minWidth)
                  : widthValue;
                const maxWidthValue = col.maxWidth != null
                  ? (typeof col.maxWidth === 'number' ? `${col.maxWidth}px` : col.maxWidth)
                  : widthValue;
                const controlWidthValue = (() => {
                  // Reserve horizontal space for cell padding (16px left + 16px right)
                  // plus a small safety margin so controls never touch the borders.
                  const reserved = 36; // 32px padding + 4px breathing room
                  if (maxWidthValue) {
                    if (typeof col.maxWidth === 'number') return `${Math.max(col.maxWidth - reserved, 24)}px`;
                    return `calc(${maxWidthValue} - ${reserved}px)`;
                  }
                  if (minWidthValue) {
                    if (typeof col.minWidth === 'number') return `${Math.max(col.minWidth - reserved, 24)}px`;
                    return `calc(${minWidthValue} - ${reserved}px)`;
                  }
                  if (widthValue) return `calc(${widthValue} - ${reserved}px)`;
                  return `calc(100% - ${reserved}px)`;
                })();
                return (
                  <TableCell
                    key={col.accessor || idx}
                    align={col.headerAlign || col.align || headerProps.align || 'left'}
                    {...restHeaderProps}
                    sx={{
                      fontWeight: 600,
                      fontSize: 14.5,
                      lineHeight: 1.4,
                      borderBottom: '1px solid #1E6F68',
                      // If a maxWidth is provided, treat it as the effective width cap
                      width: widthValue || maxWidthValue || minWidthValue,
                      minWidth: minWidthValue || maxWidthValue || widthValue,
                      maxWidth: maxWidthValue || widthValue || minWidthValue,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      py: 1,
                      px: 2,
                      ...col.headerStyle,
                      ...(headerSx || {}),
                    }}
                  >
                    {(() => {
                      const hasFilter = enableFilters && col.filter;
                      if (!hasFilter) {
                        return <Box component="span">{col.header}</Box>;
                      }
                      const filterLabel = col.filter?.label || col.header;
                      const filterKey = getColumnFilterKey(col);
                      const rawValue = filterKey ? effectiveFilterValues?.[filterKey] : undefined;
                      const normalizedValue = rawValue == null ? '' : rawValue;
                      const controlWidthSx = controlWidthValue ? { width: controlWidthValue, maxWidth: controlWidthValue } : {};
                      const controlStyle = controlWidthValue ? { width: controlWidthValue } : undefined;

                      // --- Select filters -> minimal inline select with chevron ---
                      if (col.filter.type === 'select') {
                        const opts = getFilterOptionsForColumn(col);
                        const current = normalizedValue === null || normalizedValue === undefined
                          ? ''
                          : String(normalizedValue);

                        // --- MonthYear logic for styling current month option ---
                        const isMonthYear = col.filter?.type === 'monthYear'
                          || col.filter?.subtype === 'monthYear'
                          || col.filter?.monthYear;

                        let currentYm = null;
                        if (isMonthYear) {
                          const now = new Date();
                          const y = now.getFullYear();
                          const m = String(now.getMonth() + 1).padStart(2, '0');
                          currentYm = `${y}-${m}`;
                        }

                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', width: controlWidthValue || '100%', gap: 0.5 }}>
                            <FormControl
                              variant="standard"
                              size="small"
                              sx={{
                                flex: '1 1 auto',
                                minWidth: 0,
                                width: '100%',
                                ...(col.filter.sx || {}),
                              }}
                              {...(col.filter.formControlProps || {})}
                            >
                              <Select
                                displayEmpty
                                value={current}
                                onChange={(e) => {
                                  const nextVal = e.target.value ?? '';
                                  handleFilterChange(filterKey, nextVal);
                                }}
                                inputProps={{ 'aria-label': col.header }}
                                renderValue={(selected) => {
                                  if (selected === '' || selected == null) {
                                    return (
                                      <Box component="span" sx={{ color: 'text.secondary' }}>
                                        {filterLabel}
                                      </Box>
                                    );
                                  }
                                  const hit = opts.find((o) => String(o.value) === String(selected));
                                  return hit ? hit.label : String(selected);
                                }}
                                {...(col.filter.selectProps || {})}
                                sx={{
                                  minWidth: 0,
                                  width: '100%',
                                }}
                              >
                                <MenuItem value="">
                                  <Box component="span" sx={{ color: 'text.secondary' }}>
                                    {filterLabel}
                                  </Box>
                                </MenuItem>
                                {opts.map((opt) => {
                                  const isCurrentMonth = isMonthYear && currentYm && String(opt.value) === String(currentYm);
                                  return (
                                    <MenuItem
                                      key={`${filterKey}-${String(opt.value)}`}
                                      value={opt.value}
                                      sx={
                                        isCurrentMonth
                                          ? {
                                              backgroundColor: '#1E6F68',
                                              color: '#ffffff',
                                              fontWeight: 600,
                                              '&:hover': {
                                                backgroundColor: '#15524E',
                                              },
                                            }
                                          : undefined
                                      }
                                    >
                                      {opt.label}
                                    </MenuItem>
                                  );
                                })}
                              </Select>
                            </FormControl>

                            {current !== '' && (
                              <IconButton
                                size="small"
                                aria-label="Clear filter"
                                sx={{ p: 0.25, flex: '0 0 auto', color: '#94a3b8' }}
                                onMouseDown={(ev) => {
                                  // prevent Select from opening when clicking the X
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                }}
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  handleFilterChange(filterKey, '');
                                }}
                              >
                                <ClearRoundedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        );
                      }

                      if (col.filter.type === 'autocomplete') {
                        const opts = getAutocompleteOptionsForColumn(col);
                        const currentRaw = normalizedValue || null;
                        const valueObj = (() => {
                          if (currentRaw == null || currentRaw === '') return null;
                          const found = opts.find((o) => {
                            if (o && typeof o === 'object') {
                              return (
                                String(o.value) === String(currentRaw) ||
                                String(o.label) === String(currentRaw)
                              );
                            }
                            return String(o) === String(currentRaw);
                          });
                          return found ?? (opts.includes(currentRaw) ? currentRaw : null);
                        })();

                        return (
                          <Autocomplete
                            size="small"
                            options={opts}
                            sx={{
                              width: '100%',
                              minWidth: 0,
                              ...(col.filter.sx || {}),
                            }}
                            openOnFocus
                            autoHighlight
                            forcePopupIcon
                            popupIcon={<ArrowDropDownIcon fontSize="small" />}
                            getOptionLabel={col.filter.getOptionLabel || ((o) => {
                              if (o == null) return '';
                              if (typeof o === 'object') return String(o.label ?? o.value ?? '');
                              return String(o);
                            })}
                            isOptionEqualToValue={(option, value) => {
                              if (option == null || value == null) return option === value;
                              if (typeof option === 'object' && typeof value === 'object') {
                                return String(option.value ?? option.label) === String(value.value ?? value.label);
                              }
                              return String(option) === String(value) || String(option.value ?? option.label ?? option) === String(value);
                            }}
                            value={valueObj}
                            onChange={(_, v) => {
                              let val = '';
                              if (v == null) val = '';
                              else if (typeof v === 'object') {
                                val = v.value !== undefined ? v.value : (v.label !== undefined ? v.label : '');
                              } else {
                                val = v;
                              }
                              handleFilterChange(filterKey, val);
                            }}
                            onInputChange={(_, inputVal, reason) => {
                              // Keep filter in sync with what the user types.
                              // Avoid stomping value during internal resets.
                              if (reason === 'reset') return;
                              handleFilterChange(filterKey, inputVal ?? '');
                            }}
                            clearIcon={<ClearRoundedIcon fontSize="small" />}
                            {...(col.filter.autocompleteProps || {})}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label=""
                                placeholder={filterLabel}
                                variant="standard"
                                size="small"
                                sx={{
                                  width: '100%',
                                  minWidth: 0,
                                  ...(col.filter.sx || {}),
                                }}
                              />
                            )}
                          />
                        );
                      }

                      const showClear = Boolean(normalizedValue);
                      return (
                        <TextField
                          size="small"
                          variant="standard"
                          placeholder={filterLabel}
                          label=""
                          sx={{ width: controlWidthValue || '100%', ...(col.filter.sx || {}) }}
                          value={normalizedValue}
                          onChange={(e) => handleFilterChange(filterKey, e.target.value ?? '')}
                          inputMode={col.filter.inputMode}
                          type={col.filter.inputType || col.filter.htmlInputType || 'text'}
                          inputProps={col.filter.inputProps}
                          InputProps={{
                            ...(col.filter.InputProps || {}),
                            endAdornment: showClear ? (
                              <IconButton
                                size="small"
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  handleFilterChange(filterKey, '');
                                }}
                                sx={{ color: '#94a3b8' }}
                              >
                                <ClearRoundedIcon fontSize="small" />
                              </IconButton>
                            ) : null,
                          }}
                          {...(col.filter.textFieldProps || {})}
                        />
                      );
                    })()}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow sx={{ minWidth: 'auto' }}>
                <TableCell colSpan={normalizedColumns.length} sx={{ py: 6, textAlign: 'center', minWidth: 'auto' }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}

            {!loading && error && (
              <TableRow sx={{ minWidth: 'auto' }}>
                <TableCell colSpan={normalizedColumns.length} sx={{ py: 3, color: 'error.main', minWidth: 'auto' }}>
                  {error}
                </TableCell>
              </TableRow>
            )}

            {!loading && !error && displayRows.length === 0 && (
              <TableRow sx={{ minWidth: 'auto' }}>
                <TableCell colSpan={normalizedColumns.length} sx={{ py: 3, color: 'text.secondary', minWidth: 'auto' }}>
                  No data
                </TableCell>
              </TableRow>
            )}

            {!loading && !error &&
              displayRows.map((row, rIdx) => {
                const rowDomId = row?.id ?? row?.rowId ?? row?.uuid ?? row?.bookingId ?? undefined;
                const isHighlighted =
                  highlightId !== null &&
                  highlightId !== undefined &&
                  rowDomId !== undefined &&
                  String(rowDomId) === String(highlightId);

                return (
                  <TableRow
                    key={rowDomId || rIdx}
                    hover
                    ref={isHighlighted ? highlightRowRef : null}
                    sx={{
                      minWidth: 'auto',
                      ...(isHighlighted
                        ? {
                            backgroundColor: 'rgba(245, 124, 0, 0.12)', // soft orange highlight
                            transition: 'background-color 0.25s ease-in-out',
                          }
                        : {}),
                    }}
                    data-row-id={rowDomId}
                  >
                  {normalizedColumns.map((col, cIdx) => {
                    const cellProps = col.cellProps || {};
                    const { sx: cellSx, ...restCellProps } = cellProps;
                    const widthValue = col.width != null
                      ? (typeof col.width === 'number' ? `${col.width}px` : col.width)
                      : undefined;
                    const minWidthValue = col.minWidth != null
                      ? (typeof col.minWidth === 'number' ? `${col.minWidth}px` : col.minWidth)
                      : widthValue;
                    const maxWidthValue = col.maxWidth != null
                      ? (typeof col.maxWidth === 'number' ? `${col.maxWidth}px` : col.maxWidth)
                      : widthValue;
                    const value = typeof col.accessor === 'function'
                      ? col.accessor(row)
                      : row[col.accessor];
                    const isReactElementValue = React.isValidElement(value);
                    const shouldTruncate = (col.truncate !== false) && !isReactElementValue;
                    const shouldShowTooltip =
                      col.tooltip === true
                      || (col.tooltip !== false && shouldTruncate);
                    const autoUrlEntries = !col.render ? normalizeUrlEntries(value) : [];
                    const isIconRow = autoUrlEntries.length > 0;
                    const explicitWhiteSpace = (cellSx && cellSx.whiteSpace) || (col.cellStyle && col.cellStyle.whiteSpace);
                    const allowsWrap = explicitWhiteSpace ? explicitWhiteSpace !== 'nowrap' : !shouldTruncate;
                    // Slightly tighter vertical padding; still give multi-line cells a touch more space
                    const basePy = allowsWrap ? 1.3 : 1.1;
                    return (
                      <TableCell
                        key={col.accessor || cIdx}
                        align={col.align || cellProps.align || 'left'}
                        {...restCellProps}
                        sx={{
                          whiteSpace: shouldTruncate ? 'nowrap' : 'normal',
                          overflow: shouldTruncate ? 'hidden' : 'visible',
                          textOverflow: shouldTruncate ? 'ellipsis' : 'clip',
                          // Enforce maxWidth by also using it as the effective width when provided
                          width: widthValue || maxWidthValue || minWidthValue,
                          minWidth: minWidthValue || maxWidthValue || widthValue,
                          maxWidth: maxWidthValue || widthValue || minWidthValue,
                          fontSize: 14.5,
                          lineHeight: 1.5,
                          py: basePy,
                          px: 2,
                          ...(isIconRow ? { py: basePy } : {}),
                          ...col.cellStyle,
                          ...(cellSx || {}),
                        }}
                      >
                        {(() => {
                          let rendered;

                          // Highest precedence: explicit col.cell(row, value, rowIndex)
                          if (typeof col.cell === 'function') {
                            rendered = col.cell(row, value, rIdx);
                          } else if (col.render) {
                            // Backwards-compat: legacy render(value, row)
                            rendered = col.render(value, row);
                          } else if (autoUrlEntries.length) {
                            rendered = (
                              <Box
                                component="span"
                                sx={{ display: 'inline-flex', gap: 0.25 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                {autoUrlEntries.map((entry, entryIdx) => {
                                  const labelSource = entry.label || col.header || 'Document';
                                  const title = autoUrlEntries.length > 1
                                    ? `${labelSource} ${entryIdx + 1}`
                                    : labelSource;
                                  return (
                                    <IconButton
                                      key={`${entry.url}-${entryIdx}`}
                                      size="small"
                                      aria-label={`Preview document ${entryIdx + 1}`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openPreview(entry.url, title);
                                      }}
                                      sx={{
                                        color: '#1E6F68',
                                        p: 0.25,
                                        '&:hover': { color: 'orange' },
                                      }}
                                    >
                                      <PaperClipIcon style={{ width: 18, height: 18 }} />
                                    </IconButton>
                                  );
                                })}
                              </Box>
                            );
                          } else {
                            rendered = formatCellValue(col, value, row);
                          }

                          // Option A: special shape for two-line cells.
                          // Supports both legacy { top, bottom } and semantic { primary, meta }.
                          // Renders primary on top, meta on bottom.
                          // Also supports the hybrid tooltip behavior by default when truncated.
                          if (
                            rendered
                            && typeof rendered === 'object'
                            && !React.isValidElement(rendered)
                            && (
                              'primary' in rendered
                              || 'meta' in rendered
                              || 'top' in rendered
                              || 'bottom' in rendered
                            )
                          ) {
                            const primary = rendered.primary ?? rendered.bottom ?? '';
                            const meta = rendered.meta ?? rendered.top ?? '';

                            const variantClass = col.twoLineClassName ? ` ${col.twoLineClassName}` : '';

                            const twoLineEl = (
                              <div className={`o2-cell-two-line${variantClass}`}>
                                {primary ? <div className="o2-cell-primary">{primary}</div> : null}
                                {meta ? <div className="o2-cell-meta">{meta}</div> : null}
                              </div>
                            );

                            if (shouldShowTooltip && shouldTruncate) {
                              const primaryText = primary == null ? '' : String(primary);
                              const metaText = meta == null ? '' : String(meta);

                              const hasPrimary = Boolean(String(primaryText).trim());
                              const hasMeta = Boolean(String(metaText).trim());

                              if (hasPrimary || hasMeta) {
                                const tooltipNode = (
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 0.5,
                                      maxWidth: 520,
                                      whiteSpace: 'normal',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {hasPrimary ? (
                                      <Box component="div" sx={{ fontWeight: 600 }}>
                                        {primaryText}
                                      </Box>
                                    ) : null}
                                    {hasMeta ? (
                                      <Box component="div">
                                        {metaText}
                                      </Box>
                                    ) : null}
                                  </Box>
                                );

                                return (
                                  <O2Tooltip title={tooltipNode} placement="top">
                                    <Box component="span" sx={{ display: 'inline-block', maxWidth: '100%' }}>
                                      {twoLineEl}
                                    </Box>
                                  </O2Tooltip>
                                );
                              }
                            }

                            return twoLineEl;
                          }

                          // Hybrid tooltip: show tooltip for truncated cells by default,
                          // unless explicitly disabled; also allow forcing tooltip via col.tooltip=true.
                          // Only wrap primitive text/number values (avoid wrapping complex JSX).
                          if (
                            shouldShowTooltip
                            && shouldTruncate
                            && rendered !== null
                            && rendered !== undefined
                            && !React.isValidElement(rendered)
                            && (typeof rendered === 'string' || typeof rendered === 'number')
                          ) {
                            const tooltipText = String(rendered);
                            if (tooltipText.trim()) {
                              return (
                                <O2Tooltip title={tooltipText} placement="top">
                                  <Box component="span" sx={{ display: 'inline-block', maxWidth: '100%' }}>
                                    {tooltipText}
                                  </Box>
                                </O2Tooltip>
                              );
                            }
                          }

                          return rendered;
                        })()}
                      </TableCell>
                    );
                  })}
                </TableRow>
                );
              })}
          </TableBody>
        </Table>

        {/* Sticky footer bar (sits inside the same scroll area so it stays visible) */}
        <Box
          ref={footerRef}
          sx={{
            position: 'sticky',
            bottom: 'calc(var(--table-footer-offset) * -1 - var(--page-content-padding-bottom, 0px))',
            left: 0,
            right: 0,
            top: 'auto',
            backgroundColor: (theme) => theme.palette.background.paper,
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
            boxShadow: (theme) => `0 -1px 2px ${theme.palette.action.disabledBackground}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            px: 2,
            py: 0.5, // tighter vertical padding for a lower look
            zIndex: 3,
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: '-6px',
              height: '6px',
              backgroundColor: (theme) => theme.palette.background.paper,
              pointerEvents: 'none',
            },
          }}
        >
          <Box sx={{ mr: 'auto', color: 'text.secondary', fontSize: 13 }}>{rangeText}</Box>
          {typeof onPageChange === 'function' && (
            <>
              <Button
                size="small"
                variant="text"
                disabled={!canPrev}
                onClick={() => onPageChange(page - 1)}
              >
                Prev
              </Button>
              <Button
                size="small"
                variant="text"
                disabled={!canNext}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Box>
    <Dialog
      open={previewState.open}
      onClose={closePreview}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box component="span">{previewState.title || 'Document Preview'}</Box>
        {previewState.url && (
          <Button
            size="small"
            onClick={() => {
              try { window.open(previewState.url, '_blank', 'noopener'); } catch (_) {}
            }}
          >
            Open in new tab
          </Button>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {previewState.url ? (
          <DocumentPreview url={previewState.url} style={{ height: '80vh' }} />
        ) : (
          <Box sx={{ p: 2, color: 'text.secondary' }}>No document selected.</Box>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
});

TableLite.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      header: PropTypes.node.isRequired,
      accessor: PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
      render: PropTypes.func,
      cell: PropTypes.func,
      width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      align: PropTypes.oneOf(['left', 'center', 'right', 'justify', 'inherit']),
      headerAlign: PropTypes.oneOf(['left', 'center', 'right', 'justify', 'inherit']),
      cellStyle: PropTypes.object,
      headerStyle: PropTypes.object,
      truncate: PropTypes.bool,
      tooltip: PropTypes.bool,
      twoLineClassName: PropTypes.string,
      filter: PropTypes.shape({
        type: PropTypes.oneOf(['select', 'autocomplete', 'text']),
        options: PropTypes.array,
        getOptionLabel: PropTypes.func,
        inputMode: PropTypes.string,
        inline: PropTypes.bool,
        placeholder: PropTypes.string,
      }),
      format: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
      type: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
      isMoney: PropTypes.bool,
      disableDefaultStringTransform: PropTypes.bool,
    })
  ).isRequired,
  rows: PropTypes.array,
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  useParentScroll: PropTypes.bool,
  dense: PropTypes.bool,
  page: PropTypes.number,
  pageSize: PropTypes.number,
  total: PropTypes.number,
  onPageChange: PropTypes.func,
  enableFilters: PropTypes.bool,
  filterValues: PropTypes.object,
  onFilterChange: PropTypes.func,
  autoFilter: PropTypes.bool,
  // Optional master dataset used to derive filter option lists globally (so options don't shrink after filtering)
  optionsSourceRows: PropTypes.array,
  defaultStringTransform: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
};

export default TableLite;
