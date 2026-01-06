import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Stack,
  Button,
  Tabs,
  Tab,
  Divider,
  IconButton,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  TextField,
  MenuItem,
  Card,
  CardMedia,
  CardContent,
} from '@mui/material';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useForm, useFieldArray } from 'react-hook-form';
import { toast } from 'react-toastify';
import api from '../../../api';
import RHFTextField from '../../../components/forms/rhf/RHFTextField';
import RHFSelect from '../../../components/forms/rhf/RHFSelect';
import RHFDatePicker from '../../../components/forms/rhf/RHFDatePicker';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import PRESETS from '../../../constants/inventoryPresets';

// Simple area options - adjust as needed or fetch from API
const AREA_OPTIONS = [
  'Baño',
  'Cocina',
  'Comedor',
  'Lavandería',
  'Recámara Master',
  'Recamara',
  'Sala',
  'Terraza / Balcón',
  'Otros',
];

// Parse labels like "Baño 2" -> { base: "Baño", num: 2 }
const parseAreaLabel = (label) => {
  if (!label) return { base: '', num: null };
  const m = String(label).trim().match(/^(.*?)(?:\s+(\d+))$/);
  if (m && m[1]) {
    return { base: m[1].trim(), num: m[2] ? Number(m[2]) : null };
  }
  return { base: String(label).trim(), num: null };
};

const combineAreaLabel = (base, num) => {
  if (!base) return '';
  const n = Number(num);
  if (Number.isFinite(n) && n > 0) return `${base} ${n}`;
  return base;
};

const suggestNextNumber = (items, base, skipIndex = -1) => {
  if (!base) return null;
  let max = 0;
  for (let i = 0; i < items.length; i++) {
    if (i === skipIndex) continue;
    const it = items[i];
    if (!it) continue;
    const curBase = it.area || '';
    const curNum = it.areaNumber ? Number(it.areaNumber) : parseAreaLabel(combineAreaLabel(it.area, it.areaNumber)).num;
    if (curBase === base) {
      // treat blank as 1
      const val = Number.isFinite(curNum) && curNum > 0 ? curNum : 1;
      if (val > max) max = val;
    }
  }
  // if first occurrence, return null (no number); second becomes max+1 (>=2)
  if (max === 0) return null;
  return max + 1;
};

// Helper: find previous notes for same area/desc
const findPreviousNotes = (items, skipIndex, combinedArea, descripcion) => {
  const desc = String(descripcion ?? '').trim();
  if (!desc || !combinedArea) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    if (i === skipIndex) continue;
    const it = items[i];
    if (!it) continue;
    const a = combineAreaLabel(it.area, it.areaNumber);
    if (a === combinedArea && String(it.descripcion ?? '').trim() === desc) {
      const note = String(it.notas ?? '').trim();
      if (note) return note;
    }
  }
  return null;
};

export default function MobileInventoryForm() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0); // 0 = Items, 1 = Photos
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [unitName, setUnitName] = useState('');
  const [uploading, setUploading] = useState(false);

  const form = useForm({
    defaultValues: {
      items: [],
    },
    mode: 'onBlur',
  });
  const { control, watch, reset, getValues } = form;
  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' });

  // Track which saved item is being edited per composer row index
  const [editingByIndex, setEditingByIndex] = useState({});
  // Keep only one Area card expanded at a time
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Reset all composer inputs (keeps Área and No.) and clear edit flags
  const resetAllComposers = () => {
    try {
      const arr = getValues('items') || [];
      for (let i = 0; i < arr.length; i++) {
        form.setValue(`items.${i}.descripcion`, '', { shouldDirty: false });
        form.setValue(`items.${i}.cantidad`, '', { shouldDirty: false });
        form.setValue(`items.${i}.notas`, '', { shouldDirty: false });
      }
      setEditingByIndex({});
    } catch (e) {
      // swallow
    }
  };

  // Load session with items & photos
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const { data } = await api.get(`/api/unit-inventory/session/${sessionId}`);
        if (!data?.ok) throw new Error('Failed to load session');
        if (!mounted) return;
        setSession(data.session);
        // Attempt to fetch unit name for header (if not provided in payload)
        try {
          const unitRes = await api.get(`/api/units/${data.session.unitId}`);
          const unit = unitRes.data;
          setUnitName(unit?.unitName || unit?.name || `Unit #${data.session.unitId}`);
        } catch {
          setUnitName(`Unit #${data.session.unitId}`);
        }
        const items = (data.session.items || []).map(it => {
          const parsed = parseAreaLabel(it.area || '');
          return {
            _id: it.id,
            area: parsed.base || '',
            areaNumber: parsed.num ?? '',
            descripcion: it.descripcion || '',
            cantidad: it.cantidad ?? 1,
            notas: it.notas || '',
          };
        });
        reset({ items });
        resetAllComposers();
      } catch (e) {
        if (mounted) setError(e.message || 'Error loading session');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [sessionId, reset]);

  const items = watch('items');

  // Build distinct combined area labels from Step 1 items for the Photos tab
  const photoAreaOptions = useMemo(() => {
    const set = new Set();
    for (const it of items || []) {
      const label = combineAreaLabel(it?.area, it?.areaNumber);
      if (label && label.trim()) set.add(label.trim());
    }
    // Fallback to base options if no items yet
    if (set.size === 0) return AREA_OPTIONS;
    return Array.from(set);
  }, [items]);

  // Selected area for photo uploads (defaults to last area or first available)
  const [photoArea, setPhotoArea] = useState('');
  useEffect(() => {
    const def = lastAreaOrDefault();
    // ensure current selection is valid, else pick default or first option
    if (!photoArea || !photoAreaOptions.includes(photoArea)) {
      setPhotoArea(photoAreaOptions.includes(def) ? def : (photoAreaOptions[0] || def));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoAreaOptions]);

  // Memoized filtered photos for Photos tab, only for selected area
  const filteredPhotos = React.useMemo(() => {
    const all = session?.photos || [];
    if (!photoArea) return all;
    return all.filter((p) => p.area === photoArea);
  }, [session, photoArea]);

  // Photos per area (for badges / dropdown labels)
const photoCounts = React.useMemo(() => {
  const map = new Map();
  (session?.photos || []).forEach((p) => {
    const key = String(p.area || '').trim();
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
    return map;
  }, [session]);

  const addItem = (presetArea) => {
    const baseArea = typeof presetArea === 'string' ? presetArea : '';
    const newIndex = fields.length; // new row will be appended at this index
    append({ area: baseArea, areaNumber: '', descripcion: '', cantidad: 1, notas: '' });
    // Expand the newly added Area card and collapse others
    setExpandedIdx(newIndex);
  };

  const duplicateItem = (idx) => {
    const src = items[idx];
    append({ area: src.area, descripcion: src.descripcion, cantidad: src.cantidad || 1, notas: src.notas || '' });
  };

  const saveItem = async (idx) => {
    try {
      const row = getValues(`items.${idx}`);
      if (!row?.area || !row?.descripcion) return; // required
      const payload = {
        sessionId: Number(sessionId),
        area: combineAreaLabel(row.area, row.areaNumber),
        descripcion: row.descripcion,
        cantidad: Math.max(1, Number(row.cantidad || 1)),
        notas: row.notas || null,
      };
      const { data } = await api.post('/api/unit-inventory/item', payload);
      if (!row._id && data?.item?.id) {
        // store returned id so future edits could PATCH (not implemented yet)
        update(idx, { ...row, _id: data.item.id });
      }
      toast.success('Item guardado', { autoClose: 1000 });
    } catch (e) {
      toast.error('No se pudo guardar el item', { autoClose: 1500 });
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!session) return;
    try {
      setUploading(true);
      const area = photoArea || lastAreaOrDefault();
      const caption = '';
      const formData = new FormData();
      formData.append('sessionId', String(sessionId));
      formData.append('area', area);
      formData.append('caption', caption);
      formData.append('file', file);
      const { data } = await api.post('/api/unit-inventory/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data?.ok) {
        // refresh session to show new photo
        const res2 = await api.get(`/api/unit-inventory/session/${sessionId}`);
        setSession(res2.data.session);
        toast.success('Foto subida', { autoClose: 1000 });
      } else {
        throw new Error('Upload failed');
      }
    } catch (e2) {
      toast.error('No se pudo subir la foto', { autoClose: 1500 });
    } finally {
      setUploading(false);
      // reset input
      e.target.value = '';
    }
  };

  const lastAreaOrDefault = () => {
    const last = items[items.length - 1];
    if (!last) return 'Recámara principal';
    const label = combineAreaLabel(last.area, last.areaNumber);
    return label || 'Recámara principal';
  };

  const handleSubmitSession = async () => {
    try {
      const { data } = await api.patch(`/api/unit-inventory/session/${sessionId}/submit`);
      if (data?.ok) {
        toast.success('Inventario enviado', { autoClose: 1000 });
        navigate('/m/inventory');
      } else {
        throw new Error('Submit failed');
      }
    } catch (e) {
      toast.error('No se pudo enviar el inventario', { autoClose: 1500 });
    }
  };

  const handleAreaChange = (idx, incoming) => {
    // Accept either a direct value or a MUI/RHF event
    const newBase = (incoming && typeof incoming === 'object' && 'target' in incoming)
      ? incoming.target.value
      : incoming;
    const baseStr = String(newBase ?? '');
    form.setValue(`items.${idx}.area`, baseStr, { shouldDirty: true });
    const next = suggestNextNumber(form.getValues('items'), baseStr, idx);
    form.setValue(`items.${idx}.areaNumber`, next ?? '', { shouldDirty: true });
  };

  // Add to Area: create or update the item, refresh session, and reset composer
  const handleAddToArea = async (idx) => {
    const row = getValues(`items.${idx}`);
    const desc = String(row?.descripcion ?? '').trim();
    const qty = Number(row?.cantidad ?? 0);
    if (!desc) {
      toast.warn('Selecciona una descripción', { autoClose: 1200 });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.warn('Cantidad requerida', { autoClose: 1200 });
      return;
    }
    const payload = {
      sessionId: Number(sessionId),
      area: combineAreaLabel(row.area, row.areaNumber),
      descripcion: desc,
      cantidad: Math.max(1, qty),
      notas: String(row?.notas ?? '').trim() || null,
    };
    try {
      const editingId = editingByIndex[idx];
      if (editingId) {
        // Update existing item
        const { data } = await api.patch(`/api/unit-inventory/item/${editingId}`, payload);
        if (!data?.ok) throw new Error('No ok');
      } else {
        // Create new
        const { data } = await api.post('/api/unit-inventory/item', payload);
        if (!data?.ok) throw new Error('No ok');
      }
      // Refresh session so list below shows the change
      const res2 = await api.get(`/api/unit-inventory/session/${sessionId}`);
      setSession(res2.data.session);
      // Reset composer (keep Área + No.) and clear editing flag
      form.setValue(`items.${idx}.descripcion`, '', { shouldDirty: true });
      form.setValue(`items.${idx}.cantidad`, '', { shouldDirty: true });
      if (!editingId) {
        // Clear notes only when adding a new item; keep notes when editing
        form.setValue(`items.${idx}.notas`, '', { shouldDirty: true });
      }
      setEditingByIndex((prev) => {
        const copy = { ...prev };
        delete copy[idx];
        return copy;
      });
      toast.success(editingId ? 'Item actualizado' : 'Item agregado', { autoClose: 900 });
      resetAllComposers();
    } catch (e) {
      toast.error('No se pudo guardar el item', { autoClose: 1500 });
    }
  };

  // Handler to delete a saved item
  const handleDeleteSavedItem = async (itemId) => {
    try {
      await api.delete(`/api/unit-inventory/item/${itemId}`);
      const res = await api.get(`/api/unit-inventory/session/${sessionId}`);
      setSession(res.data.session);
      resetAllComposers();
      toast.success('Item eliminado', { autoClose: 900 });
    } catch (e) {
      toast.error('No se pudo eliminar el item', { autoClose: 1500 });
    }
  };

  // Delete an entire Area (card) and all associated saved items
  const handleDeleteArea = async (idx) => {
    try {
      const row = getValues(`items.${idx}`);
      const areaLabel = combineAreaLabel(row?.area, row?.areaNumber);
      if (!areaLabel) return;
      if (!window.confirm(`¿Borrar ${areaLabel}?`)) return;

      // Delete all persisted items for this area on the server
      const affected = (session?.items || []).filter((it) => it.area === areaLabel).map((it) => it.id);
      for (const id of affected) {
        try { await api.delete(`/api/unit-inventory/item/${id}`); } catch (_) { /* continue */ }
      }

      // Refresh session from API to reflect removals
      try {
        const res = await api.get(`/api/unit-inventory/session/${sessionId}`);
        setSession(res.data.session);
      } catch (_) { /* ignore */ }

      // Remove ALL composer rows matching this area from the form
      const current = getValues('items') || [];
      const toRemove = [];
      current.forEach((it, i) => {
        const label = combineAreaLabel(it?.area, it?.areaNumber);
        if (label === areaLabel) toRemove.push(i);
      });
      toRemove.sort((a,b) => b - a).forEach((i) => remove(i));

      // Clear any edit flags for removed indices
      setEditingByIndex((prev) => {
        const copy = { ...prev };
        Object.keys(copy).forEach((k) => { if (toRemove.includes(Number(k))) delete copy[k]; });
        return copy;
      });

      toast.success(`${areaLabel} borrada`, { autoClose: 1000 });
      setExpandedIdx(null);
    } catch (e) {
      toast.error('No se pudo borrar el área', { autoClose: 1500 });
    }
  };

  const PhotosGrid = ({ photos = [], onEditCaption, onDelete }) => {
    if (!photos.length) {
      return (
        <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
          <Typography variant="body2">Aún no hay fotos. Sube la primera.</Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {photos.map((p) => (
          <Card key={p.id} variant="outlined" sx={{ position: 'relative', borderRadius: 1, cursor: 'pointer' }} onClick={() => onEditCaption && onEditCaption(p)}>
            {/* Delete button overlay */}
            {onDelete && (
              <IconButton
                size="small"
                aria-label="eliminar foto"
                onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.9)' }}
              >
                <TrashIcon style={{ width: 18, height: 18 }} />
              </IconButton>
            )}
            <CardMedia component="img" image={p.fileUrl} alt={p.caption || ''} />
            {p.caption && (
              <CardContent sx={{ p: 1 }}>
                <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary" noWrap>
                  {p.caption}
                </Typography>
              </CardContent>
            )}
          </Card>
        ))}
      </Box>
    );
  };

  // Handler to edit photo caption and refresh session
  const handleEditPhotoCaption = async (photo) => {
    const current = photo?.caption || '';
    const next = window.prompt('Añadir/editar nota de la foto:', current);
    if (next === null) return; // cancelled
    try {
      const { data } = await api.patch(`/api/unit-inventory/photo/${photo.id}`, { caption: next });
      if (!data?.ok) throw new Error('No ok');
      const res = await api.get(`/api/unit-inventory/session/${sessionId}`);
      setSession(res.data.session);
      toast.success('Nota guardada', { autoClose: 900 });
    } catch (e) {
      toast.error('No se pudo guardar la nota', { autoClose: 1500 });
    }
  };

  // Handler to delete a photo and refresh session
  const handleDeletePhoto = async (photo) => {
    if (!photo?.id) return;
    if (!window.confirm('¿Borrar esta foto?')) return;
    try {
      await api.delete(`/api/unit-inventory/photo/${photo.id}`);
      const res = await api.get(`/api/unit-inventory/session/${sessionId}`);
      setSession(res.data.session);
      toast.success('Foto eliminada', { autoClose: 900 });
    } catch (e) {
      toast.error('No se pudo eliminar la foto', { autoClose: 1500 });
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="outlined" onClick={() => navigate('/m/inventory')}>Volver</Button>
      </Box>
    );
  }

  // Helper to get presets for a given row
  const getPresetsForRow = (row) => {
    const base = parseAreaLabel(combineAreaLabel(row?.area, row?.areaNumber)).base;
    const list = PRESETS[base] || [];
    // Sort A–Z (Spanish rules)
    return [...list].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  };

  return (
    <Box sx={{ p: 2, pb: 10 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1">Inventory — {unitName}</Typography>
      </Stack>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
        <Tab label="Items" />
        <Tab label="Photos" />
      </Tabs>

      {/* Items Tab */}
      {tab === 0 && (
        <Box>
          {/* Add/duplicate actions */}
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => addItem()}>
              Añadir Área
            </Button>
          </Stack>

          {/* RHF Items List */}
          {/* Dedupe: ensure only one card per Área */}
          {(() => { return null; })()}
          <form>
            {(() => {
              const seenAreas = new Set();
              return fields.map((field, idx) => {
              const row = items[idx] || {};
              const showDetails = !!String(row.area ?? '').trim();
              // Show the Área picker only until the Área is finalized.
              // If 'Otros' is chosen, keep the picker visible until a custom label is provided.
              const showAreaPicker =
                !String(row.area ?? '').trim() ||
                String(row.area).trim() === 'Otros';
              // If area is finalized and we've already rendered a card for this same combined area, skip this row
              const combinedAreaKey = String(combineAreaLabel(row.area, row.areaNumber) || '').trim();
              if (!showAreaPicker && combinedAreaKey) {
                if (seenAreas.has(combinedAreaKey)) {
                  return null;
                }
                seenAreas.add(combinedAreaKey);
              }
              return (
                <Accordion
                  key={field.id}
                  expanded={expandedIdx === idx}
                  onChange={(_, isExp) => setExpandedIdx(isExp ? idx : null)}
                  sx={{ mb: 1, '&:before': { display: 'none' } }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      minHeight: 36,
                      py: 0,
                      '&.Mui-expanded': { minHeight: 36 },
                      '& .MuiAccordionSummary-content': { my: 0 },
                      '& .MuiAccordionSummary-content.Mui-expanded': { my: 0 }
                    }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                      {(() => {
                        const areaLabel = String(combineAreaLabel(row.area, row.areaNumber) || 'Seleccionar Área');
                        const cnt = photoCounts.get(areaLabel) || 0;
                        return (
                          <Typography variant="subtitle2">
                            {areaLabel}
                            {cnt > 0 && (
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                ({cnt})
                              </Typography>
                            )}
                          </Typography>
                        );
                      })()}
                      <Stack direction="row" spacing={1}>
                        <IconButton size="small" color="error" onClick={() => handleDeleteArea(idx)} aria-label="delete">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    {showAreaPicker && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <RHFSelect
                          control={form.control}
                          name={`items.${idx}.area`}
                          label="Área"
                          options={AREA_OPTIONS}
                          onChange={(val) => handleAreaChange(idx, val)}
                          onBlur={() => saveItem(idx)}
                          size="small"
                        />
                        <RHFTextField
                          control={form.control}
                          name={`items.${idx}.areaNumber`}
                          label="No."
                          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', min: 2, style: { textAlign: 'center' } }}
                          sx={{ width: 84 }}
                          onBlur={() => saveItem(idx)}
                          size="small"
                        />
                      </Stack>
                    )}
                    {showAreaPicker && row.area === 'Otros' && (
                      <Box sx={{ mt: 1 }}>
                        <RHFTextField
                          control={form.control}
                          name={`items.${idx}.customArea`}
                          label="Especificar área"
                          placeholder="Ej. Closet, Roof Deck, Patio..."
                          onBlur={(e) => {
                            const custom = String(e.target.value || '').trim();
                            if (custom) {
                              form.setValue(`items.${idx}.area`, custom, { shouldDirty: true });
                              form.setValue(`items.${idx}.customArea`, '', { shouldDirty: false });
                              const next = suggestNextNumber(form.getValues('items'), custom, idx);
                              if (next) {
                                form.setValue(`items.${idx}.areaNumber`, next, { shouldDirty: true });
                              }
                              saveItem(idx);
                            }
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Escribe el nombre del área y presiona fuera del campo para confirmar.
                        </Typography>
                      </Box>
                    )}
                    {showDetails && (
                      <>
                        <Box
                          sx={{
                            display: 'grid',
                            alignItems: 'center',
                            columnGap: { xs: 2, sm: 8 },
                            rowGap: { xs: 6, sm: 8 },
                            mt: 1,
                            gridTemplateColumns: { xs: 'minmax(0,1fr) 56px 32px', sm: '1.5fr 0.8fr auto' }
                          }}
                        >
                          {/* Descripción dropdown (presets) */}
                          {(() => {
                            const presetOptions = getPresetsForRow(row);
                            const currentDesc = String(form.getValues(`items.${idx}.descripcion`) ?? '');
                            const isPreset = presetOptions.includes(currentDesc);
                            return (
                          <TextField
                            select
                            size="small"
                            label="Descripción"
                            value={currentDesc ? (isPreset ? currentDesc : '__OTRO__') : ''}
                            displayEmpty
                            renderValue={(selected) => (selected ? selected : 'Selecciona item')}
                            InputLabelProps={{ shrink: true }}
                            margin="dense"
                            fullWidth
                            sx={{ mt: 0, minWidth: 0 }}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val && val !== '__OTRO__') {
                                form.setValue(`items.${idx}.descripcion`, val, { shouldDirty: true });
                                const combined = combineAreaLabel(form.getValues(`items.${idx}.area`), form.getValues(`items.${idx}.areaNumber`));
                                const prev = findPreviousNotes(form.getValues('items'), idx, combined, val);
                                form.setValue(`items.${idx}.notas`, prev ?? '', { shouldDirty: true });
                                // saveItem(idx); // Removed: do not save immediately on preset select
                              } else if (val === '__OTRO__') {
                                form.setValue(`items.${idx}.descripcion`, '', { shouldDirty: true });
                              }
                            }}
                          >
                            <MenuItem value="__OTRO__">Otro…</MenuItem>
                            {presetOptions.map((opt) => (
                              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                            ))}
                          </TextField>
                            );
                          })()}

                          {/* Cantidad */}
                          <RHFTextField
                            control={form.control}
                            name={`items.${idx}.cantidad`}
                            label="Ctd"
                            inputProps={{ type: 'number', min: 1, step: 1, style: { textAlign: 'center' } }}
                            size="small"
                            InputLabelProps={{ shrink: true }}
                            margin="dense"
                            sx={{ mt: 0, width: { xs: 56, sm: 96 } }}
                          />
                          <IconButton
                            color="primary"
                            size="small"
                            onClick={() => handleAddToArea(idx)}
                            title={editingByIndex[idx] ? 'Guardar cambios' : 'Agregar'}
                            sx={{ justifySelf: { xs: 'end', sm: 'start' }, p: { xs: 0.5, sm: 1 } }}
                          >
                            {editingByIndex[idx] ? <PencilSquareIcon style={{ width: 18, height: 18 }} /> : <AddIcon />}
                          </IconButton>
                        </Box>
                        {/* Custom description field if "Otro..." is chosen */}
                        {String(form.getValues(`items.${idx}.descripcion`) ?? '').trim() === '' && (
                          <Box sx={{ mt: 1 }}>
                            <RHFTextField
                              control={form.control}
                              name={`items.${idx}.descripcion`}
                              label="Descripción (otro)"
                              size="small"
                              placeholder="Escribe el nombre del item…"
                              onBlur={() => {
                                const desc = form.getValues(`items.${idx}.descripcion`);
                                const notas = form.getValues(`items.${idx}.notas`);
                                if (!String(notas ?? '').trim()) {
                                  const combined = combineAreaLabel(form.getValues(`items.${idx}.area`), form.getValues(`items.${idx}.areaNumber`));
                                  const prev = findPreviousNotes(form.getValues('items'), idx, combined, desc);
                                  if (prev) form.setValue(`items.${idx}.notas`, prev, { shouldDirty: true });
                                }
                                saveItem(idx);
                              }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              Escribe el item
                            </Typography>
                          </Box>
                        )}
                        <Box sx={{ mt: 1 }}>
                          <RHFTextField
                            size="small"
                            control={form.control}
                            name={`items.${idx}.notas`}
                            label="Notas"
                          />
                        </Box>
                        {/* List of saved items for this Área (horizontal) */}
                        {session?.items && (
                          <Box sx={{ mt: 1 }}>
                            {/* Header */}
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                  xs: 'minmax(100px,0.7fr) 36px minmax(0,1fr) 56px',
                                  sm: '120px 40px 1fr 72px'
                                },
                                columnGap: { xs: 1, sm: 4 }, // tighter on phones
                                alignItems: 'center',
                                px: 0,
                                py: 0.5,
                                borderBottom: '1px solid',
                                borderColor: 'divider'
                              }}
                            >
                              <Typography variant="caption" color="text.secondary" noWrap>Descripción</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }} noWrap>Ctd</Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>Notas</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }} noWrap>Acciones</Typography>
                            </Box>
                            {/* Rows */}
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                  xs: 'minmax(100px,0.7fr) 36px minmax(0,1fr) 56px',
                                  sm: '120px 40px 1fr 72px'
                                },
                                columnGap: { xs: 1, sm: 4 },
                                rowGap: 0.5,
                                mt: 0
                              }}
                            >
                              {session.items
                                .filter((it) => it.area === combineAreaLabel(row.area, row.areaNumber) && String(it.descripcion || '').trim())
                                .map((it) => (
                                  <React.Fragment key={it.id}>
                                    <Typography variant="body2" noWrap title={it.descripcion}>{it.descripcion}</Typography>
                                    <Typography variant="body2" sx={{ textAlign: 'center' }} noWrap>{it.cantidad}</Typography>
                                    <Typography variant="body2" color="text.secondary" noWrap title={it.notas || ''}>
                                      {String(it.notas || '').trim() || '—'}
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                      <IconButton size="small" aria-label="editar" onClick={() => {
                                        // Prefill composer for this area with this item's values and mark as editing
                                        form.setValue(`items.${idx}.descripcion`, it.descripcion || '', { shouldDirty: true });
                                        form.setValue(`items.${idx}.cantidad`, it.cantidad ?? 1, { shouldDirty: true });
                                        form.setValue(`items.${idx}.notas`, it.notas || '', { shouldDirty: true });
                                        setEditingByIndex((prev) => ({ ...prev, [idx]: it.id }));
                                        toast.info('Editando… ajusta y pulsa + para guardar', { autoClose: 1200 });
                                      }}>
                                        <PencilSquareIcon style={{ width: 18, height: 18 }} />
                                      </IconButton>
                                      <IconButton size="small" aria-label="eliminar" color="error" onClick={() => handleDeleteSavedItem(it.id)}>
                                        <TrashIcon style={{ width: 18, height: 18 }} />
                                      </IconButton>
                                    </Box>
                                  </React.Fragment>
                                ))}
                            </Box>
                          </Box>
                        )}
                      </>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            });
            })()}
          </form>
        </Box>
      )}

      {/* Photos Tab */}
      {tab === 1 && (
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
            <TextField
              select
              size="small"
              label="Área"
              value={photoArea}
              onChange={(e) => setPhotoArea(e.target.value)}
              sx={{ minWidth: 180 }}
            >
             {photoAreaOptions.map((opt) => {
              const cnt = photoCounts.get(opt) || 0;
              return (
                <MenuItem key={opt} value={opt}>
                  {opt}{cnt > 0 ? ` (${cnt})` : ''}
                </MenuItem>
              );
            })}
            </TextField>

            <Button
              component="label"
              variant="contained"
              startIcon={<PhotoCamera />}
              disabled={uploading}
              size="small"
            >
              {uploading ? 'Subiendo...' : 'Subir foto'}
              <input hidden accept="image/*" type="file" onChange={handlePhotoUpload} />
            </Button>
          </Stack>

          <PhotosGrid photos={filteredPhotos} onEditCaption={handleEditPhotoCaption} onDelete={handleDeletePhoto} />
        </Box>
      )}

      {/* Submit bottom bar */}
      <Box sx={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        p: 1, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider'
      }}>
        <Stack direction="row" spacing={1}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => {
              const hasDraft = items?.some(it =>
                (it.descripcion && !it._id) ||
                (String(it.cantidad ?? '').trim() && !it._id) ||
                (String(it.notas ?? '').trim() && !it._id)
              );
              if (hasDraft) {
                if (window.confirm('¿Salir sin guardar el item en edición?')) {
                  navigate('/m/inventory');
                }
              } else {
                navigate('/m/inventory');
              }
            }}
          >
            Volver
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={() => {
              toast.success('Inventario guardado', { autoClose: 1000 });
              navigate('/m/inventory');
            }}
          >
            Salvar
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}