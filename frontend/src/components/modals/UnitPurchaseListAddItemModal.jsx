import React, { useEffect, useMemo, useState } from 'react';

/**
 * UnitPurchaseListAddItemModal
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - listId: number|null
 * - onAdded: () => void  // called after successful add (parent should refresh lines)
 */
export default function UnitPurchaseListAddItemModal({ open, onClose, listId, onAdded }) {
  const [mode, setMode] = useState('catalog'); // 'catalog' | 'new'
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [error, setError] = useState('');

  // --- shared fields
  const [qty, setQty] = useState('1');
  const [existingQty, setExistingQty] = useState('0');
  const [unitCost, setUnitCost] = useState('');
  const [unitSellPrice, setUnitSellPrice] = useState('0');
  const [notes, setNotes] = useState('');
  const [purchaseSource, setPurchaseSource] = useState('');
  const [purchaseUrl, setPurchaseUrl] = useState('');

  // --- catalog mode
  const [catalogItemId, setCatalogItemId] = useState('');
  const selectedCatalogItem = useMemo(() => {
    const id = Number(catalogItemId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return catalogItems.find((x) => Number(x?.id) === id) || null;
  }, [catalogItemId, catalogItems]);

  // --- new item mode
  const CATEGORY_OPTIONS = useMemo(
    () => ['Basics', 'Towels', 'Bedroom', 'Kitchen', 'Other'],
    []
  );
  const [newCategory, setNewCategory] = useState('Basics');
  const [newDescription, setNewDescription] = useState('');

  const authFetchJson = async (url, options = {}) => {
    const token =
      localStorage.getItem('jwt') ||
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      '';

    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { ok: false, error: text || 'Invalid JSON response' };
    }

    if (!res.ok) {
      const msg = json?.message || json?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  };

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    setError('');
    setMode('catalog');
    setQty('1');
    setExistingQty('0');
    setUnitCost('');
    setUnitSellPrice('0');
    setNotes('');
    setPurchaseSource('');
    setPurchaseUrl('');
    setCatalogItemId('');
    setNewCategory('Basics');
    setNewDescription('');
  }, [open]);

  // Load catalog on open
  useEffect(() => {
    let alive = true;
    async function loadCatalog() {
      if (!open) return;
      setLoadingCatalog(true);
      try {
        // Prefer the API you already use in ItemCatalogTab
        const json = await authFetchJson('/api/purchase-catalog');
        const items = Array.isArray(json?.items) ? json.items : Array.isArray(json?.data?.items) ? json.data.items : [];
        if (!alive) return;
        setCatalogItems(items);
      } catch (e) {
        if (!alive) return;
        setCatalogItems([]);
        setError(e?.message || 'Failed to load catalog');
      } finally {
        if (alive) setLoadingCatalog(false);
      }
    }
    loadCatalog();
    return () => {
      alive = false;
    };
  }, [open]);

  // When selecting a catalog item, prefill price/source/url/notes if empty
  useEffect(() => {
    if (!selectedCatalogItem) return;

    // only prefill if user hasn't typed something
    if (unitCost === '' && selectedCatalogItem?.cost != null) setUnitCost(String(selectedCatalogItem.cost));
    if ((unitSellPrice === '' || unitSellPrice === '0') && selectedCatalogItem?.sell_price != null) {
      setUnitSellPrice(String(selectedCatalogItem.sell_price));
    }
    if (purchaseSource === '' && selectedCatalogItem?.purchase_source) setPurchaseSource(String(selectedCatalogItem.purchase_source));
    if (purchaseUrl === '' && selectedCatalogItem?.purchase_url) setPurchaseUrl(String(selectedCatalogItem.purchase_url));
    if (notes === '' && selectedCatalogItem?.notes) setNotes(String(selectedCatalogItem.notes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCatalogItem]);

  const canSubmit = useMemo(() => {
    if (!open) return false;
    if (!listId) return false;

    const q = Number(qty);
    const ex = Number(existingQty);
    if (!Number.isFinite(q) || q < 0) return false;
    if (!Number.isFinite(ex) || ex < 0) return false;

    // sell price required; default 0 is ok
    const sp = Number(unitSellPrice === '' ? 0 : unitSellPrice);
    if (!Number.isFinite(sp) || sp < 0) return false;

    if (mode === 'catalog') {
      const id = Number(catalogItemId);
      return Number.isFinite(id) && id > 0;
    }

    // new item mode
    return (newDescription || '').trim().length > 0;
  }, [open, listId, qty, existingQty, unitSellPrice, mode, catalogItemId, newDescription]);

  const handleSubmit = async () => {
    setError('');
    if (!canSubmit) return;

    const money2 = (v, def = '0.00') => {
      const s = v === null || v === undefined ? '' : String(v).trim();
      if (!s) return def;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return def;
      return n.toFixed(2);
    };

    const base = {
      qty: qty === '' ? 0 : Number(qty),
      existing_qty: existingQty === '' ? 0 : Number(existingQty),
      unit_cost: unitCost === '' ? null : money2(unitCost, '0.00'),
      unit_sell_price: money2(unitSellPrice, '0.00'),
      notes: notes === '' ? null : String(notes),
      purchase_source: purchaseSource === '' ? null : String(purchaseSource),
      purchase_url: purchaseUrl === '' ? null : String(purchaseUrl),
    };

    const body =
      mode === 'catalog'
        ? {
            ...base,
            catalog_item_id: Number(catalogItemId),
            category: (selectedCatalogItem?.category ? String(selectedCatalogItem.category) : null),
            description: (selectedCatalogItem?.name ? String(selectedCatalogItem.name) : '').trim(),
          }
        : {
            ...base,
            catalog_item_id: null,
            category: (newCategory || null),
            description: String(newDescription || '').trim(),
          };

    try {
      await authFetchJson(`/api/purchase-lists/${listId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (typeof onAdded === 'function') onAdded();
      if (typeof onClose === 'function') onClose();
    } catch (e) {
      setError(e?.message || 'Failed to add item');
    }
  };

  if (!open) return null;

  // --- styles
  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 16,
  };

  const card = {
    width: '100%',
    maxWidth: 720,
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e5e7eb',
    boxShadow: '0 12px 32px rgba(0,0,0,0.20)',
    overflow: 'hidden',
  };

  const header = {
    padding: '14px 16px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  };

  const title = { fontSize: 14, fontWeight: 800, color: '#111827' };

  const bodyStyle = { padding: 16 };

  const tabsRow = { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' };

  const tabBtn = (active) => ({
    border: active ? '1px solid #1E6F68' : '1px solid #e5e7eb',
    background: active ? '#E9F5F3' : '#fff',
    color: '#111827',
    padding: '8px 10px',
    borderRadius: 10,
    fontWeight: 800,
    cursor: 'pointer',
  });

  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  };

  const field = { display: 'flex', flexDirection: 'column', gap: 6 };
  const label = { fontSize: 12, fontWeight: 700, color: '#374151' };
  const input = {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '10px 10px',
    fontSize: 14,
    outline: 'none',
  };
  const textarea = { ...input, minHeight: 86, resize: 'vertical' };

  const footer = {
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    alignItems: 'center',
  };

  const btn = (kind) => {
    const primary = kind === 'primary';
    return {
      padding: '10px 12px',
      borderRadius: 10,
      border: primary ? '1px solid #1E6F68' : '1px solid #e5e7eb',
      background: primary ? '#1E6F68' : '#fff',
      color: primary ? '#fff' : '#111827',
      fontWeight: 800,
      cursor: primary ? (canSubmit ? 'pointer' : 'not-allowed') : 'pointer',
      opacity: primary ? (canSubmit ? 1 : 0.55) : 1,
      minWidth: 120,
    };
  };

  return (
    <div
      style={overlay}
      onMouseDown={(e) => {
        // close only if clicking the overlay itself
        if (e.target === e.currentTarget && typeof onClose === 'function') onClose();
      }}
    >
      <div style={card}>
        <div style={header}>
          <div style={title}>Add Item</div>
          <button type="button" onClick={onClose} style={{ ...btn('secondary'), minWidth: 44, padding: '8px 10px' }}>
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={tabsRow}>
            <button type="button" style={tabBtn(mode === 'catalog')} onClick={() => setMode('catalog')}>
              Add from Catalog
            </button>
            <button type="button" style={tabBtn(mode === 'new')} onClick={() => setMode('new')}>
              New Item
            </button>
          </div>

          {error ? (
            <div style={{ marginBottom: 12, color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          {mode === 'catalog' ? (
            <>
              <div style={{ marginBottom: 10, color: '#6b7280', fontSize: 12 }}>
                {loadingCatalog ? 'Loading catalog…' : 'Select an item from the catalog.'}
              </div>

              <div style={grid}>
                <div style={field}>
                  <div style={label}>Catalog Item</div>
                  <select
                    style={input}
                    value={catalogItemId}
                    onChange={(e) => setCatalogItemId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {catalogItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.category ? `${it.category} — ` : ''}{it.name}{it.bed_size ? ` (${it.bed_size})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={field}>
                  <div style={label}>Qty (Target)</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={qty}
                    onFocus={() => setQty('')}
                    onChange={(e) => setQty(e.target.value)}
                    onBlur={(e) => setQty(e.target.value === '' ? '0' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Existing</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={existingQty}
                    onFocus={() => setExistingQty('')}
                    onChange={(e) => setExistingQty(e.target.value)}
                    onBlur={(e) => setExistingQty(e.target.value === '' ? '0' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Unit Sell Price</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={unitSellPrice}
                    onFocus={() => setUnitSellPrice('')}
                    onChange={(e) => setUnitSellPrice(e.target.value)}
                    onBlur={(e) => setUnitSellPrice(e.target.value === '' ? '0' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Unit Cost (optional)</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={unitCost}
                    onFocus={() => setUnitCost('')}
                    onChange={(e) => setUnitCost(e.target.value)}
                    onBlur={(e) => setUnitCost(e.target.value === '' ? '' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Purchase Source (optional)</div>
                  <input
                    style={input}
                    value={purchaseSource}
                    onChange={(e) => setPurchaseSource(e.target.value)}
                    placeholder="e.g. Amazon, MercadoLibre"
                  />
                </div>

                <div style={{ ...field, gridColumn: '1 / -1' }}>
                  <div style={label}>Purchase URL (optional)</div>
                  <input
                    style={input}
                    value={purchaseUrl}
                    onChange={(e) => setPurchaseUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>

                <div style={{ ...field, gridColumn: '1 / -1' }}>
                  <div style={label}>Notes (optional)</div>
                  <textarea
                    style={textarea}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any comment for this line…"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 10, color: '#6b7280', fontSize: 12 }}>
                Create a one-time item only for this purchase list.
              </div>

              <div style={grid}>
                <div style={field}>
                  <div style={label}>Category</div>
                  <select style={input} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={field}>
                  <div style={label}>Description</div>
                  <input
                    style={input}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="e.g. New blender"
                  />
                </div>

                <div style={field}>
                  <div style={label}>Qty (Target)</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={qty}
                    onFocus={() => setQty('')}
                    onChange={(e) => setQty(e.target.value)}
                    onBlur={(e) => setQty(e.target.value === '' ? '0' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Existing</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={existingQty}
                    onFocus={() => setExistingQty('')}
                    onChange={(e) => setExistingQty(e.target.value)}
                    onBlur={(e) => setExistingQty(e.target.value === '' ? '0' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Unit Sell Price</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={unitSellPrice}
                    onFocus={() => setUnitSellPrice('')}
                    onChange={(e) => setUnitSellPrice(e.target.value)}
                    onBlur={(e) => setUnitSellPrice(e.target.value === '' ? '0' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Unit Cost (optional)</div>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={unitCost}
                    onFocus={() => setUnitCost('')}
                    onChange={(e) => setUnitCost(e.target.value)}
                    onBlur={(e) => setUnitCost(e.target.value === '' ? '' : e.target.value)}
                  />
                </div>

                <div style={field}>
                  <div style={label}>Purchase Source (optional)</div>
                  <input
                    style={input}
                    value={purchaseSource}
                    onChange={(e) => setPurchaseSource(e.target.value)}
                    placeholder="e.g. Amazon, MercadoLibre"
                  />
                </div>

                <div style={field}>
                  <div style={label}>Purchase URL (optional)</div>
                  <input style={input} value={purchaseUrl} onChange={(e) => setPurchaseUrl(e.target.value)} placeholder="https://…" />
                </div>

                <div style={{ ...field, gridColumn: '1 / -1' }}>
                  <div style={label}>Notes (optional)</div>
                  <textarea
                    style={textarea}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any comment for this line…"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div style={footer}>
          <button type="button" onClick={onClose} style={btn('secondary')}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} style={btn('primary')} disabled={!canSubmit}>
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}