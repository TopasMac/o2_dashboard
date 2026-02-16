import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Autocomplete from '@mui/material/Autocomplete';
import Tooltip from '@mui/material/Tooltip';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Checkbox from '@mui/material/Checkbox';

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SaveIcon from '@mui/icons-material/Save';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import api from '../../api';
import { toast } from 'react-toastify';

/**
 * HKReconMonthNotesPanel
 * Reusable content panel for Month Notes.
 *
 * Props:
 * - city: string
 * - month: YYYY-MM
 * - focusHkCleaningId?: number | null (optional: auto-expand matching note)
 * - onChanged?: () => void (optional: notify parent to refresh badge)
 */
export default function HKReconMonthNotesPanel({
  city,
  month,
  focusHkCleaningId = null,
  onChanged = null,
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const originalRef = useRef([]);

  const [filter, setFilter] = useState('all'); // all | pending(open) | solved(done)

  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  const [savingByKey, setSavingByKey] = useState(() => ({}));
  const [deletingId, setDeletingId] = useState(null);

  // Units (for autocomplete)
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  // New note header inputs
  const [newText, setNewText] = useState('');
  const [newUnitId, setNewUnitId] = useState(null);

  // Bookings context per row
  const [bookingsByKey, setBookingsByKey] = useState(() => ({}));
  const [bookingsLoadingByKey, setBookingsLoadingByKey] = useState(() => ({}));
  const [bookingsErrorByKey, setBookingsErrorByKey] = useState(() => ({}));
  const [unitSavingByKey, setUnitSavingByKey] = useState(() => ({}));

  const rowKey = useCallback((it) => (it?.id ?? it?._tmpId ?? ''), []);

  const getBaselineRow = useCallback((row) => {
    if (!row?.id) return null;
    const arr = Array.isArray(originalRef.current) ? originalRef.current : [];
    return arr.find((x) => Number(x?.id) === Number(row.id)) || null;
  }, []);

  const isRowDirty = useCallback((row) => {
    // New rows are always considered dirty until persisted.
    if (!row?.id) return true;

    const base = getBaselineRow(row);
    if (!base) return true;

    const norm = (v) => (v == null ? '' : String(v));
    const normNum = (v) => (v == null || v === '' ? null : Number(v));
    const normLower = (v) => norm(v).trim().toLowerCase();

    const curUnit = normNum(row.unit_id);
    const baseUnit = normNum(base.unit_id);

    return (
      curUnit !== baseUnit ||
      norm(row.text) !== norm(base.text) ||
      normLower(row.status) !== normLower(base.status) ||
      norm(row.resolution) !== norm(base.resolution)
    );
  }, [getBaselineRow]);

  const isExpanded = useCallback(
    (key) => {
      return expandedKeys.has(key);
    },
    [expandedKeys]
  );

  const toggleExpanded = useCallback((key) => {
    setExpandedKeys((prev) => {
      const had = prev.has(key);
      if (had) return new Set();
      return new Set([key]);
    });
  }, []);

  const fmtDdMm = useCallback((iso) => {
    if (!iso) return '';
    const s = String(iso);
    // expected: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const dd = s.slice(8, 10);
      const mm = s.slice(5, 7);
      return `${dd}/${mm}`;
    }
    return s;
  }, []);

  const applyNewUnitPrefix = useCallback((unitName) => {
    const name = String(unitName || '').trim();
    if (!name) return;

    setNewText((prev) => {
      const cur = String(prev || '');
      const trimmed = cur.trim();
      const prefix = `${name} * `;

      if (!trimmed) return prefix;
      if (cur.toLowerCase().startsWith(prefix.toLowerCase())) return cur;

      const m = cur.match(/^\s*([^*\n]{1,60})\s*\*\s*/);
      if (m) {
        const rest = cur.replace(/^\s*([^*\n]{1,60})\s*\*\s*/, '');
        return prefix + rest;
      }

      return prefix + cur;
    });
  }, []);

  const loadUnits = useCallback(async () => {
    if (!city) return;
    setUnitsLoading(true);
    try {
      const q = new URLSearchParams({ city }).toString();
      const res = await api.get(`/api/units/options?${q}`);
      const data = res?.data;
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      const mapped = arr
        .map((u) => ({
          id: u?.id ?? null,
          unitName: u?.unit_name ?? u?.unitName ?? '',
          city: u?.city ?? '',
        }))
        .filter((u) => Number(u.id) > 0 && String(u.unitName || '').trim() !== '');

      mapped.sort((a, b) => String(a.unitName).localeCompare(String(b.unitName)));
      setUnits(mapped);
    } catch (e) {
      // ignore
    } finally {
      setUnitsLoading(false);
    }
  }, [city]);

  const fetchNotes = useCallback(async () => {
    if (!city || !month) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ city, month }).toString();
      const res = await api.get(`/api/hk-reconcile/notes?${q}`);
      const data = res?.data;
      const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setItems(arr);
      originalRef.current = arr;

      // auto-expand matching note (if requested)
      if (focusHkCleaningId) {
        const found = arr.find((x) => Number(x.hk_cleaning_id) === Number(focusHkCleaningId));
        if (found) {
          const k = rowKey(found);
          setExpandedKeys(new Set([k]));
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [city, month, focusHkCleaningId, rowKey]);

  const fetchReconBookings = useCallback(async (key, unitId) => {
    if (!month || !unitId) return;

    setBookingsLoadingByKey((prev) => ({ ...prev, [key]: true }));
    setBookingsErrorByKey((prev) => ({ ...prev, [key]: null }));
    try {
      const q = new URLSearchParams({ mode: 'recon', month, unitId: String(unitId) }).toString();
      const res = await api.get(`/api/bookings?${q}`);
      const data = res?.data;
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setBookingsByKey((prev) => ({ ...prev, [key]: arr }));
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      setBookingsErrorByKey((prev) => ({ ...prev, [key]: msg }));
    } finally {
      setBookingsLoadingByKey((prev) => ({ ...prev, [key]: false }));
    }
  }, [month]);

  const autoSaveUnitId = useCallback(async (key, noteId, unitId) => {
    if (!noteId) return;
    setUnitSavingByKey((prev) => ({ ...prev, [key]: true }));
    try {
      await api.put(`/api/hk-reconcile/notes/${noteId}`, { unit_id: unitId });

      originalRef.current = (originalRef.current || []).map((x) => (x.id === noteId ? { ...x, unit_id: unitId } : x));

      setBookingsByKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (unitId) {
        fetchReconBookings(key, unitId);
      }

      toast.success('Unit saved');
      onChanged?.();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
    } finally {
      setUnitSavingByKey((prev) => ({ ...prev, [key]: false }));
    }
  }, [fetchReconBookings, onChanged]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const filteredItems = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    if (filter === 'pending') {
      return arr.filter((it) => String(it?.status ?? '').toLowerCase() === 'open');
    }
    if (filter === 'solved') {
      return arr.filter((it) => String(it?.status ?? '').toLowerCase() === 'done');
    }
    return arr;
  }, [items, filter]);

  const addItem = useCallback(() => {
    const txt = String(newText || '').trim();
    if (!txt) {
      toast.error('Enter a note');
      return;
    }

    const tmpId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    setItems((prev) => [
      ...prev,
      {
        _tmpId: tmpId,
        id: null,
        city,
        month,
        hk_cleaning_id: null,
        unit_id: newUnitId ?? null,
        text: txt,
        status: 'open',
        resolution: '',
        resolved_at: null,
        resolved_by_user_id: null,
      },
    ]);

    setExpandedKeys(new Set([tmpId]));

    if (newUnitId) {
      fetchReconBookings(tmpId, newUnitId);
    }

    setTimeout(() => {
      try {
        const el = document.getElementById(`hk-note-${tmpId}`);
        el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      } catch {
        // ignore
      }
    }, 0);

    setNewText('');
    setNewUnitId(null);
  }, [newText, city, month, newUnitId, fetchReconBookings]);

  const saveRow = useCallback(async (row) => {
    const key = rowKey(row);
    setSavingByKey((prev) => ({ ...prev, [key]: true }));
    try {
      if (!row.id) {
        // create
        const payload = {
          city,
          month,
          hk_cleaning_id: row.hk_cleaning_id ?? null,
          unit_id: row.unit_id ?? null,
          text: row.text ?? '',
          status: row.status ?? 'open',
          resolution: row.resolution ?? '',
        };
        const res = await api.post('/api/hk-reconcile/notes', payload);
        const created = res?.data?.data ?? res?.data;

        // Replace tmp row with created row
        setItems((prev) =>
          prev.map((x) => {
            if (rowKey(x) !== key) return x;
            return created;
          })
        );

        // update original snapshot
        originalRef.current = [...(originalRef.current || []), created];

        toast.success('Saved');
        onChanged?.();
        return true;
      }

      // update
      const patch = {
        unit_id: row.unit_id ?? null,
        text: row.text ?? '',
        status: row.status ?? 'open',
        resolution: row.resolution ?? '',
      };
      await api.put(`/api/hk-reconcile/notes/${row.id}`, patch);

      originalRef.current = (originalRef.current || []).map((x) => (x.id === row.id ? { ...x, ...patch } : x));

      toast.success('Saved');
      onChanged?.();
      return true;
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
      return false;
    } finally {
      setSavingByKey((prev) => ({ ...prev, [key]: false }));
    }
  }, [city, month, rowKey, onChanged]);

  const deleteRow = useCallback(async (row) => {
    if (!row?.id) {
      // just remove temp
      setItems((prev) => prev.filter((x) => rowKey(x) !== rowKey(row)));
      return;
    }

    setDeletingId(row.id);
    try {
      await api.delete(`/api/hk-reconcile/notes/${row.id}`);
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      originalRef.current = (originalRef.current || []).filter((x) => x.id !== row.id);
      toast.success('Deleted');
      onChanged?.();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  }, [rowKey, onChanged]);

  const setRowField = useCallback((row, patch) => {
    const k = rowKey(row);
    setItems((prev) => prev.map((x) => (rowKey(x) === k ? { ...x, ...patch } : x)));
  }, [rowKey]);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: '#fff',
        }}
      >
      {/* Sticky header (Add row + filters) */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: '#fff',
          // Ensure underlying scrolled content never shows through
          backdropFilter: 'blur(0px)',
          borderBottom: '1px solid #e5e7eb',
          px: 2,
          pt: 0.5,
          pb: 0.75,
        }}
      >
        <Stack spacing={0.5} sx={{ mb: 0 }}>
          {/* Row 1: Unit selector */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Autocomplete
              size="small"
              options={units}
              loading={unitsLoading}
              value={units.find((u) => Number(u.id) === Number(newUnitId)) || null}
              getOptionLabel={(opt) => (opt?.unitName ? String(opt.unitName) : '')}
              isOptionEqualToValue={(a, b) => Number(a?.id) === Number(b?.id)}
              onChange={(e, opt) => {
                const nextId = opt?.id ? Number(opt.id) : null;
                setNewUnitId(nextId);
                if (opt?.unitName) {
                  applyNewUnitPrefix(opt.unitName);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={unitsLoading ? 'Units…' : 'Unit…'}
                  disabled={loading}
                  sx={{ width: 160 }}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {unitsLoading ? <CircularProgress color="inherit" size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            <Box sx={{ flex: 1 }} />
          </Stack>

          {/* Row 2: Add note + Add button (aligned to left edge) */}
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Add a note…"
              size="small"
              disabled={loading}
              sx={{ flex: 1, minWidth: 220 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem();
                }
              }}
            />

            <Button variant="contained" size="small" onClick={addItem} disabled={loading} sx={{ minWidth: 72 }}>
              Add
            </Button>
          </Stack>

          {/* Row 3: Filters */}
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              value={filter}
              exclusive
              onChange={(e, v) => {
                if (!v) return;
                setFilter(v);
              }}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 400,
                  border: 'none',
                  backgroundColor: 'transparent',
                  px: 0.5,
                  minWidth: 'auto',
                  color: '#6b7280',
                  '&:hover': { backgroundColor: 'transparent' },
                  '&:not(:last-of-type)::after': {
                    content: '" |"',
                    display: 'inline-block',
                    marginLeft: '6px',
                    color: '#9ca3af',
                    fontWeight: 400,
                  },
                },
                '& .MuiToggleButton-root.Mui-selected': {
                  fontWeight: 700,
                  backgroundColor: 'transparent',
                },
              }}
            >
              <ToggleButton
                value="all"
                aria-label="All"
                sx={{
                  '&.Mui-selected': {
                    color: '#111827',
                    backgroundColor: 'transparent',
                  },
                }}
              >
                All
              </ToggleButton>

              <ToggleButton
                value="pending"
                aria-label="Open"
                sx={{
                  '&.Mui-selected': {
                    color: '#f59e0b',
                    backgroundColor: 'transparent',
                  },
                }}
              >
                Open
              </ToggleButton>

              <ToggleButton
                value="solved"
                aria-label="Solved"
                sx={{
                  '&.Mui-selected': {
                    color: 'var(--color-teal)',
                    backgroundColor: 'transparent',
                  },
                }}
              >
                Solved
              </ToggleButton>
            </ToggleButtonGroup>

            <Box sx={{ flex: 1 }} />
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ height: 4 }} />

      {loading ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={22} />
        </Box>
      ) : null}

      {!loading && filteredItems.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No notes.
        </Typography>
      ) : null}

      <Stack spacing={1} sx={{ px: 2, pb: 2 }}>
        {filteredItems.map((it) => {
          const key = rowKey(it);
          const expanded = isExpanded(key);
          const done = String(it?.status ?? '').toLowerCase() === 'done';
          const busy = !!savingByKey[key] || (deletingId != null && deletingId === it.id) || !!unitSavingByKey[key];

          const unitOpt = units.find((u) => Number(u.id) === Number(it.unit_id)) || null;
          const bookings = bookingsByKey[key] || null;
          const bookingsLoading = !!bookingsLoadingByKey[key];
          const bookingsError = bookingsErrorByKey[key];

          return (
            <Box
              key={key}
              id={`hk-note-${key}`}
              sx={{
                border: '1px solid #e5e7eb',
                borderRadius: 2,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              {/* Row header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1.5,
                  py: 1,
                  gap: 1,
                  background: done ? '#f0fdfa' : '#fff7ed',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                    {it.text || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {it.updated_at ? `Updated ${it.updated_at}` : ''}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
                    <IconButton size="small" onClick={() => {
                      toggleExpanded(key);
                      if (!expanded && it.unit_id) {
                        fetchReconBookings(key, it.unit_id);
                      }
                    }}>
                      {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Delete">
                    <span>
                      <IconButton
                        size="small"
                        disabled={busy}
                        onClick={() => deleteRow(it)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Box>

              {/* Expanded */}
              {expanded ? (
                <Box sx={{ px: 1.5, py: 1.25 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                      <Autocomplete
                        size="small"
                        options={units}
                        loading={unitsLoading}
                        value={unitOpt}
                        getOptionLabel={(opt) => (opt?.unitName ? String(opt.unitName) : '')}
                        isOptionEqualToValue={(a, b) => Number(a?.id) === Number(b?.id)}
                        onChange={(e, opt) => {
                          const nextId = opt?.id ? Number(opt.id) : null;
                          setRowField(it, { unit_id: nextId });
                          if (it.id != null) {
                            autoSaveUnitId(key, it.id, nextId);
                          }
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Unit…"
                            sx={{ width: 200 }}
                            InputProps={{
                              ...params.InputProps,
                              endAdornment: (
                                <>
                                  {unitsLoading ? <CircularProgress color="inherit" size={16} /> : null}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                      />

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          size="small"
                          checked={done}
                          onChange={(e) => {
                            const nextDone = !!e.target.checked;

                            // Only update local state.
                            // Persisting to API still requires clicking the Save icon.
                            setRowField(it, {
                              status: nextDone ? 'done' : 'open',
                            });
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Done
                        </Typography>
                      </Box>

                      <Box sx={{ flex: 1 }} />

                      <Tooltip title={isRowDirty(it) ? 'Save' : 'No changes'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={busy || !isRowDirty(it)}
                            onClick={async () => {
                              const ok = await saveRow(it);
                              if (ok) {
                                setExpandedKeys((prev) => {
                                  const next = new Set(prev);
                                  next.delete(key);
                                  return next;
                                });
                              }
                            }}
                            sx={{
                              color: isRowDirty(it) ? 'var(--color-teal)' : '#9ca3af',
                            }}
                          >
                            <SaveIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>

                    <TextField
                      label="Resolution"
                      value={it.resolution ?? ''}
                      onChange={(e) => setRowField(it, { resolution: e.target.value })}
                      multiline
                      minRows={2}
                      size="small"
                    />

                    {/* Bookings context */}
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Bookings (month context)
                      </Typography>

                      {bookingsLoading ? (
                        <Box sx={{ py: 1 }}>
                          <CircularProgress size={16} />
                        </Box>
                      ) : null}

                      {bookingsError ? (
                        <Typography variant="body2" color="error" sx={{ py: 1 }}>
                          {bookingsError}
                        </Typography>
                      ) : null}

                      {!bookingsLoading && Array.isArray(bookings) ? (
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {bookings.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No bookings for this month.
                            </Typography>
                          ) : null}

                          {(() => {
                            const sorted = (Array.isArray(bookings) ? bookings : [])
                              .map((b, idx) => ({ b, idx }))
                              .sort((a, c) => {
                                const sa = String(a?.b?.status || '').toLowerCase();
                                const sc = String(c?.b?.status || '').toLowerCase();
                                const ca = sa === 'cancelled' || sa === 'canceled';
                                const cc = sc === 'cancelled' || sc === 'canceled';
                                if (ca === cc) return a.idx - c.idx; // stable
                                return ca ? 1 : -1; // cancelled last
                              })
                              .map((x) => x.b);

                            return sorted.map((b) => (
                              <Box
                                key={b.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 1,
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 1.5,
                                  px: 1,
                                  py: 0.75,
                                }}
                              >
                                {/* Left: name + status, then dates */}
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 700,
                                      minWidth: 0,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={`${b.guestName || '—'}${b.status ? ` * (${b.status})` : ''}`}
                                  >
                                    {b.guestName || '—'}
                                    {b.status
                                      ? (() => {
                                          const st = String(b.status || '').toLowerCase();
                                          const statusColor =
                                            st === 'ongoing'
                                              ? 'var(--color-teal)'
                                              : st === 'cancelled' || st === 'canceled'
                                                ? '#dc2626'
                                                : '#6b7280'; // Past (and others) = current default

                                          return (
                                            <Typography component="span" variant="body2" sx={{ fontWeight: 700, color: statusColor }}>
                                              {` * (${b.status})`}
                                            </Typography>
                                          );
                                        })()
                                      : null}
                                  </Typography>

                                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                                    {fmtDdMm(b.checkIn)} - {fmtDdMm(b.checkOut)}
                                  </Typography>
                                </Box>

                                {/* Right: source + open icon */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: '0 0 auto' }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                    {b.source || ''}
                                  </Typography>

                                  {b.reservationUrl ? (
                                    <Tooltip title="Open">
                                      <IconButton size="small" onClick={() => window.open(b.reservationUrl, '_blank')} sx={{ color: '#2563eb' }}>
                                        <OpenInNewIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip title="No link">
                                      <span>
                                        <IconButton size="small" disabled sx={{ color: '#9ca3af' }}>
                                          <OpenInNewIcon fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  )}
                                </Box>
                              </Box>
                            ));
                          })()}
                        </Stack>
                      ) : null}
                    </Box>
                  </Stack>
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Stack>
      </Box>
    </Box>
  );
}