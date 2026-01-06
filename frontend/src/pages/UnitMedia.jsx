import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Autocomplete, TextField, Box, Button, Divider, Stack, Drawer } from '@mui/material';
import UnitMediaFormRHF from '../components/forms/UnitMediaFormRHF';
import { ReactSortable } from 'react-sortablejs';
import PageScaffold from '../components/layout/PageScaffold';

const API_BASE = (process.env.REACT_APP_BACKEND_BASE || '').replace(/\/$/, '');
const apiUrl = (path) => `${API_BASE}${path}`;

const TAG_OPTIONS = [
  // Unit tags
  'balcony',
  'bathroom',
  'bedroom',
  'bedroom master',
  'dining',
  'kitchen',
  'living',
  'plunge pool',
  // Common tags
  'exterior',
  'gym',
  'pool',
  'rooftop pool',
  'front desk',
  // Misc
  'other',
].sort();

export default function UnitMedia() {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [tags, setTags] = useState(''); // comma-separated
  const [isPublished, setIsPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [gallery, setGallery] = useState([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadMedia = () => {
    // Force a reload by changing the result dependency, which triggers the media useEffect
    setResult({ reloadAt: Date.now() });
  };

  const clearFilters = () => {
    // Clear any local filters (currently tags) and reload media
    setTags('');
    setResult({ reloadAt: Date.now() });
  };

  const openEditor = (media) => {
    setSelectedMedia(media);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setSelectedMedia(null);
  };

  const handleSaveMedia = async (patch) => {
    if (!selectedMedia) return;

    // Handle Delete action coming from the child form
    if (patch && patch.delete) {
      try {
        setSaving(true);
        setError('');
        const res = await fetch(apiUrl(`/api/unit_media/${selectedMedia.id}`), {
          method: 'DELETE',
          headers: { ...authHeader() },
        });
        if (res.status === 401) { navigate('/login'); return; }
        if (!res.ok && res.status !== 204) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.error || `Delete failed (${res.status})`);
        }
        // Remove from gallery and close editor
        setGallery((prev) => prev.filter((m) => m.id !== selectedMedia.id));
        closeEditor();
      } catch (e) {
        console.error(e);
        setError(e.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Default: PATCH update
    try {
      setSaving(true);
      setError('');
      const res = await fetch(apiUrl(`/api/unit_media/${selectedMedia.id}`), {
        method: 'PATCH',
        headers: {
          'Accept': 'application/ld+json, application/json',
          'Content-Type': 'application/merge-patch+json',
          ...authHeader(),
        },
        body: JSON.stringify(patch || {}),
      });
      if (res.status === 401) { navigate('/login'); return; }
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || `Update failed (${res.status})`);
      }

      let updated;
      if (res.status === 204) {
        // API returned no content; synthesize the updated object from current + patch
        updated = { ...selectedMedia, ...patch };
      } else {
        updated = await res.json();
      }

      // Optimistic in-place update
      const mergedPatch = { ...patch, ...updated };
      const nextGallery = gallery.map((m) => (m.id === updated.id ? { ...m, ...mergedPatch } : m));
      setSelectedMedia((prev) => (prev ? { ...prev, ...mergedPatch } : prev));

      const coverToggledOn = (patch && patch.isCover === true) || updated.isCover === true;
      if (coverToggledOn) {
        // Ensure single cover: unset any previous cover different from this item
        const normalized = nextGallery.map((m) =>
          m.id === updated.id ? { ...m, isCover: true } : (m.isCover ? { ...m, isCover: false } : m)
        );

        // Compute visual order (Cover first, then published, then sortOrder asc)
        const visual = [...normalized].sort((a, b) => {
          const coverCmp = Number(!!b.isCover) - Number(!!a.isCover);
          if (coverCmp !== 0) return coverCmp;
          const pubCmp = Number(!!b.isPublished) - Number(!!a.isPublished);
          if (pubCmp !== 0) return pubCmp;
          const soA = a?.sortOrder ?? 999999;
          const soB = b?.sortOrder ?? 999999;
          if (soA !== soB) return soA - soB;
          return (a.id || 0) - (b.id || 0);
        });

        // Apply local update and persist published order (cover gets sortOrder=1)
        setGallery(normalized);
        await persistPublishedOrder(visual);
      } else {
        // No cover change; regular in-place update
        setGallery(nextGallery);
      }

      closeEditor();
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const fileInputRef = useRef(null);

  const authHeader = () => {
    const t = localStorage.getItem('token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  // Load units for dropdown
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(apiUrl('/api/units?pagination=false'), { headers: { ...authHeader() } });
        if (res.status === 401) { navigate('/login'); return; }
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data['member'] || data['hydra:member'] || []);
        const activeUnits = items.filter(u => u.status === 'Active');
        if (!cancelled) setUnits(activeUnits);
      } catch (e) {
        console.error(e);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const selectedUnit = useMemo(() => units.find(u => String(u.id) === String(unitId)), [units, unitId]);

  const unitOptions = useMemo(() => (
    units.map(u => ({
      id: u.id,
      label: `${u.unitName || u.unit_name || `Unit ${u.id}`}${u.city ? ' — ' + u.city : ''}`,
    }))
  ), [units]);

  const selectedOption = useMemo(() => (
    unitOptions.find(o => String(o.id) === String(unitId)) || null
  ), [unitOptions, unitId]);

  const orderedGallery = useMemo(() => {
    const copy = [...gallery];
    copy.sort((a, b) => {
      // Cover first
      const coverCmp = Number(!!b.isCover) - Number(!!a.isCover);
      if (coverCmp !== 0) return coverCmp;
      // Published first
      const pubCmp = Number(!!b.isPublished) - Number(!!a.isPublished);
      if (pubCmp !== 0) return pubCmp;
      // Among published: sortOrder asc (fallback large number)
      const soA = a?.sortOrder ?? 999999;
      const soB = b?.sortOrder ?? 999999;
      if (soA !== soB) return soA - soB;
      // Stable fallback by id
      return (a.id || 0) - (b.id || 0);
    });
    return copy;
  }, [gallery]);

  // Summary numbers for published photos by tag/area
  const summary = useMemo(() => {
    const allTags = TAG_OPTIONS;
    const tagCounts = Object.fromEntries(allTags.map(t => [t, 0]));

    let totalPublished = 0;
    for (const m of gallery) {
      if (m.isPublished) {
        totalPublished += 1;
        const tags = Array.isArray(m.tags) ? m.tags : [];
        for (const t of tags) {
          if (t in tagCounts) tagCounts[t] += 1;
        }
      }
    }

    // Partition tags into Unit vs Common buckets
    const commonTagSet = new Set(['exterior', 'gym', 'pool', 'rooftop pool', 'front desk', 'common']);
    const unitTagSet = new Set(allTags.filter(t => !commonTagSet.has(t) && t !== 'other'));

    const unitTotal = [...unitTagSet].reduce((sum, t) => sum + (tagCounts[t] || 0), 0);
    const commonTotal = [...commonTagSet].reduce((sum, t) => sum + (tagCounts[t] || 0), 0);

    return { totalPublished, tagCounts, unitTotal, commonTotal, unitTagSet, commonTagSet, allTags };
  }, [gallery]);

  // Persist only published items' order to backend, with cover sortOrder 1 if present
  const persistPublishedOrder = async (newList) => {
     // Guard: avoid running on first render or with empty/stale lists
  if (!Array.isArray(newList) || newList.length === 0) return;

  // Only consider items that are explicitly published
  const published = newList.filter((m) => m && m.isPublished === true);
  if (published.length === 0) return;

    const hasCoverFirst = !!published[0]?.isCover;

    for (let i = 0; i < published.length; i++) {
      const m = published[i];
      // Reserve 1 for the cover if it is the first published item; others shift to 2..n
      const desired = hasCoverFirst ? (i === 0 ? 1 : i + 1) : (i + 1); // 1‑based indexing

      if (m.sortOrder !== desired) {
        // Optimistic local update
        setGallery((prev) => prev.map((x) => (x.id === m.id ? { ...x, sortOrder: desired } : x)));
        // Persist to backend
        try {
          await fetch(apiUrl(`/api/unit_media/${m.id}`), {
            method: 'PATCH',
            headers: {
              Accept: 'application/ld+json, application/json',
              'Content-Type': 'application/merge-patch+json',
              ...authHeader(),
            },
            body: JSON.stringify({ sortOrder: desired }),
          });
        } catch (e) {
          console.error('Failed to persist sortOrder', m.id, e);
        }
      }
    }
  };

  // Load media for current unit (via dedicated endpoint)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!unitId) { setGallery([]); return; }
      try {
        const res = await fetch(apiUrl(`/api/units/${unitId}/media`), { headers: { ...authHeader() } });
        if (res.status === 401) { navigate('/login'); return; }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.error || `Fetch failed (${res.status})`);
        }
        const items = await res.json();
        const normalize = (it) => ({
          ...it,
          // Map API names → internal state
          isPublished: (it.published ?? it.isPublished ?? it.is_published ?? false),
          isCover:     (it.cover     ?? it.isCover     ?? it.is_cover     ?? false),
          tags: Array.isArray(it.tags) ? it.tags : [],
        });

        if (!Array.isArray(items)) {
          const list = items['member'] || items['hydra:member'] || [];
          if (!cancelled) setGallery(list.map(normalize));
        } else {
          if (!cancelled) setGallery(items.map(normalize));
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e.message);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [unitId, result]);

  const handleBulkFiles = async (fileList) => {
    if (!unitId) { setError('Please select a unit'); return; }
    if (!fileList || fileList.length === 0) { return; }

    const fd = new FormData();
    Array.from(fileList).forEach(f => fd.append('files[]', f));
    fd.append('is_published', '1');

    try {
      setBusy(true);
      setError('');
      const res = await fetch(apiUrl(`/api/units/${unitId}/media`), {
        method: 'POST',
        headers: { ...authHeader() },
        body: fd,
      });
      if (res.status === 401) { navigate('/login'); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || `Upload failed (${res.status})`);
      }
      const json = await res.json();
      setResult(json);
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <PageScaffold
      title="Unit Media"
      sectionKey="management"
      currentPath="/units-media"
      layout="table"
      stickyHeader={(
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Box>
            <Autocomplete
              options={unitOptions}
              value={selectedOption}
              onChange={(event, newValue) => setUnitId(newValue?.id || '')}
              renderInput={(params) => <TextField {...params} placeholder="Type to search units" label="Unit" size="small" />}
              sx={{ width: 360 }}
            />
            {selectedUnit && (
              <Box sx={{ color: '#666', fontSize: 12, mt: 0.5 }}>
                ID: {selectedUnit.id} • City: {selectedUnit.city || '—'}
              </Box>
            )}
          </Box>
          <TextField
            label="Tags"
            size="small"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma separated"
            sx={{ minWidth: 220 }}
          />
          <Button variant="contained" onClick={loadMedia} disabled={!unitId || busy}>
            {busy ? 'Loading…' : 'Load Media'}
          </Button>
          <Button variant="outlined" onClick={clearFilters} disabled={busy}>
            Clear
          </Button>
          <Button variant="outlined" onClick={() => fileInputRef.current?.click()} disabled={!unitId}>
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleBulkFiles(e.target.files)}
          />
        </Stack>
      )}
      contentPadding={20}
    >

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <section style={{ padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, maxWidth: 944, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Gallery</h3>
            <div style={{ color: '#666' }}>{gallery.length} photos</div>
          </div>
          {!unitId && <div style={{ marginTop: 8, color: '#666' }}>Select a unit to view its media.</div>}
          {unitId && (
            <ReactSortable
              list={orderedGallery}
              setList={async (newList) => {
                // Reconcile visual order back to base gallery by id
                const orderById = new Map(newList.map(x => [x.id, x]));
                setGallery(prev => prev.map(x => orderById.get(x.id) || x));

                // Auto-cover: if the new first item is published and not already cover, set it as cover
                const newFirst = newList[0];
                if (newFirst && newFirst.isPublished && !newFirst.isCover) {
                  try {
                    // Find previous cover (if any) before we mutate
                    const prevCover = gallery.find(g => g.isCover);

                    // Set new cover
                    await fetch(apiUrl(`/api/unit_media/${newFirst.id}`), {
                      method: 'PATCH',
                      headers: {
                        'Accept': 'application/ld+json, application/json',
                        'Content-Type': 'application/merge-patch+json',
                        ...authHeader(),
                      },
                      body: JSON.stringify({ isCover: true }),
                    });
                    setGallery(prev => prev.map(x => x.id === newFirst.id ? { ...x, isCover: true } : x));

                    // Unset previous cover if it's a different item
                    if (prevCover && prevCover.id !== newFirst.id) {
                      await fetch(apiUrl(`/api/unit_media/${prevCover.id}`), {
                        method: 'PATCH',
                        headers: {
                          'Accept': 'application/ld+json, application/json',
                          'Content-Type': 'application/merge-patch+json',
                          ...authHeader(),
                        },
                        body: JSON.stringify({ isCover: false }),
                      });
                      setGallery(prev => prev.map(x => x.id === prevCover.id ? { ...x, isCover: false } : x));
                    }
                  } catch (e) {
                    console.error('Failed to update cover after drag', e);
                  }
                }

                // Persist order (cover reserved at sortOrder=1 when first)
                persistPublishedOrder(newList);
              }}
              filter=".is-unpublished"
              preventOnFilter={false}
              animation={150}
              delayOnTouchStart={true}
              delay={2}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
                marginTop: 12,
                maxWidth: 920,
              }}
            >
              {orderedGallery.map(m => (
                <div
                  key={m.id}
                  onClick={() => openEditor(m)}
                  className={!m.isPublished ? 'is-unpublished' : undefined}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: m.isPublished ? 'grab' : 'not-allowed',
                    opacity: m.isPublished ? 1 : 0.6,
                  }}
                >
                  <a href={m.url} target="_blank" rel="noreferrer">
                    <img src={m.url} alt={m.seoDescription || m.caption || ''} style={{ width: '100%', display: 'block', aspectRatio: '1/1', objectFit: 'cover' }} />
                  </a>
                  <div style={{ padding: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.caption || '—'}</div>
                    <div style={{ color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(m.tags || []).join(', ')}</div>
                    <div style={{ marginTop: 4 }}>
                      {m.isCover ? <span style={{ padding: '2px 6px', background: '#1e6f68', color: '#fff', borderRadius: 4, marginRight: 6 }}>Cover</span> : null}
                      {m.isPublished ? (
                        <span style={{ padding: '2px 6px', background: '#e0f2f1', color: '#1e6f68', borderRadius: 4 }}>Published</span>
                      ) : (
                        <span style={{ padding: '2px 6px', background: '#fbe9e7', color: '#c62828', borderRadius: 4 }}>Hidden</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </ReactSortable>
          )}
        </section>

        {unitId && (
          <section style={{ padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, width: 260, flex: '0 0 260px' }}>
            <h3 style={{ margin: '0 0 8px 0' }}>Summary</h3>

            <div style={{ fontSize: 14, marginBottom: 8 }}>
              <div><strong>Total Published:</strong> {summary.totalPublished}</div>
            </div>

            {/* Unit group */}
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, marginBottom: 4 }}>
              Unit: {summary.unitTotal}
            </div>
            <div style={{ fontSize: 13, color: '#333', marginBottom: 8 }}>
              {summary.allTags.filter(t => summary.unitTagSet.has(t)).map((t) => (
                <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: '#666' }}>{t}</span>
                  <span>{summary.tagCounts[t] ?? 0}</span>
                </div>
              ))}
            </div>

            {/* Common group */}
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, marginBottom: 4 }}>
              Common: {summary.commonTotal}
            </div>
            <div style={{ fontSize: 13, color: '#333' }}>
              {summary.allTags.filter(t => summary.commonTagSet.has(t)).map((t) => (
                <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: '#666' }}>{t}</span>
                  <span>{summary.tagCounts[t] ?? 0}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <Drawer
        anchor="right"
        open={editorOpen}
        onClose={closeEditor}
        PaperProps={{
          sx: {
            width: { xs: 'min(92vw, 320px)', sm: 'min(92vw, 520px)' },
            maxWidth: '100vw',
            boxSizing: 'border-box',
            overflowX: 'hidden'
          }
        }}
      >
        <Box sx={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}>
            <h3 style={{ margin: 0, flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>Edit Media</h3>
            <button
              onClick={closeEditor}
              style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
            >×</button>
          </Box>
          <Divider />
          <Box sx={{ p: 2, overflowY: 'auto', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {!selectedMedia ? (
              <div style={{ color: '#666' }}>No media selected.</div>
            ) : (
              <>
                <div style={{ marginBottom: 12, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                  <img
                    src={selectedMedia.url}
                    alt={selectedMedia.caption || ''}
                    style={{ width: '100%', maxWidth: 280, height: 'auto', borderRadius: 8, display: 'block', margin: '0 auto' }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#666',
                    marginBottom: 12,
                    width: '100%',
                    maxWidth: 280,
                    margin: '0 auto 12px auto',
                    boxSizing: 'border-box',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word'
                  }}
                >
                  <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>ID:</strong> {selectedMedia.id}</div>
                  <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>Key:</strong> {selectedMedia.s3Key}</div>
                  <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>Tags:</strong> {(selectedMedia.tags || []).join(', ') || '—'}</div>
                  <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>Caption:</strong> {selectedMedia.caption || '—'}</div>
                  <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>SEO:</strong> {selectedMedia.seoDescription || '—'}</div>
                  <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>Published:</strong> {selectedMedia.isPublished ? 'Yes' : 'No'}</div>
                  <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>Cover:</strong> {selectedMedia.isCover ? 'Yes' : 'No'}</div>
                </div>
                <Divider />
                <div style={{ marginTop: 12 }}>
                  <UnitMediaFormRHF
                    media={selectedMedia}
                    saving={saving}
                    onCancel={closeEditor}
                    onSave={handleSaveMedia}
                  />
                </div>
              </>
            )}
          </Box>
          <Divider />
          <Box sx={{ p: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={closeEditor}>Close</Button>
          </Box>
        </Box>
      </Drawer>
    </PageScaffold>
  );
}
