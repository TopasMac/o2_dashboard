import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Checkbox, Collapse, Divider, IconButton, Stack, TextField, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
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

  const [items, setItems] = useState([]);        // draft items (can include new rows without id)
  const originalRef = useRef([]);                // last loaded snapshot from server

  const [newText, setNewText] = useState('');
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
  }, [load]);

  const normalize = (it) => ({
    _tmpId: null,
    id: it?.id ?? null,
    city: it?.city ?? city,
    month: it?.month ?? month,
    hk_cleaning_id: it?.hk_cleaning_id ?? it?.hkCleaningId ?? null,
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

  const rowKey = useCallback((it) => (it?.id ?? it?._tmpId ?? ''), []);

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

  const hasResolution = useCallback((it) => {
    return String(it?.resolution ?? '').trim().length > 0;
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

    setItems((prev) => [
      ...prev,
      {
        _tmpId: `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        id: null,
        city,
        month,
        hk_cleaning_id: null,
        text,
        status: 'open',
        resolution: '',
        resolved_at: null,
        resolved_by_user_id: null,
        created_at: null,
        updated_at: null,
      },
    ]);

    setNewText('');
  }, [newText, city, month]);

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

        if (nextText !== (before.text ?? '')) patch.text = nextText;
        if (nextStatus !== (before.status ?? 'open')) patch.status = nextStatus;
        if (nextRes !== (before.resolution ?? '')) patch.resolution = nextRes;

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
            <TextField
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Add a note…"
              size="small"
              disabled={loading}
              sx={{ width: 420, maxWidth: '52vw' }}
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
                px: 1.5,
                minWidth: 64,
                color: '#6b7280', // grey default
                '&:hover': {
                  backgroundColor: 'transparent',
                },
              },
            }}
          >
            <ToggleButton
              value="all"
              aria-label="All"
              sx={{
                '&.Mui-selected': {
                  fontWeight: 600,
                  color: '#374151',
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
                  color: '#f59e0b', // amber
                  backgroundColor: 'transparent',
                },
              }}
            >
              Pending
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
            const done = (it.status || '').toLowerCase() === 'done';
            const busy = saving || (deletingId != null && deletingId === it.id);

            const key = rowKey(it);
            const expanded = isExpanded(key);
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
                    </Collapse>
                  </Box>

                  <IconButton
                    size="small"
                    disabled={busy}
                    onClick={() => {
                      toggleExpanded(key);
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