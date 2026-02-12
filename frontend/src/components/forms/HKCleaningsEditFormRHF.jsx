import React, { useMemo, useState } from 'react';
import { Stack, Button } from '@mui/material';
import api from '../../api';

// RHF field components (they require a react-hook-form context)
import { useForm } from 'react-hook-form';
import RHFForm, { RHFTextField, RHFSelect } from './rhf/RHFForm';

/**
 * EditHKCleaningsForm — edit an existing hk_cleanings entry
 *
 * Notes:
 * - Uses RHFForm + RHF field components for consistency.
 * - Keeps payload compatible with existing API: checkoutDate, status, cleaningCost, o2CollectedFee, notes.
 */
export default function EditHKCleaningsForm({ cleaning, onSuccess, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const defaultValues = useMemo(() => {
    const c = cleaning || {};
    const co = c.checkout_date || c.checkoutDate || '';
    const coYmd = typeof co === 'string' ? co.slice(0, 10) : '';

    return {
      id: c.id ?? null,
      reservation_code: c.reservation_code ?? c.reservationCode ?? '',
      checkout_date: coYmd,
      status: (c.status ?? '').toString() || 'pending',
      unit_id: c.unit_id ?? c.unitId ?? null,
      unit_name: c.unit_name ?? c.unitName ?? '',
      city: c.city ?? '',
      cleaning_type: c.cleaning_type ?? c.cleaningType ?? 'checkout',
      cleaning_cost: c.cleaning_cost ?? c.cleaningCost ?? '',
      o2_collected_fee: c.o2_collected_fee ?? c.o2CollectedFee ?? '',
      notes: c.notes ?? '',
    };
  }, [cleaning]);

  const canSave = Boolean(defaultValues.id && defaultValues.checkout_date);

  const methods = useForm({
    defaultValues,
    mode: 'onSubmit',
  });

  React.useEffect(() => {
    methods.reset(defaultValues);
  }, [defaultValues, methods]);

  const onSubmit = async (values) => {
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);

    try {
      const id = values.id;
      if (!id) throw new Error('Missing cleaning ID');

      const payload = {
        checkoutDate: values.checkout_date,
        status: values.status,
        cleaningCost: values.cleaning_cost !== '' && values.cleaning_cost !== null ? Number(values.cleaning_cost) : null,
        o2CollectedFee: values.o2_collected_fee !== '' && values.o2_collected_fee !== null ? Number(values.o2_collected_fee) : null,
        notes: values.notes ? String(values.notes) : null,
      };

      const res = await api.put(`/api/hk-cleanings/${id}`, payload, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });

      const json = res?.data ?? res;
      if (json?.ok === false) {
        throw new Error(json?.detail || json?.message || 'Failed to update cleaning');
      }

      onSuccess && onSuccess(json);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <RHFForm
      formId="hk-cleanings-edit-form"
      methods={methods}
      onSubmit={onSubmit}
      useGrid={false}
    >
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Edit Cleaning</div>
      <Stack direction="column" spacing={3} sx={{ mb: 1 }}>
        <RHFTextField
          name="checkout_date"
          label="Date"
          type="date"
          size="small"
          required
          InputLabelProps={{ shrink: true }}
          placeholder="YYYY-MM-DD"
          control={methods.control}
        />

        <RHFTextField
          name="unit_name"
          label="Unit"
          size="small"
          disabled
          control={methods.control}
        />

        <RHFSelect
          name="status"
          control={methods.control}
          label="Status"
          size="small"
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'done', label: 'Done' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />

        <RHFTextField
          name="city"
          label="City"
          size="small"
          disabled
          control={methods.control}
        />

        <RHFTextField
          name="cleaning_cost"
          label="Cleaning Cost"
          size="small"
          type="number"
          inputProps={{ step: '0.01' }}
          control={methods.control}
        />

        <RHFTextField
          name="o2_collected_fee"
          label="O2 Collected"
          size="small"
          type="number"
          inputProps={{ step: '0.01' }}
          control={methods.control}
        />

        <RHFTextField
          name="notes"
          label="Notes"
          size="small"
          sx={{ minWidth: 260 }}
          control={methods.control}
        />
      </Stack>

      {err && (
        <div style={{ color: 'crimson', fontSize: 13, marginBottom: 8 }}>{err}</div>
      )}

      <Stack direction="row" spacing={1}>
        <Button
          type="submit"
          variant="outlined"
          color="success"
          disabled={!canSave || saving}
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
    </RHFForm>
  );
}