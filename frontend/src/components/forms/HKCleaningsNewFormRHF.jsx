import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Controller, useForm } from 'react-hook-form';

import RHFForm from './rhf/RHFForm';
import api from '../../api';

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

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * NewHKCleaningsFormRHF
 *
 * Fields:
 * - date (mapped to checkout_date)
 * - unit (select by name, stores unit_id)
 * - cleaning_type
 * - status (default pending)
 * - price (mapped to o2_collected_fee)
 * - bill_to
 */
export default function NewHKCleaningsFormRHF({ onSaved, onCancel }) {
  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const defaultValues = useMemo(
    () => ({
      date: todayISO(),
      unit_id: '',
      cleaning_type: 'midstay',
      status: 'pending',
      o2_collected_fee: '',
      bill_to: 'CLIENT',
    }),
    []
  );

  // We keep a local RHF instance only to power the MUI Controllers below.
  // RHFForm in this codebase usually wraps FormProvider internally; if it does,
  // this still works because we pass `form` down.
  const form = useForm({ defaultValues });

  // Auto-set status to 'done' when the selected date is before today
  const selectedDate = form.watch('date');

  useEffect(() => {
    if (!selectedDate) return;
    const today = todayISO();

    if (selectedDate <= today) {
      form.setValue('status', 'done', { shouldDirty: true });
    } else {
      form.setValue('status', 'pending', { shouldDirty: true });
    }
  }, [selectedDate, form]);

  const selectedCleaningType = form.watch('cleaning_type');
  const selectedUnitId = form.watch('unit_id');

  const selectedUnitCity = useMemo(() => {
    if (!selectedUnitId) return null;
    const u = (Array.isArray(units) ? units : []).find(
      (row) => String(row.unit_id ?? row.id) === String(selectedUnitId)
    );
    return u?.city || u?.unit_city || null;
  }, [units, selectedUnitId]);

  // Auto-default bill_to based on cleaning_type rules
  useEffect(() => {
    if (!selectedCleaningType) return;

    if (selectedCleaningType === 'initial' || selectedCleaningType === 'refresh') {
      form.setValue('bill_to', 'CLIENT', { shouldDirty: true });
      return;
    }

    if (selectedCleaningType === 'redo') {
      // Redo is billed to Housekeepers; HK_Playa/HK_Tulum is determined server-side by city/cost_centre rules.
      form.setValue('bill_to', 'HOUSEKEEPERS', { shouldDirty: true });
      return;
    }

    if (selectedCleaningType === 'midstay') {
      // Default to Client, but user may edit.
      form.setValue('bill_to', 'CLIENT', { shouldDirty: true });
      return;
    }
  }, [selectedCleaningType, selectedUnitCity, form]);

  const unitOptions = useMemo(() => {
    return (Array.isArray(units) ? units : [])
      .map((u) => {
        const id = u.unit_id ?? u.unitId ?? u.id;
        const name = u.name ?? u.unit_name ?? u.unitName ?? id;
        return { value: String(id ?? ''), label: String(name ?? '') };
      })
      .filter((o) => o.value && o.label)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [units]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingUnits(true);
      try {
        // Try common endpoints; backend may return { data: [...] } or array
        const res = await api.get('/api/hk-cleanings/active-units');
        const arr = res?.data?.data ?? res?.data;
        if (mounted) setUnits(Array.isArray(arr) ? arr : []);
      } catch (e) {
        // If units endpoint differs, keep empty list; user can still type unit_id manually
        if (mounted) setUnits([]);
      } finally {
        if (mounted) setLoadingUnits(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const submit = async (values) => {
    setSubmitError(null);

    const unit = units.find(u => String(u.unit_id ?? u.id) === String(values.unit_id));
    const city = unit?.city || unit?.unit_city || null;

    // Determine report_status based on rules
    let reportStatus = 'pending';
    if (city && city.toLowerCase().includes('playa') && values.status === 'done') {
      reportStatus = 'reported';
    } else if (city && city.toLowerCase().includes('tulum')) {
      reportStatus = 'pending';
    }

    const payload = {
      id: null,
      unit_id: values.unit_id || null,
      city,
      booking_id: null,
      reservation_code: null,
      checkout_date: values.date || null,
      cleaning_type: values.cleaning_type || 'midstay',
      o2_collected_fee: values.o2_collected_fee === '' ? 0 : Number(values.o2_collected_fee),
      status: values.status || 'pending',
      assigned_to_id: null,
      assign_notes: null,
      created_at: null,
      updated_at: null,
      cleaning_cost: null,
      done_by_employee_id: null,
      done_at: null,
      source: 'Housekeepers',
      laundry_cost: null,
      bill_to: values.bill_to || 'CLIENT',
      report_status: reportStatus,
    };

    try {
      const res = await api.post('/api/hk-cleanings', payload);
      if (onSaved) onSaved(res?.data ?? res);
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'Failed to create cleaning';
      setSubmitError(msg);
    }
  };

  return (
    <RHFForm
      form={form}
      onSubmit={submit}
      submitLabel="Create"
    >
      <Stack spacing={2}>
        <Typography variant="h6">New Cleaning</Typography>

        <Controller
          name="date"
          control={form.control}
          rules={{ required: true }}
          render={({ field }) => (
            <TextField
              {...field}
              label="Date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          )}
        />

        <Controller
          name="unit_id"
          control={form.control}
          rules={{ required: true }}
          render={({ field, fieldState }) => {
            const selected = unitOptions.find((o) => o.value === String(field.value || '')) || null;

            return (
              <Autocomplete
                options={unitOptions}
                value={selected}
                onChange={(_, opt) => field.onChange(opt?.value || '')}
                loading={loadingUnits}
                disableClearable={false}
                autoHighlight
                isOptionEqualToValue={(a, b) => a?.value === b?.value}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Unit"
                    size="small"
                    fullWidth
                    error={!!fieldState.error}
                    helperText={
                      loadingUnits
                        ? 'Loading units…'
                        : fieldState.error
                          ? 'Unit is required'
                          : 'Start typing to search'
                    }
                  />
                )}
              />
            );
          }}
        />

        <Controller
          name="cleaning_type"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Cleaning type"
              size="small"
              select
              fullWidth
            >
              {[...CLEANING_TYPE_OPTIONS]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
            </TextField>
          )}
        />

        <Controller
          name="status"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Status"
              size="small"
              select
              fullWidth
            >
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="done">Done</MenuItem>
              <MenuItem value="reported">Reported</MenuItem>
              <MenuItem value="needs_review">Needs review</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
          )}
        />

        <Controller
          name="o2_collected_fee"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Price"
              size="small"
              type="number"
              fullWidth
              inputProps={{ step: '0.01', min: 0 }}
            />
          )}
        />

        <Controller
          name="bill_to"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Bill to"
              size="small"
              select
              fullWidth
            >
              {BILL_TO_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
          )}
        />

        {submitError ? (
          <Typography sx={{ color: 'error.main' }}>{submitError}</Typography>
        ) : null}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onCancel}>Cancel</Button>
            <Button variant="contained" onClick={form.handleSubmit(submit)}>Create</Button>
          </Stack>
        </Box>
      </Stack>
    </RHFForm>
  );
}