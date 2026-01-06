import React, { useEffect, useMemo } from 'react';
import useUnitCalendarAvailability from '../../hooks/useUnitCalendarAvailability';
import { Box, Stack, TextField, Autocomplete, Typography, Checkbox, FormControlLabel, InputAdornment, Button } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-toastify';

// RHF wrappers (project-local)
import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import RHFDatePicker from './rhf/RHFDatePicker';


/** Helpers **/
const parseCommaNumber = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\s+/g, '');
  if (s === '') return undefined;
  // allow comma as decimal separator
  const n = Number(s.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : undefined;
};

const normalizePaymentMethod = (v) => {
  if (v == null) return '';
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '_');
  // keep only known values; else return as-is so user can see it
  if (['platform', 'cash', 'card', 'no_pay'].includes(s)) return s;
  return s || '';
};

const coerceNumberOrEmpty = (v) => (v == null || v === '' ? '' : Number(v));

const isoToDMY = (iso) => {
  if (!iso || typeof iso !== 'string' || iso.length < 8) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return '';
  return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
};

const dmyToYMD = (v) => {
  if (!v) return '';
  const s0 = String(v).trim();
  if (!s0) return '';

  // If already ISO (YYYY-MM-DD or with time), return the date part.
  const isoDate = s0.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }

  // Accept DD/MM/YYYY or DD-MM-YYYY
  const parts = s0.includes('/') ? s0.split('/') : (s0.includes('-') ? s0.split('-') : []);
  if (parts.length !== 3) return '';
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return '';

  const D = String(dd).padStart(2, '0');
  const M = String(mm).padStart(2, '0');
  const Y = String(yyyy);
  if (Y.length !== 4) return '';

  return `${Y}-${M}-${D}`;
};

const formatYMD = (d) => {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
};

const ymdMinusOne = (ymd) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - 1);
  return formatYMD(d);
};

// Default option sets (can be overridden by props)
const DEFAULT_STATUS_OPTIONS = [
  { value: 'Upcoming', label: 'Upcoming' },
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Past', label: 'Past' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const DEFAULT_PAYMENT_METHODS = [
  { value: 'platform', label: 'Platform' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'no_pay', label: 'No Pay' },
];

/** Zod schema (can be overridden/extended via props.schema) **/
const BaseSchemaCore = z.object({
  reservationCode: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.string().optional()
  ),
  unitId: z.coerce.number().int().positive({ message: 'Select a unit' }),
  status: z.string().min(1, 'Select a status'),
  guestName: z.string().min(1, 'Guest name is required'),
  guests: z.coerce.number().int().min(0, 'Guests must be >= 0').optional(),
  checkIn: z.string().min(1, 'Check-in is required'),
  checkOut: z.string().min(1, 'Check-out is required'),
  payout: z.preprocess(parseCommaNumber, z.number().nonnegative('Payout must be >= 0').optional()),
  paymentMethod: z.string().optional(),
  cleaningFee: z.preprocess(parseCommaNumber, z.number().nonnegative('Cleaning Fee must be >= 0').optional()),
  commissionPercent: z.preprocess(
    parseCommaNumber,
    z.number().min(0, '>= 0').max(100, '<= 100').optional()
  ),
  notes: z.string().optional(),
  checkInNotes: z.string().optional(),
  checkOutNotes: z.string().optional(),
  source: z.string().optional(),
  isPaid: z.coerce.boolean().optional(),
});

const BaseSchema = BaseSchemaCore.superRefine((data, ctx) => {
  const source = (data.source || '').toLowerCase();
  const paymentMethod = normalizePaymentMethod(data.paymentMethod);
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

/**
 * Page-agnostic Booking Edit Form (RHF + Zod + MUI)
 */
export default function BookingEditFormRHF({
  layout = 'desktop', // 'desktop' | 'mobile'
  initialValues,
  schema,
  unitOptions = [], // [{id:number, label:string}|{id:number, unitName:string}]
  statusOptions = DEFAULT_STATUS_OPTIONS,
  paymentMethodOptions = DEFAULT_PAYMENT_METHODS,
  readOnly = false,
  hiddenFields = [],
  submitLabel = 'Save',
  secondaryActionLabel, // e.g., 'Delete'
  onSecondaryAction,
  onSubmit,
  onSave, // backward compatibility for callers using onSave
  onCancel,
  loadingUnits = false,
  formId,
  uxFlags = {},
  proposedDates = {},
  shouldDisableDate,
  shouldDisableStartDate,
  shouldDisableEndDate,
  onMonthChange,
  // Calendar UX (optional; provided by parent if calendar availability is loaded)
  calendarLoading = false,
  calendarError = '',
  calendarConflicts = [],
  calendarWarnings = [],
}) {
  const formSchema = useMemo(() => (schema ? schema.merge(BaseSchema) : BaseSchema), [schema]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting, isDirty, errors },
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
    mode: 'onBlur',
  });

  // --- Dynamic select options for Status & Payment Method (edit form rules) ---
  const curStatus = watch('status');
  const curPaymentMethod = watch('paymentMethod');

  const statusOptionsForEdit = useMemo(() => {
    const cur = curStatus ? String(curStatus) : '';
    const labelMap = { Upcoming: 'Upcoming', Ongoing: 'Ongoing', Past: 'Past', Cancelled: 'Cancelled' };
    const items = [];
    if (cur) items.push({ value: cur, label: labelMap[cur] || cur, disabled: true });
    items.push({ value: 'Cancelled', label: 'Cancelled' });
    return items;
  }, [curStatus]);

  const paymentOptionsForEdit = useMemo(() => {
    const cur = (curPaymentMethod || '').toLowerCase();
    const items = [];
    if (cur) {
      const label = cur.charAt(0).toUpperCase() + cur.slice(1).replace('_', ' ');
      items.push({ value: curPaymentMethod, label, disabled: true });
    }
    if (cur === 'cash') items.push({ value: 'card', label: 'Card' });
    else if (cur === 'card') items.push({ value: 'cash', label: 'Cash' });
    return items;
  }, [curPaymentMethod]);

  // keep form in sync when initialValues change
  useEffect(() => {
    if (!initialValues) return;
    const toInputString = (v) => (v === null || v === undefined || v === '' ? '' : String(v));
    const iv = initialValues || {};
    const next = {
      id: iv.id ?? iv.bookingId ?? iv.booking_id ?? null,
      ...iv,
      // ids / numbers
      unitId: iv.unitId != null ? Number(iv.unitId) : (iv.unit?.id != null ? Number(iv.unit.id) : ''),
      guests: iv.guests != null ? Number(iv.guests) : (iv.numGuests != null ? Number(iv.numGuests) : ''),
      payout: toInputString(iv.payout ?? iv.payoutInMonth ?? iv.totalPayout ?? iv.total_payout ?? ''),
      // Strict: only rely on `cleaningFee` coming from the caller/API
      cleaningFee: toInputString(iv.cleaningFee ?? iv.cleaning_fee ?? ''),
      commissionPercent: toInputString(iv.commissionPercent ?? iv.commission_percent ?? ''),
      // dates
      checkIn: iv.checkIn ?? iv.check_in ?? '',
      checkOut: iv.checkOut ?? iv.check_out ?? '',
      // text
      paymentMethod: normalizePaymentMethod(iv.paymentMethod ?? iv.bookingPaymentMethod ?? iv.payment_method ?? iv.booking_payment_method ?? ''),
      notes: iv.notes ?? '',
      checkInNotes: iv.checkInNotes ?? iv.check_in_notes ?? '',
      checkOutNotes: iv.checkOutNotes ?? iv.check_out_notes ?? '',
      status: iv.status || 'Active',
      guestName: iv.guestName ?? iv.guest_name ?? '',
      source: iv.source ?? '',
    };
    reset(next);
  }, [initialValues, reset]);

  // Resolve current unit object from unitId
  const unitId = watch('unitId');
  const excludeBookingId = initialValues?.id ? Number(initialValues.id) : 0;
  const source = watch('source');
  const currentUnitOption = useMemo(() => {
    const idNum = Number(unitId);
    return unitOptions.find((o) => Number(o?.id) === idNum) || null;
  }, [unitId, unitOptions]);

  // Calendar availability integration
  const checkInValRaw = watch('checkIn');
  const checkOutValRaw = watch('checkOut');
  const checkInYmd = useMemo(() => dmyToYMD(checkInValRaw), [checkInValRaw]);
  const checkOutYmd = useMemo(() => dmyToYMD(checkOutValRaw), [checkOutValRaw]);
  // Treat checkout as exclusive for the *range* query so warnings on the checkout day do not show.
  const checkOutQueryTo = useMemo(() => {
    if (!checkInYmd || !checkOutYmd) return '';
    const t = ymdMinusOne(checkOutYmd);
    return t && t >= checkInYmd ? t : checkOutYmd;
  }, [checkInYmd, checkOutYmd]);

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

  const wideAvail = useUnitCalendarAvailability({
    unitId,
    from: fromWide,
    to: toWide,
    merge: 1,
    excludeBookingId,
    enabled: !!unitId,
    debounceMs: 0,
  });

  const rangeAvail = useUnitCalendarAvailability({
    unitId,
    from: checkInYmd,
    to: checkOutQueryTo,
    merge: 1,
    excludeBookingId,
    enabled: !!unitId && !!checkInYmd && !!checkOutQueryTo,
    debounceMs: 300,
  });

  // Prefer parent-provided calendar UX if present, otherwise use hook results
  const effectiveCalendarLoading = calendarLoading || rangeAvail.calendarLoading;
  const effectiveCalendarError = calendarError || rangeAvail.calendarError;
  const effectiveCalendarConflicts = (Array.isArray(calendarConflicts) && calendarConflicts.length > 0)
    ? calendarConflicts
    : rangeAvail.hardConflicts;
  const effectiveCalendarWarnings = (Array.isArray(calendarWarnings) && calendarWarnings.length > 0)
    ? calendarWarnings
    : rangeAvail.softWarnings;

  const effectiveShouldDisableDate = useMemo(() => {
    if (typeof shouldDisableDate === 'function') return shouldDisableDate;
    return (day) => wideAvail.shouldDisableCalendarDate(day);
  }, [shouldDisableDate, wideAvail]);

  const effectiveShouldDisableStartDate = useMemo(() => {
    if (typeof shouldDisableStartDate === 'function') return shouldDisableStartDate;
    return effectiveShouldDisableDate;
  }, [shouldDisableStartDate, effectiveShouldDisableDate]);

  const effectiveShouldDisableEndDate = useMemo(() => {
    if (typeof shouldDisableEndDate === 'function') return shouldDisableEndDate;
    return effectiveShouldDisableDate;
  }, [shouldDisableEndDate, effectiveShouldDisableDate]);

  const isMobileLayout = layout === 'mobile';

  const warningBreakdown = useMemo(() => {
    const counts = { manual: 0, o2Block: 0, o2Hold: 0 };
    (effectiveCalendarWarnings || []).forEach((ev) => {
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
  }, [effectiveCalendarWarnings]);

  const warningLines = useMemo(() => {
    const lines = [];
    if (warningBreakdown.manual > 0) lines.push('Warning: manual block(s) in this date range');
    if (warningBreakdown.o2Block > 0) lines.push('Warning: O2 block(s) in this date range');
    if (warningBreakdown.o2Hold > 0) lines.push('Warning: O2 hold(s) in this date range');
    return lines;
  }, [warningBreakdown]);

  const handleFormSubmit = async (values) => {
    try {
      // Strip UI-only artifacts if any; ensure numbers are numbers
      const payload = {
        ...values,
        unitId: Number(values.unitId),
        guests: values.guests != null ? Number(values.guests) : undefined,
        payout: parseCommaNumber(values.payout),
        cleaningFee: parseCommaNumber(values.cleaningFee),
        commissionPercent: parseCommaNumber(values.commissionPercent),
      };
      // Ensure id is present for PUT /api/bookings/{id}
      payload.id = payload.id ?? initialValues?.id ?? initialValues?.bookingId ?? initialValues?.booking_id ?? null;
      if (typeof onSubmit === 'function') {
        await onSubmit(payload);
        return;
      }
      if (typeof onSave === 'function') {
        await onSave(payload);
        return;
      }
      // No-op if neither handler is provided
    } catch (e) {
      console.error('Update booking failed', e);
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to update booking';
      toast.error(msg, { autoClose: 1000 });
    }
  };

  const fieldHidden = (name) => hiddenFields.includes(name);

  const getUnitLabel = (opt) => opt?.label || opt?.unitName || '';

  return (
    <Box component="form" id={formId || 'booking-edit-form'} onSubmit={handleSubmit(handleFormSubmit)} noValidate>
      <Stack spacing={2}>
        {/* Row 1: Unit */}
        {!fieldHidden('unitId') && (
          <Controller
            name="unitId"
            control={control}
            render={({ field, fieldState }) => (
              <Autocomplete
                disablePortal
                loading={loadingUnits}
                options={unitOptions}
                getOptionLabel={getUnitLabel}
                isOptionEqualToValue={(a, b) => Number(a?.id) === Number(b?.id)}
                value={currentUnitOption}
                onChange={(e, val) => field.onChange(val ? Number(val.id) : undefined)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Unit"
                    size="small"
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    fullWidth={isMobileLayout}
                  />
                )}
                sx={isMobileLayout ? { width: '100%' } : { minWidth: 260, maxWidth: 420, flex: '0 0 auto' }}
              />
            )}
          />
        )}

        {/* Row 2: Status */}
        {!fieldHidden('status') && (
          <RHFSelect
            name="status"
            control={control}
            label="Status"
            options={statusOptionsForEdit}
            size="small"
            fullWidth={isMobileLayout}
            sx={isMobileLayout ? { width: '100%' } : { minWidth: 200, maxWidth: 320 }}
          />
        )}

        {/* Row 3: Guest Name / Guests */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {!fieldHidden('guestName') && (
            <RHFTextField
              name="guestName"
              control={control}
              label="Guest Name"
              size="small"
              fullWidth
            />
          )}
          {!fieldHidden('guests') && (
            <RHFTextField
              name="guests"
              control={control}
              label="Guests"
              size="small"
              type="number"
              inputProps={{ min: 0 }}
              InputProps={{ endAdornment: <InputAdornment position="end">#</InputAdornment> }}
              fullWidth={isMobileLayout}
              sx={isMobileLayout ? { width: '100%' } : { width: 140 }}
            />
          )}
        </Stack>

        {/* Row 4: Check In / Check Out */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {!fieldHidden('checkIn') && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 0', minWidth: 0 }}>
              <RHFDatePicker
                name="checkIn"
                control={control}
                label="Check In"
                format="DD/MM/YYYY"
                fullWidth
                shouldDisableDate={effectiveShouldDisableStartDate}
                onMonthChange={onMonthChange}
                loading={effectiveCalendarLoading}
              />
              {uxFlags?.showApplyProposedButtons && proposedDates?.checkIn && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setValue('checkIn', isoToDMY(proposedDates.checkIn), { shouldDirty: true })}
                  sx={{ whiteSpace: 'nowrap' }}
                  title={`Use proposed ${isoToDMY(proposedDates.checkIn)}`}
                >
                  Use proposed
                </Button>
              )}
            </Box>
          )}
          {!fieldHidden('checkOut') && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 0', minWidth: 0 }}>
              <RHFDatePicker
                name="checkOut"
                control={control}
                label="Check Out"
                format="DD/MM/YYYY"
                fullWidth
                shouldDisableDate={effectiveShouldDisableEndDate}
                onMonthChange={onMonthChange}
                loading={effectiveCalendarLoading}
              />
              {uxFlags?.showApplyProposedButtons && proposedDates?.checkOut && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setValue('checkOut', isoToDMY(proposedDates.checkOut), { shouldDirty: true })}
                  sx={{ whiteSpace: 'nowrap' }}
                  title={`Use proposed ${isoToDMY(proposedDates.checkOut)}`}
                >
                  Use proposed
                </Button>
              )}
            </Box>
          )}
        </Stack>

        {/* Calendar availability (optional) */}
        {unitId && watch('checkIn') && watch('checkOut') && (
          <Box sx={{ mt: 0.5 }}>
            {effectiveCalendarLoading && (
              <Typography variant="caption" color="text.secondary">
                Checking availability for this date range...
              </Typography>
            )}

            {!effectiveCalendarLoading && !!effectiveCalendarError && (
              <Typography variant="caption" color="error">
                {effectiveCalendarError}
              </Typography>
            )}

            {!effectiveCalendarLoading && !effectiveCalendarError && Array.isArray(effectiveCalendarConflicts) && effectiveCalendarConflicts.length > 0 && (
              <Typography variant="caption" color="error">
                Not available: {effectiveCalendarConflicts.length} hard conflict(s) in this date range.
              </Typography>
            )}

            {!effectiveCalendarLoading && !effectiveCalendarError && Array.isArray(effectiveCalendarConflicts) && effectiveCalendarConflicts.length === 0 && Array.isArray(effectiveCalendarWarnings) && effectiveCalendarWarnings.length > 0 && (
              <Box>
                {(warningLines.length > 0 ? warningLines : ['Warning: block(s) in this date range (override allowed).']).map((line, idx) => (
                  <Typography key={idx} variant="caption" color="warning.main" display="block">
                    {line}
                  </Typography>
                ))}
              </Box>
            )}

            {!effectiveCalendarLoading && !effectiveCalendarError && Array.isArray(effectiveCalendarConflicts) && effectiveCalendarConflicts.length === 0 && Array.isArray(effectiveCalendarWarnings) && effectiveCalendarWarnings.length === 0 && (
              <Typography variant="caption" color="success.main">
                No existing events found in this date range on the merged calendar.
              </Typography>
            )}
          </Box>
        )}

        {/* Row 5: Payout / Cleaning Fee (+ Paid if Private) */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          {!fieldHidden('payout') && (
            <Box sx={isMobileLayout ? { width: '100%' } : { flex: '1 1 0', minWidth: 0 }}>
              <Controller
                name="payout"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Payout"
                    size="small"
                    inputMode="decimal"
                    fullWidth
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    helperText={fieldState.error?.message}
                    error={!!fieldState.error}
                  />
                )}
              />
            </Box>
          )}
          {!fieldHidden('cleaningFee') && (
            <Box sx={isMobileLayout ? { width: '100%' } : { flex: '1 1 0', minWidth: 0 }}>
              <Controller
                name="cleaningFee"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Cleaning Fee"
                    size="small"
                    inputMode="decimal"
                    fullWidth
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    helperText={fieldState.error?.message}
                    error={!!fieldState.error}
                  />
                )}
              />
            </Box>
          )}
          {String(source).toLowerCase() === 'private' && (
            <Controller
              name="isPaid"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="Paid"
                />
              )}
            />
          )}
        </Stack>

        {/* Row 6: Payment Method / Commission % */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          {!fieldHidden('paymentMethod') && (
            <Box sx={isMobileLayout ? { width: '100%' } : { flex: '1 1 0', minWidth: 0 }}>
              <RHFSelect
                name="paymentMethod"
                control={control}
                label="Payment Method"
                options={paymentOptionsForEdit}
                size="small"
                fullWidth
              />
            </Box>
          )}
          {!fieldHidden('commissionPercent') && (
            <Box sx={isMobileLayout ? { width: '100%' } : { flex: '1 1 0', minWidth: 0 }}>
              <Controller
                name="commissionPercent"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Commission %"
                    size="small"
                    inputMode="decimal"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                    helperText={fieldState.error?.message}
                    error={!!fieldState.error}
                    fullWidth
                  />
                )}
              />
            </Box>
          )}
        </Stack>

        {/* Row 9: Notes */}
        {!fieldHidden('notes') && (
          <RHFTextField
            name="notes"
            control={control}
            label="Notes"
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
        )}

        {/* Row 10: CheckIn Notes */}
        {!fieldHidden('checkInNotes') && (
          <RHFTextField
            name="checkInNotes"
            control={control}
            label="Check-In Notes"
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
        )}

        {/* Row 11: CheckOut Notes */}
        {!fieldHidden('checkOutNotes') && (
          <RHFTextField
            name="checkOutNotes"
            control={control}
            label="Check-Out Notes"
            size="small"
            multiline
            minRows={2}
            fullWidth={isMobileLayout}
          />
        )}
      </Stack>
    </Box>
  );
}
