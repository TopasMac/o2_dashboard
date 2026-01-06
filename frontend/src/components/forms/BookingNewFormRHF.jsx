import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Box, Stack, Button, TextField, Autocomplete, Typography, InputAdornment } from '@mui/material';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import RHFDatePicker from './rhf/RHFDatePicker';
import api from '../../api';
import useUnitCalendarAvailability from '../../hooks/useUnitCalendarAvailability';
import { toast } from 'react-toastify';

const STATUS_OPTIONS = [
  { value: 'Upcoming', label: 'Upcoming' },
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Past', label: 'Past' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const PAYMENT_METHODS = [
  { value: 'platform', label: 'Platform' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'no_pay', label: 'No Pay' },
];

const SOURCE_OPTIONS = [
  { value: 'Private', label: 'Private' },
  { value: 'Airbnb', label: 'Airbnb' },
];

const GUEST_TYPE_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'owner', label: 'Owner' },
  { value: 'previous', label: 'Previous' },
];

const SchemaCore = z.object({
  source: z.enum(['Private', 'Airbnb'], { required_error: 'Select a source' }),
  unitId: z.coerce.number().int({ message: 'Select a unit' }).positive('Select a unit'),
  unitName: z.string().optional(),
  city: z.string().optional(),
  status: z.enum(['Upcoming', 'Ongoing', 'Past', 'Cancelled']).default('Upcoming'),
  guestType: z.enum(['new', 'owner', 'previous']).default('new'),
  guestName: z.string().min(1, 'Guest name is required'),
  guests: z.coerce.number().int().min(0, 'Guests must be ≥ 0').optional(),
  checkIn: z.string().min(1, 'Check-in is required'), // YYYY-MM-DD
  checkOut: z.string().min(1, 'Check-out is required'),
  payout: z.string().optional(), // normalized numeric string via RHFTextField
  paymentMethod: z.enum(['platform', 'cash', 'card', 'no_pay']).optional(),
  cleaningFee: z.string().optional(), // normalized numeric string
  commissionPercent: z.string().optional(), // normalized numeric string
  notes: z.string().optional(),
  checkInNotes: z.string().optional(),
  checkOutNotes: z.string().optional(),
  isPaid: z.coerce.boolean().optional(),
});

const Schema = SchemaCore.superRefine((data, ctx) => {
  const source = (data.source || '').toLowerCase();
  const paymentMethod = (data.paymentMethod || '').toLowerCase();
  const isPaid = !!data.isPaid;

  if (source === 'private' && paymentMethod === 'cash' && isPaid) {
    if (!data.notes || !data.notes.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Please add payment description',
      });
    }
  }
});

function normalizeNumberString(s) {
  if (s == null || s === '') return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function BookingNewFormRHF({
  initialUnit = null, // { id, label, city, cleaningFee? }
  initialCheckIn = '',
  initialCheckOut = '',
  onSaved,
  onCancel,
  onSubmit: onSubmitProp, // optional external submit handler
  formId,
  hideActions = true,    // hide internal Save/Cancel by default for AppDrawer usage
}) {
  const [unitOptions, setUnitOptions] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  // calendar availability is handled by useUnitCalendarAvailability

  // Load units (minimal fields)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingUnits(true);
      try {
        const res = await api.get('/api/unit-list/active');
        const items = Array.isArray(res.data) ? res.data : (res.data?.member || res.data?.['hydra:member'] || []);
        const mapped = items.map((u) => ({
          id: Number(u.id),
          label: u.unit_name || u.unitName,
          city: u.city || '',
          cleaningFee: u.cleaning_fee ?? u.cleaningFee ?? null,
          commissionPercent: u.commission_percent ?? u.commissionPercent ?? null,
        })).filter((u) => Number.isFinite(u.id) && u.label);
        if (alive) setUnitOptions(mapped);
      } catch (e) {
        console.error('load units failed', e);
        if (alive) setUnitOptions([]);
      } finally {
        if (alive) setLoadingUnits(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const defaultValues = useMemo(() => ({
    source: 'Private',
    unitId: initialUnit?.id ?? undefined,
    unitName: initialUnit?.label ?? '',
    city: initialUnit?.city ?? '',
    status: 'Upcoming',
    guestType: 'new',
    guestName: '',
    guests: undefined,
    checkIn: initialCheckIn || '',
    checkOut: initialCheckOut || '',
    payout: '',
    paymentMethod: 'cash',
    cleaningFee: initialUnit?.cleaningFee != null ? String(initialUnit.cleaningFee) : '',
    commissionPercent: '20',
    notes: '',
    checkInNotes: '',
    checkOutNotes: '',
    isPaid: false,
  }), [initialUnit]);

  const emptyValues = useMemo(() => ({
    source: 'Private',
    unitId: undefined,
    unitName: '',
    city: '',
    status: 'Upcoming',
    guestType: 'new',
    guestName: '',
    guests: undefined,
    checkIn: '',
    checkOut: '',
    payout: '',
    paymentMethod: 'cash',
    cleaningFee: '',
    commissionPercent: '',
    notes: '',
    checkInNotes: '',
    checkOutNotes: '',
    isPaid: false,
  }), []);

  const { control, handleSubmit, watch, setValue, getValues, reset, formState: { isSubmitting } } = useForm({
    resolver: zodResolver(Schema),
    defaultValues,
    mode: 'onBlur',
  });

  // Reset defaults when caller provides a new unit or initial dates (e.g., from timeline selection)
  useEffect(() => {
    reset({
      ...defaultValues,
      unitId: initialUnit?.id ?? undefined,
      unitName: initialUnit?.label ?? '',
      city: initialUnit?.city ?? '',
      checkIn: initialCheckIn || '',
      checkOut: initialCheckOut || '',
    });
  }, [initialUnit, initialCheckIn, initialCheckOut, reset, defaultValues]);

  const source = watch('source');
  const unitId = watch('unitId');
  const guestType = watch('guestType');

  // When unit changes, populate unitName, city, cleaningFee default and commissionPercent
  useEffect(() => {
    if (!unitId) return;
    const found = unitOptions.find((u) => Number(u.id) === Number(unitId));
    if (!found) return;
    setValue('unitName', found.label || '');
    setValue('city', found.city || '');
    if (found.cleaningFee != null && String(found.cleaningFee) !== '') {
      setValue('cleaningFee', String(found.cleaningFee));
    }
    if (found.commissionPercent != null && String(found.commissionPercent) !== '') {
      setValue('commissionPercent', String(found.commissionPercent));
    } else {
      // only set default 20 if empty (so we don’t clobber a user entry)
      const current = watch('commissionPercent');
      if (current == null || String(current) === '') {
        setValue('commissionPercent', '20');
      }
    }
  }, [unitId, unitOptions, setValue, watch]);

  // When source changes, set default payment method
  useEffect(() => {
    if (source === 'Airbnb') setValue('paymentMethod', 'platform');
    if (source === 'Private') setValue('paymentMethod', 'cash');
  }, [source, setValue]);

  // When guestType is 'owner', autofill fields per business rules
  useEffect(() => {
    if (guestType === 'owner') {
      setValue('guestName', 'Reserva Propietario', { shouldDirty: true });
      setValue('payout', '0', { shouldDirty: true });
      setValue('cleaningFee', '0', { shouldDirty: true });
      setValue('paymentMethod', 'no_pay', { shouldDirty: true });
      {
        const base = 'Reserva propietario';
        const prev = getValues('notes');
        const next = !prev ? base : (prev.includes(base) ? prev : `${base} — ${prev}`);
        setValue('notes', next, { shouldDirty: true });
      }
    }
  }, [guestType, setValue, getValues]);

  const getUnitLabel = (opt) => opt?.label || '';

  const parseYMDLocal = (ymd) => {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };
  const formatYMD = (d) => {
    if (!(d instanceof Date)) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const computeStatus = (ci, co) => {
    const today = new Date();
    const start = parseYMDLocal(ci);
    const end = parseYMDLocal(co);
    if (!start || !end) return 'Upcoming';
    // treat [start, end) like nights
    if (today < start) return 'Upcoming';
    if (today >= start && today < end) return 'Ongoing';
    return 'Past';
  };


  const checkInVal = watch('checkIn');
  const checkOutVal = watch('checkOut');
  useEffect(() => {
    const st = computeStatus(checkInVal, checkOutVal);
    setValue('status', st, { shouldDirty: true });
  }, [checkInVal, checkOutVal, setValue]);
  const checkInMonthRef = useMemo(
    () => (checkInVal ? dayjs(checkInVal) : null),
    [checkInVal],
  );



  // --- Calendar availability logic via useUnitCalendarAvailability ---
  const today = useMemo(() => new Date(), []);
  const fromWide = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 180);
    return formatYMD(d);
  }, [today]);
  const toWide = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 365);
    return formatYMD(d);
  }, [today]);

  const wide = useUnitCalendarAvailability({
    unitId,
    from: fromWide,
    to: toWide,
    merge: 1,
    enabled: !!unitId,
    debounceMs: 0,
  });

  const range = useUnitCalendarAvailability({
    unitId,
    from: checkInVal,
    to: checkOutVal,
    merge: 1,
    enabled: !!unitId && !!checkInVal && !!checkOutVal,
    debounceMs: 300,
  });

  const calendarLoading = range.calendarLoading;
  const calendarError = range.calendarError;
  const calendarConflicts = range.hardConflicts;
  const softWarnings = range.softWarnings;

  // Compute breakdown of warning types in softWarnings
  const warningBreakdown = useMemo(() => {
    const counts = { manual: 0, o2Block: 0, o2Hold: 0 };
    (softWarnings || []).forEach((ev) => {
      const s = String(ev?.summary || '').toLowerCase();
      if (!s) return;
      if (s.includes('not available') || s.includes('airbnb')) {
        counts.manual += 1;
      } else if (s.includes('o2 hold')) {
        counts.o2Hold += 1;
      } else if (s.includes('o2 block')) {
        counts.o2Block += 1;
      }
    });
    return counts;
  }, [softWarnings]);

  // Build warning lines for each warning type present
  const warningLines = useMemo(() => {
    const lines = [];
    if (warningBreakdown.manual > 0) {
      lines.push('Warning: manual block(s) in this date range');
    }
    if (warningBreakdown.o2Block > 0) {
      lines.push('Warning: O2 block(s) in this date range');
    }
    if (warningBreakdown.o2Hold > 0) {
      lines.push('Warning: O2 hold(s) in this date range');
    }
    return lines;
  }, [warningBreakdown]);

  const handleInternalSubmit = async (values) => {
    try {
      // Build payload (camelCase) then POST to proper endpoint
      const payload = {
        source: values.source,
        unitId: Number(values.unitId),
        unitName: values.unitName || null,
        city: values.city || null,
        status: values.status,
        guestType: values.guestType,
        guest_type: values.guestType,
        guestName: values.guestName,
        guests: values.guests != null ? Number(values.guests) : null,
        checkIn: values.checkIn,
        checkOut: values.checkOut,
        payout: normalizeNumberString(values.payout),
        paymentMethod: values.paymentMethod || null,
        cleaningFee: normalizeNumberString(values.cleaningFee),
        commissionPercent: normalizeNumberString(values.commissionPercent),
        notes: values.notes || '',
        checkInNotes: values.checkInNotes || '',
        checkOutNotes: values.checkOutNotes || '',
        isPaid: !!values.isPaid,
      };

      const url = values.source === 'Private'
        ? '/api/bookings/private-reservation'
        : '/api/bookings/manual-airbnb';

      const res = await api.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      });

      reset(emptyValues);
      onSaved?.(res.data);
    } catch (e) {
      console.error('Create booking failed', e);
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to create booking';
      toast.error(msg, { autoClose: 1000 });
    }
  };

  const onSubmit = async (values) => {
    // Build payload exactly as internal does to keep single source of truth
    const payload = {
      source: values.source,
      unitId: Number(values.unitId),
      unitName: values.unitName || null,
      city: values.city || null,
      status: values.status,
      guestType: values.guestType,
      guest_type: values.guestType,
      guestName: values.guestName,
      guests: values.guests != null ? Number(values.guests) : null,
      checkIn: values.checkIn,
      checkOut: values.checkOut,
      payout: normalizeNumberString(values.payout),
      paymentMethod: values.paymentMethod || null,
      cleaningFee: normalizeNumberString(values.cleaningFee),
      commissionPercent: normalizeNumberString(values.commissionPercent),
      notes: values.notes || '',
      checkInNotes: values.checkInNotes || '',
      checkOutNotes: values.checkOutNotes || '',
      isPaid: !!values.isPaid,
    };
    if (typeof onSubmitProp === 'function') {
      try {
        await onSubmitProp(payload);
        reset(emptyValues);
      } catch (e) {
        console.error('External submit failed', e);
        const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to create booking';
        toast.error(msg, { autoClose: 1000 });
      }
      return;
    }
    // Fallback to internal submission
    await handleInternalSubmit(values);
  };

  const shouldDisableCalendarDate = useCallback(
    (day) => wide.shouldDisableCalendarDate(day),
    [wide],
  );

  return (
    <Box component="form" id={formId || 'booking-new-form'} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
        New Booking
      </Typography>

      <Stack spacing={2}>
        {/* Unit */}
        <Controller
          name="unitId"
          control={control}
          render={({ field, fieldState }) => (
            <Autocomplete
              disablePortal
              loading={loadingUnits}
              options={unitOptions}
              getOptionLabel={(opt) => opt?.label || ''}
              isOptionEqualToValue={(a, b) => Number(a?.id) === Number(b?.id)}
              value={unitOptions.find((u) => Number(u.id) === Number(field.value)) || null}
              onChange={(e, val) => field.onChange(val ? Number(val.id) : undefined)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Unit"
                  size="small"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
              sx={{ minWidth: 260, maxWidth: 420, flex: '0 0 auto' }}
            />
          )}
        />

        {/* City (auto after Unit, read-only) */}
        <RHFTextField
          name="city"
          control={control}
          label="City"
          size="small"
          InputProps={{ readOnly: true }}
          sx={{ maxWidth: 280 }}
        />

        {/* Guest Type */}
        <RHFSelect
          name="guestType"
          control={control}
          label="Guest Type"
          options={GUEST_TYPE_OPTIONS}
          size="small"
          sx={{ maxWidth: 260 }}
        />

        {/* Guest Name / Guests */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <RHFTextField
            name="guestName"
            control={control}
            label="Guest Name"
            size="small"
            fullWidth
          />
          <RHFTextField
            name="guests"
            control={control}
            label="Guests"
            size="small"
            type="number"
            inputProps={{ min: 0 }}
            sx={{ width: 140 }}
          />
        </Stack>

        {/* Check In / Check Out */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <RHFDatePicker
            name="checkIn"
            control={control}
            label="Check In"
            shouldDisableDate={shouldDisableCalendarDate}
          />
          <RHFDatePicker
            name="checkOut"
            control={control}
            label="Check Out"
            shouldDisableDate={shouldDisableCalendarDate}
          />
        </Stack>
        {unitId && checkInVal && checkOutVal && (
          <Box sx={{ mt: 0.5 }}>
            {calendarLoading && (
              <Typography variant="caption" color="text.secondary">
                Checking availability for this date range...
              </Typography>
            )}
            {!calendarLoading && calendarError && (
              <Typography variant="caption" color="error">
                {calendarError}
              </Typography>
            )}
            {!calendarLoading && !calendarError && calendarConflicts.length > 0 && (
              <Typography variant="caption" color="error">
                Not available: {calendarConflicts.length} hard conflict(s) in this date range.
              </Typography>
            )}
            {!calendarLoading && !calendarError && calendarConflicts.length === 0 && softWarnings.length > 0 && (
              <Box>
                {(warningLines.length > 0 ? warningLines : ['Warning: block(s) in this date range (override allowed).']).map((line, idx) => (
                  <Typography key={idx} variant="caption" color="warning.main" display="block">
                    {line}
                  </Typography>
                ))}
              </Box>
            )}
            {!calendarLoading && !calendarError && calendarConflicts.length === 0 && softWarnings.length === 0 && (
              <Typography variant="caption" color="success.main">
                No existing events found in this date range on the merged calendar.
              </Typography>
            )}
          </Box>
        )}

        {/* Status (auto from dates, read-only) */}
        <RHFTextField
          name="status"
          control={control}
          label="Status"
          size="small"
          InputProps={{ readOnly: true }}
          sx={{ maxWidth: 260 }}
        />

        {/* Payout / Paid */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <RHFTextField
            name="payout"
            control={control}
            label="Payout"
            size="small"
            inputMode="decimal"
            sx={{ minWidth: 180 }}
          />
          <Controller
            name="isPaid"
            control={control}
            render={({ field }) => (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />
                Paid
              </label>
            )}
          />
        </Stack>

        {/* Payment Method */}
        <RHFSelect
          name="paymentMethod"
          control={control}
          label="Payment Method"
          options={PAYMENT_METHODS}
          size="small"
          sx={{ maxWidth: 260 }}
        />

        {/* Cleaning Fee / Commission % (auto from unit, editable) */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <RHFTextField
            name="cleaningFee"
            control={control}
            label="Cleaning Fee"
            size="small"
            inputMode="decimal"
            sx={{ width: 148 }}
          />
          <RHFTextField
            name="commissionPercent"
            control={control}
            label="Commission %"
            size="small"
            inputMode="decimal"
            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            sx={{ width: 148 }}
          />
        </Stack>

        {/* Notes */}
        <RHFTextField
          name="notes"
          control={control}
          label="Notes"
          size="small"
          fullWidth
          multiline
          minRows={2}
        />

        {/* Check-In Notes */}
        <RHFTextField
          name="checkInNotes"
          control={control}
          label="Check-In Notes"
          size="small"
          multiline
          minRows={2}
          sx={{ width: 312 }}
        />

        {/* Check-Out Notes */}
        <RHFTextField
          name="checkOutNotes"
          control={control}
          label="Check-Out Notes"
          size="small"
          multiline
          minRows={2}
          sx={{ width: 312 }}
        />

        {/* Actions (hidden when using AppDrawer) */}
        {!hideActions && (
          <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => { reset(emptyValues); onCancel?.(); }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>Save</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
