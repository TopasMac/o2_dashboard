import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';

/**
 * useUnitCalendarAvailability
 *
 * Fetches merged unit calendar events and classifies them into:
 * - hard conflicts (no override)   => hardBlock === true OR hardBlock missing
 * - soft warnings  (override ok)   => hardBlock === false
 *
 * The backend endpoint is:
 *   GET /api/units/:unitId/calendar?merge=1&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export default function useUnitCalendarAvailability({
  unitId,
  from,
  to,
  merge = 1,
  excludeBookingId = 0,
  enabled = true,
  debounceMs = 250,
} = {}) {
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [unitCalendarEvents, setUnitCalendarEvents] = useState([]);
  const [hardConflicts, setHardConflicts] = useState([]);
  const [softWarnings, setSoftWarnings] = useState([]);

  const timerRef = useRef(null);
  const lastKeyRef = useRef('');

  const isHard = useCallback((ev) => {
    if (!ev || !ev.type || ev.type === 'Available') return false;
    if (ev.hardBlock === true) return true;
    if (ev.hardBlock === false) return false;
    // Backward compatible default: if hardBlock is missing, treat as hard.
    return true;
  }, []);

  const fetchCalendar = useCallback(async () => {
    if (!enabled || !unitId || !from || !to) {
      setCalendarLoading(false);
      setCalendarError('');
      setUnitCalendarEvents([]);
      setHardConflicts([]);
      setSoftWarnings([]);
      return;
    }

    const key = `${unitId}|${from}|${to}|${merge}|${excludeBookingId || 0}`;
    if (lastKeyRef.current === key) {
      return; // avoid duplicate fetches for same params
    }
    lastKeyRef.current = key;

    setCalendarLoading(true);
    setCalendarError('');

    try {
      const params = { merge, from, to };
      if (excludeBookingId) {
        params.excludeBookingId = excludeBookingId;
      }

      const res = await api.get(`/api/units/${unitId}/calendar`, {
        params,
      });

      const items = Array.isArray(res.data)
        ? res.data
        : (res.data?.member || res.data?.['hydra:member'] || []);

      const clean = (items || []).filter((ev) => ev && ev.start && ev.end);
      const notAvailable = clean.filter((ev) => ev && ev.type && ev.type !== 'Available');

      const hard = notAvailable.filter(isHard);
      const soft = notAvailable.filter((ev) => !isHard(ev));

      setUnitCalendarEvents(clean);
      setHardConflicts(hard);
      setSoftWarnings(soft);
    } catch (e) {
      console.error('[useUnitCalendarAvailability] load unit calendar failed', e);
      setCalendarError('Could not load calendar for this unit');
      setUnitCalendarEvents([]);
      setHardConflicts([]);
      setSoftWarnings([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [enabled, unitId, from, to, merge, excludeBookingId, isHard]);

  // Debounced effect
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Reset immediately when inputs are missing
    if (!enabled || !unitId || !from || !to) {
      setCalendarLoading(false);
      setCalendarError('');
      setUnitCalendarEvents([]);
      setHardConflicts([]);
      setSoftWarnings([]);
      return;
    }

    timerRef.current = setTimeout(() => {
      fetchCalendar();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, unitId, from, to, merge, excludeBookingId, debounceMs, fetchCalendar]);

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

  /**
   * shouldDisableCalendarDate
   *
   * Accepts a Dayjs object (from MUI DatePicker callbacks) and returns true
   * only if the date falls inside a HARD block range.
   */
  const shouldDisableCalendarDate = useCallback(
    (day) => {
      if (!day || !unitId || !Array.isArray(unitCalendarEvents) || unitCalendarEvents.length === 0) {
        return false;
      }
      const y = day.year();
      const m = String(day.month() + 1).padStart(2, '0');
      const d = String(day.date()).padStart(2, '0');
      const ymd = `${y}-${m}-${d}`;

      return unitCalendarEvents.some((ev) => {
        if (!ev || !ev.type || ev.type === 'Available') return false;
        if (!ev.start || !ev.end) return false;

        // Only hard blocks disable; soft blocks allow override.
        const hard = ev.hardBlock === false ? false : true; // default hard if missing
        if (!hard) return false;

        return ymd >= ev.start && ymd <= ev.end;
      });
    },
    [unitId, unitCalendarEvents],
  );

  const refreshCalendar = useCallback(() => {
    // allow re-fetch even with same params
    lastKeyRef.current = '';
    fetchCalendar();
  }, [fetchCalendar]);

  return {
    calendarLoading,
    calendarError,

    unitCalendarEvents,
    hardConflicts,
    softWarnings,
    warningBreakdown,

    shouldDisableCalendarDate,
    refreshCalendar,
  };
}