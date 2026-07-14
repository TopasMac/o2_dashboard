import React, { useMemo, useState } from 'react';
import { Stack, Button } from '@mui/material';
import api from '../../api';

import { useForm } from 'react-hook-form';
import RHFForm, { RHFDatePicker, RHFTextField, RHFSelect } from './rhf/RHFForm';

const CLEANING_TYPE_OPTIONS = [
  { value: 'midstay', label: 'Mid-stay' },
  { value: 'refresh', label: 'Refresh' },
  { value: 'initial', label: 'Initial' },
  { value: 'redo', label: 'Redo' },
];

const BILL_TO_OPTIONS = [
  { value: 'OWNERS2', label: 'Owners2' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'GUEST', label: 'Guest' },
  { value: 'HOUSEKEEPERS', label: 'Housekeepers' },
];

const normalizeCleaningType = (value) => {
  const raw = (value ?? '').toString().trim();
  const key = raw.toLowerCase();
  const map = {
    'mid-stay': 'midstay',
    'mid stay': 'midstay',
    midstay: 'midstay',
    refresh: 'refresh',
    initial: 'initial',
    redo: 'redo',
    owner: 'owner',
    checkout: 'checkout',
  };
  return map[key] ?? raw;
};

const cleaningTypeLabel = (value) => {
  if (value === 'midstay') return 'Mid-stay';
  const raw = (value ?? '').toString();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
};

/**
 * Edit an existing hk_cleanings entry.
 */
export default function EditHKCleaningsForm({ cleaning, onSuccess, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState(null);

  const defaultValues = useMemo(() => {
    const c = cleaning || {};
    const checkout = c.checkout_date || c.checkoutDate || '';
    const checkoutYmd = typeof checkout === 'string' ? checkout.slice(0, 10) : '';

    return {
      id: c.id ?? null,
      reservation_code: c.reservation_code ?? c.reservationCode ?? '',
      checkout_date: checkoutYmd,
      status: (c.status ?? '').toString() || 'pending',
      unit_id: c.unit_id ?? c.unitId ?? null,
      unit_name: c.unit_name ?? c.unitName ?? '',
      city: c.city ?? '',
      cleaning_type: normalizeCleaningType(c.cleaning_type ?? c.cleaningType ?? 'checkout'),
      cleaning_cost: c.cleaning_cost ?? c.cleaningCost ?? '',
      o2_collected_fee: c.o2_collected_fee ?? c.o2CollectedFee ?? '',
      bill_to: (c.bill_to ?? c.billTo ?? 'OWNERS2').toString().toUpperCase(),
      notes: c.notes ?? c.assign_notes ?? c.assignNotes ?? '',
    };
  }, [cleaning]);

  const canSave = Boolean(defaultValues.id && defaultValues.checkout_date);
  const methods = useForm({ defaultValues, mode: 'onSubmit' });

  React.useEffect(() => {
    methods.reset(defaultValues);
  }, [defaultValues, methods]);

  const cleaningTypeOptions = useMemo(() => {
    const current = defaultValues.cleaning_type;
    if (!current || CLEANING_TYPE_OPTIONS.some((option) => option.value === current)) {
      return CLEANING_TYPE_OPTIONS;
    }
    return [{ value: current, label: cleaningTypeLabel(current) }, ...CLEANING_TYPE_OPTIONS];
  }, [defaultValues.cleaning_type]);

  const onSubmit = async (values) => {
    if (!canSave || saving || deleting) return;
    setSaving(true);
    setErr(null);

    try {
      const id = values.id;
      if (!id) throw new Error('Missing cleaning ID');

      const payload = {
        checkoutDate: values.checkout_date,
        cleaningType: values.cleaning_type,
        status: values.status,
        cleaningCost: values.cleaning_cost !== '' && values.cleaning_cost !== null
          ? Number(values.cleaning_cost)
          : null,
        o2CollectedFee: values.o2_collected_fee !== '' && values.o2_collected_fee !== null
          ? Number(values.o2_collected_fee)
          : null,
        billTo: values.bill_to || null,
        notes: values.notes ? String(values.notes) : null,
      };

      const res = await api.put(`/api/hk-cleanings/${id}`, payload, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const json = res?.data ?? res;
      if (json?.ok === false) {
        throw new Error(json?.detail || json?.message || json?.error || 'Failed to update cleaning');
      }

      onSuccess && onSuccess(json);
    } catch (e) {
      setErr(
        e?.response?.data?.detail
        || e?.response?.data?.message
        || e?.response?.data?.error
        || e?.message
        || String(e)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const id = defaultValues.id;
    if (!id || saving || deleting) return;
    if (!window.confirm('Delete this cleaning permanently?')) return;

    setDeleting(true);
    setErr(null);
    try {
      const res = await api.delete(`/api/hk-cleanings/${id}`, {
        headers: { Accept: 'application/json' },
      });
      const json = res?.data ?? res;
      if (json?.ok === false) {
        throw new Error(json?.detail || json?.message || json?.error || 'Failed to delete cleaning');
      }
      onSuccess && onSuccess({ ...json, deleted: true });
    } catch (e) {
      setErr(
        e?.response?.data?.detail
        || e?.response?.data?.message
        || e?.response?.data?.error
        || e?.message
        || String(e)
      );
    } finally {
      setDeleting(false);
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
        <RHFDatePicker
          name="checkout_date"
          control={methods.control}
          rules={{ required: 'Date is required' }}
          label="Date"
          format="DD-MM-YYYY"
          size="small"
        />

        <RHFTextField
          name="unit_name"
          label="Unit"
          size="small"
          disabled
          control={methods.control}
        />

        <RHFTextField
          name="city"
          label="City"
          size="small"
          disabled
          control={methods.control}
        />

        <RHFSelect
          name="cleaning_type"
          control={methods.control}
          label="Cleaning Type"
          size="small"
          options={cleaningTypeOptions}
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
          name="cleaning_cost"
          label="Cleaning Cost"
          size="small"
          type="number"
          inputProps={{ step: '0.01', min: 0 }}
          control={methods.control}
        />

        <RHFTextField
          name="o2_collected_fee"
          label="O2 Collected"
          size="small"
          type="number"
          inputProps={{ step: '0.01', min: 0 }}
          control={methods.control}
        />

        <RHFSelect
          name="bill_to"
          control={methods.control}
          label="Bill to"
          size="small"
          options={BILL_TO_OPTIONS}
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
          disabled={!canSave || saving || deleting}
          sx={{ fontWeight: 700 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outlined"
          color="error"
          onClick={handleDelete}
          disabled={!defaultValues.id || saving || deleting}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
        <Button
          type="button"
          variant="outlined"
          onClick={onCancel}
          disabled={saving || deleting}
        >
          Cancel
        </Button>
      </Stack>
    </RHFForm>
  );
}
