import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useUnitCalendarAvailability from '../../hooks/useUnitCalendarAvailability';
import dayjs from 'dayjs';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import RHFDatePicker from './rhf/RHFDatePicker';

import RHFAutocomplete from './rhf/RHFAutocomplete';
import { widthMap } from '../forms/rhf/widthMap';
import RHFDateRange from './rhf/RHFDateRange';

// Helper: convert label to value used by backend
const PAYMENT_METHODS = [
  { label: 'Cash', value: 'cash' },
  { label: 'Transfer', value: 'transfer' },
];

const HOLD_POLICIES = [
  { label: '24 hours', value: '24h' },
  { label: '48 hours', value: '48h' },
];

const BLOCK_REASONS = [
  { label: 'Cleaning', value: 'Cleaning' },
  { label: 'Late CheckOut', value: 'Late CheckOut' },
  { label: 'Maintenance', value: 'Maintenance' },
  { label: 'Other', value: 'Other' },
];

// Format a Date into "YYYY-MM-DD HH:mm" in a specific IANA timezone
const formatYMDHMInTZ = (dateObj, timeZone = 'America/Cancun') => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(dateObj).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

// Helper: attach JWT auth header if available
const buildAuthHeaders = () => {
  const token =
    (typeof window !== 'undefined' && (localStorage.getItem('jwt') || localStorage.getItem('token'))) ||
    (typeof window !== 'undefined' && (sessionStorage.getItem('jwt') || sessionStorage.getItem('token')));
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function BlockCalFormRHF({
  onSuccess,
  defaultUnitId = null,
  defaultUnitName = '',
  initialType = 'Hold',
  unitOptions = [],
  initialStartDate = '',
  initialEndDate = '',
}) {
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);


  const methods = useForm({
    defaultValues: {
      cleaningFee: 0,
      commissionPercent: 20,
    },
    mode: 'onChange',
  });
  const { handleSubmit, setValue, control } = methods;

  const eachDate = (startStr, endStr) => {
    // half-open [start, end) in local timezone using dayjs
    const out = [];
    let d = dayjs(startStr).startOf('day');
    const end = dayjs(endStr).startOf('day');
    while (d.isBefore(end)) {
      out.push(d.format('YYYY-MM-DD'));
      d = d.add(1, 'day');
    }
    return out;
  };

  const formatYMD = (d) => dayjs(d).format('YYYY-MM-DD');

  const ymdPlusOne = (ymd) => {
    if (!ymd) return '';
    const d = dayjs(String(ymd).slice(0, 10)).add(1, 'day');
    return d.isValid() ? d.format('YYYY-MM-DD') : '';
  };

  const ymdMinusOne = (ymd) => {
    if (!ymd) return '';
    const d = dayjs(String(ymd).slice(0, 10)).subtract(1, 'day');
    return d.isValid() ? d.format('YYYY-MM-DD') : '';
  };

  // Load units for autocomplete
  const loadUnits = useCallback(async () => {
    try {
      const res = await fetch('/api/units?pagination=false&lifecycle=active,onboarding', {
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        credentials: 'include',
      });
      if (res.status === 401) {
        alert('Not authorized. Please sign in again.');
        throw new Error('Not authorized (401).');
      }
      const json = await res.json();
      const options = (Array.isArray(json) ? json : json['hydra:member'] || []).map((u) => ({
        id: u.id,
        label: u.unitName || u.listingName || u.name || `Unit #${u.id}`,
        value: u.id,
        raw: u,
      }));
      setUnits(options);
      if (defaultUnitId) {
        const pre = options.find((o) => String(o.id) === String(defaultUnitId));
        if (pre) setSelectedUnit(pre);
      }
    } catch (e) {
      console.error('Failed to load units', e);
      alert(e?.message || 'Failed to load units. Please log in and try again.');
    }
  }, [defaultUnitId]);

  useEffect(() => { loadUnits(); }, [loadUnits]);
  useEffect(() => {
    if (defaultUnitId && defaultUnitName) {
      setSelectedUnit({ id: defaultUnitId, label: defaultUnitName, raw: null });
      methods.setValue('unitId', defaultUnitId, { shouldDirty: true, shouldValidate: true });
    }
  }, [defaultUnitId, defaultUnitName, methods]);

  // Watch fields to drive UI/derived values
  const watchType = useWatch({ control, name: 'type' });

  const uId = selectedUnit?.id || defaultUnitId;

  const fromWide = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const toWide = useMemo(() => dayjs().add(90, 'day').format('YYYY-MM-DD'), []);

  const wideAvail = useUnitCalendarAvailability({
    unitId: uId,
    from: fromWide,
    to: toWide,
    merge: 1,
    enabled: !!uId,
    debounceMs: 0,
  });

  // Prefill cleaning fee & commission percent from unit
  const unitFinanceDefaults = useMemo(() => {
    const u = selectedUnit?.raw;
    if (!u) return { cleaningFee: 0, commissionPercent: 20 };
    const cleaningFee = u.cleaningFee ?? u.cleaningFeeAmount ?? u.cleaningRate ?? 0;
    const commissionPercent = u.commissionPercent ?? u.ownerCommissionPercent ?? 20;
    return { cleaningFee, commissionPercent };
  }, [selectedUnit]);

  const initialValues = useMemo(() => {
    const today = dayjs();
    const tomorrow = today.add(1, 'day');
    const start = initialStartDate || today.format('YYYY-MM-DD');
    const end = initialEndDate || tomorrow.format('YYYY-MM-DD');
    return {
      bookingDate: today.format('YYYY-MM-DD'), // hidden field, default to today
      unitId: selectedUnit?.id ?? defaultUnitId ?? '',
      type: initialType,
      // Hold fields
      holdPolicy: '24h',
      holdExpiresAt: '',
      guestName: '',
      guests: 1,
      checkIn: initialStartDate || today.add(3, 'day').format('YYYY-MM-DD'),
      checkOut: initialEndDate || today.add(4, 'day').format('YYYY-MM-DD'),
      payout: '',
      paymentMethod: 'cash',
      cleaningFee: unitFinanceDefaults.cleaningFee,
      commissionPercent: unitFinanceDefaults.commissionPercent,
      notes: '',
      // Block fields
      blockCheckIn: start,
      blockCheckOut: end,
      blockReason: 'Cleaning',
      blockNotes: '',
    };
  }, [selectedUnit, unitFinanceDefaults, defaultUnitId, initialType, initialStartDate, initialEndDate]);

  React.useEffect(() => {
    const current = methods.getValues();
    // Preserve user's current selections/inputs across unit changes
    const preserved = {
      // Common
      type: current?.type || initialValues.type,
      notes: current?.notes ?? initialValues.notes,
      // Hold fields
      checkIn: current?.checkIn || initialValues.checkIn,
      checkOut: current?.checkOut || initialValues.checkOut,
      guestName: current?.guestName || initialValues.guestName,
      guests: (current?.guests ?? initialValues.guests),
      payout: (current?.payout ?? initialValues.payout),
      paymentMethod: current?.paymentMethod || initialValues.paymentMethod,
      // Block fields
      blockCheckIn: current?.blockCheckIn || initialValues.blockCheckIn,
      blockCheckOut: current?.blockCheckOut || initialValues.blockCheckOut,
      blockReason: current?.blockReason || initialValues.blockReason,
      blockNotes: (current?.blockNotes ?? initialValues.blockNotes),
    };
    methods.reset({ ...initialValues, ...preserved });
  }, [initialValues]);

  // Auto-fill Cleaning Fee from Unit API whenever Unit changes
  const watchedUnitId = methods.watch('unitId');
  useEffect(() => {
    const id = watchedUnitId || selectedUnit?.id || defaultUnitId;
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/units/${id}`, {
          headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Failed to load unit ${id}`);
        const u = await res.json();
        const fee = u?.cleaningFee ?? 0;
        methods.setValue('cleaningFee', Number(fee) || 0, { shouldDirty: true, shouldValidate: true });
      } catch (e) {
        console.warn('Could not fetch unit cleaning fee', e);
      }
    })();
  }, [watchedUnitId, selectedUnit, defaultUnitId]);

  // Compute Expires At preview in America/Cancun timezone
  const watchPolicy = useWatch({ control, name: 'holdPolicy' });

  const watchCheckIn = useWatch({ control, name: 'checkIn' });
  const watchCheckOut = useWatch({ control, name: 'checkOut' });
  const watchBlockCheckIn = useWatch({ control, name: 'blockCheckIn' });
  const watchBlockCheckOut = useWatch({ control, name: 'blockCheckOut' });

  const expirePreview = useMemo(() => {
    const hours = watchPolicy === '48h' ? 48 : 24;
    const now = new Date();
    const exp = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return formatYMDHMInTZ(exp, 'America/Cancun');
  }, [watchPolicy]);

  const selectedRange = useMemo(() => {
    if (watchType === 'Block') {
      return { start: watchBlockCheckIn, end: watchBlockCheckOut };
    }
    return { start: watchCheckIn, end: watchCheckOut };
  }, [watchType, watchCheckIn, watchCheckOut, watchBlockCheckIn, watchBlockCheckOut]);

  const blockedRanges = useMemo(() => {
    const clean = Array.isArray(wideAvail.unitCalendarEvents) ? wideAvail.unitCalendarEvents : [];
    // Only hard blocks disable date selection; soft blocks are warnings only.
    return clean
      .filter((r) => r && r.type && r.type !== 'Available')
      .filter((r) => r.hardBlock !== false) // default hard if missing
      .map((r) => ({
        start: String(r.start).slice(0, 10),
        // RHFDateRange expects half-open [start,end) where end is checkout boundary.
        end: ymdPlusOne(String(r.end).slice(0, 10)),
      }))
      .filter((r) => r.start && r.end);
  }, [wideAvail.unitCalendarEvents]);

  const rangeFrom = useMemo(() => {
    const s = selectedRange?.start;
    return s ? String(s).slice(0, 10) : '';
  }, [selectedRange]);

  const rangeEndRaw = useMemo(() => {
    const e = selectedRange?.end;
    return e ? String(e).slice(0, 10) : '';
  }, [selectedRange]);

  const rangeTo = useMemo(() => {
    if (!rangeFrom || !rangeEndRaw) return '';
    const t = ymdMinusOne(rangeEndRaw);
    return t && t >= rangeFrom ? t : rangeEndRaw;
  }, [rangeFrom, rangeEndRaw]);

  const rangeAvail = useUnitCalendarAvailability({
    unitId: uId,
    from: rangeFrom,
    to: rangeTo,
    merge: 1,
    enabled: !!uId && !!rangeFrom && !!rangeTo,
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

  const onSubmit = useCallback(async (values) => {
    const isHold = values.type === 'Hold';
    const unit_id = values.unitId || selectedUnit?.id || defaultUnitId;

    // Guard: require unit before submitting to backend
    if (!unit_id) {
      if (methods?.setError) {
        methods.setError('unitId', {
          type: 'manual',
          message: 'Please select a unit',
        });
      }
      return;
    }

    // Normalize payout and payment_method defaults for Hold
    const payoutValue =
      values.payout === '' || values.payout == null ? 0 : Number(values.payout);
    const paymentMethodValue = values.paymentMethod || 'cash';

    const payload = isHold
      ? {
          // Hold for real reservations: keep the real guest name
          type: 'Hold',
          unit_id,
          source: 'Owners2',
          status: 'Active',
          guestName: values.guestName || undefined,
          guests: Number(values.guests || 1),
          check_in: values.checkIn,
          check_out: values.checkOut,
          expiry: values.holdPolicy, // 24h|48h
          payout: payoutValue,
          payment_method: paymentMethodValue,
          note: values.notes || undefined,
        }
      : {
          // Block entries: controller will set guest_name to normalized reason
          type: 'Block',
          unit_id,
          source: 'Owners2',
          status: 'Active',
          check_in: values.blockCheckIn,
          check_out: values.blockCheckOut,
          blockReason: values.blockReason,
          note: values.blockNotes || undefined,
        };

    const res = await fetch('/api/soft-reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      console.warn('[BlockCalForm] 401 Unauthorized — JWT required');
      const txt = await res.text().catch(() => '');
      throw new Error(txt || 'auth_required');
    }

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(errTxt || `Request failed (${res.status})`);
    }

    const data = await res.json();
    if (typeof onSuccess === 'function') onSuccess(data);
  }, [onSuccess, selectedUnit, defaultUnitId, methods]);

  return (
    <FormProvider {...methods}>
      <form id="block-cal-form" onSubmit={handleSubmit(onSubmit)}>
        {/* Booking Date - visible formatted */}
        <RHFTextField
          name="bookingDate"
          label="Date"
          value={dayjs(methods.getValues('bookingDate')).format('DD-MM-YYYY')}
          disabled
        />

        <RHFSelect
          name="type"
          label="Type"
          options={[
            { label: 'Hold (Provisional)', value: 'Hold' },
            { label: 'Block (Maintenance/Cleaning)', value: 'Block' },
          ]}
        />

        {defaultUnitId && defaultUnitName ? (
          <div style={widthMap.full}>
            <TextField
              label="Unit"
              value={defaultUnitName}
              fullWidth
              disabled
              InputProps={{ readOnly: true }}
            />
            <RHFTextField name="unitId" label="Unit" fullWidth style={{ display: 'none' }} />
          </div>
        ) : (
          <div style={widthMap.full}>
            <RHFAutocomplete
              name="unitId"
              label="Unit"
              options={unitOptions.length ? unitOptions : units}
              placeholder="Search unit by name"
              rules={{ required: 'Unit is required' }}
              onChange={(value, option) => {
                if (option && option.raw) setSelectedUnit(option);
                else setSelectedUnit({ id: value, raw: null });
              }}
              getOptionValue={(opt) => opt.value ?? opt.id}
              getOptionLabel={(opt) => opt.label ?? opt.name ?? String(opt.value ?? opt.id)}
            />
          </div>
        )}

      {watchType === 'Hold' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <div style={widthMap.oneThird}>
              <RHFSelect
                name="holdPolicy"
                label="Auto-Expire"
                options={HOLD_POLICIES}
                fullWidth
                style={{ width: '100%' }}
              />
            </div>
            <div style={widthMap.twoThirds}>
              <RHFTextField name="holdExpiresAt" label="Expires At" value={expirePreview} disabled fullWidth style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ marginTop: '1rem', ...widthMap.full }}>
            <RHFDateRange
              nameStart="checkIn"
              nameEnd="checkOut"
              blockedRanges={blockedRanges}
              minDate={new Date()}
              fullWidth
            />
          </div>
          {watchType === 'Hold' && warningLines.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              {warningLines.map((line, idx) => (
                <Typography key={idx} variant="caption" color="warning.main" display="block">
                  {line}
                </Typography>
              ))}
            </Box>
          )}

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <div style={widthMap.twoThirds}>
              <RHFTextField name="guestName" label="Guest Name" fullWidth style={{ width: '100%' }} />
            </div>
            <div style={widthMap.oneThird}>
              <RHFTextField name="guests" label="Guests" type="number" inputProps={{ min: 1, step: 1 }} fullWidth style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <div style={widthMap.twoThirds}>
              <RHFTextField name="payout" label="Payout" type="number" inputProps={{ min: 0, step: 1 }} fullWidth style={{ width: '100%' }} />
            </div>
            <div style={widthMap.oneThird}>
              <RHFSelect name="paymentMethod" label="Payment Method" options={PAYMENT_METHODS} fullWidth style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <div style={widthMap.twoThirds}>
              <RHFTextField
                name="cleaningFee"
                label="Cleaning Fee"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                disabled
                fullWidth
                style={{ width: '100%' }}
              />
            </div>
            <div style={widthMap.oneThird}>
              <RHFTextField
                name="commissionPercent"
                label="Commission %"
                type="number"
                inputProps={{ min: 0, step: 0.1 }}
                disabled
                fullWidth
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <RHFTextField name="notes" label="Notes" multiline rows={3} />
        </>
      )}

      {watchType === 'Block' && (
        <>
          <div style={{ marginTop: '1rem', ...widthMap.full }}>
            <RHFDateRange
              nameStart="blockCheckIn"
              nameEnd="blockCheckOut"
              blockedRanges={blockedRanges}
              minDate={new Date()}
              fullWidth
              labelStart="Start"
              labelEnd="End"
            />
          </div>
          {watchType === 'Block' && warningLines.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              {warningLines.map((line, idx) => (
                <Typography key={idx} variant="caption" color="warning.main" display="block">
                  {line}
                </Typography>
              ))}
            </Box>
          )}

          <div style={{ marginTop: '1rem' }}>
            <RHFSelect name="blockReason" label="Reason" options={BLOCK_REASONS} />
          </div>
          <RHFTextField name="blockNotes" label="Notes" multiline rows={3} />
        </>
      )}

      </form>
    </FormProvider>
  );
}
