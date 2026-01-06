import React, { useEffect, useMemo, useRef, useState } from 'react';
import O2ConfirmDialog from '../../components/common/O2ConfirmDialog';
import { TrashIcon } from '@heroicons/react/24/outline';
import UnitPurchaseListAddItemModal from '../../components/modals/UnitPurchaseListAddItemModal';
import api from '../../api';

/**
 * UnitPurchasesTab
 *
 * First pass scaffold:
 * - Pick a unit (dropdown)
 * - Loads purchase catalog (Always items only)
 * - Calculates "Required", "Existing", "Needed", and totals
 *
 * Notes:
 * - Required calculation is best-effort with current known fields:
 *   - qty_basis: unit | guest | bathroom | (fallback)
 *   - qty_per_basis
 *   - qty_per_bed_by_size (uses unit.beds_by_size if available)
 * - Existing is editable client-side for now (no persistence yet).
 */
export default function UnitPurchasesTab({ unitId, status = 'ALL', onOpenNewPurchaseList }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);

  // Candidate units for new purchase list (when no unitId selected)
  const [candidateUnits, setCandidateUnits] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState('');

  const [draftList, setDraftList] = useState(null);
  const [draftLines, setDraftLines] = useState([]);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const statusUpper = String(status || 'ALL').toUpperCase().trim() || 'ALL';

// Internally we may force DRAFT after creating a new list, even if the parent is still on ALL.
const [effectiveStatusUpper, setEffectiveStatusUpper] = useState(statusUpper);

useEffect(() => {
  setEffectiveStatusUpper(statusUpper);
}, [statusUpper]);

const isReadOnly = effectiveStatusUpper !== 'DRAFT';

  // Local, per-unit “existing” quantities (for now, in-memory only)
  const [existingByItemId, setExistingByItemId] = useState({});
  // Local, per-unit “target/proposed” quantities (defaults to Required)
  const [targetByItemId, setTargetByItemId] = useState({});
  // Autosave state for Draft edits
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'saving' | 'error'
  const pendingEditsRef = useRef(new Map()); // key: lineId, value: { qty, existing_qty }
  const saveTimerRef = useRef(null);
  const scrollRef = useRef(null);
  const [scrollMeta, setScrollMeta] = useState({ canScroll: false, atTop: true, atBottom: true });
  const [addItemOpen, setAddItemOpen] = useState(false);
  // Controlled notes input per persisted line (Draft only)
  const [notesByLineId, setNotesByLineId] = useState({}); // { [lineId]: string }

  // --- PDF Preview (blob-based, JWT-safe via shared api wrapper) ---
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const revokePreviewUrl = () => {
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    } catch (_) {}
    setPreviewUrl('');
  };

  const loadPreviewPdf = async () => {
    if (!draftList?.id) throw new Error('No draft list to preview');

    setPreviewLoading(true);
    setPreviewError('');

    const res = await api.get(`/api/reports/purchase-lists/${draftList.id}/pdf`, {
      responseType: 'arraybuffer',
      headers: { Accept: 'application/pdf' },
    });

    const bytes = res?.data ?? res;
    const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(pdfBlob);

    // Replace any previous blob URL
    revokePreviewUrl();
    setPreviewUrl(url);

    setPreviewLoading(false);
    return url;
  };

  const openPreview = async () => {
    if (!draftList?.id) return;
    setPreviewOpen(true);
    revokePreviewUrl();
    try {
      await loadPreviewPdf();
    } catch (e) {
      setPreviewError(e?.message || 'Failed to load preview');
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    revokePreviewUrl();
    setPreviewLoading(false);
    setPreviewError('');
  };

  const openPreviewNewTab = async () => {
    try {
      const url = previewUrl || (await loadPreviewPdf());
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) window.location.href = url;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[UnitPurchasesTab] open preview new tab failed', e);
      alert(e?.message || 'Failed to open preview');
    }
  };
  

  const [deleteState, setDeleteState] = useState({ open: false, lineId: null, name: '' });

  const [deleteListState, setDeleteListState] = useState({ open: false });

  const requestDeleteList = () => {
    if (!draftList?.id || isReadOnly) return;
    setDeleteListState({ open: true });
  };

  const closeDeleteListDialog = () => {
    setDeleteListState({ open: false });
  };

  const confirmDeleteList = async () => {
    if (!draftList?.id || isReadOnly) {
      closeDeleteListDialog();
      return;
    }
    try {
      await authFetchJson(`/api/purchase-lists/${draftList.id}`, { method: 'DELETE' });
      // After delete, force full reload to reset state cleanly
      window.location.reload();
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[UnitPurchasesTab] delete list failed', e);
    } finally {
      closeDeleteListDialog();
    }
  };

  const requestDeleteLine = (lineId, name) => {
    if (!lineId || isReadOnly) return;
    setDeleteState({ open: true, lineId, name: name || '' });
  };

  const closeDeleteDialog = () => {
    setDeleteState({ open: false, lineId: null, name: '' });
  };

  const confirmDeleteLine = async () => {
    if (!draftList?.id || !deleteState?.lineId) {
      closeDeleteDialog();
      return;
    }
    try {
      await authFetchJson(`/api/purchase-lists/${draftList.id}/lines/${deleteState.lineId}`, {
        method: 'DELETE',
      });
      await refreshDraft();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[UnitPurchasesTab] delete line failed', e);
    } finally {
      closeDeleteDialog();
    }
  };

  const getAuthToken = () => {
    // Best-effort: support common token keys used across the app
    return (
      window?.localStorage?.getItem('token') ||
      window?.localStorage?.getItem('jwt') ||
      window?.localStorage?.getItem('access_token') ||
      ''
    );
  };

  const authFetchJson = async (url, options = {}) => {
    const token = getAuthToken();
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/json',
    };

    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[UnitPurchasesTab] API error', url, res.status, json);
    }
    return json;
  };

  // Helper to load candidate units for new purchase lists
  const loadCandidateUnits = async () => {
    setCandidatesLoading(true);
    setCandidatesError('');

    try {
      // Use the shared api wrapper so auth/baseURL/interceptors match the rest of the app.
      const res = await api.get('/api/unit-purchase-lists/candidates');
      const data = res?.data ?? res;

      const items = Array.isArray(data?.items) ? data.items : [];
      setCandidateUnits(items);
      return items;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[UnitPurchasesTab] loadCandidateUnits failed', e);

      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Failed to load units';

      setCandidateUnits([]);
      setCandidatesError(msg);
      return [];
    } finally {
      setCandidatesLoading(false);
    }
  };

  // Helper to fetch PDF with JWT auth and open as blob in new tab
  const openPdfWithAuth = async (url) => {
    const token = getAuthToken();
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/pdf',
      },
    });

    // If server redirects to login or returns HTML, surface a readable error
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load PDF (HTTP ${res.status})`);
    }
    if (!ct.includes('application/pdf')) {
      const text = await res.text().catch(() => '');
      throw new Error(text || 'Preview returned non-PDF response (likely auth redirect).');
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    // Open in a new tab; if blocked, fallback to navigating the current tab.
    const w = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!w) {
      window.location.href = blobUrl;
    }

    // Cleanup later
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  };

  const [unitDetails, setUnitDetails] = useState(null);

  const refreshDraft = async () => {
    if (!unitId) return;

    const json = await authFetchJson(`/api/units/${unitId}/purchase-list?status=${encodeURIComponent(effectiveStatusUpper)}`);
    const lines = Array.isArray(json?.lines) ? json.lines : [];
    const list = json?.list ?? null;

    setDraftList(list);
    setDraftLines(lines);
    // Prefill notes state for controlled inputs
    const nextNotes = {};
    for (const ln of lines) {
      if (ln?.id) nextNotes[String(ln.id)] = ln?.notes ?? '';
    }
    setNotesByLineId(nextNotes);

    // Keep inputs in sync with returned values (best-effort)
    const nextExisting = {};
    const nextTarget = {};
    for (const ln of lines) {
      const itemId = ln?.item_id ?? ln?.itemId ?? ln?.catalog_item_id ?? ln?.catalogItemId ?? null;
      if (itemId !== null && itemId !== undefined) {
        const required = safeNum(ln?.required ?? ln?.required_qty ?? ln?.requiredQty ?? 0);
        const ex = ln?.existing ?? ln?.existing_qty ?? ln?.existingQty ?? 0;
        nextExisting[itemId] = safeNum(ex);

        const tg =
          ln?.target ??
          ln?.target_qty ??
          ln?.targetQty ??
          ln?.proposed ??
          ln?.proposed_qty ??
          ln?.proposedQty ??
          ln?.qty ??
          ln?.qty_target ??
          ln?.qtyTarget ??
          null;

        nextTarget[itemId] = tg === null || tg === undefined ? required : safeNum(tg);
      }
    }
    setExistingByItemId(nextExisting);
    setTargetByItemId(nextTarget);
  };

  const queueLineSave = (lineId, patch) => {
    if (!lineId) return;
    const prev = pendingEditsRef.current.get(lineId) || {};
    pendingEditsRef.current.set(lineId, { ...prev, ...patch });

    // Flip UI to saving immediately
    setSaveState('saving');

    // Debounce flush
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // Only autosave in Draft, and only if we have a list id
      if (!draftList?.id || isReadOnly) {
        setSaveState('saved');
        pendingEditsRef.current.clear();
        return;
      }

      const entries = Array.from(pendingEditsRef.current.entries());
      pendingEditsRef.current.clear();

      try {
        await Promise.all(
          entries.map(([id, body]) =>
            authFetchJson(`/api/purchase-lists/${draftList.id}/lines/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          )
        );

        // Refresh lines so the table reflects persisted values (best-effort)
        await refreshDraft();

        setSaveState('saved');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[UnitPurchasesTab] autosave failed', e);
        setSaveState('error');
      }
    }, 750);
  };

  // --- Data loading ---------------------------------------------------------
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        // 1) Purchase catalog
        const catJson = await authFetchJson('/api/purchase-catalog');
        const catItems = Array.isArray(catJson?.items) ? catJson.items : [];
        if (alive) setCatalog(catItems);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[UnitPurchasesTab] load failed', e);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // When switching units:
  // - load latest purchase list/lines for the unit by status (if any)
  // - reset existing quantities to match the list (or empty if no list)
  useEffect(() => {
    let alive = true;

    async function loadDraft() {
      if (!unitId) {
        setDraftList(null);
        setDraftLines([]);
        setExistingByItemId({});
        setTargetByItemId({});
        setNotesByLineId({});
        setUnitDetails(null);
        setSaveState('saved');
        return;
      }

      // Load unit details (best-effort) so the fallback calculator can use guests/bathrooms/beds_by_size
      try {
        const uJson = await authFetchJson(`/api/units/${unitId}`);
        const u = uJson?.item ?? uJson?.unit ?? uJson ?? null;
        if (alive) setUnitDetails(u);
      } catch (e) {
        if (alive) setUnitDetails(null);
      }

      setLoadingDraft(true);
      try {
        let json = await authFetchJson(`/api/units/${unitId}/purchase-list?status=${encodeURIComponent(effectiveStatusUpper)}`);

        // If there is no list yet, generate a DRAFT with "always needed" lines.
        // This is used both for explicit DRAFT view, and for the "New Purchase List" flow where parent may still be on ALL.
        if (!json?.list) {
          const generated = await authFetchJson(`/api/units/${unitId}/purchase-list/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            onlyAlwaysNeeded: true,
            includeExtras: false,
            resetLines: true,
          }),
        });

        // Force effective status to DRAFT so the UI becomes editable and subsequent refreshes load draft.
        setEffectiveStatusUpper('DRAFT');

        // After generating, load the draft view explicitly
        json =
          generated?.list
          ? generated
          : await authFetchJson(`/api/units/${unitId}/purchase-list?status=${encodeURIComponent('DRAFT')}`);
}

        const lines = Array.isArray(json?.lines) ? json.lines : [];
        const list = json?.list ?? null;

        if (!alive) return;

        setDraftList(list);
        setDraftLines(lines);
        // Prefill notes state for controlled inputs
        const nextNotes = {};
        for (const ln of lines) {
          if (ln?.id) nextNotes[String(ln.id)] = ln?.notes ?? '';
        }
        setNotesByLineId(nextNotes);

        // Pre-fill Existing/Target inputs from draft lines if available
        const nextExisting = {};
        const nextTarget = {};
        for (const ln of lines) {
          const itemId = ln?.item_id ?? ln?.itemId ?? ln?.catalog_item_id ?? ln?.catalogItemId ?? null;
          if (itemId !== null && itemId !== undefined) {
            const required = safeNum(ln?.required ?? ln?.required_qty ?? ln?.requiredQty ?? 0);
            const ex = ln?.existing ?? ln?.existing_qty ?? ln?.existingQty ?? 0;
            nextExisting[itemId] = safeNum(ex);

            const tg =
              ln?.target ??
              ln?.target_qty ??
              ln?.targetQty ??
              ln?.proposed ??
              ln?.proposed_qty ??
              ln?.proposedQty ??
              ln?.qty ??
              ln?.qty_target ??
              ln?.qtyTarget ??
              null;

            nextTarget[itemId] = tg === null || tg === undefined ? required : safeNum(tg);
          }
        }
        setExistingByItemId(nextExisting);
        setTargetByItemId(nextTarget);
        setSaveState('saved');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[UnitPurchasesTab] loadDraft failed', e);
        if (!alive) return;
        setDraftList(null);
        setDraftLines([]);
        setExistingByItemId({});
        setTargetByItemId({});
        setNotesByLineId({});
        setSaveState('error');
      } finally {
        if (alive) setLoadingDraft(false);
      }
    }

    loadDraft();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, statusUpper, effectiveStatusUpper]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Cleanup blob URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      try {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const compute = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      const atTop = el.scrollTop <= 1;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      setScrollMeta({ canScroll, atTop, atBottom });
    };

    compute();

    el.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);

    return () => {
      el.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [draftLines, catalog, unitDetails, existingByItemId, targetByItemId]);

  // --- Helpers -------------------------------------------------------------
  const fmtMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toFixed(2);
  };

  const getBedsBySize = (unit) => {
    // We support a few possible shapes so we don’t hard-depend on a finalized schema.
    // Preferred: unit.beds_by_size = { king: 1, queen: 0, single: 2 }
    // Alternate: unit.bedsBySize
    // Also support API shape: unit.bedConfig = [{ type: 'king', count: 1 }, ...]
    const m = unit?.beds_by_size || unit?.bedsBySize;
    if (m && typeof m === 'object') return m;

    if (Array.isArray(unit?.bedConfig) && unit.bedConfig.length) {
      const out = {};
      for (const b of unit.bedConfig) {
        if (!b) continue;
        const k = String(b.type || '').toLowerCase().trim();
        const c = Number(b.count ?? b.qty ?? 0);
        if (!k || !Number.isFinite(c) || c <= 0) continue;
        out[k] = (out[k] || 0) + c;
      }
      return Object.keys(out).length ? out : null;
    }

    return null;
  };

  const computeRequired = (item, unit) => {
    if (!item) return 0;

    const basis = item.qty_basis;
    const qtyPer = Number(item.qty_per_basis ?? 0);

    // If item defines per-bed-size mapping and unit has bed counts, use that.
    const bySize = item.qty_per_bed_by_size;
    const bedsBySize = getBedsBySize(unit);
    const itemBedSize = item?.bed_size ? String(item.bed_size).toLowerCase().trim() : '';

    // If the item targets a specific bed size and we have bed counts, return 0 if unit has none.
    if (itemBedSize && bedsBySize && typeof bedsBySize === 'object') {
      const bedCount = Number(bedsBySize[itemBedSize] ?? 0);
      if (!bedCount) return 0;

      // Prefer explicit per-bed-size multipliers when available
      if (bySize && typeof bySize === 'object') {
        const perBed = Number(bySize[itemBedSize] ?? 0);
        if (perBed) return bedCount * perBed;
      }

      // Otherwise fall back to qty_per_basis per bed of that size
      return bedCount * qtyPer;
    }

    // General per-bed-size mapping across all bed sizes (when item doesn't target a single size)
    if (bySize && typeof bySize === 'object' && bedsBySize && typeof bedsBySize === 'object') {
      let sum = 0;
      for (const [size, bedCountRaw] of Object.entries(bedsBySize)) {
        const bedCount = Number(bedCountRaw ?? 0);
        if (!bedCount) continue;
        const perBed = Number(bySize[size] ?? 0);
        if (!perBed) continue;
        sum += bedCount * perBed;
      }
      // If we computed something meaningful, return it.
      if (sum > 0) return sum;
    }

    // Fallback: basis multipliers from unit fields (best-effort)
    if (!unit) return qtyPer;

    if (basis === 'guest' || basis === 'pax') {
      const guests = Number(unit.pax ?? unit.guests ?? unit.max_guests ?? unit.maxGuests ?? 0);
      return (guests || 0) * qtyPer;
    }

    if (basis === 'bathroom' || basis === 'baths') {
      const bathrooms = Number(unit.baths ?? unit.bathrooms ?? unit.bathroom_count ?? unit.bathCount ?? 0);
      return (bathrooms || 0) * qtyPer;
    }

    // Default "per unit"
    return qtyPer;
  };

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizeDraftLine = (line) => {
    const category = line?.category ?? line?.item_category ?? line?.itemCategory ?? '';
    const name = line?.name ?? line?.item_name ?? line?.itemName ?? line?.description ?? '';
    const required = safeNum(
      line?.required ??
      line?.required_qty ??
      line?.requiredQty ??
      ((safeNum(line?.needed_qty ?? line?.neededQty ?? 0)) + (safeNum(line?.existing_qty ?? line?.existingQty ?? 0)))
    );
    const existing = safeNum(line?.existing ?? line?.existing_qty ?? line?.existingQty ?? 0);

    const targetRaw =
      line?.target ??
      line?.target_qty ??
      line?.targetQty ??
      line?.proposed ??
      line?.proposed_qty ??
      line?.proposedQty ??
      line?.qty ??
      line?.qty_target ??
      line?.qtyTarget ??
      null;
    const target = targetRaw === null || targetRaw === undefined ? required : safeNum(targetRaw);

    const needed = Math.max(0, target - existing);

    const unitPrice = safeNum(
      line?.unitPrice ??
      line?.unit_price ??
      line?.unit_sell_price ??
      line?.unitSellPrice ??
      line?.price ??
      line?.sell_price ??
      line?.unit_cost ??
      line?.unitCost ??
      line?.cost ??
      0
    );
    const total = safeNum(line?.total ?? line?.line_total ?? line?.lineTotal ?? (needed * unitPrice));

    // Keep a stable key for React (prefer line.id; else fallback to item id)
    const key = line?.id ?? line?.item_id ?? line?.itemId ?? `${category}-${name}`;

    return {
      _key: String(key),
      category,
      name,
      required,
      target,
      existing,
      needed,
      unitPrice,
      total,
      _raw: line,
    };
  };

  // --- Rows ---------------------------------------------------------------
  const alwaysItems = useMemo(() => {
    return (catalog || []).filter((it) => it?.is_always_needed);
  }, [catalog]);

  const rows = useMemo(() => {
    // Prefer rendering existing saved draft lines
    if (draftLines && draftLines.length) {
      return draftLines
        .map(normalizeDraftLine)
        .filter((r) => (r.name || '').trim() !== '')
        .sort((a, b) => {
          const caRaw = String(a.category || '').trim();
          const cbRaw = String(b.category || '').trim();
          const ca = caRaw.toLowerCase();
          const cb = cbRaw.toLowerCase();

          const ra = ca === 'other' ? 1 : 0;
          const rb = cb === 'other' ? 1 : 0;
          if (ra !== rb) return ra - rb;

          if (ca !== cb) return ca.localeCompare(cb);

          const na = String(a.name || '').trim().toLowerCase();
          const nb = String(b.name || '').trim().toLowerCase();
          return na.localeCompare(nb);
        });
    }

    // Fallback: computed list from Always items
    const unit = unitDetails;

    return alwaysItems
      .map((it) => {
        const required = computeRequired(it, unit);

        const existing = safeNum(existingByItemId[it.id] ?? 0);
        const target = safeNum(
          targetByItemId[it.id] === undefined || targetByItemId[it.id] === null ? required : targetByItemId[it.id]
        );

        const needed = Math.max(0, target - existing);

        const unitPrice = safeNum(it.sell_price ?? it.cost ?? 0);
        const total = needed * unitPrice;

        return {
          _key: String(it.id),
          category: it.category || '',
          name: `${it.name}${it.bed_size ? ` ${String(it.bed_size).charAt(0).toUpperCase()}${String(it.bed_size).slice(1)}` : ''}`,
          required,
          target,
          existing,
          needed,
          unitPrice,
          total,
          _raw: it,
        };
      })
      .filter((r) => Number(r.required) > 0)
      .sort((a, b) => {
        const caRaw = String(a.category || '').trim();
        const cbRaw = String(b.category || '').trim();
        const ca = caRaw.toLowerCase();
        const cb = cbRaw.toLowerCase();

        const ra = ca === 'other' ? 1 : 0;
        const rb = cb === 'other' ? 1 : 0;
        if (ra !== rb) return ra - rb;

        if (ca !== cb) return ca.localeCompare(cb);

        const na = String(a.name || '').trim().toLowerCase();
        const nb = String(b.name || '').trim().toLowerCase();
        return na.localeCompare(nb);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alwaysItems, unitDetails, existingByItemId, targetByItemId, draftLines]);

  const grandTotal = useMemo(() => {
    return rows.reduce((acc, r) => acc + safeNum(r.total), 0);
  }, [rows]);

  // --- UI -----------------------------------------------------------------
  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Unit Purchases</div>
        <div>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <style>{`
        @keyframes o2SavingBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {(() => {
            if (!unitId) return <span>Select a unit</span>;
            const u = unitDetails || {};
            const unitName = u.unitName || u.unit_name || u.name || `Unit #${unitId}`;
            const type = u.type || '';
            const pax = u.pax ?? u.guests ?? u.max_guests ?? '';
            const beds = u.beds ?? '';
            const baths = u.baths ?? u.bathrooms ?? '';

            let breakdown = '';
            if (Array.isArray(u.bedConfig) && u.bedConfig.length) {
              breakdown = u.bedConfig
                .filter((x) => x && (x.count ?? x.qty ?? 0) > 0)
                .map((x) => `${x.count ?? x.qty} ${String(x.type || '').toLowerCase()}`.trim())
                .filter(Boolean)
                .join(', ');
            }

            return (
              <>
                <span style={{ fontWeight: 800 }}>{unitName}</span>

                {type && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>🏷️</span>
                    <span>{type}</span>
                  </span>
                )}

                {pax !== '' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>👤</span>
                    <span>{pax}</span>
                  </span>
                )}

                {beds !== '' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>🛏️</span>
                    <span>
                      {beds}
                      {breakdown ? ` (${breakdown})` : ''}
                    </span>
                  </span>
                )}

                {baths !== '' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>🛁</span>
                    <span>{baths}</span>
                  </span>
                )}
              </>
            );
          })()}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {!unitId ? (
            <button
              type="button"
              onClick={async () => {
                const items = candidateUnits?.length ? candidateUnits : await loadCandidateUnits();
                // Prefer parent-provided handler, but pass candidates so the modal can render immediately.
                if (typeof onOpenNewPurchaseList === 'function') {
                  onOpenNewPurchaseList(items);
                  return;
                }
                // Fallback: no handler wired yet
                alert('New Purchase List modal is not wired in the parent yet.');
              }}
              style={{
                padding: '6px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                background: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
                opacity: 1,
              }}
              title="Create a new purchase list"
            >
              {candidatesLoading ? 'Loading…' : `New Purchase List${candidateUnits?.length ? ` (${candidateUnits.length})` : ''}`}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!unitId || isReadOnly}
                onClick={async () => {
                  if (!unitId || isReadOnly) return;

                  // Ensure a draft exists so we have list.id before adding lines
                  if (!draftList || !draftList.id) {
                    try {
                      setLoadingDraft(true);
                      const ensured = await authFetchJson(`/api/units/${unitId}/purchase-list/draft/ensure`, { method: 'POST' });
                      setDraftList(ensured?.list ?? null);
                      setDraftLines(Array.isArray(ensured?.lines) ? ensured.lines : []);
                    } catch (e) {
                      // eslint-disable-next-line no-console
                      console.error('[UnitPurchasesTab] ensure draft before add failed', e);
                      return;
                    } finally {
                      setLoadingDraft(false);
                    }
                  }

                  setAddItemOpen(true);
                }}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: !unitId || isReadOnly ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  opacity: !unitId || isReadOnly ? 0.6 : 1,
                }}
              >
                Add Item
              </button>
              <button
                type="button"
                disabled={!draftList?.id}
                onClick={openPreview}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: !draftList?.id ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  opacity: !draftList?.id ? 0.6 : 1,
                }}
              >
                Preview
              </button>
              <button
                type="button"
                disabled={!draftList?.id || isReadOnly}
                onClick={requestDeleteList}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #fee2e2',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: !draftList?.id || isReadOnly ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  opacity: !draftList?.id || isReadOnly ? 0.5 : 1,
                  color: '#dc2626',
                }}
              >
                Delete list
              </button>
              <button
                type="button"
                disabled
                style={{
                  padding: saveState === 'saving' ? '8px 10px 6px' : '6px 10px',
                  border: saveState === 'saved' ? '1px solid #1E6F68' : '1px solid #e5e7eb',
                  borderRadius: 10,
                  background:
                    saveState === 'saved'
                      ? '#1E6F68'
                      : saveState === 'error'
                      ? '#fee2e2'
                      : '#ffffff',
                  color: saveState === 'saved' ? '#ffffff' : '#111827',
                  cursor: 'default',
                  fontWeight: 700,
                  opacity: !unitId || isReadOnly ? 0.6 : 1,
                  minWidth: 132,
                  lineHeight: 1.05,
                }}
              >
                {saveState === 'saving' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div>Saving Draft…</div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 999,
                        background: '#e5e7eb',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '40%',
                          background: '#1E6F68',
                          borderRadius: 999,
                          animation: 'o2SavingBar 1.1s linear infinite',
                        }}
                      />
                    </div>
                  </div>
                ) : saveState === 'error' ? (
                  'Save failed'
                ) : (
                  'Draft Saved'
                )}
              </button>
            </>
          )}
        </div>
      </div>
      {unitId && isReadOnly ? (
        <div style={{ marginTop: -4, marginBottom: 10, color: '#6b7280', fontSize: 12 }}>
          Read-only view (status: {effectiveStatusUpper.toLowerCase()}).
        </div>
      ) : null}

      <UnitPurchaseListAddItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        listId={draftList?.id ?? null}
        onAdded={async () => {
          try {
            await refreshDraft();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[UnitPurchasesTab] refresh after add failed', e);
          }
        }}
      />

      <O2ConfirmDialog
        open={!!deleteState.open}
        title="Delete item?"
        message={`Remove "${deleteState.name || 'this item'}" from the purchase list?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteLine}
        onCancel={closeDeleteDialog}
        onClose={closeDeleteDialog}
      />

      <O2ConfirmDialog
        open={!!deleteListState.open}
        title="Delete list?"
        message="Delete the entire draft purchase list? This will remove all items in the list."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteList}
        onCancel={closeDeleteListDialog}
        onClose={closeDeleteListDialog}
      />

      {/* Preview modal (PDF in iframe via blob URL) */}
      {previewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            // close when clicking the backdrop (but not when clicking the panel)
            if (e.target === e.currentTarget) closePreview();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(1100px, 96vw)',
              height: 'min(760px, 92vh)',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                borderBottom: '1px solid #e5e7eb',
                background: '#f9fafb',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Purchase List Preview</span>
                {draftList?.id ? (
                  <span style={{ fontWeight: 600, color: '#6b7280', fontSize: 12 }}>#{draftList.id}</span>
                ) : null}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={openPreviewNewTab}
                  disabled={previewLoading}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    background: '#fff',
                    cursor: previewLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    opacity: previewLoading ? 0.6 : 1,
                  }}
                >
                  Open in new tab
                </button>

                <button
                  type="button"
                  onClick={closePreview}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    background: '#fff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
              {previewLoading ? (
                <div style={{ padding: 16, color: '#6b7280' }}>Loading preview…</div>
              ) : previewError ? (
                <div style={{ padding: 16, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>{previewError}</div>
              ) : previewUrl ? (
                <iframe
                  title="Purchase list PDF preview"
                  src={previewUrl}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                />
              ) : (
                <div style={{ padding: 16, color: '#6b7280' }}>No preview available.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!unitId ? (
        <>
          <div style={{ padding: 12, border: '1px dashed #e5e7eb', borderRadius: 10, color: '#6b7280' }}>
            Select a unit to calculate required items and quantities.
          </div>
          {/* Inline error hint if candidates fail to load */}
          {candidatesError ? (
            <div style={{ marginTop: 8, color: '#b91c1c', fontSize: 12 }}>
              {candidatesError}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ position: 'relative' }}>
              {/* Fades to hint scrollable content */}
              {!scrollMeta.atTop && scrollMeta.canScroll ? (
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    height: 18,
                    marginBottom: -18,
                    zIndex: 4,
                    pointerEvents: 'none',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.10), rgba(0,0,0,0))',
                  }}
                />
              ) : null}

              {(!scrollMeta.atBottom && scrollMeta.canScroll) ? (
                <div
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    height: 22,
                    marginTop: -22,
                    zIndex: 4,
                    pointerEvents: 'none',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.10), rgba(0,0,0,0))',
                  }}
                />
              ) : null}

              <div
                ref={scrollRef}
                style={{
                  maxHeight: 600,
                  overflowY: 'auto',
                  overflowX: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={stickyTh}>Category</th>
                  <th style={stickyTh}>Name</th>
                  <th style={{ ...stickyTh, textAlign: 'right' }}>Min</th>
                  <th style={{ ...stickyTh, textAlign: 'right' }}>Target</th>
                  <th style={{ ...stickyTh, textAlign: 'right' }}>Existing</th>
                  <th style={{ ...stickyTh, textAlign: 'right' }}>Needed</th>
                  <th style={{ ...stickyTh, textAlign: 'right' }}>Unit Price</th>
                  <th style={{ ...stickyTh, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const itemId =
                    r?._raw?.item_id ??
                    r?._raw?.itemId ??
                    r?._raw?.catalog_item_id ??
                    r?._raw?.catalogItemId ??
                    null;

                  const existingKey = itemId !== null && itemId !== undefined ? itemId : r._key;
                  const lineId = r?._raw?.id ?? null;
                  // Compute neededNow and isZeroNeeded for this row
                  const neededNow = Math.max(
                    0,
                    safeNum((targetByItemId[existingKey] ?? r.target ?? r.required ?? 0)) -
                      safeNum(existingByItemId[existingKey] ?? r.existing ?? 0)
                  );
                  const isZeroNeeded = neededNow === 0;

                  return (
                    <tr
                    key={r._key}
                    style={{
                        borderTop: '1px solid #f3f4f6',
                        color: isZeroNeeded ? '#9ca3af' : '#111827',
                    }}
                >
                      <td style={td}>{r.category || ''}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.name || ''}
                            </span>

                            {(() => {
                              const rawNotes = r?._raw?.notes ?? '';
                              const notesVal = lineId ? (notesByLineId[String(lineId)] ?? rawNotes ?? '') : (rawNotes ?? '');

                              // Show nothing if empty in read-only/non-persisted rows
                              if (!notesVal && !(lineId && !isReadOnly)) return null;

                              // Editable only for persisted lines in DRAFT
                              if (lineId && !isReadOnly) {
                                return (
                                  <input
                                    type="text"
                                    value={notesVal}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setNotesByLineId((prev) => ({ ...prev, [String(lineId)]: v }));
                                      if (effectiveStatusUpper === 'DRAFT' && draftList?.id) {
                                        queueLineSave(lineId, { notes: v });
                                      }
                                    }}
                                    style={{
                                      width: 260,
                                      maxWidth: '100%',
                                      height: 22,
                                      padding: '0 0',
                                      border: 'none',
                                      borderBottom: '1px solid #e5e7eb',
                                      borderRadius: 0,
                                      fontSize: 12,
                                      color: notesVal ? '#111827' : '#6b7280',
                                      background: 'transparent',
                                      outline: 'none',
                                    }}
                                  />
                                );
                              }

                              return (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: '#6b7280',
                                    lineHeight: 1.25,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {String(notesVal)}
                                </div>
                              );
                            })()}
                          </div>

                          {lineId ? (
                            <button
                              type="button"
                              title={isReadOnly ? 'Read-only' : 'Delete row'}
                              disabled={isReadOnly}
                              onClick={() => requestDeleteLine(lineId, r.name)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                margin: 0,
                                cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                color: '#dc2626',
                                fontSize: 16,
                                lineHeight: 1,
                                opacity: isReadOnly ? 0.35 : 1,
                              }}
                            >
                              <TrashIcon style={{ width: 16, height: 16 }} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.required}</td>

                      <td style={{ ...td, textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          disabled={isReadOnly}
                          value={
                            targetByItemId[existingKey] ??
                            r.target ??
                            r.required ??
                            0
                          }
                          onFocus={() => {
                            if (isReadOnly) return;
                            setTargetByItemId((prev) => ({ ...prev, [existingKey]: '' }));
                          }}
                          onChange={(e) => {
                            if (isReadOnly) return;
                            const v = e.target.value;
                            setTargetByItemId((prev) => ({
                              ...prev,
                              [existingKey]: v,
                            }));

                            if (effectiveStatusUpper === 'DRAFT' && draftList?.id && lineId) {
                              queueLineSave(lineId, { qty: v === '' ? 0 : Number(v) });
                            }
                          }}
                          onBlur={(e) => {
                            if (isReadOnly) return;
                            const v = e.target.value;
                            // Normalize empty to 0 so we don't keep blanks if user leaves field empty
                            setTargetByItemId((prev) => ({
                              ...prev,
                              [existingKey]: v === '' ? 0 : v,
                            }));
                          }}
                          style={{
                            width: 80,
                            padding: '4px 6px',
                            textAlign: 'right',
                            border: '1px solid #e5e7eb',
                            borderRadius: 8,
                          }}
                        />
                      </td>

                      <td style={{ ...td, textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          disabled={isReadOnly}
                          value={existingByItemId[existingKey] ?? r.existing ?? 0}
                          onFocus={() => {
                            if (isReadOnly) return;
                            setExistingByItemId((prev) => ({ ...prev, [existingKey]: '' }));
                          }}
                          onChange={(e) => {
                            if (isReadOnly) return;
                            const v = e.target.value;
                            setExistingByItemId((prev) => ({
                              ...prev,
                              [existingKey]: v,
                            }));

                            if (effectiveStatusUpper === 'DRAFT' && draftList?.id && lineId) {
                              queueLineSave(lineId, { existing_qty: v === '' ? 0 : Number(v) });
                            }
                          }}
                          onBlur={(e) => {
                            if (isReadOnly) return;
                            const v = e.target.value;
                            setExistingByItemId((prev) => ({
                              ...prev,
                              [existingKey]: v === '' ? 0 : v,
                            }));
                          }}
                          style={{
                            width: 80,
                            padding: '4px 6px',
                            textAlign: 'right',
                            border: '1px solid #e5e7eb',
                            borderRadius: 8,
                          }}
                        />
                      </td>

                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {neededNow}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(r.unitPrice)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {fmtMoney(neededNow * safeNum(r.unitPrice))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr
                  style={{
                    borderTop: '1px solid #e5e7eb',
                    background: '#fff',
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 2,
                  }}
                >
                  <td style={{ ...td, background: '#fff' }} colSpan={7}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800 }}>Grand Total</span>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>Rows: {rows.length}</span>
                      {scrollMeta.canScroll ? (
                        <span style={{ color: '#6b7280', fontSize: 12 }}>
                          {scrollMeta.atBottom ? 'End of list' : 'Scroll for more'}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ ...td, background: '#fff', textAlign: 'right', fontWeight: 800 }}>{fmtMoney(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
}

const th = {
  textAlign: 'left',
  fontSize: 12,
  color: '#6b7280',
  padding: '10px 12px',
  whiteSpace: 'nowrap',
};

const stickyTh = {
  ...th,
  position: 'sticky',
  top: 0,
  zIndex: 3,
  background: '#f9fafb',
};

const td = {
  padding: '10px 12px',
  fontSize: 14,
  whiteSpace: 'nowrap',
};