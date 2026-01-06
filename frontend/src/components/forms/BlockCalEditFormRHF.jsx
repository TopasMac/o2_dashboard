import React, { useEffect, useMemo } from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { Box, Grid, TextField, Typography } from '@mui/material';
import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import RHFDatePicker from './rhf/RHFDatePicker';
import { widthMap } from './rhf/widthMap';
import dayjs from 'dayjs';
import useUnitCalendarAvailability from '../../hooks/useUnitCalendarAvailability';


const holdPolicies = [
  { value: '24h', label: '24 Hours' },
  { value: '48h', label: '48 Hours' },
];

const blockReasons = [
  { value: 'Cleaning', label: 'Cleaning' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Late Check-Out', label: 'Late Check-Out' },
  { value: 'Other', label: 'Other' },
];

const confirmGuestTypes = [
  { value: 'New', label: 'New' },
  { value: 'Previous', label: 'Previous' },
  { value: 'Airbnb Extension', label: 'Airbnb Extension' },
];

// Helper to infer type if missing
const guessTypeFromRow = (row = {}) => {
  const explicit = (row?.type || '').toString().trim();
  if (explicit) return explicit;
  const src = (row?.source || '').toString().toLowerCase();
  const gtRaw = row?.guestType ?? row?.guest_type ?? '';
  const gt = gtRaw ? gtRaw.toString().toLowerCase() : '';
  // If guest_type looks like a block reason, treat as Block
  const blockMarkers = ['cleaning', 'maintenance', 'late check-out', 'late checkout', 'block', 'other'];
  if (blockMarkers.some(m => gt.includes(m))) return 'Block';
  // Owners2 soft rows without explicit hold markers → Block by default
  if (src === 'owners2' && !gt.includes('hold')) return 'Block';
  // Fallback
  return 'Hold';
};

export default function BlockCalEditFormRHF({ initialValues, defaultValues, onSubmit, formId = 'block-edit-form' }) {
  const methods = useForm({
    defaultValues: initialValues || defaultValues || {},
  });

  const { watch, setValue } = methods;

  // Ensure RHF tracks this even without an RHF-bound input
  useEffect(() => {
    methods.register('holdExpiresAt');
  }, [methods]);
  // Compute fallback type and ensure RHF value is set
  const fallbackType = useMemo(() => guessTypeFromRow(initialValues || defaultValues || {}), [initialValues, defaultValues]);

  useEffect(() => {
    const current = methods.getValues('type');
    if (!current) {
      methods.setValue('type', fallbackType, { shouldDirty: false, shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackType]);

  const type = watch('type');
  const status = watch('status');
  const holdPolicyVal = watch('holdPolicy');
useEffect(() => {
  if (type !== 'Hold') return;
  if (status !== 'Extend') return;
  // Ensure a default policy when extending
  let cur = methods.getValues('holdPolicy');
  if (!cur) {
    methods.setValue('holdPolicy', '24h', { shouldDirty: true, shouldValidate: false });
    cur = '24h';
  }
  // Compute new expiry from current expiry + policy hours (local time)
  const hours = cur === '48h' ? 48 : 24;
  // Try to use the existing holdExpiresAt as the base; fall back to now if missing/invalid
  const currentRaw =
    methods.getValues('holdExpiresAt') ||
    initialValues?.holdExpiresAt ||
    defaultValues?.holdExpiresAt ||
    '';
  let base = null;
  if (currentRaw) {
    const s = String(currentRaw).replace('T', ' ').trim();
    const [datePart, timePartRaw] = s.split(/\s+/);
    if (datePart) {
      const [Y, M, D] = datePart.split('-').map(Number);
      if (!Number.isNaN(Y) && !Number.isNaN(M) && !Number.isNaN(D)) {
        const hoursPart = timePartRaw ? Number(timePartRaw.slice(0, 2)) : 0;
        const minsPart = timePartRaw ? Number(timePartRaw.slice(3, 5)) : 0;
        base = new Date(Y, (M || 1) - 1, D || 1, isNaN(hoursPart) ? 0 : hoursPart, isNaN(minsPart) ? 0 : minsPart);
      }
    }
  }
  if (!base || Number.isNaN(base.getTime())) {
    base = new Date();
  }
  const exp = new Date(base.getTime() + hours * 60 * 60 * 1000);
  const y = exp.getFullYear();
  const m = String(exp.getMonth() + 1).padStart(2, '0');
  const d = String(exp.getDate()).padStart(2, '0');
  const HH = String(exp.getHours()).padStart(2, '0');
  const MM = String(exp.getMinutes()).padStart(2, '0');
  // Set raw value so the display updates
  methods.setValue('holdExpiresAt', `${y}-${m}-${d} ${HH}:${MM}`, { shouldDirty: true, shouldValidate: false });
}, [type, status, holdPolicyVal, methods, initialValues, defaultValues]);

  const unitId = watch('unitId');
  const resolvedUnitId = useMemo(() => unitId || initialValues?.unitId || defaultValues?.unitId, [unitId, initialValues, defaultValues]);

  // Wide window for calendar disables
  const fromWide = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const toWide = useMemo(() => dayjs().add(90, 'day').format('YYYY-MM-DD'), []);

  const wideAvail = useUnitCalendarAvailability({
    unitId: resolvedUnitId,
    from: fromWide,
    to: toWide,
    merge: 1,
    excludeBookingId: initialValues?.id ? Number(initialValues.id) : 0,
    enabled: !!resolvedUnitId,
    debounceMs: 0,
  });

  const shouldDisableStartDate = (muiDate) => {
    if (!muiDate) return false;
    if (!wideAvail?.shouldDisableCalendarDate) return false;
    return wideAvail.shouldDisableCalendarDate(muiDate);
  };

  const shouldDisableEndDate = (muiDate) => {
    if (!muiDate) return false;
    if (!wideAvail?.shouldDisableCalendarDate) return false;
    // For END dates, we look at the *night before* the checkout/end day.
    const d = dayjs(muiDate?.toDate ? muiDate.toDate() : (muiDate?.$d ? muiDate.$d : muiDate)).subtract(1, 'day');
    return wideAvail.shouldDisableCalendarDate(d);
  };

  // Watchers and helpers for warnings
  const watchCheckIn = useWatch({ control: methods.control, name: 'checkIn' });
  const watchCheckOut = useWatch({ control: methods.control, name: 'checkOut' });
  const watchStart = useWatch({ control: methods.control, name: 'start' });
  const watchEnd = useWatch({ control: methods.control, name: 'end' });

  const toYmdFromAny = (v) => {
    if (!v) return '';
    if (typeof v === 'string') {
      const iso = v.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
      // accept DD/MM/YYYY or DD-MM-YYYY
      const parts = v.includes('/') ? v.split('/') : (v.includes('-') ? v.split('-') : []);
      if (parts.length === 3 && parts[2].length === 4 && parts[0].length <= 2) {
        const dd = String(parts[0]).padStart(2, '0');
        const mm = String(parts[1]).padStart(2, '0');
        const yyyy = String(parts[2]);
        return `${yyyy}-${mm}-${dd}`;
      }
      return '';
    }
    const d = v?.toDate ? v.toDate() : (v?.$d ? v.$d : (v instanceof Date ? v : new Date(v)));
    if (!d || Number.isNaN(d.getTime?.())) return '';
    return dayjs(d).format('YYYY-MM-DD');
  };

  const rangeFrom = useMemo(() => {
    const isHold = (type || '').toString() === 'Hold';
    return isHold ? toYmdFromAny(watchCheckIn) : toYmdFromAny(watchStart);
  }, [type, watchCheckIn, watchStart]);

  const rangeEndRaw = useMemo(() => {
    const isHold = (type || '').toString() === 'Hold';
    return isHold ? toYmdFromAny(watchCheckOut) : toYmdFromAny(watchEnd);
  }, [type, watchCheckOut, watchEnd]);

  const rangeTo = useMemo(() => {
    if (!rangeFrom || !rangeEndRaw) return '';
    const t = dayjs(rangeEndRaw).subtract(1, 'day').format('YYYY-MM-DD');
    return t && t >= rangeFrom ? t : rangeEndRaw;
  }, [rangeFrom, rangeEndRaw]);

  const rangeAvail = useUnitCalendarAvailability({
    unitId: resolvedUnitId,
    from: rangeFrom,
    to: rangeTo,
    merge: 1,
    excludeBookingId: initialValues?.id ? Number(initialValues.id) : 0,
    enabled: !!resolvedUnitId && !!rangeFrom && !!rangeTo,
    debounceMs: 300,
  });

  const warningBreakdown = useMemo(() => {
    const counts = { manual: 0, o2Block: 0, o2Hold: 0 };
    (rangeAvail.softWarnings || []).forEach((ev) => {
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
  }, [rangeAvail.softWarnings]);

  const warningLines = useMemo(() => {
    const lines = [];
    if (warningBreakdown.manual > 0) lines.push('Warning: manual block(s) in this date range');
    if (warningBreakdown.o2Block > 0) lines.push('Warning: O2 block(s) in this date range');
    if (warningBreakdown.o2Hold > 0) lines.push('Warning: O2 hold(s) in this date range');
    return lines;
  }, [warningBreakdown]);

  const holdExpiresWatched = watch('holdExpiresAt');
  const holdExpiresRaw = useMemo(() => {
    // Prefer the current edited value; fall back to API/defaults
    if (holdExpiresWatched) return holdExpiresWatched;
    return initialValues?.holdExpiresAt ?? defaultValues?.holdExpiresAt ?? '';
  }, [holdExpiresWatched, initialValues, defaultValues]);
  const holdExpiresDisplay = useMemo(() => {
    const v = holdExpiresRaw;
    if (!v) return '';
    if (v instanceof Date && !Number.isNaN(v.getTime?.())) {
      const dd = String(v.getDate()).padStart(2, '0');
      const mm = String(v.getMonth() + 1).padStart(2, '0');
      const yyyy = v.getFullYear();
      const HH = String(v.getHours()).padStart(2, '0');
      const MM = String(v.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
    }
    const s = String(v).replace('T', ' ').trim();
    const [datePart, timeRaw] = s.split(' ');
    if (!datePart) return s;
    const [Y, M, D] = datePart.split('-');
    const dd = (D || '').padStart(2, '0');
    const mm = (M || '').padStart(2, '0');
    const yyyy = (Y || '').padStart(4, '0');
    const hhmm = timeRaw ? timeRaw.slice(0, 5) : '';
    return hhmm ? `${dd}/${mm}/${yyyy} ${hhmm}` : `${dd}/${mm}/${yyyy}`;
  }, [holdExpiresRaw]);

  return (
    <FormProvider {...methods}>
      <Box
        component="form"
        id={formId}
        noValidate
        autoComplete="off"
        onSubmit={methods.handleSubmit((vals) => {
          const out = { ...vals };

          // Normalize user-facing status "Cancel" to API "Cancelled"
          if (out.status === 'Cancel') out.status = 'Cancelled';

          // Determine soft type from current form or fallback
          const rawType = (methods.getValues('type') || '').toString().trim() || (fallbackType || '');
          const typeLower = rawType.toLowerCase();
          const typeProper = typeLower === 'block' ? 'Block' : 'Hold';
          out.type = typeProper; // <-- keep type; backend uses it to route logic

          // Helpers
          const toJsDate = (v) => (v?.toDate ? v.toDate() : (v?.$d ? v.$d : (v instanceof Date ? v : (v ? new Date(v) : null))));
          const toYmdSafe = (v) => {
            const d = toJsDate(v);
            if (!d || Number.isNaN(d.getTime())) return undefined;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };

          if (typeLower === 'block') {
            // Block edits: send reason (NOT guest_type) and keep raw start/end for parent handler
            const currentReason = methods.getValues('reason')
              || methods.getValues('guestType')
              || (initialValues?.guestType ?? initialValues?.guest_type)
              || 'Other';
            out.reason = currentReason;
            delete out.guest_type; // do not send guest_type for blocks
            // IMPORTANT: Do NOT compute or delete dates here — let parent handler use out.start/out.end
            // Keep out.start and out.end as chosen in the form
            delete out.check_in;
            delete out.check_out;
          } else {
            // Hold edits: keep guest name; map checkIn/checkOut to YMD
            if (!out.guest_type) out.guest_type = 'Hold';
            const ci = toYmdSafe(out.checkIn);
            const co = toYmdSafe(out.checkOut);
            if (ci) out.check_in = ci;
            if (co) out.check_out = co;
          }

          // Normalize payout and payment method for Hold edits so backend requirements are satisfied
          if (typeLower !== 'block') {
            const payoutRaw = out.payout;
            const payoutValue =
              payoutRaw === '' || payoutRaw == null ? 0 : Number(payoutRaw);
            out.payout = Number.isNaN(payoutValue) ? 0 : payoutValue;

            const paymentMethodValue = out.paymentMethod || 'cash';
            out.payment_method = paymentMethodValue;
          }

          // Cleanup fields not required by API
          delete out.guestType;   // RHF shadow
          delete out.paymentMethod; // shadow; backend uses payment_method
          // keep out.reason (backend uses it); do not delete
          delete out.unitId;      // per request: do not send unitId
          delete out.unit_id;     // safety
          // Do NOT delete out.type (backend needs it)

          onSubmit(out);
        })}
        sx={{ mt: 2 }}
      >
        {/* Hidden input to guarantee type is always posted */}
        <input type="hidden" name="type" value={methods.watch('type') || fallbackType} />
        <input type="hidden" name="unitId" value={methods.watch('unitId') ?? initialValues?.unitId ?? defaultValues?.unitId ?? ''} />
        <input type="hidden" name="unitName" value={methods.watch('unitName') ?? initialValues?.unitName ?? defaultValues?.unitName ?? ''} />
        <input type="hidden" name="holdExpiresAt" value={methods.watch('holdExpiresAt') || ''} />
        <Grid container spacing={2}>
          {/* Common Fields */}
          <Grid item xs={12} container spacing={2}>
            <Grid item sx={widthMap.half}>
              <RHFDatePicker
                name="bookingDate"
                label="Booking Date"
                disabled
                inputFormat="dd-MM-yyyy"
                sx={{ width: '100%' }}
              />
            </Grid>
          </Grid>
          <Grid item xs={12} container spacing={2}>
            <Grid item sx={widthMap.twoThirds}>
              <RHFTextField name="unitName" label="Unit" disabled fullWidth />
            </Grid>
            <Grid item sx={widthMap.oneThird}>
              <RHFSelect
                name="status"
                label="Status"
                options={[
                  { value: 'Active', label: 'Active' },
                  { value: 'Extend', label: 'Extend' },
                  { value: 'Confirm', label: 'Confirm' },
                  { value: 'Cancel', label: 'Cancel' }, // maps to "Cancelled" on submit
                ]}
                fullWidth
              />
            </Grid>
          </Grid>
          {warningLines.length > 0 && (
            <Grid item xs={12}>
              <Box sx={{ px: 0.5 }}>
                {warningLines.map((t) => (
                  <Typography key={t} variant="caption" sx={{ display: 'block', color: 'warning.main' }}>
                    • {t}
                  </Typography>
                ))}
              </Box>
            </Grid>
          )}
          <Grid item xs={12} container spacing={2}>
            {type === 'Block' && (
              <Grid item sx={widthMap.half}>
                <RHFSelect name="reason" label="Reason" options={blockReasons} fullWidth />
              </Grid>
            )}
            {type === 'Hold' && (
              <>
                <Grid item sx={widthMap.oneThird}>
                  <RHFSelect
                    name="holdPolicy"
                    label="Hold Policy"
                    options={holdPolicies}
                    disabled={status !== 'Extend'}
                    fullWidth
                  />
                </Grid>
                <Grid item sx={widthMap.twoThirds}>
                  <TextField
                    label="Expires At"
                    value={holdExpiresDisplay || holdExpiresRaw || ''}
                    disabled
                    fullWidth
                    inputProps={{ 'data-testid': 'hold-expires-at-display' }}
                  />
                </Grid>
              </>
            )}
          </Grid>

          {type === 'Hold' && (
            <>
              <Grid item xs={12} container spacing={2}>
                <Grid item sx={widthMap.twoThirds}>
                  <RHFTextField name="guestName" label="Guest Name" fullWidth />
                </Grid>
                <Grid item sx={widthMap.oneThird}>
                  <RHFTextField name="guests" label="Guests" type="number" fullWidth />
                </Grid>
              </Grid>
              {status === 'Confirm' && (
                <Grid item xs={12} container spacing={2}>
                  <Grid item sx={widthMap.half}>
                    <RHFSelect
                      name="guestTypeConfirm"
                      label="Guest Type"
                      options={confirmGuestTypes}
                      fullWidth
                    />
                  </Grid>
                </Grid>
              )}
              <Grid item xs={12} container spacing={2}>
              <Grid item sx={widthMap.half}>
                <RHFDatePicker
                  name="checkIn"
                  label="Check-In"
                  inputFormat="dd-MM-yyyy"
                  fullWidth
                  shouldDisableDate={shouldDisableStartDate}
                />
              </Grid>
              <Grid item sx={widthMap.half}>
                <RHFDatePicker
                  name="checkOut"
                  label="Check-Out"
                  inputFormat="dd-MM-yyyy"
                  fullWidth
                  shouldDisableDate={shouldDisableEndDate}
                />
              </Grid>
              </Grid>
              {/* Payout and Payment Method */}
              <Grid item xs={12} container spacing={2}>
                <Grid item sx={widthMap.twoThirds}>
                  <RHFTextField
                    name="payout"
                    label="Payout"
                    type="number"
                    fullWidth
                  />
                </Grid>
                <Grid item sx={widthMap.oneThird}>
                  <RHFSelect
                    name="paymentMethod"
                    label="Payment Method"
                    options={[
                      { value: 'cash', label: 'Cash' },
                      { value: 'card', label: 'Card' },
                      { value: 'transfer', label: 'Transfer' },
                      { value: 'other', label: 'Other' },
                    ]}
                    fullWidth
                  />
                </Grid>
              </Grid>
              {/* Cleaning Fee and Commission % */}
              <Grid item xs={12} container spacing={2}>
                <Grid item sx={widthMap.twoThirds}>
                  <RHFTextField
                    name="cleaningFee"
                    label="Cleaning Fee"
                    type="number"
                    fullWidth
                  />
                </Grid>
                <Grid item sx={widthMap.oneThird}>
                  <RHFTextField
                    name="commissionPercent"
                    label="Commission %"
                    type="number"
                    fullWidth
                  />
                </Grid>
              </Grid>
            </>
          )}

          {type === 'Block' && (
            <Grid item xs={12} container spacing={2}>
              <Grid item sx={widthMap.half}>
                <RHFDatePicker name="start" label="Start" inputFormat="dd-MM-yyyy" fullWidth shouldDisableDate={shouldDisableStartDate} />
              </Grid>
              <Grid item sx={widthMap.half}>
                <RHFDatePicker name="end" label="End" inputFormat="dd-MM-yyyy" fullWidth shouldDisableDate={shouldDisableEndDate} />
              </Grid>
            </Grid>
          )}

          <Grid item xs={12}>
            <RHFTextField name="notes" label="Notes" multiline rows={2} fullWidth />
          </Grid>
        </Grid>
      </Box>
    </FormProvider>
  );
}
