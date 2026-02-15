import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, Box, Button, Checkbox, CircularProgress, Collapse, Divider, IconButton, Stack, TextField, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import BaseModal from '../common/BaseModal';
import O2ConfirmDialog from '../common/O2ConfirmDialog';
import api from '../../api';
import { toast } from 'react-toastify';

const HKReconMonthNotesModal = memo(function HKReconMonthNotesModal({ open, city, month, focusHkCleaningId = null, onSaved, onClose }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState(null);
  const loadUnits = useCallback(async () => {
    if (!open) return;
    setUnitsLoading(true);
    setUnitsError(null);
    try {
      // Lightweight options endpoint (id + unit_name + city)
      const q = city ? new URLSearchParams({ city }).toString() : '';
      const res = await api.get(`/api/units/options${q ? `?${q}` : ''}`);
      const data = res?.data;
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

      const mapped = arr
        .map((u) => ({
          id: u?.id ?? null,
          unitName: u?.unit_name ?? u?.unitName ?? '',
          city: u?.city ?? '',
        }))
        .filter((u) => Number(u.id) > 0 && String(u.unitName || '').trim() !== '');

      // The endpoint already filters by city when provided, but keep a defensive client-side filter.
      const filtered = city
        ? mapped.filter((u) => String(u.city || '').toLowerCase() === String(city).toLowerCase())
        : mapped;

      filtered.sort((a, b) => String(a.unitName).localeCompare(String(b.unitName)));
      setUnits(filtered);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      setUnitsError(msg);
      setUnits([]);
    } finally {
      setUnitsLoading(false);
    }
  }, [open, city]);

  const [items, setItems] = useState([]);        // draft items (can include new rows without id)
  const originalRef = useRef([]);                // last loaded snapshot from server

  const [newText, setNewText] = useState('');
  const [newUnitId, setNewUnitId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | solved

  const displayMonth = useMemo(() => {
    // month comes as YYYY-MM
    const m = String(month || '');
    const match = m.match(/^(\d{4})-(\d{2})$/);
    if (!match) return m;

    const year = match[1];
    const mm = parseInt(match[2], 10);
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = names[mm - 1] || match[2];
    return `${mon}/${year.slice(2)}`;
  }, [month]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ city, month }).toString();
      const res = await api.get(`/api/hk-reconcile/notes?${q}`);
      const json = res?.data;
      const arr = Array.isArray(json?.data) ? json.data : [];
      const normalized = arr.map(normalize);
      originalRef.current = normalized;
      setItems(normalized);
      // Auto-expand a specific row-level note if requested (from table click)
      if (focusHkCleaningId) {
        const match = normalized.find((x) => Number(x.hk_cleaning_id) === Number(focusHkCleaningId));
        if (match && match.id != null) {
          setExpandedKeys(new Set([match.id]));
          // Scroll after render
          setTimeout(() => {
            try {
              const el = document.getElementById(`hk-note-${match.id}`);
              el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
            } catch {
              // ignore
            }
          }, 50);
        } else {
          setExpandedKeys(new Set());
        }
      } else {
        setExpandedKeys(new Set());
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [open, city, month, focusHkCleaningId]);

  useEffect(() => {
    load();
    loadUnits();
  }, [load, loadUnits]);

  const normalize = (it) => ({
    _tmpId: null,
    id: it?.id ?? null,
    city: it?.city ?? city,
    month: it?.month ?? month,
    hk_cleaning_id: it?.hk_cleaning_id ?? it?.hkCleaningId ?? null,
    unit_id: it?.unit_id ?? it?.unitId ?? null,
    text: (it?.text ?? '').toString(),
    status: (it?.status ?? 'open').toString(),
    resolution: it?.resolution === null || it?.resolution === undefined ? '' : (it.resolution ?? '').toString(),
    resolved_at: it?.resolved_at ?? null,
    resolved_by_user_id: it?.resolved_by_user_id ?? null,
    created_at: it?.created_at ?? null,
    updated_at: it?.updated_at ?? null,
  });

  const isDirty = useMemo(() => {
    const orig = originalRef.current || [];
    const cur = items || [];

    if (cur.length !== orig.length) return true;

    // Compare by position (we keep server order + appended new rows)
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = orig[i];
      if ((a?.id ?? null) !== (b?.id ?? null)) return true;
      if ((a?.text ?? '') !== (b?.text ?? '')) return true;
      if ((a?.status ?? 'open') !== (b?.status ?? 'open')) return true;
      if ((a?.resolution ?? '') !== (b?.resolution ?? '')) return true;
      if ((a?.unit_id ?? null) !== (b?.unit_id ?? null)) return true;
    }

    return false;
  }, [items]);

  const hasOpen = useMemo(() => items.some((it) => (it.status || '').toLowerCase() !== 'done'), [items]);

  const headerCounts = useMemo(() => {
    const total = items.length;
    const solved = items.filter((it) => (it.status || '').toLowerCase() === 'done').length;
    const pending = total - solved;
    return { total, solved, pending };
  }, [items]);

  const filteredItems = useMemo(() => {
    const list = items || [];
    if (statusFilter === 'pending') {
      return list.filter((it) => (it.status || '').toLowerCase() !== 'done');
    }
    if (statusFilter === 'solved') {
      return list.filter((it) => (it.status || '').toLowerCase() === 'done');
    }
    return list;
  }, [items, statusFilter]);

  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [bookingsByKey, setBookingsByKey] = useState(() => ({}));
  const [bookingsLoadingByKey, setBookingsLoadingByKey] = useState(() => ({}));
  const [bookingsErrorByKey, setBookingsErrorByKey] = useState(() => ({}));
  const [unitSavingByKey, setUnitSavingByKey] = useState(() => ({}));

  const isExpanded = useCallback((key) => {
    return expandedKeys.has(key);
  }, [expandedKeys]);

  const toggleExpanded = useCallback((key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const fetchReconBookings = useCallback(async (key, unitId) => {
    if (!unitId) return;

    // prevent duplicate loads
    setBookingsLoadingByKey((prev) => ({ ...prev, [key]: true }));
    setBookingsErrorByKey((prev) => ({ ...prev, [key]: null }));

    try {
      const q = new URLSearchParams({ mode: 'recon', month: String(month || ''), unitId: String(unitId) }).toString();
      const res = await api.get(`/api/bookings?${q}`);
      const arr = Array.isArray(res?.data) ? res.data : [];
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

      // Update snapshot so isDirty reflects that this change is already saved
      originalRef.current = (originalRef.current || []).map((x) => (x.id === noteId ? { ...x, unit_id: unitId } : x));

      // Clear bookings cache for this row and reload bookings
      setBookingsByKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (unitId) {
        fetchReconBookings(key, unitId);
      }

      toast.success('Unit saved');
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
    } finally {
      setUnitSavingByKey((prev) => ({ ...prev, [key]: false }));
    }
  }, [fetchReconBookings]);

  const rowKey = useCallback((it) => (it?.id ?? it?._tmpId ?? ''), []);

  const hasResolution = useCallback((it) => {
    return String(it?.resolution ?? '').trim().length > 0;
  }, []);

  const fmtDdMm = useCallback((iso) => {
    const s = String(iso || '').trim();
    if (!s) return '—';
    // Expect YYYY-MM-DD; fall back to original if unexpected
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    return `${m[3]}/${m[2]}`;
  }, []);

  const applyNewUnitPrefix = useCallback((unitName) => {
    const name = String(unitName || '').trim();
    if (!name) return;

    setNewText((prev) => {
      const cur = String(prev || '');
      const trimmed = cur.trim();

      const prefix = `${name} * `;

      // If empty, just set prefix
      if (!trimmed) return prefix;

      // If already starts with this prefix (case-insensitive), keep as-is
      if (cur.toLowerCase().startsWith(prefix.toLowerCase())) return cur;

      // If it already has a "Unit *" style prefix, replace it
      // Examples:
      //  - "Menesse 224B * 02/01"
      //  - "Menesse_224B • 11-01-2026 * (Checkout)" (we only replace if it's the simple "*" pattern)
      const m = cur.match(/^\s*([^*\n]{1,60})\s*\*\s*/);
      if (m) {
        const rest = cur.replace(/^\s*([^*\n]{1,60})\s*\*\s*/, '');
        return prefix + rest;
      }

      // Otherwise, prepend
      return prefix + cur;
    });
  }, []);

  const anyExpanded = useMemo(() => expandedKeys.size > 0, [expandedKeys]);

  // Collapsed view: show about 3 rows then scroll.
  // Expanded view: allow a taller list (still scrolls) so the resolution editor fits.
  const listMaxHeight = useMemo(() => {
    // Approximate heights (px) for consistent UI
    const COLLAPSED_ROW_PX = 54; // checkbox + text field row height
    const LIST_GAP_PX = 8;
    const base = (COLLAPSED_ROW_PX * 3) + (LIST_GAP_PX * 2) + 16; // 3 rows + gaps + padding

    return anyExpanded ? '60vh' : `${base}px`;
  }, [anyExpanded]);

  const addItem = useCallback(() => {
    const text = newText.trim();
    if (!text) return;

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
        text,
        status: 'open',
        resolution: '',
        resolved_at: null,
        resolved_by_user_id: null,
        created_at: null,
        updated_at: null,
      },
    ]);

    // Auto-expand the newly added draft note so the user sees month/unit context immediately
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.add(tmpId);
      return next;
    });

    // If unit is already selected, preload bookings for this month
    if (newUnitId) {
      fetchReconBookings(tmpId, newUnitId);
    }

    // Scroll into view after render
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

  const saveAll = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      // Build maps for diffing existing rows
      const orig = originalRef.current || [];
      const origById = new Map(orig.filter((x) => x.id != null).map((x) => [x.id, x]));

      // 1) Create new rows (id == null)
      const toCreate = (items || []).filter((x) => x.id == null);
      for (const row of toCreate) {
        const payload = {
          city,
          month,
          text: (row.text ?? '').toString().trim(),
          unit_id: row.unit_id ?? null,
        };
        if ((row.status ?? 'open') !== 'open') payload.status = row.status;
        if ((row.resolution ?? '').toString().trim() !== '') payload.resolution = row.resolution;

        if (!payload.text) {
          throw new Error('Cannot save an empty note');
        }

        await api.post('/api/hk-reconcile/notes', payload);
      }

      // 2) Update existing rows (id != null) where fields changed
      const toUpdate = (items || []).filter((x) => x.id != null);
      for (const row of toUpdate) {
        const before = origById.get(row.id);
        if (!before) continue;

        const patch = {};
        const nextText = (row.text ?? '').toString();
        const nextStatus = (row.status ?? 'open').toString();
        const nextRes = (row.resolution ?? '').toString();
        const nextUnitId = row.unit_id ?? null;

        if (nextText !== (before.text ?? '')) patch.text = nextText;
        if (nextStatus !== (before.status ?? 'open')) patch.status = nextStatus;
        if (nextRes !== (before.resolution ?? '')) patch.resolution = nextRes;
        if (nextUnitId !== (before.unit_id ?? null)) patch.unit_id = nextUnitId;

        if (Object.keys(patch).length > 0) {
          // Keep minimal payload
          await api.put(`/api/hk-reconcile/notes/${row.id}`, patch);
        }
      }

      toast.success('Saved');
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [items, city, month, load, saving]);

  const deleteItem = useCallback(async (id) => {
    // Draft rows (no DB id) use _tmpId
    if (id == null || (typeof id === 'string' && id.startsWith('tmp_'))) {
      setItems((prev) => prev.filter((it) => (it.id ?? it._tmpId) !== id));
      return;
    }
    setDeletingId(id);
    try {
      await api.delete(`/api/hk-reconcile/notes/${id}`);
      setItems((prev) => prev.filter((it) => it.id !== id));
      toast.success('Deleted');
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e);
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  }, [load]);

  return (
    <>
    <BaseModal
      open={open}
      title={`Month Notes - ${city} ${displayMonth}  •  Notes: ${headerCounts.total}  •  Solved: ${headerCounts.solved}  •  Pending: ${headerCounts.pending}${hasOpen ? '' : '  •  ✓'}`}
      onClose={onClose}
      width={760}
      draggable
      actions={
        <>
          <Button
            variant="outlined"
            size="small"
            type="button"
            onClick={() => {
              if (isDirty) {
                setConfirmOpen(true);
              } else {
                onClose();
              }
            }}
            disabled={loading || saving}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            type="button"
            onClick={async () => {
              try {
                await saveAll();
                if (typeof onSaved === 'function') {
                  await onSaved();
                }
                onClose();
              } catch {
                // keep modal open on save error
              }
            }}
            disabled={loading || saving || !isDirty}
            sx={{ textTransform: 'none' }}
          >
            Save
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

        {/* Add new + Filter */}
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: '0 0 auto' }}>
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
            <TextField
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Add a note…"
              size="small"
              disabled={loading}
              sx={{ width: 320, maxWidth: '42vw', minWidth: 220 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addItem();
                }
              }}
            />
            <Button
              variant="contained"
              size="small"
              type="button"
              onClick={addItem}
              disabled={loading || !newText.trim()}
              sx={{ textTransform: 'none' }}
            >
              Add
            </Button>
          </Stack>

          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            size="small"
            onChange={(e, v) => {
              if (v) setStatusFilter(v);
            }}
            aria-label="Filter notes"
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 400,
                border: 'none',
                backgroundColor: 'transparent',
                px: 0.5,
                minWidth: 'auto',
                color: '#6b7280',
                '&:hover': {
                  backgroundColor: 'transparent',
                },
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
                  fontWeight: 600,
                  color: '#111827',
                  backgroundColor: 'transparent',
                },
              }}
            >
              All
            </ToggleButton>

            <ToggleButton
              value="pending"
              aria-label="Pending"
              sx={{
                '&.Mui-selected': {
                  fontWeight: 600,
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
                  fontWeight: 600,
                  color: 'var(--color-teal)',
                  backgroundColor: 'transparent',
                },
              }}
            >
              Solved
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Divider />

        {/* List */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            maxHeight: listMaxHeight,
            overflowY: 'auto',
            pr: 0.5,
          }}
        >
          {filteredItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No notes match this filter.
            </Typography>
          ) : null}

          {filteredItems.map((it) => {
            const key = rowKey(it);
            const expanded = isExpanded(key);
            const done = (it.status || '').toLowerCase() === 'done';
            const busy = saving || (deletingId != null && deletingId === it.id) || !!unitSavingByKey[key];
            const showDot = hasResolution(it);

            return (
              <Box
                key={it.id ?? it._tmpId}
                id={`hk-note-${key}`}
                sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 1 }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Checkbox
                    checked={done}
                    disabled={busy}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setItems((prev) => prev.map((x) => (x === it ? { ...x, status: checked ? 'done' : 'open' } : x)));
                    }}
                    size="small"
                  />

                  <Box sx={{ flex: 1 }}>
                    <TextField
                      value={it.text ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) =>
                          prev.map((x) => {
                            const same = (it.id != null && x.id === it.id) || (it.id == null && x._tmpId && x._tmpId === it._tmpId);
                            return same ? { ...x, text: v } : x;
                          })
                        );
                      }}
                      size="small"
                      fullWidth
                      disabled={busy}
                    />

                    <Collapse in={expanded} timeout={150}>
                      <TextField
                        value={it.resolution ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItems((prev) =>
                            prev.map((x) => {
                              const same = (it.id != null && x.id === it.id) || (it.id == null && x._tmpId && x._tmpId === it._tmpId);
                              return same ? { ...x, resolution: v } : x;
                            })
                          );
                        }}
                        size="small"
                        fullWidth
                        disabled={busy}
                        placeholder="Resolution / follow-up…"
                        sx={{ mt: 1 }}
                        multiline
                        minRows={2}
                        maxRows={6}
                      />

                      {it.resolved_at ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Resolved: {it.resolved_at}
                        </Typography>
                      ) : null}

                      <Box sx={{ mt: 1, p: 1, border: '1px dashed #e5e7eb', borderRadius: 1, backgroundColor: '#fafafa' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 88 }}>
                            Unit context
                          </Typography>

                          <Autocomplete
                            size="small"
                            options={units}
                            loading={unitsLoading}
                            value={units.find((u) => Number(u.id) === Number(it.unit_id)) || null}
                            getOptionLabel={(opt) => (opt?.unitName ? String(opt.unitName) : '')}
                            isOptionEqualToValue={(a, b) => Number(a?.id) === Number(b?.id)}
                            onChange={(e, opt) => {
                              const nextId = opt?.id ? Number(opt.id) : null;
                              setItems((prev) =>
                                prev.map((x) => {
                                  const same = (it.id != null && x.id === it.id) || (it.id == null && x._tmpId && x._tmpId === it._tmpId);
                                  return same ? { ...x, unit_id: nextId } : x;
                                })
                              );

                              // Auto-save for existing notes
                              if (it.id != null) {
                                autoSaveUnitId(key, it.id, nextId);
                              }
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                placeholder={unitsLoading ? 'Loading units…' : 'Select unit…'}
                                disabled={busy}
                                sx={{ minWidth: 260 }}
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
                          {(() => {
                            if (it.unit_id != null) return null;
                            const t = String(it.text || '').toLowerCase();
                            if (!t) return null;
                            const suggested = units.find((u) => String(u.unitName || '').toLowerCase().includes(t) || t.includes(String(u.unitName || '').toLowerCase()));
                            if (!suggested) return null;
                            return (
                              <Button
                                size="small"
                                variant="text"
                                disabled={busy}
                                sx={{ textTransform: 'none' }}
                                onClick={() => {
                                  setItems((prev) =>
                                    prev.map((x) => {
                                      const same = (it.id != null && x.id === it.id) || (it.id == null && x._tmpId && x._tmpId === it._tmpId);
                                      return same ? { ...x, unit_id: Number(suggested.id) } : x;
                                    })
                                  );
                                }}
                              >
                                Use suggestion: {suggested.unitName}
                              </Button>
                            );
                          })()}
                        </Stack>

                        {(() => {
                          const u = it.unit_id === null || it.unit_id === undefined ? null : Number(it.unit_id);
                          if (!u) {
                            return (
                              <Typography variant="caption" color="text.secondary">
                                No unit selected. Set a Unit ID to load the booking calendar.
                              </Typography>
                            );
                          }

                          const loadingBk = !!bookingsLoadingByKey[key];
                          const errBk = bookingsErrorByKey[key];
                          const rows = bookingsByKey[key] || [];

                          if (loadingBk) {
                            return (
                              <Typography variant="caption" color="text.secondary">
                                Loading bookings…
                              </Typography>
                            );
                          }

                          if (errBk) {
                            return (
                              <Typography variant="caption" color="error">
                                {errBk}
                              </Typography>
                            );
                          }

                          if (!rows || rows.length === 0) {
                            return (
                              <Typography variant="caption" color="text.secondary">
                                No bookings found for this unit in recon mode for {month}.
                              </Typography>
                            );
                          }

                          return (
                            <Box sx={{ mt: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                Bookings (checkout in month or ongoing)
                              </Typography>

                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {rows.map((b) => (
                                  <Box key={b.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                                    <Typography variant="caption" sx={{ minWidth: 72 }}>
                                      {fmtDdMm(b.checkIn)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ minWidth: 72, color: '#6b7280' }}>
                                      {fmtDdMm(b.checkOut)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ flex: 1 }}>
                                      {b.guestName || '—'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ minWidth: 64, color: '#6b7280' }}>
                                      {b.source || '—'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ minWidth: 72, color: '#6b7280', textAlign: 'right' }}>
                                      {b.status || '—'}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          );
                        })()}
                      </Box>
                    </Collapse>
                  </Box>

                  <IconButton
                    size="small"
                    disabled={busy}
                    onClick={() => {
                      toggleExpanded(key);

                      // If expanding and unit_id exists, load bookings once
                      if (!expanded) {
                        const u = it.unit_id;
                        if (u && bookingsByKey[key] === undefined && !bookingsLoadingByKey[key]) {
                          fetchReconBookings(key, u);
                        }
                      }

                      // Let the DOM update then scroll the row into view
                      setTimeout(() => {
                        try {
                          const el = document.getElementById(`hk-note-${key}`);
                          el?.scrollIntoView?.({ block: 'nearest' });
                        } catch {
                          // ignore
                        }
                      }, 0);
                    }}
                    title={expanded ? 'Hide comments' : 'Show comments'}
                    sx={{ mt: 0.25 }}
                  >
                    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                      {showDot ? (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            backgroundColor: 'var(--color-coral)',
                          }}
                        />
                      ) : null}
                    </Box>
                  </IconButton>

                  <IconButton
                    size="small"
                    disabled={busy}
                    onClick={() => deleteItem(it.id ?? it._tmpId)}
                    title="Delete"
                    sx={{ mt: 0.25 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Box>
    </BaseModal>
    <O2ConfirmDialog
      open={confirmOpen}
      title="Save changes?"
      description="You have unsaved changes. What do you want to do?"
      confirmLabel="Save"
      cancelLabel="Discard"
      thirdLabel="Cancel"
      confirmClassName="btn-primary"
      cancelClassName="btn-danger"
      thirdClassName="btn-warning"
      onClose={() => setConfirmOpen(false)}
      onConfirm={async () => {
        try {
          await saveAll();
          if (typeof onSaved === 'function') {
            await onSaved();
          }
          setConfirmOpen(false);
          onClose();
        } catch {
          // keep dialog open on error
        }
      }}
      onCancel={() => {
        setConfirmOpen(false);
        onClose();
      }}
    />
    </>
  );
});

export default HKReconMonthNotesModal;