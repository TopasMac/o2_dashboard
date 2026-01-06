import React from 'react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Box,
  Stack,
  Typography,
  Divider,
  Chip,
  CircularProgress,
  Button,
  IconButton,
  Paper,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { ArrowLeftIcon, CheckCircleIcon, PhotoIcon, DocumentTextIcon, TrashIcon } from '@heroicons/react/24/outline';
import api from '../../api';
import { toast } from 'react-toastify';

const fmt = (d) => (d ? (dayjs(d).isValid() ? dayjs(d).format('DD-MM-YYYY') : '—') : '—');

// Try multiple known fields for photo URL and fall back to an API download route
const getPhotoSrc = (p) => (
  p?.url || p?.presignedUrl || p?.signedUrl || p?.originalUrl || p?.fileUrl || p?.path || (p?.id ? `/api/unit-inventory/photo/${p.id}/download` : '')
);

const extractNotes = (s) => (
  s?.notes ?? s?.sessionNotes ?? s?.meta?.notes ?? s?.session?.notes ?? ''
);

function SectionHeader({ icon, title, count }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1 }}>
      {icon}
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      {typeof count === 'number' && <Chip size="small" label={count} />}
    </Stack>
  );
}

function GroupedItems({ items }) {
  // Group by area + number (e.g., "Baño 2")
  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items ?? []) {
      const area = String(it.area || '').trim();
      const no = String(it.areaNumber ?? '').trim();
      const key = [area, no].filter(Boolean).join(' ');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    // sort keys by area name then number
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [items]);

  if (!items?.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>No hay items.</Typography>;
  }

  return (
    <Stack sx={{ px: 2, pb: 2 }} spacing={1.5}>
      {grouped.map(([group, arr]) => (
        <Paper key={group} variant="outlined" sx={{ borderRadius: 1 }}>
          <Box sx={{ px: 1.5, py: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{group || 'Área'}</Typography>
          </Box>
          <Divider />
          {/* Header row */}
          <Box
            sx={{
              display: 'grid',
              px: 1.5,
              py: 0.75,
              gridTemplateColumns: {
                xs: 'minmax(110px,0.7fr) 36px minmax(0,1fr)',
                sm: '120px 40px 1fr',
              },
              columnGap: { xs: 1, sm: 3 },
              alignItems: 'center',
              color: 'text.secondary',
              fontSize: '0.8rem',
            }}
          >
            <Typography noWrap>Descripción</Typography>
            <Typography align="center" noWrap>Ctd</Typography>
            <Typography noWrap>Notas</Typography>
          </Box>
          <Divider />
          <Stack sx={{ px: 1, py: 0.5 }}>
            {arr.map((row) => (
              <Box
                key={row.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'minmax(110px,0.7fr) 36px minmax(0,1fr)',
                    sm: '120px 40px 1fr',
                  },
                  columnGap: { xs: 1, sm: 3 },
                  alignItems: 'center',
                  py: 0.5,
                }}
              >
                <Typography variant="body2" noWrap title={row.descripcion}>{row.descripcion}</Typography>
                <Typography variant="body2" align="center">{row.cantidad ?? ''}</Typography>
                <Typography variant="body2" noWrap title={row.notas || ''}>{row.notas || ''}</Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

function PhotosGrid({ photos, onPhotoClick }) {
  if (!photos?.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>No hay fotos.</Typography>;
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(3, 1fr)',
          sm: 'repeat(6, 1fr)',
        },
        gap: 1,
        px: 2,
        pb: 2,
      }}
    >
      {photos.map((p) => {
        const initialSrc = getPhotoSrc(p);
        const fallback = p?.id ? `/api/unit-inventory/photo/${p.id}/download` : '';
        return (
          <Box
            key={p.id}
            sx={{ textAlign: 'center', cursor: 'pointer' }}
            onClick={() => onPhotoClick?.(p)}
            role="button"
            aria-label={`${p.area ? p.area + ' ' : ''}${p.caption || 'Foto'}`}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPhotoClick?.(p); } }}
          >
            <Box
              component="img"
              src={initialSrc}
              alt={p.caption || 'Foto'}
              loading="lazy"
              onError={(e) => {
                if (fallback && !e.currentTarget.dataset.fallbackApplied) {
                  e.currentTarget.dataset.fallbackApplied = 'true';
                  e.currentTarget.src = fallback;
                }
              }}
              sx={{
                width: '100%',
                aspectRatio: '1 / 1',
                objectFit: 'cover',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'action.hover',
              }}
            />
            {p.caption && (
              <Typography variant="caption" sx={{ display: 'block' }} noWrap title={p.caption}>
                {p.caption}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function PhotosByArea({ photos, onPhotoClick }) {
  // Build groups by area + number (e.g., "Baño 2") without hooks
  const map = new Map();
  for (const p of photos || []) {
    const area = String(p.area || '').trim();
    const no = String(p.areaNumber ?? '').trim();
    const key = [area, no].filter(Boolean).join(' ');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const groups = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));

  if (!groups.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>No hay fotos.</Typography>;
  }

  return (
    <Stack sx={{ px: 2, pb: 2 }} spacing={1.5}>
      {groups.map(([group, arr]) => (
        <Paper key={group || 'area-unknown'} variant="outlined" sx={{ borderRadius: 1 }}>
          <Box sx={{ px: 1.5, py: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {group || 'Área'}
            </Typography>
          </Box>
          <Divider />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(3, 1fr)',
                sm: 'repeat(6, 1fr)',
              },
              gap: 1,
              px: 1.5,
              py: 1,
            }}
          >
            {arr.map((p) => {
              const initialSrc = getPhotoSrc(p);
              const fallback = p?.id ? `/api/unit-inventory/photo/${p.id}/download` : '';
              return (
                <Box
                  key={p.id}
                  sx={{ textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => onPhotoClick?.(p)}
                  role="button"
                  aria-label={`${p.area ? p.area + ' ' : ''}${p.caption || 'Foto'}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPhotoClick?.(p); } }}
                >
                  <Box
                    component="img"
                    src={initialSrc}
                    alt={p.caption || 'Foto'}
                    loading="lazy"
                    onError={(e) => {
                      if (fallback && !e.currentTarget.dataset.fallbackApplied) {
                        e.currentTarget.dataset.fallbackApplied = 'true';
                        e.currentTarget.src = fallback;
                      }
                    }}
                    sx={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: 'action.hover',
                    }}
                  />
                  {p.caption && (
                    <Typography variant="caption" sx={{ display: 'block' }} noWrap title={p.caption}>
                      {p.caption}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Paper>
      ))}
    </Stack>
  );
}

export default function MobileInventoryReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editPhoto, setEditPhoto] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [sessionNotes, setSessionNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const startEdit = (p) => {
    setEditPhoto(p);
    setEditCaption(p?.caption || '');
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditPhoto(null);
    setEditCaption('');
  };

  const persistCaption = async () => {
    if (!editPhoto?.id) return closeEdit();
    setSavingCaption(true);
    const photoId = editPhoto.id;
    const payload = { caption: editCaption };
    let ok = false;
    try {
      await api.patch(`/api/unit-inventory/photo/${photoId}`, payload);
      ok = true;
    } catch (e1) {
      try {
        await api.put(`/api/unit-inventory/photo/${photoId}`, payload);
        ok = true;
      } catch (e2) {
        try {
          await api.post(`/api/unit-inventory/photo/${photoId}/caption`, payload);
          ok = true;
        } catch (e3) {
          ok = false;
        }
      }
    }
    if (ok) {
      setPhotos((prev) => prev.map((ph) => (ph.id === photoId ? { ...ph, caption: editCaption } : ph)));
      toast.success('Leyenda actualizada.');
      closeEdit();
    } else {
      toast.error('No fue posible actualizar la leyenda.');
    }
    setSavingCaption(false);
  };

  const deletePhoto = async () => {
    if (!editPhoto?.id) return;
    const photoId = editPhoto.id;
    const confirmed = window.confirm('¿Eliminar esta foto? Esta acción no se puede deshacer.');
    if (!confirmed) return;
    setDeleting(true);
    let ok = false;
    try {
      await api.delete(`/api/unit-inventory/photo/${photoId}`);
      ok = true;
    } catch (e1) {
      try {
        await api.post(`/api/unit-inventory/photo/${photoId}/delete`);
        ok = true;
      } catch (e2) {
        ok = false;
      }
    }
    if (ok) {
      setPhotos((prev) => prev.filter((ph) => ph.id !== photoId));
      toast.success('Foto eliminada.');
      closeEdit();
    } else {
      toast.error('No fue posible eliminar la foto.');
    }
    setDeleting(false);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Try a consolidated endpoint first
      const sRes = await api.get(`/api/unit-inventory/session/${sessionId}`);
      const s = sRes?.data || {};
      setSession(s);
      setSessionNotes(extractNotes(s));

      // If the session payload already contains items/photos, prefer those.
      const itemsIn = s.items || s.sessionItems || [];
      const photosIn = s.photos || s.sessionPhotos || [];

      let ii = itemsIn;
      let pp = photosIn;

      if (!ii?.length) {
        const itRes = await api.get(`/api/unit-inventory/session/${sessionId}/items`);
        ii = itRes?.data?.items || itRes?.data || [];
      }
      if (!pp?.length) {
        const phRes = await api.get(`/api/unit-inventory/session/${sessionId}/photos`);
        pp = phRes?.data?.photos || phRes?.data || [];
      }

      // Sort items by area, then descripcion
      ii.sort((a, b) => {
        const ak = `${a.area || ''} ${a.areaNumber || ''} ${a.descripcion || ''}`.toLowerCase();
        const bk = `${b.area || ''} ${b.areaNumber || ''} ${b.descripcion || ''}`.toLowerCase();
        return ak.localeCompare(bk, 'es');
      });

      setItems(ii);
      setPhotos(pp);
    } catch (e) {
      console.error(e);
      toast.error('No fue posible cargar la sesión.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const persistSessionNotes = async () => {
    if (!sessionId) return;
    setSavingNotes(true);
    const payload = { notes: sessionNotes };
    let ok = false;
    try {
      await api.patch(`/api/unit-inventory/session/${sessionId}`, payload);
      ok = true;
    } catch (e1) {
      try {
        await api.post(`/api/unit-inventory/session/${sessionId}/notes`, payload);
        ok = true;
      } catch (e2) {
        ok = false;
      }
    }
    if (ok) {
      toast.success('Comentarios guardados.');
      setSession((prev) => ({ ...(prev || {}), notes: sessionNotes }));
    } else {
      toast.error('No fue posible guardar los comentarios.');
    }
    setSavingNotes(false);
  };

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!sessionNotes && session) {
      const extracted = extractNotes(session);
      if (extracted) setSessionNotes(extracted);
    }
  }, [session, sessionNotes]);

  const onSubmit = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      // Preferred: dedicated submit endpoint
      try {
        await api.post(`/api/unit-inventory/session/${sessionId}/submit`);
      } catch {
        // Fallback: patch status
        await api.patch(`/api/unit-inventory/session/${sessionId}`, { status: 'submitted' });
      }
      toast.success('Inventario enviado para revisión.');
      navigate('/m/inventory'); // back to list
    } catch (e) {
      console.error(e);
      toast.error('No fue posible enviar el inventario.');
    } finally {
      setSubmitting(false);
    }
  };

  const status = (session?.status || '').toString();
  const canSubmit = status === 'draft';

  return (
    <Stack sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 1 }}>
        <IconButton onClick={() => navigate(-1)} size="small" aria-label="back">
          <ArrowLeftIcon width={22} height={22} />
        </IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }} noWrap>
          Revisar y Enviar
        </Typography>
        {status && <Chip size="small" label={status} color={status === 'draft' ? 'default' : 'success'} />}
      </Stack>

      {/* Session meta */}
      <Box sx={{ px: 2, pb: 1 }}>
        <Typography variant="body2" color="text.secondary" noWrap>
          {session?.unitName || session?.unit?.name || ''} · Iniciado {fmt(session?.startedAt || session?.started_at || session?.createdAt || session?.created_at)} · Envío {fmt(session?.submittedAt || session?.submitted_at)}
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 11, minHeight: 0 }}>
      {loading ? (
        <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
          <CircularProgress size={24} />
        </Stack>
      ) : (
        <>
          {/* ITEMS */}
          <SectionHeader
            icon={<DocumentTextIcon width={18} height={18} />}
            title="Items"
            count={items?.length ?? 0}
          />
          <GroupedItems items={items} />

          <Divider />

          {/* PHOTOS */}
          <SectionHeader
            icon={<PhotoIcon width={18} height={18} />}
            title="Fotos"
            count={photos?.length ?? 0}
          />
          <PhotosByArea photos={photos} onPhotoClick={startEdit} />
        </>
      )}
      </Box>

      <Divider />
      <Box sx={{ px: 2, py: 2 }}>
        <TextField
          label="Comentarios"
          placeholder="Notas generales del inventario"
          fullWidth
          multiline
          minRows={3}
          value={sessionNotes}
          onChange={(e) => setSessionNotes(e.target.value)}
          onBlur={persistSessionNotes}
          disabled={savingNotes}
          helperText={savingNotes ? 'Guardando…' : 'Se guarda automáticamente al salir del campo'}
        />
      </Box>

      {/* Sticky footer */}
      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          p: 1,
          zIndex: (t) => t.zIndex.appBar,
          bgcolor: 'background.paper',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Revisa los items y fotos antes de enviar.
            </Typography>
          </Box>
          <Tooltip title={canSubmit ? 'Enviar para revisión' : 'Solo se puede enviar desde estado "draft"'}>
            <span>
              <Button
                variant="contained"
                disableElevation
                onClick={onSubmit}
                disabled={!canSubmit || submitting}
                startIcon={<CheckCircleIcon width={18} height={18} />}
                sx={{ bgcolor: '#1E6F68', '&:hover': { bgcolor: '#185a55' } }}
              >
                Enviar
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Paper>

      <Dialog open={editOpen} onClose={closeEdit} fullWidth maxWidth="sm">
        <DialogTitle>Editar foto</DialogTitle>
        <DialogContent dividers>
          {editPhoto && (
            <Box sx={{ mb: 2, position: 'relative' }}>
              <Box
                component="img"
                src={getPhotoSrc(editPhoto)}
                alt={editPhoto.caption || 'Foto'}
                sx={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
              />
              <Tooltip title="Eliminar foto">
                <span>
                  <IconButton
                    size="small"
                    onClick={deletePhoto}
                    disabled={savingCaption || deleting}
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      bgcolor: 'rgba(255,255,255,0.85)',
                      border: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
                    }}
                    aria-label="Eliminar foto"
                  >
                    <TrashIcon width={18} height={18} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          )}
          <TextField
            autoFocus
            fullWidth
            label="Leyenda"
            value={editCaption}
            onChange={(e) => setEditCaption(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit} disabled={savingCaption}>Cancelar</Button>
          <Button onClick={persistCaption} variant="contained" disabled={savingCaption}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
