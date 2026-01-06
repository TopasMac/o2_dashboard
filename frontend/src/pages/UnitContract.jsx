import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { Box } from '@mui/material';
import PageScaffold from '../components/layout/PageScaffold';

const UnitContract = () => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [lang, setLang] = useState('en');
  const [rawPreviewLang, setRawPreviewLang] = useState('');
  const handlePreviewRaw = async (lng) => {
    const chosen = lng || rawPreviewLang || 'en';
    setLang(chosen); // keep UI language aligned
    setLoading(true);
    setErr(null);
    try {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      // Backend endpoint expected to return a PDF for the raw template by lang
      const res = await api.get(`/api/contracts/preview?lang=${encodeURIComponent(chosen)}`, {
        responseType: 'blob',
        headers: { Accept: 'application/pdf' },
      });
      const ct = (res.headers && res.headers['content-type']) || '';
      if (!ct.includes('application/pdf')) {
        try {
          const text = await res.data.text();
          setErr(text || 'Unexpected response while generating raw PDF.');
        } catch {
          setErr('Unexpected response while generating raw PDF.');
        }
        return;
      }
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setPreviewUrl(url);
    } catch (e) {
      console.error('Raw preview failed:', e);
      setErr(e?.response?.data?.message || e.message || 'Could not generate raw contract preview.');
    } finally {
      setLoading(false);
    }
  };
  // Removed unused mode and displayMode state
  const [draftId, setDraftId] = useState(null);

  const [newClientName, setNewClientName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newDefaultLocale, setNewDefaultLocale] = useState('en');
  const [newNotes, setNewNotes] = useState('');
  const [newEffectiveDate, setNewEffectiveDate] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerIdNumber, setNewOwnerIdNumber] = useState('');
  const [newUnitAddress, setNewUnitAddress] = useState('');
  const [newLinensFee, setNewLinensFee] = useState('');
  const [linensFeePreset, setLinensFeePreset] = useState('');

  const [stage, setStage] = useState('idle'); // 'idle' | 'create' | 'edit'
  const [draftsList, setDraftsList] = useState([]); // [{id, clientName, unitName}]
  const [selectedDraftForLoad, setSelectedDraftForLoad] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [overridesEn, setOverridesEn] = useState({});
  const [overridesEs, setOverridesEs] = useState({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const editorRef = useRef(null);

  // Reusable back handler to close preview and reset filters globally
  const handleBack = () => {
    // Close PDF preview if open
    try { if (previewUrl) URL.revokeObjectURL(previewUrl); } catch (e) {}
    setPreviewUrl(null);
    // Broadcast a global event so any table/layout filters can clear themselves
    try {
      window.dispatchEvent(new CustomEvent('o2:reset-filters'));
    } catch (_) {}
    // Optionally return to idle stage
    setStage('idle');
  };

  const handleCreateDraft = async () => {
    setLoading(true);
    setErr(null);
    try {
      const fields = {};
      if (newEffectiveDate) fields.effectiveDate = newEffectiveDate; // YYYY-MM-DD
      if (newOwnerPhone) fields.ownerPhone = newOwnerPhone;
      if (newOwnerEmail) fields.ownerEmail = newOwnerEmail;
      if (newOwnerIdNumber) fields.ownerIdNumber = newOwnerIdNumber;
      if (newUnitAddress) fields.address = newUnitAddress;
      if (newLinensFee) fields.linensFee = newLinensFee;

      const payload = {
        clientName: newClientName.trim(),
        unitName: newUnitName.trim(),
        defaultLocale: newDefaultLocale,
        notes: newNotes ? newNotes.trim() : null,
        fields,
        overridesEn: {},
        overridesEs: {},
      };

      if (!payload.clientName || !payload.unitName) {
        setErr('Please enter both Client Name and Unit Name.');
        setLoading(false);
        return;
      }

      const res = await api.post('/api/contract_drafts', payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      // API Platform may return { id } or an IRI in @id
      const id = res?.data?.id ?? (res?.data?.['@id'] ? Number(String(res.data['@id']).split('/').pop()) : null);
      if (!id) {
        setErr('Draft created but ID was not returned.');
        return;
      }

      setDraftId(id);
      setStage('edit');
      setErr(null); // Optionally clear any lingering preview error when switching to edit stage
      // Align UI lang to the draft's default
      setLang(newDefaultLocale || 'en');
    } catch (e) {
      console.error('Create draft failed:', e);
      setErr(e?.response?.data?.message || e.message || 'Could not create draft.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draftId) {
      setErr('No Draft ID to save.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const fields = {};
      if (newEffectiveDate) fields.effectiveDate = newEffectiveDate; // YYYY-MM-DD
      if (newOwnerPhone) fields.ownerPhone = newOwnerPhone;
      if (newOwnerEmail) fields.ownerEmail = newOwnerEmail;
      if (newOwnerIdNumber) fields.ownerIdNumber = newOwnerIdNumber;
      if (newUnitAddress) fields.address = newUnitAddress;
      if (newLinensFee) fields.linensFee = newLinensFee;

      const payload = {
        clientName: newClientName.trim(),
        unitName: newUnitName.trim(),
        defaultLocale: newDefaultLocale,
        notes: newNotes ? newNotes.trim() : null,
        fields,
      };

      await api.patch(`/api/contract_drafts/${draftId}`, payload, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      });

      // refresh list in case names changed
      fetchDraftsList();

      // Re-preview after save
      setTimeout(() => handlePreview(), 0);
    } catch (e) {
      console.error('Save draft failed:', e);
      setErr(e?.response?.data?.message || e.message || 'Could not save draft.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDraft = async (idParam) => {
    setLoading(true);
    setErr(null);
    try {
      const idToLoad = idParam ?? draftId;
      if (!idToLoad) {
        setErr('Select a draft to load.');
        setLoading(false);
        return;
      }
      // make sure local state reflects the selected id
      setDraftId(Number(idToLoad));
      const res = await api.get(`/api/contract_drafts/${idToLoad}`);
      const data = res?.data || {};

      // API Platform may wrap the entity; handle both direct fields and hydra response
      const clientName = data.clientName ?? data['client_name'] ?? '';
      const unitName = data.unitName ?? data['unit_name'] ?? '';
      const defaultLocale = data.defaultLocale ?? data['default_locale'] ?? 'en';
      const notes = data.notes ?? null;
      const fields = data.fields ?? {};

      setNewClientName(clientName || '');
      setNewUnitName(unitName || '');
      setNewDefaultLocale(defaultLocale || 'en');
      setNewNotes(notes || '');

      setNewEffectiveDate(fields.effectiveDate || '');
      setNewOwnerPhone(fields.ownerPhone || '');
      setNewOwnerEmail(fields.ownerEmail || '');
      setNewOwnerIdNumber(fields.ownerIdNumber || '');
      setNewUnitAddress(fields.address || '');
      setNewLinensFee(fields.linensFee || '');
      // Initialize preset based on loaded value
      const lf = String(fields.linensFee || '').trim();
      if (lf === '400' || lf === '600' || lf === '800') {
        setLinensFeePreset(lf);
      } else if (lf) {
        setLinensFeePreset('other');
      } else {
        setLinensFeePreset('');
      }

      // Load section overrides if present
      const ovEn = data.overridesEn ?? data['overrides_en'] ?? {};
      const ovEs = data.overridesEs ?? data['overrides_es'] ?? {};
      setOverridesEn(ovEn || {});
      setOverridesEs(ovEs || {});

      // Also align preview language to the draft's default
      setLang(defaultLocale || 'en');
      setStage('edit');
    } catch (e) {
      console.error('Load draft failed:', e);
      setErr(e?.response?.data?.message || e.message || 'Could not load draft.');
    } finally {
      setLoading(false);
    }
  };

  // Advanced section override helpers
  const SECTION_KEYS = [
    'intro',
    'purpose',
    'definitions',
    'services',
    'financial_terms',
    'other',
    'legal',
    'contacts',
  ];

  const openEditorForKey = async (key) => {
    setEditorKey(key);
    const current = (lang === 'es' ? overridesEs[key] : overridesEn[key]) || '';
    setEditorHtml(current);
    setEditorOpen(true);
    // If no override exists, pull the default section HTML from backend
    if (!current) {
      try {
        const res = await api.get(`/api/contracts/section`, { params: { lang, key } });
        const html = res?.data?.html || '';
        if (html) {
          setEditorHtml(html);
          if (editorRef.current) {
            editorRef.current.innerHTML = html;
          }
        }
      } catch (e) {
        console.error('Fetch default section failed', e);
        setErr(e?.response?.data?.message || e.message || 'Could not load default section text.');
      }
    }
  };
  useEffect(() => {
    if (editorOpen && editorRef.current) {
      // Initialize content once when opening the modal
      editorRef.current.innerHTML = editorHtml || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen]);

  const saveEditorHtml = async () => {
    if (!draftId || !editorKey) return;
    // Read latest HTML directly from the editor to avoid stale state on fast clicks
    const latestHtml = editorRef.current ? editorRef.current.innerHTML : editorHtml;
    // optimistic update local state
    if (lang === 'es') {
      const next = { ...(overridesEs || {}), [editorKey]: latestHtml };
      setOverridesEs(next);
    } else {
      const next = { ...(overridesEn || {}), [editorKey]: latestHtml };
      setOverridesEn(next);
    }
    // send patch with only overrides to minimize payload
    try {
      const patch = (lang === 'es')
        ? { overridesEs: { ...(overridesEs || {}), [editorKey]: latestHtml } }
        : { overridesEn: { ...(overridesEn || {}), [editorKey]: latestHtml } };
      await api.patch(`/api/contract_drafts/${draftId}`, patch, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      });
      setEditorOpen(false);
      // auto-refresh preview if visible
      if (previewUrl) {
        handlePreview();
      }
    } catch (e) {
      console.error('Save override failed', e);
      setErr(e?.response?.data?.message || e.message || 'Could not save override.');
    }
  };

  const resetOverride = async (key) => {
    if (!draftId) return;
    try {
      let next;
      if (lang === 'es') {
        next = { ...(overridesEs || {}) };
        delete next[key];
        setOverridesEs(next);
        await api.patch(`/api/contract_drafts/${draftId}`, { overridesEs: next }, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        next = { ...(overridesEn || {}) };
        delete next[key];
        setOverridesEn(next);
        await api.patch(`/api/contract_drafts/${draftId}`, { overridesEn: next }, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      }
    } catch (e) {
      console.error('Reset override failed', e);
      setErr(e?.response?.data?.message || e.message || 'Could not reset override.');
    }
  };

  const fetchDraftsList = async () => {
    try {
      // API Platform hydra list, newest first
      const res = await api.get('/api/contract_drafts?pagination=false&order[updatedAt]=desc');
      const items = res?.data?.['hydra:member'] || res?.data || [];
      const mapped = items.map((it) => ({
        id: it.id ?? (it['@id'] ? Number(String(it['@id']).split('/').pop()) : null),
        clientName: it.clientName ?? it['client_name'] ?? '',
        unitName: it.unitName ?? it['unit_name'] ?? '',
      })).filter(x => x.id);
      setDraftsList(mapped);
    } catch (e) {
      console.error('fetchDraftsList failed', e);
    }
  };

  useEffect(() => { fetchDraftsList(); }, []);

  // Cleanup blob URLs when unmounting or when generating a new one
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePreview = async () => {
    setLoading(true);
    setErr(null);
    try {
      if (!draftId) {
        setErr('Please create or enter a Draft ID first.');
        setLoading(false);
        return;
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      const res = await api.get(
        `/api/contract-drafts/${draftId}/preview?lang=${encodeURIComponent(lang)}&t=${Date.now()}`,
        {
          responseType: 'blob',
          headers: { Accept: 'application/pdf' },
        }
      );
      const ct = (res.headers && res.headers['content-type']) || '';
      if (!ct.includes('application/pdf')) {
        try {
          const text = await res.data.text();
          setErr(text || 'Unexpected response while generating PDF.');
        } catch {
          setErr('Unexpected response while generating PDF.');
        }
        return;
      }
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setPreviewUrl(url);
    } catch (e) {
      console.error('Preview failed:', e);
      setErr(e?.response?.data?.message || e.message || 'No se pudo generar la vista previa.');
    } finally {
      setLoading(false);
    }
  };

  // Removed onClickPdf and onClickHtml

  return (
    <PageScaffold
      title="Contracts"
      layout="cards"
      withCard
      headerPlacement="inside"
    >
      <Box sx={{ pb: 3 }}>
        {/* Top selector when idle */}
        {stage === 'idle' && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
            alignItems: 'start',
          }}>
            <div>
              <button className="btn btn-primary" onClick={() => setStage('create')}>
                Create Draft
              </button>
            </div>

            <div>
              <div style={{ position: 'relative', display: 'block', width: 320, marginTop: 6 }}>
                <span style={{ position: 'absolute', top: -10, left: 10, background: '#fff', padding: '0 4px', fontSize: 12, color: '#6b7280' }}>
                  Load a draft
                </span>
                <select
                  value={selectedDraftForLoad}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedDraftForLoad(val);
                    const id = Number(val);
                    if (id) {
                      setDraftId(id);
                      handleLoadDraft(id);
                    }
                  }}
                  disabled={loading}
                  style={{ width: '100%' }}
                >
                  <option value="">Select draft…</option>
                  {draftsList.map(d => (
                    <option key={d.id} value={d.id}>
                      {`${d.clientName || 'Unnamed'} * ${d.unitName || 'Unit'}`} (#{d.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <div style={{ position: 'relative', display: 'block', width: 320, marginTop: 6 }}>
                <span style={{ position: 'absolute', top: -10, left: 10, background: '#fff', padding: '0 4px', fontSize: 12, color: '#6b7280' }}>
                  Preview contract
                </span>
                <select
                  value={rawPreviewLang}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRawPreviewLang(v);
                    if (v) handlePreviewRaw(v);
                  }}
                  disabled={loading}
                  style={{ width: '100%' }}
                >
                  <option value="">Select language…</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Creation form only after choosing Create */}
        {stage === 'create' && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {/* existing New Draft inputs (client/unit/date/lang/phone/email/id/notes) */}
            {/* BEGIN: copied from previous block */}
            <div>
              <label>Client Name<br/>
                <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="e.g., Alejandra Pérez" style={{ width: '100%' }} />
              </label>
            </div>
            <div>
              <label>Unit Name (provisional)<br/>
                <input type="text" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} placeholder="e.g., Menesse Tulum 203" style={{ width: '100%' }} />
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Unit Address (for contract)<br/>
                <input
                  type="text"
                  value={newUnitAddress}
                  onChange={(e) => setNewUnitAddress(e.target.value)}
                  placeholder="Street, Number, City, State, ZIP"
                  style={{ width: '100%' }}
                />
              </label>
            </div>
            {/* Linens Fee selector - inserted below address, above start date */}
            <div>
              <label>Linens fee (per month)<br/>
                <select
                  value={linensFeePreset}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLinensFeePreset(v);
                    if (v && v !== 'other') setNewLinensFee(v);
                    if (!v) setNewLinensFee('');
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="">Select…</option>
                  <option value="400">Studio / 1 Bdr — 400</option>
                  <option value="600">2 Bdr — 600</option>
                  <option value="800">3 Bdr — 800</option>
                  <option value="other">Other amount — enter</option>
                </select>
              </label>
              {linensFeePreset === 'other' && (
                <div style={{ marginTop: 6 }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={newLinensFee}
                    onChange={(e) => setNewLinensFee(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="Enter amount e.g. 750"
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>
            <div>
              <label>Start Date<br/>
                <input type="date" value={newEffectiveDate} onChange={(e) => setNewEffectiveDate(e.target.value)} style={{ width: '100%' }} />
              </label>
            </div>
            <div>
              <label>Default Language<br/>
                <select value={newDefaultLocale} onChange={(e) => setNewDefaultLocale(e.target.value)} style={{ width: '100%' }}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </label>
            </div>
            <div>
              <label>Owner Phone<br/>
                <input type="tel" value={newOwnerPhone} onChange={(e) => setNewOwnerPhone(e.target.value)} placeholder="+52 1 555 123 4567" style={{ width: '100%' }} />
              </label>
            </div>
            <div>
              <label>Owner Email<br/>
                <input type="email" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="owner@example.com" style={{ width: '100%' }} />
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Owner ID / Passport (optional)<br/>
                <input type="text" value={newOwnerIdNumber} onChange={(e) => setNewOwnerIdNumber(e.target.value)} placeholder="e.g., Passport P1234567" style={{ width: '100%' }} />
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notes (optional)<br/>
                <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Notes about special clauses during negotiation..." rows={2} style={{ width: '100%' }} />
              </label>
            </div>
            {/* END: inputs */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={handleBack}>Back</button>
              <button className="btn btn-primary" onClick={handleCreateDraft} disabled={loading}>
                {loading ? 'Creating…' : 'Save'}
              </button>
              <button className="btn btn-secondary" onClick={handlePreview} disabled={loading || !draftId}>
                {loading ? 'Loading…' : 'Preview PDF'}
              </button>
            </div>
          </div>
        )}

        {/* Editing/preview toolbars visible only after a draft is active */}
        {stage === 'edit' && (
          <>
            <div style={{
              marginBottom: 16,
              padding: 12,
              border: '1px solid #e0e0e0',
              borderRadius: 8,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}>
              <div>
                <label>Client Name<br/>
                  <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div>
                <label>Unit Name (provisional)<br/>
                  <input type="text" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Unit Address (for contract)<br/>
                  <input
                    type="text"
                    value={newUnitAddress}
                    onChange={(e) => setNewUnitAddress(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </label>
              </div>
              {/* Linens Fee selector - inserted below address, above start date */}
              <div>
                <label>Linens fee (per month)<br/>
                  <select
                    value={linensFeePreset}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLinensFeePreset(v);
                      if (v && v !== 'other') setNewLinensFee(v);
                      if (!v) setNewLinensFee('');
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select…</option>
                    <option value="400">Studio / 1 Bdr — 400</option>
                    <option value="600">2 Bdr — 600</option>
                    <option value="800">3 Bdr — 800</option>
                    <option value="other">Other amount — enter</option>
                  </select>
                </label>
                {linensFeePreset === 'other' && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={newLinensFee}
                      onChange={(e) => setNewLinensFee(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="Enter amount e.g. 750"
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </div>
              <div>
                <label>Start Date<br/>
                  <input type="date" value={newEffectiveDate} onChange={(e) => setNewEffectiveDate(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div>
                <label>Default Language<br/>
                  <select value={newDefaultLocale} onChange={(e) => setNewDefaultLocale(e.target.value)} style={{ width: '100%' }}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </label>
              </div>
              <div>
                <label>Owner Phone<br/>
                  <input type="tel" value={newOwnerPhone} onChange={(e) => setNewOwnerPhone(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div>
                <label>Owner Email<br/>
                  <input type="email" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Owner ID / Passport (optional)<br/>
                  <input type="text" value={newOwnerIdNumber} onChange={(e) => setNewOwnerIdNumber(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notes (optional)<br/>
                  <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} style={{ width: '100%' }} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={handleBack}>Back</button>
                <button className="btn btn-primary" onClick={handleSaveDraft} disabled={loading || !draftId}>
                  {loading ? 'Saving…' : 'Save'}
                </button>
                <button className="btn btn-secondary" onClick={handlePreview} disabled={loading || !draftId}>
                  {loading ? 'Loading…' : 'Preview PDF'}
                </button>
              </div>
            </div>

            <div style={{
              marginBottom: 16,
              padding: 12,
              border: '1px solid #e0e0e0',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Advanced edits</strong>
                <button className="btn" onClick={() => setShowAdvanced(!showAdvanced)}>
                  {showAdvanced ? 'Hide' : 'Show'}
                </button>
              </div>
              {showAdvanced && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 8, color: '#6b7280' }}>
                    Editing language: <strong>{lang === 'es' ? 'Español' : 'English'}</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                    {SECTION_KEYS.map((k) => (
                      <div key={k} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{k}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-secondary" onClick={() => openEditorForKey(k)}>Edit (this language)</button>
                          <button className="btn" onClick={() => resetOverride(k)}>Reset</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {editorOpen && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
              }}>
                <div style={{ background: '#fff', width: 'min(900px, 96vw)', maxHeight: '90vh', borderRadius: 8, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
                  <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Edit section: {editorKey}</strong>
                    <button className="btn" onClick={() => setEditorOpen(false)}>Close</button>
                  </div>
                  <div style={{ padding: 12 }}>
                    {/* Simple WYSIWYG placeholder: contenteditable div */}
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setEditorHtml(e.currentTarget.innerHTML)}
                      style={{
                        border: '1px solid #e5e7eb', borderRadius: 6, padding: 10,
                        minHeight: 240, overflow: 'auto'
                      }}
                    />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                      Tip: Paste formatted text here. Allowed tags will be sanitized on save.
                    </div>
                  </div>
                  <div style={{ padding: 12, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={() => setEditorOpen(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveEditorHtml}>Save override</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {err && <span style={{ color: 'crimson', maxWidth: 480, overflow: 'auto' }}>{err}</span>}
        {previewUrl && (
          <div style={{ position: 'relative', marginTop: 16, border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
            <button
              aria-label="Close preview"
              title="Close preview"
              onClick={() => {
                try { if (previewUrl) URL.revokeObjectURL(previewUrl); } catch (e) {}
                setPreviewUrl(null);
              }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 32,
                height: 32,
                border: 'none',
                borderRadius: 16,
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontWeight: 700,
                lineHeight: '32px',
                textAlign: 'center',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              ×
            </button>
            <iframe title={'PDF Preview'} src={previewUrl} style={{ width: '100%', height: '80vh', display: 'block' }} />
          </div>
        )}
      </Box>
    </PageScaffold>
  );
};

export default UnitContract;