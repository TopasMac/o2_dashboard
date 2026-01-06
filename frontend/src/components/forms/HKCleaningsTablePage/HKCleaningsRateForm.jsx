import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AppDrawer from '../../common/AppDrawer';
import api from '../../../api';
import FormLayoutInline from '../../layouts/FormLayoutInline';
import '../../layouts/FormLayoutInline.css';

/**
 * HKCleaningsRateForm
 *
 * Props:
 * - open: boolean
 * - onClose: function
 * - unit: { id, unitName, city, cleaningFee, unitRateAmount }
 * - onSaved?: function(updatedRate)
 */
export default function HKCleaningsRateForm({ open, onClose, unit, onSaved }) {
  const unitId = unit?.id ?? unit?.unit_id ?? unit?.unitId;
  const title = useMemo(() => (unit?.unitName ? `Edit Rate — ${unit.unitName}` : 'Edit Rate'), [unit?.unitName]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [rateId, setRateId] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  // Load current rate when opening
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open || !unitId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/api/hk-cleanings', {
          params: {
            start: '',
            end: '',
            city: '',
            status: 'any',
            search: '',
            page: 1,
            pageSize: 25,
            sort: 'checkout_date',
            dir: 'asc',
          },
        });
        const list = Array.isArray(res?.data?.data) ? res.data.data : [];
        const cityNorm = String((unit?.city ?? '')).trim().toLowerCase();
        const match = list.find((r) => {
          const rid = r.unit_id ?? r.unitId ?? r.id;
          const rcity = String(r.city ?? r.unit_city ?? '').trim().toLowerCase();
          return Number(rid) === Number(unitId) && (!cityNorm || rcity === cityNorm);
        });
        if (!cancelled && match) {
          setRateId(null);
          const amt = match.unit_rate_amount ?? null;
          setAmount(amt === null || amt === undefined ? '' : String(amt));
          const d = match.checkout_date ?? null;
          setDate(d ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10));
          setNotes(match.notes ?? '');
        } else if (!cancelled) {
          const initial = unit?.unitRateAmount ?? '';
          setAmount(initial === null || initial === undefined ? '' : String(initial));
          setDate(new Date().toISOString().slice(0, 10));
          setNotes('');
          setRateId(null);
        }
      } catch (e) {
        if (!cancelled) setError('No se pudo cargar la tarifa actual.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unitId]);

  const handleClose = () => {
    if (saving) return; // prevent closing while saving
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!unitId) return;

    // Basic validation
    const numeric = amount === '' ? null : Number(amount);
    if (amount !== '' && (Number.isNaN(numeric) || numeric < 0)) {
      setError('Ingrese un número válido (>= 0).');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Upsert style POST
      const payload = {
        unit_id: unitId,
        city: String(unit?.city ?? '').trim(),
        amount: numeric,
        date,
        effective_from: date,
        effective_to: null,
        notes,
      };
      const res = await api.post('/api/hk-cleaning-rate', payload);
      const updated = res?.data?.rate ?? null;
      onSaved?.(updated ?? { unit_id: unitId, amount: numeric, date, effective_from: date, effective_to: null, notes });
      handleClose();
    } catch (e) {
      const serverMsg = e?.response?.data?.detail || e?.response?.data?.error || e?.message;
      setError(serverMsg ? `No se pudo guardar la tarifa: ${serverMsg}` : 'No se pudo guardar la tarifa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDrawer open={open} onClose={handleClose} title={title} anchor="right">
      <Box sx={{ width: 'min(420px, 100vw)', minWidth: 0 }}>
        <FormLayoutInline onSubmit={handleSubmit}>
          {loading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2">Cargando…</Typography>
            </Stack>
          ) : (
            <>
              <Stack spacing={0.5}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Unidad
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {unit?.unitName ?? '—'}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={3}>
                <Stack spacing={0.5}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    Ciudad
                  </Typography>
                  <Typography variant="body2">{unit?.city ?? '—'}</Typography>
                </Stack>
                <Stack spacing={0.5}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    Cleaning fee
                  </Typography>
                  <Typography variant="body2">
                    {unit?.cleaningFee ?? '—'}
                  </Typography>
                </Stack>
              </Stack>

              <TextField
                label="Fecha"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                fullWidth
              />

              <TextField
                label="Monto"
                placeholder="e.g. 800"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                size="small"
                inputProps={{ inputMode: 'decimal' }}
                fullWidth
              />

              <TextField
                label="Notas"
                placeholder="Opcional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                size="small"
                multiline
                minRows={2}
                fullWidth
              />

              {error && (
                <Typography variant="caption" color="error" sx={{ mt: -1 }}>
                  {error}
                </Typography>
              )}

              {saving && (
                <Typography variant="caption" color="text.secondary">Enviando cambios…</Typography>
              )}

              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
                <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </Stack>
            </>
          )}
        </FormLayoutInline>
      </Box>
    </AppDrawer>
  );
}