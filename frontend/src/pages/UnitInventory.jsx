import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import inventoryPresets from '../constants/inventoryPresets';
import PageScaffold from '../components/layout/PageScaffold';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import ItemCatalogTab from './unitSetup/ItemCatalogTab';
import UnitPurchasesTab from './unitSetup/UnitPurchasesTab';
import UnitPurchaseListNewListModal from '../components/modals/UnitPurchaseListNewListModal';

// Simple debounce hook
function useDebouncedValue(value, delay = 400) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}

const STATUSES = [
    { value: '', label: 'All' },
    { value: 'collecting', label: 'In progress' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'ready', label: 'Ready' },
    { value: 'sent', label: 'Sent' },
    { value: 'signed', label: 'Signed' },
];

const OTHER_LABEL = 'Otros';
function getAreaOptions(area) {
    const src = inventoryPresets || {};
    // Common shapes: { Cocina: ['Cafetera', ...] } or { AREAS: { Cocina: [...] } }
    const map = src.AREAS || src.areas || src;
    const list = (map && (map[area] || map[String(area)])) || [];
    // Ensure it's an array of strings
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
}

export default function UnitInventoryPage() {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // filters
    const [status, setStatus] = useState('');
    const [city, setCity] = useState('');
    const [q, setQ] = useState('');
    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    const qDebounced = useDebouncedValue(q, 400);
    const cityDebounced = useDebouncedValue(city, 400);

    const canPrev = offset > 0;
    const canNext = offset + rows.length < total;

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                limit,
                offset,
            };
            if (status) params.status = status;
            if (cityDebounced) params.city = cityDebounced;
            if (qDebounced) params.q = qDebounced;

            const { data } = await api.get('/api/unit-inventory/sessions', { params });
            setRows(data?.rows ?? []);
            setTotal(data?.total ?? 0);
        } catch (err) {
            console.error('Failed to load sessions', err);
            setError(err?.response?.data?.message || err.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [status, cityDebounced, qDebounced, limit, offset]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        fetchData();
    }, [fetchData]);

    const onPrev = useCallback(() => {
        if (!canPrev) return;
        setOffset(Math.max(0, offset - limit));
    }, [canPrev, offset, limit]);

    const onNext = useCallback(() => {
        if (!canNext) return;
        setOffset(offset + limit);
    }, [canNext, offset, limit]);

    const [activeSessionId, setActiveSessionId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const [activeTab, setActiveTab] = useState('items'); // 'items' | 'photos'
    // Signed-URL PDF preview (iframe)
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [activeView, setActiveView] = useState('purchases'); // 'catalog' | 'inventory' | 'purchases'
    // Purchases tab filter/state (status + unit selector in header)
    const [purchaseListStatus, setPurchaseListStatus] = useState('ALL'); // ALL | DRAFT | SENT | APPROVED | DONE
    const [purchaseUnits, setPurchaseUnits] = useState([]);
    const [purchaseUnitsLoading, setPurchaseUnitsLoading] = useState(false);
    const [purchaseUnitsError, setPurchaseUnitsError] = useState('');
    const [purchaseUnitId, setPurchaseUnitId] = useState('');

    // New Purchase List modal (unit candidates from Units table)
    const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
    const [newPurchaseUnitId, setNewPurchaseUnitId] = useState('');
    const [purchaseCandidates, setPurchaseCandidates] = useState([]);
    const [purchaseCandidatesLoading, setPurchaseCandidatesLoading] = useState(false);
    const [purchaseCandidatesError, setPurchaseCandidatesError] = useState('');

    const openNewPurchaseModal = useCallback(async () => {
        setNewPurchaseUnitId('');
        setPurchaseCandidatesError('');
        setNewPurchaseOpen(true);

        // Lazy-load candidates (Active/Onboarding units) when opening
        if (purchaseCandidatesLoading) return;
        if (Array.isArray(purchaseCandidates) && purchaseCandidates.length > 0) return;

        try {
            setPurchaseCandidatesLoading(true);
            const { data } = await api.get('/api/unit-purchase-lists/candidates');
            const items = Array.isArray(data?.items) ? data.items : [];
            setPurchaseCandidates(items);
        } catch (e) {
            setPurchaseCandidatesError(e?.response?.data?.message || e.message || 'Failed to load unit candidates');
            setPurchaseCandidates([]);
        } finally {
            setPurchaseCandidatesLoading(false);
        }
    }, [purchaseCandidates, purchaseCandidatesLoading]);

    const closeNewPurchaseModal = useCallback(() => {
        setNewPurchaseOpen(false);
        setNewPurchaseUnitId('');
        setPurchaseCandidatesError('');
    }, []);

    const confirmNewPurchaseModal = useCallback(() => {
        const uid = String(newPurchaseUnitId || '').trim();
        if (!uid) return;

        // Reset filters to ALL (so the tab can sync to latest list status after creation)
        setPurchaseListStatus('ALL');
        setPurchaseUnitId(uid);

        // Close modal
        setNewPurchaseOpen(false);
        setNewPurchaseUnitId('');
        setPurchaseCandidatesError('');
    }, [newPurchaseUnitId]);
    useEffect(() => {
        let alive = true;

        async function loadUnitsForPurchases() {
            if (activeView !== 'purchases') return;

            // When changing status, we intentionally refetch the unit options
            setPurchaseUnitsLoading(true);
            setPurchaseUnitsError('');
            try {
                const statusParam = purchaseListStatus && purchaseListStatus !== 'ALL' ? purchaseListStatus : 'ALL';
                const { data } = await api.get('/api/unit-purchase-lists/units', {
                    params: { status: statusParam },
                });
                const items = Array.isArray(data?.items) ? data.items : [];
                if (!alive) return;

                setPurchaseUnits(items);

                // If currently selected unit is not in options anymore, clear it
                if (purchaseUnitId && !items.some((u) => String(u.id) === String(purchaseUnitId))) {
                    setPurchaseUnitId('');
                }
            } catch (e) {
                if (!alive) return;
                setPurchaseUnitsError(e?.response?.data?.message || e.message || 'Failed to load units');
                setPurchaseUnits([]);
                setPurchaseUnitId('');
            } finally {
                if (alive) setPurchaseUnitsLoading(false);
            }
        }

        loadUnitsForPurchases();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeView, purchaseListStatus, purchaseUnitId]);

    // If user picked a unit while Status=ALL, auto-sync status to that unit's latest list status
    useEffect(() => {
        let alive = true;

        async function syncStatusForSelectedUnit() {
            if (activeView !== 'purchases') return;
            if (!purchaseUnitId) return;
            if (purchaseListStatus !== 'ALL') return;

            try {
                const { data } = await api.get(`/api/units/${purchaseUnitId}/purchase-list`, {
                    params: { status: 'ALL' },
                });
                const stRaw = data?.list?.status;
                const st = String(stRaw || '').toUpperCase().trim();
                if (!alive) return;

                if (st && st !== 'ALL') {
                    // Only sync when ALL is selected, so we don't override explicit user choice
                    setPurchaseListStatus(st);
                }
            } catch (e) {
                // Best-effort; ignore failures
                // eslint-disable-next-line no-console
                console.warn('[UnitInventory] syncStatusForSelectedUnit failed', e);
            }
        }

        syncStatusForSelectedUnit();
        return () => { alive = false; };
    }, [activeView, purchaseUnitId, purchaseListStatus]);

    // Helper to fetch signed URL for PDF preview (force inline)
    const openItemsPreview = useCallback(async () => {
        if (!activeSessionId) return;
        setPreviewError('');
        setPreviewLoading(true);
        try {
            const { data } = await api.get(`/api/reports/unit-inventory/items/${activeSessionId}/signed`);
            const base = (data?.url || '').trim();
            if (!base) {
                throw new Error('No signed URL returned');
            }
            // Ensure inline preview & cache-bust
            const inlineUrl = base.includes('disposition=')
                ? base.replace(/disposition=attachment/gi, 'disposition=inline')
                : `${base}${base.includes('?') ? '&' : '?'}disposition=inline`;
            const withTs = `${inlineUrl}&t=${Date.now()}`;
            setPreviewUrl(withTs);
            setPreviewOpen(true);
        } catch (e) {
            setPreviewError(e?.response?.data?.message || e.message || 'Failed to get preview URL');
            setPreviewOpen(false);
            setPreviewUrl('');
        } finally {
            setPreviewLoading(false);
        }
    }, [activeSessionId]);

    // Cache-busting iframe src for preview, always force disposition=inline
    const iframeSrc = useMemo(() => {
        if (!previewUrl) return '';
        const ensureInline = previewUrl.includes('disposition=')
            ? previewUrl.replace(/disposition=attachment/gi, 'disposition=inline')
            : `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}disposition=inline`;
        const t = Date.now();
        return ensureInline.includes('t=') ? ensureInline : `${ensureInline}&t=${t}`;
    }, [previewUrl]);
    // Collapsible Areas state for Items tab
    const [openAreas, setOpenAreas] = useState({});
    const toggleArea = (name) => {
        setOpenAreas((prev) => ({ ...prev, [name]: !prev[name] }));
    };
    // Collapsible Areas state for Photos tab
    const [openPhotoAreas, setOpenPhotoAreas] = useState({});
    const togglePhotoArea = (name) => {
        setOpenPhotoAreas((prev) => ({ ...prev, [name]: !prev[name] }));
    };


    // Photo edit/delete state
    const [editingPhoto, setEditingPhoto] = useState(null);
    const [photoSaving, setPhotoSaving] = useState(false);
    const [photoError, setPhotoError] = useState(null);

    // Inline enlarge (lightbox-style)
    const [enlargedPhoto, setEnlargedPhoto] = useState(null);
    const openEnlarge = useCallback((ph) => setEnlargedPhoto(ph || null), []);
    const closeEnlarge = useCallback(() => setEnlargedPhoto(null), []);
    // Close on ESC
    useEffect(() => {
        if (!enlargedPhoto) return;
        const onKey = (e) => {
            if (e.key === 'Escape') closeEnlarge();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enlargedPhoto, closeEnlarge]);

    // Offer area choices from items/photos already present
    const allAreas = useMemo(() => {
        if (!detail) return [];
        const fromItems = (detail.items || []).map(i => i.area).filter(Boolean);
        const fromPhotos = (detail.photos || []).map(p => p.area).filter(Boolean);
        const set = new Set([...fromItems, ...fromPhotos].map(a => String(a).trim()).filter(Boolean));
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }, [detail]);

    const handleDeletePhoto = useCallback(async (photoId) => {
        if (!photoId) return;
        if (!window.confirm('Delete this photo?')) return;
        try {
            setPhotoError(null);
            await api.delete(`/api/unit-inventory/photo/${photoId}`);
            // update local state
            setDetail(prev => {
                if (!prev) return prev;
                const next = { ...prev, photos: (prev.photos || []).filter(ph => ph.id !== photoId) };
                return next;
            });
        } catch (e) {
            setPhotoError(e?.response?.data?.message || e.message || 'Delete failed');
        }
    }, []);

    const handleOpenEditPhoto = useCallback((ph) => {
        setPhotoError(null);
        setEditingPhoto(ph || null);
    }, []);

    const handleCloseEditPhoto = useCallback(() => {
        setEditingPhoto(null);
        setPhotoSaving(false);
        setPhotoError(null);
    }, []);

    const handleSaveEditPhoto = useCallback(async ({ area, caption }) => {
        if (!editingPhoto) return;
        try {
            setPhotoSaving(true);
            setPhotoError(null);
            await api.patch(`/api/unit-inventory/photo/${editingPhoto.id}`, { area, caption });
            // merge back into detail
            setDetail(prev => {
                if (!prev) return prev;
                const nextPhotos = (prev.photos || []).map(p => p.id === editingPhoto.id ? { ...p, area, caption } : p);
                return { ...prev, photos: nextPhotos };
            });
            setEditingPhoto(null);
        } catch (e) {
            setPhotoError(e?.response?.data?.message || e.message || 'Save failed');
        } finally {
            setPhotoSaving(false);
        }
    }, [editingPhoto]);

    const loadSession = useCallback(async (id) => {
        if (!id) return;
        setDetailLoading(true);
        setDetailError(null);
        try {
            const { data } = await api.get(`/api/unit-inventory/session/${id}`);
            setDetail(data?.session || null);
        } catch (err) {
            console.error('Failed to load session', err);
            setDetailError(err?.response?.data?.message || err.message || 'Failed to load session');
        } finally {
            setDetailLoading(false);
        }
    }, []);
    // Group items by Area for collapsible UI
    const groupedItems = useMemo(() => {
        const map = {};
        const list = detail?.items || [];
        for (const it of list) {
            const area = (it.area || '—').trim();
            if (!map[area]) map[area] = [];
            map[area].push(it);
        }
        // sort areas A–Z and items by name (with Spanish fallbacks)
        const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
        return entries.map(([area, items]) => ({
            area,
            items: items
                .slice()
                .sort((a, b) =>
                    String(a.name || a.itemName || a.descripcion || '')
                        .localeCompare(
                            String(b.name || b.itemName || b.descripcion || ''),
                            undefined,
                            { sensitivity: 'base' }
                        )
                )
        }));
    }, [detail]);
    const groupedPhotos = useMemo(() => {
        const map = {};
        const list = detail?.photos || [];
        for (const ph of list) {
            const area = (ph.area || '—').trim();
            if (!map[area]) map[area] = [];
            map[area].push(ph);
        }
        const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
        return entries.map(([area, photos]) => ({ area, photos }));
    }, [detail]);

    const onLimitChange = useCallback((e) => {
        const next = Number(e.target.value) || 20;
        setLimit(next);
        setOffset(0);
    }, []);

    const onOpenInv = useCallback((id) => {
        if (!id) return;
        setActiveTab('items');
        setActiveSessionId(id);
        loadSession(id);
    }, [loadSession]);

    const onOpenPhotos = useCallback((id) => {
        if (!id) return;
        setActiveTab('photos');
        setActiveSessionId(id);
        loadSession(id);
    }, [loadSession]);

    const header = useMemo(() => (
        <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0 }}>Inventory Sessions (Desktop Review)</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>
                    Status:{' '}
                    <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </label>
                <label>
                    City:{' '}
                    <input
                        type="text"
                        value={city}
                        onChange={(e) => { setCity(e.target.value); setOffset(0); }}
                        placeholder="e.g. Tulum"
                        style={{ width: 160 }}
                    />
                </label>
                <label>
                    Search:{' '}
                    <input
                        type="text"
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setOffset(0); }}
                        placeholder="Unit name..."
                        style={{ width: 220 }}
                    />
                </label>
                <label>
                    Per page:{' '}
                    <select value={limit} onChange={onLimitChange}>
                        {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </label>
                <button onClick={onRefresh} disabled={loading}>
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>
        </div>
    ), [status, city, q, limit, loading, onLimitChange, onRefresh]);

    const DetailPanel = useMemo(() => {
        if (!activeSessionId) return null;
        return (
            <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Session #{activeSessionId} — Inventory</h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => loadSession(activeSessionId)} disabled={detailLoading}>Reload</button>
                        <button onClick={() => { setActiveSessionId(null); setDetail(null); }}>Close</button>
                    </div>
                </div>
                {detailError && (
                    <div style={{ marginTop: 8, color: 'white', background: '#c0392b', padding: 8, borderRadius: 4 }}>
                        {String(detailError)}
                    </div>
                )}
                {detailLoading && <div style={{ padding: 12 }}>Loading session…</div>}
                {!detailLoading && detail && (
                    <div style={{ marginTop: 8 }}>
                        <div style={{ maxWidth: 980, margin: '0 auto' }}>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, color: '#555' }}>
                                <span><b>Unit:</b> {detail.unitName ?? detail.unitId}</span>
                                <span><b>Status:</b> <StatusBadge status={detail.status} /></span>
                                <span><b>Read-only:</b> {detail.readOnly ? 'Yes' : 'No'}</span>
                                <span><b>Started:</b> <DateCell value={detail.startedAt} /></span>
                                <span><b>Submitted:</b> <DateCell value={detail.submittedAt} /></span>
                                <span><b>Inv Issued:</b> <DateCell value={detail.invIssuedAt} /></span>
                                <span><b>Photos Issued:</b> <DateCell value={detail.photoIssuedAt} /></span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #eee', margin: '8px 0', paddingBottom: 6 }}>
                                <button
                                    onClick={() => { setActiveTab('items'); }}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: 999,
                                        border: '1px solid ' + (activeTab === 'items' ? '#1e6f68' : '#ddd'),
                                        background: activeTab === 'items' ? '#eafaf1' : '#fff',
                                        color: activeTab === 'items' ? '#1e6f68' : '#333',
                                        fontWeight: 600
                                    }}
                                >
                                    Items
                                </button>
                                <button
                                    onClick={() => { setActiveTab('photos'); setPreviewOpen(false); setPreviewUrl(''); setPreviewError(''); }}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: 999,
                                        border: '1px solid ' + (activeTab === 'photos' ? '#1e6f68' : '#ddd'),
                                        background: activeTab === 'photos' ? '#eafaf1' : '#fff',
                                        color: activeTab === 'photos' ? '#1e6f68' : '#333',
                                        fontWeight: 600
                                    }}
                                >
                                    Photos
                                </button>
                                <button
                                    onClick={async () => {
                                        if (activeTab !== 'items') return;
                                        if (previewOpen) {
                                            setPreviewOpen(false);
                                            setPreviewUrl('');
                                            return;
                                        }
                                        await openItemsPreview();
                                    }}
                                    disabled={activeTab !== 'items'}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: 999,
                                        border: '1px solid ' + (previewOpen ? '#1e6f68' : '#ddd'),
                                        background: previewOpen ? '#eafaf1' : '#fff',
                                        color: previewOpen ? '#1e6f68' : (activeTab !== 'items' ? '#999' : '#333'),
                                        fontWeight: 600,
                                        opacity: activeTab !== 'items' ? 0.6 : 1,
                                        cursor: activeTab !== 'items' ? 'not-allowed' : 'pointer'
                                    }}
                                    title={activeTab !== 'items' ? 'Preview available for Items tab' : (previewOpen ? 'Hide preview' : 'Preview')}
                                >
                                    {previewOpen ? 'Hide preview' : 'Preview'}
                                </button>
                            </div>
                            {previewOpen && previewUrl && (
                                <div style={{ margin: '8px 0 12px', padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                                    <div style={{ maxWidth: 980, margin: '0 auto' }}>
                                        {previewLoading && (
                                            <div style={{ padding: '6px 0', color: '#555', fontSize: 13 }}>Loading preview…</div>
                                        )}
                                        {previewError && (
                                            <div style={{ padding: '6px 0', color: '#c0392b', fontSize: 13 }}>Preview error: {String(previewError)}</div>
                                        )}
                                        {!previewLoading && !previewError && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                // Always fetch a fresh signed URL before downloading
                                                                const { data } = await api.get(`/api/reports/unit-inventory/items/${activeSessionId}/signed`);
                                                                const base = (data?.url || '').trim();
                                                                if (!base) throw new Error('No signed URL returned');
                                                                const downloadUrl = base.includes('disposition=')
                                                                    ? base.replace(/disposition=inline/gi, 'disposition=attachment')
                                                                    : `${base}${base.includes('?') ? '&' : '?'}disposition=attachment`;

                                                                // Open in a new tab to trigger browser download UI
                                                                window.open(downloadUrl, '_blank', 'noopener,noreferrer');
                                                            } catch (e) {
                                                                setPreviewError(e?.response?.data?.message || e.message || 'Failed to get download URL');
                                                            }
                                                        }}
                                                        style={{ padding: '6px 10px', border: '1px solid #1e6f68', background: '#1e6f68', color: '#fff', borderRadius: 6, fontWeight: 600 }}
                                                        title="Download PDF"
                                                    >
                                                        Download PDF
                                                    </button>
                                                </div>
                                                <iframe
                                                    title="Items PDF Preview"
                                                    src={iframeSrc}
                                                    style={{ width: '100%', height: 900, border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {activeTab === 'items' && (
                                <>
                                    <h3 style={{ margin: '8px 0' }}>Items</h3>
                                    {(!groupedItems || groupedItems.length === 0) && (
                                        <div style={{ color: '#666', padding: '8px 0' }}>No items yet.</div>
                                    )}
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        {groupedItems.map(({ area, items }) => {
                                            const isOpen = !!openAreas[area];
                                            return (
                                                <div key={area} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                                                    <button
                                                        onClick={() => toggleArea(area)}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            gap: 12,
                                                            padding: '10px 12px',
                                                            fontSize: 16,
                                                            background: '#fff',
                                                            border: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                        aria-expanded={isOpen}
                                                    >
                                                        <span style={{ fontWeight: 600 }}>{area}</span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <span style={{ color: '#666', fontSize: 13 }}>({items.length})</span>
                                                            <span style={{
                                                                transition: 'transform 0.15s ease',
                                                                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                                                display: 'inline-block'
                                                            }}>▾</span>
                                                        </span>
                                                    </button>
                                                    {isOpen && (
                                                        <div style={{ borderTop: '1px solid #eee', padding: 8 }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                                                <colgroup>
                                                                    <col style={{ width: 'auto' }} />
                                                                    <col style={{ width: 80 }} />
                                                                    <col style={{ width: 280 }} />
                                                                    <col style={{ width: 72 }} />
                                                                </colgroup>
                                                                <thead>
                                                                    <tr>
                                                                        <Th>Item</Th>
                                                                        <Th style={{ width: 80, textAlign: 'right' }}>Qty</Th>
                                                                        <Th style={{ width: 280 }}>Notes</Th>
                                                                        <Th style={{ width: 72, textAlign: 'right' }}>Actions</Th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {items.map((it) => (
                                                                        <ItemRow
                                                                            key={it.id}
                                                                            it={it}
                                                                            readOnly={detail.readOnly}
                                                                            onUpdated={(next) => {
                                                                                setDetail((prev) => {
                                                                                    if (!prev) return prev;
                                                                                    const nextItems = (prev.items || []).map((x) => (x.id === next.id ? { ...x, ...next } : x));
                                                                                    return { ...prev, items: nextItems };
                                                                                });
                                                                            }}
                                                                            onDeleted={(deletedId) => {
                                                                                setDetail((prev) => {
                                                                                    if (!prev) return prev;
                                                                                    const nextItems = (prev.items || []).filter((x) => x.id !== deletedId);
                                                                                    return { ...prev, items: nextItems };
                                                                                });
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            {activeTab === 'photos' && (
                                <>
                                    <h3 style={{ margin: '8px 0' }}>Photos</h3>
                                    {(!groupedPhotos || groupedPhotos.length === 0) && (
                                        <div style={{ color: '#666', padding: '8px 0' }}>No photos yet.</div>
                                    )}
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        {groupedPhotos.map(({ area, photos }) => {
                                            const isOpen = !!openPhotoAreas[area];
                                            return (
                                                <div key={area} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                                                    <button
                                                        onClick={() => togglePhotoArea(area)}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            gap: 12,
                                                            padding: '10px 12px',
                                                            fontSize: 16,
                                                            background: '#fff',
                                                            border: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                        aria-expanded={isOpen}
                                                    >
                                                        <span style={{ fontWeight: 600 }}>{area}</span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <span style={{ color: '#666', fontSize: 13 }}>({photos.length})</span>
                                                            <span style={{
                                                                transition: 'transform 0.15s ease',
                                                                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                                                display: 'inline-block'
                                                            }}>▾</span>
                                                        </span>
                                                    </button>
                                                    {isOpen && (
                                                        <div style={{ borderTop: '1px solid #eee', padding: 8 }}>
                                                            <div style={{ maxWidth: 980, margin: '0 auto' }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                                                                    {photos.map((ph) => (
                                                                        <div key={ph.id} style={{ position: 'relative', border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
                                                                            {/* Action icons (top-right) */}
                                                                            <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 6, zIndex: 2 }}>
                                                                                {/* Delete (trash) */}
                                                                                <button
                                                                                    title="Delete photo"
                                                                                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(ph.id); }}
                                                                                    style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid #ddd', borderRadius: 6, padding: 4, cursor: 'pointer' }}
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18, color: '#c0392b' }}>
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.108 1.022.169M4.772 5.79c.34-.061.68-.117 1.022-.169m3.678-.39A48.108 48.108 0 0114.53 5.4m-5.058 0A48.11 48.11 0 016.794 5.23m0 0L6.5 7h11l-.294-1.77M6.794 5.23L5.5 7m12 0v12a2.25 2.25 0 01-2.25 2.25H8.75A2.25 2.25 0 016.5 19V7" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>

                                                                            <div
                                                                                onClick={() => openEnlarge(ph)}
                                                                                title="Click to enlarge"
                                                                                style={{ aspectRatio: '4 / 3', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in' }}
                                                                            >
                                                                                {(ph.url || ph.fileUrl) ? (
                                                                                    <img
                                                                                        src={ph.url || ph.fileUrl}
                                                                                        alt={ph.caption || ph.area || 'Photo'}
                                                                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                                                                                    />
                                                                                ) : (
                                                                                    <div style={{ color: '#aaa', fontSize: 12 }}>no preview</div>
                                                                                )}
                                                                            </div>
                                                                            <div style={{ padding: 8, fontSize: 12, color: '#444' }}>
                                                                                <div><b>Area:</b> {ph.area || '-'}</div>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                                                                    <span>{ph.caption || '—'}</span>
                                                                                    <button
                                                                                        title="Edit area/caption"
                                                                                        onClick={(e) => { e.stopPropagation(); handleOpenEditPhoto(ph); }}
                                                                                        style={{
                                                                                            background: 'transparent',
                                                                                            border: 'none',
                                                                                            cursor: 'pointer',
                                                                                            padding: 4,
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            color: '#1e6f68'
                                                                                        }}
                                                                                    >
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18 }}>
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687 1.687m-2.74-.353a2.25 2.25 0 113.182 3.182L7.5 20.5 3 21.75l1.25-4.5L15.81 5.82z" />
                                                                                        </svg>
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                {/* Modal for editing photo */}
                                                                {editingPhoto && (
                                                                    <PhotoEditModal
                                                                        photo={editingPhoto}
                                                                        areas={allAreas}
                                                                        saving={photoSaving}
                                                                        error={photoError}
                                                                        onClose={handleCloseEditPhoto}
                                                                        onSave={handleSaveEditPhoto}
                                                                    />
                                                                )}
                                                                {enlargedPhoto && (
                                                                    <div
                                                                        onClick={closeEnlarge}
                                                                        style={{
                                                                            position: 'fixed',
                                                                            inset: 0,
                                                                            background: 'rgba(0,0,0,0.55)',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            zIndex: 9998,
                                                                            cursor: 'zoom-out'
                                                                        }}
                                                                    >
                                                                        <div
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            style={{
                                                                                maxWidth: '92vw',
                                                                                maxHeight: '88vh',
                                                                                background: '#000',
                                                                                borderRadius: 10,
                                                                                boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                                                                                overflow: 'hidden',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center'
                                                                            }}
                                                                        >
                                                                            <img
                                                                                src={enlargedPhoto.url || enlargedPhoto.fileUrl}
                                                                                alt={enlargedPhoto.caption || enlargedPhoto.area || 'Photo'}
                                                                                style={{ maxWidth: '70vw', maxHeight: '70vh', objectFit: 'contain' }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }, [
        activeSessionId,
        detail,
        detailError,
        detailLoading,
        loadSession,
        activeTab,
        openAreas,
        groupedPhotos,
        openPhotoAreas,
        editingPhoto,
        photoSaving,
        photoError,
        allAreas,
        handleCloseEditPhoto,
        handleSaveEditPhoto,
        enlargedPhoto,
        openEnlarge,
        closeEnlarge,
        previewOpen,
        previewLoading,
        previewError
    ]);

    return (
        <PageScaffold
            title={null}
            stickyHeader={
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pt: 1.5, pb: 1.5 }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            flexWrap: 'wrap',
                        }}
                    >
                        <Tabs
                            value={activeView}
                            onChange={(_, v) => setActiveView(v)}
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
                                value="catalog"
                                label={
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                        <span>Item Catalog</span>
                                        <span style={{ color: '#d1d5db', fontWeight: 600 }}>|</span>
                                    </Box>
                                }
                                sx={{
                                    minHeight: 34,
                                    px: 1.75,
                                    py: 0,
                                    textTransform: 'uppercase',
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    fontSize: 12,
                                    color: '#6b7280',
                                    '&.Mui-selected': { color: '#1E6F68' },
                                }}
                            />
                            <Tab
                                value="inventory"
                                label={
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                        <span>Unit Inventory</span>
                                        <span style={{ color: '#d1d5db', fontWeight: 600 }}>|</span>
                                    </Box>
                                }
                                sx={{
                                    minHeight: 34,
                                    px: 1.75,
                                    py: 0,
                                    textTransform: 'uppercase',
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    fontSize: 12,
                                    color: '#6b7280',
                                    '&.Mui-selected': { color: '#1E6F68' },
                                }}
                            />
                            <Tab
                                value="purchases"
                                label="Unit Purchases"
                                sx={{
                                    minHeight: 34,
                                    px: 1.75,
                                    py: 0,
                                    textTransform: 'uppercase',
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    fontSize: 12,
                                    color: '#6b7280',
                                    '&.Mui-selected': { color: '#1E6F68' },
                                }}
                            />
                        </Tabs>

                        {activeView === 'purchases' && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', minWidth: 160 }}>
                                    <label
                                        style={{
                                            position: 'absolute',
                                            top: -7,
                                            left: 10,
                                            padding: '0 4px',
                                            fontSize: 11,
                                            background: '#fff',
                                            color: '#6b7280',
                                            fontWeight: 600,
                                        }}
                                    >
                                        Status
                                    </label>
                                    <select
                                        value={purchaseListStatus}
                                        onChange={(e) => {
                                            const next = e.target.value || 'ALL';
                                            setPurchaseListStatus(next);
                                            // Clear selected unit on status change so the table doesn't show stale data
                                            setPurchaseUnitId('');
                                        }}
                                        style={{
                                            padding: '10px 10px 8px',
                                            width: '100%',
                                            borderRadius: 8,
                                            border: '1px solid #d1d5db',
                                            background: '#fff',
                                        }}
                                    >
                                        <option value="ALL">All</option>
                                        <option value="DRAFT">Draft</option>
                                        <option value="SENT">Sent</option>
                                        <option value="APPROVED">Approved</option>
                                        <option value="DONE">Done</option>
                                    </select>
                                </div>

                                <div style={{ position: 'relative', minWidth: 240 }}>
                                    <label
                                        style={{
                                            position: 'absolute',
                                            top: -7,
                                            left: 10,
                                            padding: '0 4px',
                                            fontSize: 11,
                                            background: '#fff',
                                            color: '#6b7280',
                                            fontWeight: 600,
                                        }}
                                    >
                                        Unit
                                    </label>
                                    <select
                                        value={purchaseUnitId}
                                        onChange={(e) => setPurchaseUnitId(e.target.value)}
                                        style={{
                                            padding: '10px 10px 8px',
                                            width: '100%',
                                            borderRadius: 8,
                                            border: '1px solid #d1d5db',
                                            background: '#fff',
                                        }}
                                    >
                                        <option value="">
                                            {purchaseUnitsLoading ? 'Loading units…' : 'Select a unit…'}
                                        </option>
                                        {purchaseUnits.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.name || u.unit_name || u.unitName || `Unit #${u.id}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {purchaseUnitsError ? (
                                    <span style={{ fontSize: 12, color: '#c0392b' }}>
                                        {String(purchaseUnitsError)}
                                    </span>
                                ) : null}
                            </Box>
                        )}
                    </Box>
                </Box>
            }
        >
            {activeView === 'catalog' && (
                <ItemCatalogTab />
            )}

            {activeView === 'purchases' && (
                <>
                    <UnitPurchasesTab
                        unitId={purchaseUnitId}
                        status={purchaseListStatus}
                        onOpenNewPurchaseList={openNewPurchaseModal}
                    />

                    <UnitPurchaseListNewListModal
                        open={newPurchaseOpen}
                        units={purchaseCandidates}
                        value={newPurchaseUnitId}
                        loading={purchaseCandidatesLoading}
                        onChange={setNewPurchaseUnitId}
                        onCancel={closeNewPurchaseModal}
                        onConfirm={confirmNewPurchaseModal}
                    />

                    {purchaseCandidatesError ? (
                        <div style={{ padding: '0 16px 12px', color: '#c0392b', fontSize: 12 }}>
                            {String(purchaseCandidatesError)}
                        </div>
                    ) : null}
                </>
            )}

            {activeView === 'inventory' && (
                <div style={{ padding: 16 }}>
                    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                        {header}

                        {error && (
                            <div style={{ marginTop: 12, color: 'white', background: '#c0392b', padding: 8, borderRadius: 4 }}>
                                Error: {String(error)}
                            </div>
                        )}

                        <div style={{ overflowX: 'auto', marginTop: 12 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <Th>Session ID</Th>
                                        <Th>Unit</Th>
                                        <Th>City</Th>
                                        <Th>Status</Th>
                                        <Th>Started</Th>
                                        <Th>Submitted</Th>
                                        <Th>Inv Issued</Th>
                                        <Th>Photos Issued</Th>
                                        <Th>Items</Th>
                                        <Th>Photos</Th>
                                        <Th>Actions</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 && !loading && (
                                        <tr>
                                            <Td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#666' }}>
                                                No sessions found.
                                            </Td>
                                        </tr>
                                    )}
                                    {rows.map((r) => (
                                        <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                                            <Td>{r.id}</Td>
                                            <Td>{r.unitName || r.unitId}</Td>
                                            <Td>{r.city || '-'}</Td>
                                            <Td><StatusBadge status={r.status} /></Td>
                                            <Td><DateCell value={r.startedAt} /></Td>
                                            <Td><DateCell value={r.submittedAt} /></Td>
                                            <Td><DateCell value={r.invIssuedAt} /></Td>
                                            <Td><DateCell value={r.photoIssuedAt} /></Td>
                                            <Td style={{ textAlign: 'right' }}>{r.itemsCount ?? 0}</Td>
                                            <Td style={{ textAlign: 'right' }}>{r.photosCount ?? 0}</Td>
                                            <Td>
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                    {/* TODO: Wire to desktop detail route when added */}
                                                    <button title="Open Inventory (items)" onClick={() => onOpenInv(r.id)}>Open Inv</button>
                                                    <button title="Open Photos" onClick={() => onOpenPhotos(r.id)}>Open Photos</button>
                                                    <button title="Export Items PDF" disabled>Items PDF</button>
                                                    <button title="Export Photos PDF" disabled>Photos PDF</button>
                                                </div>
                                            </Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                            <div style={{ color: '#555' }}>
                                Showing {rows.length} of {total} — offset {offset}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={onPrev} disabled={!canPrev}>Prev</button>
                                <button onClick={onNext} disabled={!canNext}>Next</button>
                            </div>
                        </div>
                        {DetailPanel}
                    </div>
                </div>
            )}
        </PageScaffold>
    );
}

function Th({ children, style }) {
    return (
        <th
            style={{
                textAlign: 'left',
                fontWeight: 600,
                fontSize: 13,
                padding: '10px 8px',
                background: '#fafafa',
                borderBottom: '1px solid #eee',
                whiteSpace: 'nowrap',
                ...style,
            }}
        >
            {children}
        </th>
    );
}

function Td({ children, style, colSpan }) {
    return (
        <td
            colSpan={colSpan}
            style={{
                padding: '10px 8px',
                fontSize: 13,
                borderBottom: '1px solid #eee',
                verticalAlign: 'top',
                whiteSpace: 'nowrap',
                ...style,
            }}
        >
            {children}
        </td>
    );
}

function DateCell({ value }) {
    if (!value) return <span style={{ color: '#aaa' }}>—</span>;
    try {
        const d = new Date(value);
        // Render date only (e.g., "Oct 31, 2025"). Keep ISO in title for full context.
        const formatted = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
        return <span title={d.toISOString()}>{formatted}</span>;
    } catch {
        return <span>{String(value)}</span>;
    }
}

function StatusBadge({ status }) {
    const map = {
        collecting: { bg: '#fdf2e9', fg: '#d35400' },
        submitted: { bg: '#eaf2ff', fg: '#2e86de' },
        ready: { bg: '#eafaf1', fg: '#1e8449' },
        sent: { bg: '#f0f3f4', fg: '#566573' },
        signed: { bg: '#ede7f6', fg: '#6a1b9a' },
    };
    const s = map[status] || { bg: '#f4f6f7', fg: '#7f8c8d' };
    return (
        <span style={{ padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.fg, fontWeight: 600, fontSize: 12 }}>
            {status || 'unknown'}
        </span>
    );
}

// Inline-editing row for item with Edit/Delete actions
function ItemRow({ it, readOnly, onUpdated, onDeleted }) {
    const [isEditing, setIsEditing] = React.useState(false);

    const originalName = it.name ?? it.itemName ?? it.descripcion ?? '';
    const areaOptions = getAreaOptions(it.area || '');
    // Determine if current name is one of the presets for this area
    const originalIsPreset = areaOptions.includes(originalName);
    const initialSelect = originalIsPreset ? originalName : OTHER_LABEL;

    const [itemSelect, setItemSelect] = React.useState(initialSelect);
    const [customName, setCustomName] = React.useState(originalIsPreset ? '' : originalName);

    const [qty, setQty] = React.useState(
        (it.quantity ?? it.qty ?? it.cantidad ?? '') === '' ? '' : String(it.quantity ?? it.qty ?? it.cantidad)
    );
    const [notes, setNotes] = React.useState(it.notes ?? it.notas ?? '');
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState(null);
    const [deleting, setDeleting] = React.useState(false);

    const debouncedQty = useDebouncedValue(qty, 500);
    const debouncedNotes = useDebouncedValue(notes, 500);

    const origQty = it.quantity ?? it.qty ?? it.cantidad ?? '';
    const origNotes = it.notes ?? it.notas ?? '';

    React.useEffect(() => {
        setQty((it.quantity ?? it.qty ?? it.cantidad ?? '') === '' ? '' : String(it.quantity ?? it.qty ?? it.cantidad));
        setNotes(it.notes ?? it.notas ?? '');
        // Reset editing state for name
        setItemSelect(areaOptions.includes(originalName) ? originalName : OTHER_LABEL);
        setCustomName(areaOptions.includes(originalName) ? '' : originalName);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [it.id]);

    React.useEffect(() => {
        if (readOnly || !isEditing) return; // only save when editable and in edit mode
        const nextQty = debouncedQty;
        const nextNotes = debouncedNotes;
        const nextName = itemSelect === OTHER_LABEL ? (customName || '') : itemSelect;

        const changedQty = String(nextQty ?? '') !== String(origQty ?? '');
        const changedNotes = String(nextNotes ?? '') !== String(origNotes ?? '');
        const changedName = String(nextName ?? '') !== String(originalName ?? '');
        if (!changedQty && !changedNotes && !changedName) return;

        const payload = {};
        if (changedQty) {
            const num = String(nextQty).trim() === '' ? null : Number(nextQty);
            payload.cantidad = Number.isFinite(num) ? num : null;
        }
        if (changedNotes) payload.notas = nextNotes ?? '';
        if (changedName) payload.descripcion = nextName;

        let cancelled = false;
        setSaving(true);
        setErr(null);
        api.patch(`/api/unit-inventory/item/${it.id}`, payload)
            .then(() => {
                if (cancelled) return;
                const merged = { ...it };
                if (Object.prototype.hasOwnProperty.call(payload, 'cantidad')) merged.cantidad = payload.cantidad;
                if (Object.prototype.hasOwnProperty.call(payload, 'notas')) merged.notas = payload.notas;
                if (Object.prototype.hasOwnProperty.call(payload, 'descripcion')) merged.descripcion = payload.descripcion;
                onUpdated && onUpdated(merged);
            })
            .catch((e) => {
                if (cancelled) return;
                setErr(e?.response?.data?.message || e.message || 'Save failed');
            })
            .finally(() => {
                if (cancelled) return;
                setSaving(false);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQty, debouncedNotes, itemSelect, customName, readOnly, isEditing]);

    const name = originalName || '—';

    const onClickDelete = async () => {
        if (readOnly) return;
        if (!window.confirm('Delete this item?')) return;
        try {
            setDeleting(true);
            setErr(null);
            await api.delete(`/api/unit-inventory/item/${it.id}`);
            onDeleted && onDeleted(it.id);
        } catch (e) {
            setErr(e?.response?.data?.message || e.message || 'Delete failed');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <tr style={{ borderTop: '1px solid #f0f0f0' }}>
            <Td title={name}>
                {isEditing ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                            disabled={readOnly}
                            value={itemSelect}
                            onChange={(e) => setItemSelect(e.target.value)}
                            style={{ padding: '6px 8px' }}
                        >
                            {/* Area presets first */}
                            {areaOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                            {/* Fallback/manual option */}
                            <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                        </select>
                        {itemSelect === OTHER_LABEL && (
                            <input
                                type="text"
                                disabled={readOnly}
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                placeholder="Especificar…"
                                style={{ flex: 1, minWidth: 160, padding: '6px 8px', boxSizing: 'border-box' }}
                            />
                        )}
                    </div>
                ) : (
                    <span>{name || '—'}</span>
                )}
            </Td>
            <Td style={{ width: 80, textAlign: 'right' }}>
                {isEditing ? (
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        disabled={readOnly}
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                        style={{ width: '100%', textAlign: 'right', padding: '6px 8px', boxSizing: 'border-box' }}
                    />
                ) : (
                    <span>{(it.quantity ?? it.qty ?? it.cantidad) ?? '—'}</span>
                )}
            </Td>
            <Td style={{ width: 280 }}>
                {isEditing ? (
                    <input
                        type="text"
                        disabled={readOnly}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notes…"
                        style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box' }}
                    />
                ) : (
                    <span title={it.notes ?? it.notas ?? ''} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(it.notes ?? it.notas) || '—'}
                    </span>
                )}
                {saving && isEditing && <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>saving…</span>}
                {err && <span style={{ marginLeft: 8, fontSize: 11, color: '#c0392b' }}>{String(err)}</span>}
            </Td>
            <Td style={{ width: 72, textAlign: 'right' }}>
                {isEditing ? (
                    <button
                        onClick={() => setIsEditing(false)}
                        disabled={readOnly}
                        title="Done"
                        style={{ padding: '4px 8px' }}
                    >
                        Done
                    </button>
                ) : (
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                        {/* Edit icon (Heroicons Pencil Square 24/outline) */}
                        <button
                            onClick={() => !readOnly && setIsEditing(true)}
                            disabled={readOnly}
                            title={readOnly ? 'Read-only' : 'Edit'}
                            style={{ background: 'transparent', border: 'none', padding: 4, cursor: readOnly ? 'not-allowed' : 'pointer' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 20, height: 20, color: readOnly ? '#bbb' : '#1e6f68' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687 1.687m-2.74-.353a2.25 2.25 0 113.182 3.182L7.5 20.5 3 21.75l1.25-4.5L15.81 5.82z" />
                            </svg>
                        </button>
                        {/* Delete icon (Heroicons Trash 24/outline) */}
                        <button
                            onClick={onClickDelete}
                            disabled={readOnly || deleting}
                            title={readOnly ? 'Read-only' : 'Delete'}
                            style={{ background: 'transparent', border: 'none', padding: 4, cursor: (readOnly || deleting) ? 'not-allowed' : 'pointer' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 20, height: 20, color: (readOnly || deleting) ? '#bbb' : '#c0392b' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.108 1.022.169M4.772 5.79c.34-.061.68-.117 1.022-.169m3.678-.39A48.108 48.108 0 0114.53 5.4m-5.058 0A48.11 48.11 0 016.794 5.23m0 0L6.5 7h11l-.294-1.77M6.794 5.23L5.5 7m12 0v12a2.25 2.25 0 01-2.25 2.25H8.75A2.25 2.25 0 016.5 19V7" />
                            </svg>
                        </button>
                    </div>
                )}
            </Td>
        </tr>
    );
}
// Modal for editing a photo's area/caption
function PhotoEditModal({ photo, areas, saving, error, onClose, onSave }) {
    const [mode, setMode] = React.useState('pick'); // 'pick' or 'custom'
    const [area, setArea] = React.useState(photo?.area || '');
    const [caption, setCaption] = React.useState(photo?.caption || '');

    React.useEffect(() => {
        setArea(photo?.area || '');
        setCaption(photo?.caption || '');
        setMode((photo?.area && areas && areas.includes(photo.area)) ? 'pick' : 'custom');
    }, [photo, areas]);

    const canSave = String(area).trim().length > 0;

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
            <div style={{ width: 'min(520px, 92vw)', background: '#fff', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Edit photo</strong>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#555' }}>Area</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <input type="radio" name="areaMode" value="pick" checked={mode === 'pick'} onChange={() => setMode('pick')} />
                                <span>Choose</span>
                            </label>
                            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <input type="radio" name="areaMode" value="custom" checked={mode === 'custom'} onChange={() => setMode('custom')} />
                                <span>Custom</span>
                            </label>
                        </div>
                        {mode === 'pick' ? (
                            <select value={area} onChange={(e) => setArea(e.target.value)} style={{ padding: '8px 10px' }}>
                                {[photo?.area, ...areas].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).map(a => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        ) : (
                            <input type="text" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area…" style={{ padding: '8px 10px' }} />
                        )}
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#555' }}>Caption</span>
                        <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption…" style={{ padding: '8px 10px' }} />
                    </label>
                    {error && <div style={{ color: '#c0392b', fontSize: 12 }}>{String(error)}</div>}
                </div>
                <div style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} disabled={saving} style={{ padding: '6px 10px' }}>Cancel</button>
                    <button
                        onClick={() => onSave({ area, caption })}
                        disabled={!canSave || saving}
                        style={{ padding: '6px 12px', fontWeight: 600, background: '#1e6f68', color: '#fff', border: '1px solid #1e6f68', borderRadius: 6 }}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}