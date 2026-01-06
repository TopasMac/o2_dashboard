// RHFDateRange.jsx — RHF wrapper around two MUI DatePickers
// Writes two form fields (start & end) from a paired picker.

import React, { useMemo } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Box } from '@mui/material';
import dayjs from 'dayjs';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

/**
 * Props:
 * - control, getValues, setValue: optionally passed; otherwise taken from useFormContext
 * - nameStart: form field name for start (default: 'checkIn')
 * - nameEnd:   form field name for end   (default: 'checkOut')
 * - label: optional group label text
 * - labelStart, labelEnd: individual field labels
 * - disabledDates: array of date strings (YYYY-MM-DD) or Date/dayjs objects to disable
 * - blockedRanges: array of { start, end } date strings (YYYY-MM-DD) representing occupied nights
 * - minDate, maxDate: Date limits (optional)
 * - onRangeCommit: callback({ startDate, endDate }) when selection changes
 * - readOnly: if true, renders disabled
 * - fullWidth / style: layout props for container
 */
export default function RHFDateRange(props) {
  const formContext = useFormContext();
  const {
    control = formContext?.control,
    getValues = formContext?.getValues,
    setValue = formContext?.setValue,
    nameStart = 'checkIn',
    nameEnd = 'checkOut',
    label,
    labelStart = 'Check In',
    labelEnd = 'Check Out',
    disabledDates = [],
    blockedRanges = [],
    minDate,
    maxDate,
    onRangeCommit,
    readOnly = false,
    fullWidth = true,
    style,
  } = props;

  if (!control || !getValues || !setValue) {
    console.error(
      '[RHFDateRange] Missing control/getValues/setValue. ' +
        'Ensure this is used inside FormProvider or pass them via props.'
    );
    // We still render nothing, but this happens after all hooks are declared below,
    // so there is no conditional hook execution.
  }

  // Normalize disabled dates to a Set of YYYY-MM-DD (local, via dayjs)
  const disabledSet = useMemo(() => {
    const toKey = (d) => {
      if (d instanceof Date) return dayjs(d).format('YYYY-MM-DD');
      if (typeof d === 'string') return dayjs(d).format('YYYY-MM-DD');
      if (dayjs.isDayjs(d)) return d.format('YYYY-MM-DD');
      return String(d).slice(0, 10);
    };
    const set = new Set((disabledDates || []).map(toKey));
    return set;
  }, [disabledDates]);

  const normalizedRanges = useMemo(() => {
    if (!blockedRanges || blockedRanges.length === 0) return [];
    const out = [];
    (blockedRanges || []).forEach((r) => {
      if (!r) return;
      const s = dayjs(r.start).startOf('day');
      const e = dayjs(r.end).startOf('day');
      if (!s.isValid() || !e.isValid()) return;
      out.push({ start: s, end: e });
    });
    return out;
  }, [blockedRanges]);

  const fieldName = `${nameStart}__range__${nameEnd}`; // synthetic controller anchor (keeps start/end in sync)

  const internalShouldDisableStart = (d) => {
    if (!d) return false;
    const key = dayjs(d).format('YYYY-MM-DD');

    // If no blockedRanges, fall back to disabledDates set.
    if (!normalizedRanges.length) {
      return disabledSet.has(key);
    }

    const date = dayjs(d).startOf('day');
    return normalizedRanges.some(({ start, end }) => {
      // [start, end) occupied: allow selecting `end` as a new start (checkout boundary)
      return (date.isSame(start) || date.isAfter(start)) && date.isBefore(end);
    });
  };

  const internalShouldDisableEnd = (d) => {
    if (!d) return false;
    const key = dayjs(d).format('YYYY-MM-DD');

    if (!normalizedRanges.length) {
      return disabledSet.has(key);
    }

    // For END dates, we look at the night before the chosen checkout date.
    const lastNight = dayjs(d).startOf('day').subtract(1, 'day');
    return normalizedRanges.some(({ start, end }) => {
      // [start, end) occupied nights: allow choosing `start` as checkout (end boundary)
      return (lastNight.isSame(start) || lastNight.isAfter(start)) && lastNight.isBefore(end);
    });
  };

  const coerceDayjs = (val, fallback) => {
    if (!val) return fallback;
    try {
      if (dayjs.isDayjs(val)) return val.startOf('day');
      if (val instanceof Date) return dayjs(val).startOf('day');
      if (typeof val === 'string') return dayjs(val).startOf('day');
      return fallback;
    } catch (e) {
      return fallback;
    }
  };

  return (
    <Box sx={{ width: fullWidth ? '100%' : 'auto', mb: 2 }} style={style}>
      {label ? (
        <Box sx={{ fontSize: 12, fontWeight: 600, mb: 0.75 }}>{label}</Box>
      ) : null}

      <Controller
        name={fieldName}
        control={control}
        render={({ field: { onChange } }) => {
          const startVal = getValues(nameStart);
          const endVal = getValues(nameEnd);

          const startDate = startVal ? coerceDayjs(startVal, null) : null;
          const rawEndDate = endVal ? coerceDayjs(endVal, null) : null;

          // If we have a start date but no valid end date (or end is not after start),
          // default to start + 1 night for display purposes.
          let endDate = rawEndDate;
          if (startDate) {
            if (!endDate || !endDate.isAfter(startDate)) {
              endDate = startDate.add(1, 'day');
            }
          }

          const today = dayjs().startOf('day');

          return (
            <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <DatePicker
                    label={labelStart}
                    value={startDate}
                    onChange={(newVal) => {
                      if (readOnly) return;
                      const s = coerceDayjs(newVal, null);
                      if (!s) return;
                      let e = getValues(nameEnd) ? coerceDayjs(getValues(nameEnd), null) : null;
                      if (!e || !e.isAfter(s)) {
                        e = s.add(1, 'day');
                      }
                      const sStr = s.format('YYYY-MM-DD');
                      const eStr = e.format('YYYY-MM-DD');
                      setValue(nameStart, sStr, { shouldValidate: true, shouldDirty: true });
                      setValue(nameEnd, eStr, { shouldValidate: true, shouldDirty: true });
                      onChange(`${sStr}|${eStr}`);
                      if (typeof onRangeCommit === 'function') onRangeCommit({ startDate: s, endDate: e });
                    }}
                    disablePast
                    minDate={minDate ? dayjs(minDate) : today}
                    maxDate={maxDate ? dayjs(maxDate) : undefined}
                    shouldDisableDate={internalShouldDisableStart}
                    format="DD-MM-YYYY"
                  />
                </Box>

                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <DatePicker
                    label={labelEnd}
                    value={endDate}
                    onChange={(newVal) => {
                      if (readOnly) return;
                      const s = getValues(nameStart) ? coerceDayjs(getValues(nameStart), null) : null;
                      if (!s) return;
                      let e = coerceDayjs(newVal, null);
                      if (!e || !e.isAfter(s)) {
                        e = s.add(1, 'day');
                      }
                      const sStr = s.format('YYYY-MM-DD');
                      const eStr = e.format('YYYY-MM-DD');
                      setValue(nameStart, sStr, { shouldValidate: true, shouldDirty: true });
                      setValue(nameEnd, eStr, { shouldValidate: true, shouldDirty: true });
                      onChange(`${sStr}|${eStr}`);
                      if (typeof onRangeCommit === 'function') onRangeCommit({ startDate: s, endDate: e });
                    }}
                    disablePast
                    minDate={startDate ? startDate.add(1, 'day') : today.add(1, 'day')}
                    maxDate={maxDate ? dayjs(maxDate) : undefined}
                    shouldDisableDate={internalShouldDisableEnd}
                    format="DD-MM-YYYY"
                  />
                </Box>
              </Box>
            </LocalizationProvider>
          );
        }}
      />
    </Box>
  );
}
