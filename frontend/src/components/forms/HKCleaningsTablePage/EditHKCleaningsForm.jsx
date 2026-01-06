import React, { useState } from 'react';
import FormLayoutInline from '../../layouts/FormLayoutInline';
import { TextField, Stack, Button, MenuItem } from '@mui/material';
import api from '../../../api';

/** EditHKCleaningsForm — edit an existing hk_cleanings entry */
export default function EditHKCleaningsForm({ cleaning, onSuccess, onCancel }) {
  const [form, setForm] = useState(() => {
    const c = cleaning || {};
    const co = c.checkout_date || c.checkoutDate || '';
    const coYmd = typeof co === 'string' ? co.slice(0, 10) : '';
    return {
      id: c.id ?? null,
      reservation_code: c.reservation_code ?? c.reservationCode ?? '',
      checkout_date: coYmd,
      status: (c.status ?? '').toString(),
      unit_id: c.unit_id ?? c.unitId ?? null,
      unit_name: c.unit_name ?? c.unitName ?? '',
      city: c.city ?? '',
      cleaning_type: c.cleaning_type ?? c.cleaningType ?? 'checkout',
      cleaning_cost: c.cleaning_cost ?? c.cleaningCost ?? '',
      o2_collected_fee: c.o2_collected_fee ?? c.o2CollectedFee ?? '',
      notes: c.notes ?? '',
    };
  });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleDateChange = (e) => {
    const val = e.target.value; // yyyy-mm-dd
    setForm((prev) => ({ ...prev, checkout_date: val }));
  };

  const canSave = Boolean(form.id && form.checkout_date);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);

    try {
      const id = form.id;
      if (!id) throw new Error('Missing cleaning ID');
      const payload = {
        checkoutDate: form.checkout_date,
        status: form.status,
        cleaningCost: form.cleaning_cost !== '' ? Number(form.cleaning_cost) : null,
        o2CollectedFee: form.o2_collected_fee !== '' ? Number(form.o2_collected_fee) : null,
        notes: form.notes || null,
      };

      const res = await api.put(`/api/hk-cleanings/${id}`, payload, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      const json = res?.data ?? res;
      if (json?.ok === false) {
        throw new Error(json?.detail || json?.message || 'Failed to update cleaning');
      }
      onSuccess && onSuccess(json);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormLayoutInline title="Edit Cleaning" onSubmit={handleSubmit}>
      <Stack direction="column" spacing={3} sx={{ mb: 1 }}>
        <TextField
          label="Date"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={form.checkout_date}
          onChange={handleDateChange}
          placeholder="YYYY-MM-DD"
          required
        />

        <TextField
          label="Unit"
          size="small"
          value={form.unit_name}
          disabled
        />

        <TextField
          label="Status"
          select
          size="small"
          value={form.status}
          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
        >
          {form.status === 'pending' && (
            <MenuItem value="pending" disabled>
              Pending
            </MenuItem>
          )}
          <MenuItem value="done">Done</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>

        <TextField
          label="City"
          size="small"
          value={form.city}
          onChange={handleChange('city')}
          disabled
        />

        <TextField
          label="Cleaning Cost"
          size="small"
          type="number"
          inputProps={{ step: '0.01' }}
          value={form.cleaning_cost}
          onChange={handleChange('cleaning_cost')}
        />

        <TextField
          label="O2 Collected"
          size="small"
          type="number"
          inputProps={{ step: '0.01' }}
          value={form.o2_collected_fee}
          onChange={handleChange('o2_collected_fee')}
        />

        <TextField
          label="Notes"
          size="small"
          value={form.notes}
          onChange={handleChange('notes')}
          sx={{ minWidth: 260 }}
        />
      </Stack>

      {err && (
        <div style={{ color: 'crimson', fontSize: 13, marginBottom: 8 }}>{err}</div>
      )}

      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          color="success"
          disabled={!canSave || saving}
          onClick={handleSubmit}
          sx={{ fontWeight: 700 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="outlined"
          color="error"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </Stack>
    </FormLayoutInline>
  );
}