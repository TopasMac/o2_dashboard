import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  CircularProgress,
  Button,
  Stack,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import api from '../../api';
import './MobileBookingsCalendar.css';
import MobileFormDrawer from '../../components/common/mobile/MobileFormDrawer';
import BookingEditFormRHF from '../../components/forms/BookingEditFormRHF';
import useCurrentUserAccess from '../../hooks/useCurrentUserAccess';
import AppDrawer from '../../components/common/AppDrawer';
import BookingNewFormRHF from '../../components/forms/BookingNewFormRHF';
import BlockCalFormRHF from '../../components/forms/BlockCalFormRHF';
import BlockCalEditFormRHF from '../../components/forms/BlockCalEditFormRHF';

import MobileShell from './MobileShell';

/**
 * MobileBookingsCalendar
 * - Focused mobile-first calendar for a single Unit + Month
 * - Shows CONFIRMED bookings only (no daily rates)
 * - Filters: Unit (autocomplete), Month/Year with arrows
 */
export default function MobileBookingsCalendar() {
  // --- URL state
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search));
  const getParam = (k, d = '') => search.get(k) || d;

  const { isAdmin, isManager, isSupervisor } = useCurrentUserAccess();
  const canOpenBookingDetails = isAdmin || isManager;
  const canSeePayout = isAdmin || isManager; // supervisors can view calendar but not payouts
  const canCreateItems = isAdmin || isManager;

  // --- Filters
  const [unit, setUnit] = useState(() => {
    const id = getParam('unitId', '');
    const name = getParam('unitName', '');
    return id ? { id: Number(id), name } : null;
  });

  // --- Units options
  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // --- Bookings for current unit+month
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const FORM_ID = 'booking-edit-form';

  // --- Create flow (New Booking / New Block/Hold) ---
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState('choose'); // 'choose' | 'booking' | 'block'
  const [createUnit, setCreateUnit] = useState(null);
  const [createDate, setCreateDate] = useState(null);

  const fmtDate = (d) => {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fmtDisplayDate = (d) =>
    d instanceof Date && !isNaN(d) ? d.toLocaleDateString() : '';

  const addDays = (d, n) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  const resetCreateDrawer = () => {
    setCreateOpen(false);
    setCreateStep('choose');
    setCreateUnit(null);
    setCreateDate(null);
  };

  const openCreate = (unitOption, date) => {
    if (!canCreateItems) return; // only Admin/Manager can create
    setCreateUnit(unitOption || null);
    setCreateDate(date || null);
    setCreateStep('choose');
    setCreateOpen(true);
  };

  // --- Availability (UnitCalendarController) for the form date pickers
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [disabledDates, setDisabledDates] = useState(() => new Set());
  // --- Helpers for Unit Calendar availability ---
  const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const loadUnitCalendar = useCallback(async (monthDate) => {
    if (!unit?.id) return;
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    setCalendarLoading(true);
    try {
      const res = await api.get('/api/ical/unit-calendar', {
        params: { unitId: unit.id, start: toYMD(start), end: toYMD(end) }
      });
      const payload = res.data?.data || res.data || [];
      const blocked = new Set();
      const pushRange = (s, e) => {
        const sd = parseYMDUtc(String(s).slice(0,10));
        const ed = parseYMDUtc(String(e).slice(0,10));
        if (!sd || !ed) return;
        for (let d = new Date(sd); d <= ed; d.setDate(d.getDate()+1)) {
          blocked.add(toYMD(d));
        }
      };
      if (Array.isArray(payload)) {
        for (const item of payload) {
          if (typeof item === 'string') {
            blocked.add(String(item).slice(0,10));
          } else if (item && typeof item === 'object') {
            if (item.date && (item.available === false || item.isAvailable === false || item.blocked === true)) {
              blocked.add(String(item.date).slice(0,10));
            } else if (item.start && item.end) {
              pushRange(item.start, item.end);
            }
          }
        }
      } else if (payload && typeof payload === 'object') {
        // common shapes: { unavailable: [...dates] } or { busy: [{start,end}, ...] }
        if (Array.isArray(payload.unavailable)) {
          for (const d of payload.unavailable) blocked.add(String(d).slice(0,10));
        }
        if (Array.isArray(payload.busy)) {
          for (const rng of payload.busy) pushRange(rng.start, rng.end);
        }
      }
      setDisabledDates(blocked);
    } catch (e) {
      setDisabledDates(new Set()); // fail open
    } finally {
      setCalendarLoading(false);
    }
  }, [unit?.id]);

  // Predicate for the form date pickers
  const shouldDisableDate = useCallback((day) => {
    try {
      const ymd = toYMD(day instanceof Date ? day : new Date(day));
      return disabledDates.has(ymd);
    } catch(_) { return false; }
  }, [disabledDates]);

  // When the month changes in the picker, refetch that month
  const onMonthChange = useCallback((newMonth) => {
    if (!newMonth) return;
    const d = new Date(newMonth);
    if (!isNaN(d)) loadUnitCalendar(d);
  }, [loadUnitCalendar]);
  // Fetch availability when the drawer opens (use the booking’s check-in month or current month)
  useEffect(() => {
    if (!drawerOpen) return;
    const base = selectedBooking?.check_in ? new Date(selectedBooking.check_in) : new Date();
    if (!isNaN(base)) loadUnitCalendar(base);
  }, [drawerOpen, selectedBooking?.check_in, loadUnitCalendar]);

  // --- Load bookings for this unit (extracted for reuse) ---
  const loadBookings = useCallback(async () => {
    if (!unit?.id) return;
    let mounted = true;
    setLoading(true); setError('');
    try {
      const res = await api.get('/api/bookings-timeline', {
        params: {
          unitId: unit.id,
          // Rely on backend defaults for date window and status,
          // just like the desktop timeline does.
        }
      });

      const rows = Array.isArray(res.data) ? res.data : (res.data?.rows || []);
      const mapped = rows.map((r) => {
        const guestType = r.guest_type || r.guestType || '';
        const gtLower = String(guestType || '').toLowerCase();

        let normalizedSource = r.source_normalized || r.source || '';
        let srcLower = String(normalizedSource || '').toLowerCase();

        let isHold = r.is_hold === 1 || r.is_hold === true;
        let isBlock = r.is_block === 1 || r.is_block === true;

        // Derive from guest_type when source is empty or Owners2
        if (!normalizedSource || srcLower === 'owners2') {
          if (gtLower === 'hold') {
            normalizedSource = 'Hold';
            srcLower = 'hold';
            isHold = true;
          } else if (gtLower === 'block') {
            normalizedSource = 'Block';
            srcLower = 'block';
            isBlock = true;
          }
        }

        // Also derive from source itself if it already says Hold/Block
        if (srcLower === 'hold') {
          isHold = true;
        } else if (srcLower === 'block') {
          isBlock = true;
        }

        return {
          id: r.id,
          guest: r.guest || r.guest_name || '',
          guest_name: r.guest_name || r.guest || '',
          code: r.confirmation_code || r.reservation_code || r.code || '',
          check_in: r.check_in || r.start || r.from,
          check_out: r.check_out || r.end || r.to,
          booking_date: r.booking_date || r.bookingDate || null,
          status: r.status || 'confirmed',
          source: r.source || '',
          is_hold: isHold,
          is_block: isBlock,
          source_normalized: normalizedSource,
          payout: r.payout ?? null,
          guests: r.guests ?? r.num_guests ?? null,
          unit_id: r.unit_id ?? null,
          unit_name: r.unit_name ?? '',
          payment_method: r.payment_method ?? '',
          is_paid: r.is_paid ?? 0,
          cleaning_fee: r.cleaning_fee ?? null,
          commission_percent: r.commission_percent ?? null,
          notes: r.notes ?? '',
          check_in_notes: r.check_in_notes ?? '',
          check_out_notes: r.check_out_notes ?? '',
          hold_expires_at: r.hold_expires_at || r.holdExpiresAt || null,
          hold_policy: r.hold_policy || r.holdPolicy || '',
        };
      });
      if (mounted) setBookings(mapped);
    } catch (e) {
      if (mounted) setError('Failed to load bookings');
    } finally {
      if (mounted) setLoading(false);
    }
    return () => { mounted = false; };
  }, [unit?.id]);

  // Load units (simple options list: id,label)
  useEffect(() => {
    let mounted = true;
    const loadUnits = async () => {
      setLoadingUnits(true);
      try {
        // Reuse existing employees/options-like endpoint pattern if you have one for units
        const res = await api.get('/api/units/options');
        const list = Array.isArray(res.data) ? res.data : (res.data?.rows || []);
        const mapped = list.map((u) => ({
          id: u.id ?? u.value,
          name: u.unit_name ?? u.name ?? u.label ?? u.code ?? '',
          city: u.city ?? ''
        }));
        if (mounted) setUnits(mapped);
      } catch (e) {
        if (mounted) setUnits([]);
      } finally {
        if (mounted) setLoadingUnits(false);
      }
    };
    loadUnits();
    return () => { mounted = false; };
  }, []);

  // Sync URL whenever filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (unit?.id) {
      params.set('unitId', String(unit.id));
      params.set('unitName', unit.name || '');
    }
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', newUrl);
    setSearch(new URLSearchParams(qs));
  }, [unit]);

  // Load bookings for this unit+month (CONFIRMED only)
  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Build a map of bookings for quick overlap check
  const activeBookings = bookings.filter((b) => (b.status || '').toLowerCase() !== 'cancelled');

  const handleOpenBooking = (bookingId) => {
    const booking = activeBookings.find((b) => b.id === bookingId);
    if (booking) {
      setSelectedBooking(booking);
      setDrawerOpen(true);
    }
  };
  const handleCloseDrawer = () => setDrawerOpen(false);

  // --- Form drawer submit handlers to refresh calendar and show feedback ---
  const handleSubmitSuccess = () => {
    // Refresh bookings after a successful save
    loadBookings();
  };
  const handleSubmitError = (err) => {
    // Basic feedback; replace with toast if available
    console.error('Save failed', err);
    if (typeof window !== 'undefined') {
      window.alert('Failed to save booking. Please try again.');
    }
  };

  // Rolling window months: 2 back, 6 ahead (inclusive)
  const windowMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    const firstOfThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(firstOfThis.getFullYear(), firstOfThis.getMonth() - 2, 1);
    const end = new Date(firstOfThis.getFullYear(), firstOfThis.getMonth() + 6, 1);
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      months.push(new Date(d));
    }
    return months;
  }, []);

  // Refs to month containers so we can scroll current month into view on load
  const monthRefs = useRef({});
  const currentMonthKey = `${new Date().getFullYear()}-${new Date().getMonth()}`; // e.g., 2025-9
  const scrollToMonthKeyRef = useRef(null);
  const didInitialAutoScrollRef = useRef(true);

  // Auto-scroll to current month on load (or when unit/bookings change)
  useEffect(() => {
    const key = scrollToMonthKeyRef.current || currentMonthKey;
    const el = monthRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: didInitialAutoScrollRef.current ? 'auto' : 'smooth', block: 'start' });
      didInitialAutoScrollRef.current = false;
    }
    // reset target so future loads default to current month
    scrollToMonthKeyRef.current = null;
  }, [unit?.id, bookings.length]);


  // --- Mapper: API booking to form initial values, resolving unit to option object
  const mapApiBookingToFormInitials = (b = {}, units = []) => {
    const unitOption = units.find(u => (
      (b.unit_id != null && u.id === b.unit_id) ||
      (b.unit_name && u.name && u.name.toLowerCase() === String(b.unit_name).toLowerCase())
    )) || null;

    return {
      id: b.id ?? null,
      unitId: b.unit_id ?? unitOption?.id ?? null,
      status: b.status ?? '',
      source: b.source ?? '',

      // Guest & guests count
      guestName: b.guest_name ?? b.guest ?? '',
      guests: b.guests != null ? Number(b.guests) : 0,

      // Dates
      checkIn: b.check_in ?? '',
      checkOut: b.check_out ?? '',

      // Money / numbers (camelCase expected by form)
      payout: b.payout != null ? Number(b.payout) : 0,
      cleaningFee: b.cleaning_fee != null ? String(b.cleaning_fee) : '',
      commissionPercent: b.commission_percent != null ? String(b.commission_percent) : '',

      // Payment / paid
      isPaid: b.is_paid === 1 || b.is_paid === true,
      paymentMethod: b.payment_method ?? '',

      // Notes
      notes: b.notes ?? '',
      checkInNotes: b.check_in_notes ?? '',
      checkOutNotes: b.check_out_notes ?? '',

      // (Optionally keep snake_case aliases for compatibility)
      check_in: b.check_in ?? '',
      check_out: b.check_out ?? '',
      cleaning_fee: b.cleaning_fee != null ? String(b.cleaning_fee) : '',
      commission_percentage: b.commission_percent != null ? String(b.commission_percent) : '',
      payment_method: b.payment_method ?? '',
      is_paid: b.is_paid === 1 || b.is_paid === true ? 1 : 0,
      guest_name: b.guest_name ?? b.guest ?? '',
    };
  };

  // Memoized options for BookingEditFormRHF
  const unitOptionsForForm = useMemo(() => (
    Array.isArray(units) ? units.map(u => ({ id: u.id, label: u.name || '' })) : []
  ), [units]);

  // --- Mapper: Form values to API payload ---
  const mapFormToApi = (v = {}) => ({
    unit_id: v.unitId ?? null,
    status: v.status ?? '',
    source: v.source ?? '',
    guest_name: v.guestName ?? v.guest_name ?? '',
    check_in: v.checkIn ?? v.check_in ?? '',
    check_out: v.checkOut ?? v.check_out ?? '',
    payout: v.payout != null ? Number(v.payout) : 0,
    is_paid: v.isPaid ? 1 : 0,
    payment_method: v.paymentMethod ?? v.payment_method ?? '',
    cleaning_fee: v.cleaningFee != null ? Number(v.cleaningFee) : (v.cleaning_fee != null ? Number(v.cleaning_fee) : 0),
    commission_percent: v.commissionPercent != null ? Number(v.commissionPercent) : (v.commission_percentage != null ? Number(v.commission_percentage) : 0),
    notes: v.notes ?? '',
    check_in_notes: v.checkInNotes ?? v.check_in_notes ?? '',
    check_out_notes: v.checkOutNotes ?? v.check_out_notes ?? '',
    guests: v.guests != null ? Number(v.guests) : null,
  });

  // --- Edit drawer: choose form/component based on booking type (normal vs block/hold) ---
  const isSelectedHold = !!selectedBooking?.is_hold;
  const isSelectedBlock = !!selectedBooking?.is_block;
  const editIsBlockHold = isSelectedHold || isSelectedBlock;

  const editFormId = editIsBlockHold ? 'block-cal-edit-form-mobile-edit' : FORM_ID;

  const editFormProps = editIsBlockHold
    ? {
        formId: editFormId,
        initialValues: selectedBooking
          ? (() => {
              if (isSelectedHold) {
                // Hold edit initial values
                return {
                  id: selectedBooking.id,
                  unitId: selectedBooking.unit_id ?? null,
                  unitName: selectedBooking.unit_name ?? '',
                  type: 'Hold',
                  status: selectedBooking.status || 'Active',
                  guestName: selectedBooking.guest_name || '',
                  guestType: 'Hold',
                  checkIn: selectedBooking.check_in || '',
                  checkOut: selectedBooking.check_out || '',
                  payout: selectedBooking.payout ?? '',
                  paymentMethod: selectedBooking.payment_method || '',
                  holdPolicy: selectedBooking.hold_policy || '',
                  holdExpiresAt: selectedBooking.hold_expires_at || '',
                  notes: selectedBooking.notes || '',
                  bookingDate: selectedBooking.booking_date || selectedBooking.bookingDate || '',
                };
              }
              // Block edit initial values
              return {
                id: selectedBooking.id,
                unitId: selectedBooking.unit_id ?? null,
                unitName: selectedBooking.unit_name ?? '',
                type: 'Block',
                status: selectedBooking.status || 'Active',
                reason: selectedBooking.guest_name || 'Other',
                start: selectedBooking.check_in || '',
                end: selectedBooking.check_out || '',
                notes: selectedBooking.notes || '',
                bookingDate: selectedBooking.booking_date || selectedBooking.bookingDate || '',
              };
            })()
          : {},
        onSubmit: async (out) => {
          try {
            const id = selectedBooking?.id;
            if (!id) throw new Error('Missing booking id');
            await api.put(`/api/bookings/${id}`, out, {
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            });
            handleSubmitSuccess();
            setDrawerOpen(false);
          } catch (err) {
            handleSubmitError(err);
          }
        },
        onCancel: handleCloseDrawer,
        submitLabel: 'Save',
      }
    : {
        formId: FORM_ID,
        layout: 'mobile',
        initialValues: selectedBooking ? mapApiBookingToFormInitials(selectedBooking, units) : {},
        unitOptions: unitOptionsForForm,
        onSubmit: async (values) => {
          try {
            const id = selectedBooking?.id;
            const payload = mapFormToApi(values);
            // After save, scroll back to the edited booking's month (based on check-in)
            const ci = values?.checkIn || values?.check_in;
            if (ci) {
              const d = new Date(ci);
              if (!isNaN(d)) {
                scrollToMonthKeyRef.current = `${d.getFullYear()}-${d.getMonth()}`;
              }
            }
            await api.put(`/api/bookings/${id}`, payload, {
              headers: { 'Content-Type': 'application/json' },
            });
            handleSubmitSuccess(); // refresh
            setDrawerOpen(false); // close
          } catch (err) {
            handleSubmitError(err);
          }
        },
        shouldDisableDate,
        onMonthChange,
        calendarLoading,
      };

  const unitFilter = (
    <Box className="mbc-filter-bar" sx={{ mt: '0px' }}>
      <Box className="grow" sx={{ minWidth: 0 }}>
        <Autocomplete
          loading={loadingUnits}
          disablePortal
          slotProps={{
            popper: {
              className: 'mbc-unit-popper',
              strategy: 'fixed',
              modifiers: [
                { name: 'offset', options: { offset: [0, 4] } },
                { name: 'preventOverflow', options: { padding: 8 } },
              ],
            },
            paper: { sx: { mt: 0, p: 0 } },
            listbox: { sx: { py: 0, my: 0 } },
          }}
          options={units}
          value={unit}
          onChange={(e, v) => setUnit(v)}
          getOptionLabel={(o) => o?.name || ''}
          renderOption={(props, option) => (
            <li
              {...props}
              style={{
                minHeight: 34,
                paddingTop: 4,
                paddingBottom: 4,
              }}
            >
              {option?.name || ''}
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Unit"
              size="small"
              placeholder="Search unit…"
              sx={{
                backgroundColor: '#ffffff',
                borderRadius: 1,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#ffffff',
                },
                '& .MuiInputLabel-root': {
                  color: '#374151', /* gray-700 */
                },
              }}
            />
          )}
        />
      </Box>
      {/* Future buttons will go here */}
    </Box>
  );

  return (
    <MobileShell
      title="Bookings"
      stickyContent={unitFilter}
    >
      <div id="mobile-bookings-calendar">
        <Box sx={{ p: 0 }}>
          {/* Calendar months stack (scrollable) */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>
          ) : (
            <Box sx={{ pb: 2 }}>
              {windowMonths.map((mDate, mi) => {
                const days = buildMonthGrid(mDate);
                const barSegments = buildSegmentsForDays(days, activeBookings);
                return (
                  <Box
                    key={`month-${mDate.getFullYear()}-${mDate.getMonth()}`}
                    ref={(el) => {
                      if (el) {
                        monthRefs.current[`${mDate.getFullYear()}-${mDate.getMonth()}`] = el;
                      }
                    }}
                    sx={{ mb: 3, scrollMarginTop: '72px' }}
                  >
                    {/* Month header */}
                    <Box className="mbc-sticky">
                      <Typography variant="h6" className="mbc-month-title">
                        {formatMonthTitle(mDate)}
                      </Typography>
                    </Box>

                    {/* Weekday row */}
                    <Box className="mbc-weekdays">
                      {['S','M','T','W','T','F','S'].map((d, idx) => (
                        <Typography key={`${d}-${idx}`} className="wd">{d}</Typography>
                      ))}
                    </Box>

                    {/* Days grid + overlay */}
                    <Box className="mbc-grid">
                      {days.map((day, idx) => (
                        <DayCell
                          key={idx}
                          day={day}
                          bookings={activeBookings}
                          canCreateItems={canCreateItems}
                          onDayClick={(date) => {
                            if (unit && unit.id) {
                              openCreate(unit, date);
                            }
                          }}
                        />
                      ))}
                      <Box className="mbc-bars-layer" sx={{ gridTemplateRows: `repeat(${barSegments.numWeeks || 0}, 1fr)` }}>
                        {(barSegments.segments || []).map((seg, i) => {
                          const spanCols = Math.max(1, seg.colEnd - seg.colStart);
                          const startInset = seg.isFirst ? `${40 / spanCols}%` : undefined; // half of one column
                          const endInset = seg.isLast ? `${60 / spanCols}%` : undefined;   // slightly shorter end for checkout day
                          return (
                            <Box
                              key={`seg-${mi}-${seg.id}-${i}`}
                              className={`mbc-bar${seg.isHold ? ' hold' : ''}${seg.isBlock ? ' block' : ''}`}
                              onClick={() => {
                                if (canOpenBookingDetails) {
                                  handleOpenBooking(seg.id);
                                }
                              }}
                              sx={{
                                backgroundColor: seg.color,
                                gridColumn: `${seg.colStart} / ${seg.colEnd}`,
                                gridRow: `${seg.row} / ${seg.row}`,
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: '8px',
                                paddingRight: '6px',
                                color: seg.isHold ? '#111827' : '#fff',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                cursor: canOpenBookingDetails ? 'pointer' : 'default',
                                ...(startInset ? { marginLeft: startInset } : {}),
                                ...(endInset ? { marginRight: endInset } : {}),
                              }}
                            >
                              {(() => {
                                if (!seg.isFirst) return null;
                                const booking = activeBookings.find((b) => b.id === seg.id);
                                if (!booking) return null;

                                const guestName = booking.guest_name || booking.guest || '';
                                const firstName = (guestName || '').split(' ')[0] || '';

                                // Compute nights from check-in/out
                                const ci = booking.check_in ? parseYMDUtc(String(booking.check_in).slice(0, 10)) : null;
                                const co = booking.check_out ? parseYMDUtc(String(booking.check_out).slice(0, 10)) : null;
                                let nights = 1;
                                if (ci && co) {
                                  nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24)));
                                }
                                const nightsPart = `${nights}n`;

                                if (booking.is_hold) {
                                  // HOLD bars: [icon] dd/mm HH:MM • policy (no year) + optional notes icon/text
                                  const holdExpiresRaw = booking.hold_expires_at || booking.holdExpiresAt;
                                  let holdExpiresLabel = '';
                                  if (holdExpiresRaw) {
                                    const str = String(holdExpiresRaw).replace('T', ' ');
                                    const [datePart, timeFull] = str.trim().split(/\s+/);
                                    if (datePart) {
                                      const [y, m, d] = datePart.split('-').map(Number);
                                      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
                                        const dd = String(d).padStart(2, '0');
                                        const mm = String(m).padStart(2, '0');
                                        const timeShort = (timeFull || '').slice(0, 5); // HH:MM
                                        holdExpiresLabel = timeShort
                                          ? `${dd}/${mm} ${timeShort}`
                                          : `${dd}/${mm}`;
                                      } else {
                                        holdExpiresLabel = datePart;
                                      }
                                    } else {
                                      holdExpiresLabel = str;
                                    }
                                  }

                                  const holdPolicyLabel = booking.hold_policy || booking.holdPolicy || '';
                                  const notesStr = (booking.notes || '').trim();
                                  const parts = [];
                                  if (holdExpiresLabel) parts.push(holdExpiresLabel);
                                  if (holdPolicyLabel) parts.push(holdPolicyLabel);
                                  const text = parts.length > 0 ? parts.join(' \u2022 ') : 'Hold';

                                  return (
                                    <>
                                      <span className="mbc-hold-icon" aria-hidden="true">
                                        &#x23f1;
                                      </span>
                                      <span>{truncate(text, notesStr ? 26 : 32)}</span>
                                      {notesStr && (
                                        <span
                                          style={{
                                            marginLeft: 4,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 2,
                                          }}
                                        >
                                          <span className="mbc-notes-icon" aria-hidden="true">✎</span>
                                          <span>{truncate(notesStr, 18)}</span>
                                        </span>
                                      )}
                                    </>
                                  );
                                }

                                if (booking.is_block) {
                                  // Blocks: [icon] guest_name • notes (if any)
                                  const notesStr = (booking.notes || '').trim();
                                  const parts = [];
                                  if (guestName) parts.push(guestName);
                                  if (notesStr) parts.push(notesStr);
                                  const text = parts.length > 0 ? parts.join(' • ') : 'Block';
                                  return (
                                    <>
                                      <span className="mbc-block-icon" aria-hidden="true">⨂</span>
                                      <span>{truncate(text, 32)}</span>
                                    </>
                                  );
                                }

                                // Non-hold: GuestFirstName • 3n • $Amount (Admin/Manager only for payout)
                                const payoutStr =
                                  canSeePayout && typeof booking.payout === 'number'
                                    ? ` • $${booking.payout.toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}`
                                    : '';

                                const baseText = firstName ? `${firstName} • ${nightsPart}` : nightsPart;
                                const finalText = `${baseText}${payoutStr}`;

                                return truncate(finalText, 32);
                              })()}
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </div>

      <MobileFormDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        onSubmitSuccess={handleSubmitSuccess}
        onSubmitError={handleSubmitError}
        title={editIsBlockHold ? 'Edit Block/Hold' : 'Edit Reservation'}
        componentKey={selectedBooking ? `booking-${selectedBooking.id}` : 'booking-new'}
        FormComponent={editIsBlockHold ? BlockCalEditFormRHF : BookingEditFormRHF}
        formId={editFormId}
        formProps={editFormProps}
      />

      {canCreateItems && (
        <AppDrawer
          open={createOpen}
          onClose={resetCreateDrawer}
          title={
            createStep === 'choose'
              ? (createUnit?.name ? `Add item — ${createUnit.name}` : 'Add item')
              : createStep === 'booking'
              ? (createUnit?.name ? `New Booking — ${createUnit.name}` : 'New Booking')
              : (createUnit?.name ? `New Block/Hold — ${createUnit.name}` : 'New Block/Hold')
          }
          width={560}
          showActions={createStep !== 'choose'}
          formId={
            createStep === 'booking'
              ? 'booking-new-form-mobile'
              : createStep === 'block'
              ? 'block-cal-form-mobile'
              : undefined
          }
        >
          {createStep === 'choose' && (
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                {createUnit?.name || 'Select unit'}
              </Typography>
              {createDate && (
                <Typography variant="body2" color="text.secondary">
                  {fmtDisplayDate(createDate)}
                </Typography>
              )}
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={() => setCreateStep('booking')}>
                  New Booking
                </Button>
                <Button variant="outlined" onClick={() => setCreateStep('block')}>
                  New Block/Hold
                </Button>
              </Stack>
            </Stack>
          )}
          {createStep === 'booking' && (
            <BookingNewFormRHF
              formId="booking-new-form-mobile"
              layout="mobile"
              unitOptions={unitOptionsForForm}
              initialUnit={
                createUnit
                  ? { id: createUnit.id, label: createUnit.name, city: createUnit.city }
                  : null
              }
              initialCheckIn={createDate ? fmtDate(createDate) : ''}
              initialCheckOut={createDate ? fmtDate(addDays(createDate, 1)) : ''}
              onSaved={async () => {
                await loadBookings();
                resetCreateDrawer();
              }}
              onCancel={resetCreateDrawer}
            />
          )}
          {createStep === 'block' && (
            <BlockCalFormRHF
              formId="block-cal-form-mobile"
              initialType="Hold"
              unitOptions={unitOptionsForForm}
              defaultUnitId={createUnit?.id || null}
              defaultUnitName={createUnit?.name || ''}
              initialStartDate={createDate ? fmtDate(createDate) : ''}
              initialEndDate={createDate ? fmtDate(addDays(createDate, 1)) : ''}
              shouldDisableDate={shouldDisableDate}
              onMonthChange={onMonthChange}
              onSuccess={async () => {
                await loadBookings();
                resetCreateDrawer();
              }}
              onCancel={resetCreateDrawer}
            />
          )}
        </AppDrawer>
      )}
    </MobileShell>
  );
}

// --- Day Cell ---
function DayCell({ day, bookings, onDayClick, canCreateItems }) {
  const isCurrentMonth = day.inMonth;
  const label = day.date.getDate();
  const ymd = toISODate(day.date);

  const triggerCreate = () => {
    if (!canCreateItems || !day?.date || !day.inMonth) return;
    if (typeof onDayClick === 'function') {
      onDayClick(day.date);
    }
  };

  // Find bookings that cover this day
  const items = useMemo(() => {
    return bookings.filter((b) => covers(b, ymd));
  }, [bookings, day.date]);

  return (
    <Box
      className={`mbc-day${isCurrentMonth ? '' : ' dim'}`}
      onClick={(e) => {
        e.stopPropagation();
        triggerCreate();
      }}
      sx={{ cursor: canCreateItems && isCurrentMonth ? 'pointer' : 'default' }}
    >
      <Typography className="label">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }} />
    </Box>
  );
}

// --- Utils ---
function parseYMDUtc(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfWeek(d) {
  const day = d.getDay(); // 0=Sun
  const diff = day; // start on Sunday
  const res = new Date(d);
  res.setDate(d.getDate() - diff);
  res.setHours(0,0,0,0);
  return res;
}
function endOfWeek(d) {
  const start = startOfWeek(d);
  const res = new Date(start);
  res.setDate(start.getDate() + 6);
  res.setHours(0,0,0,0);
  return res;
}
function buildMonthGrid(monthDate) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const gridStart = startOfWeek(start);
  const gridEnd = endOfWeek(end);
  const days = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    days.push({ date: new Date(cur), inMonth: cur.getMonth() === monthDate.getMonth() });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function covers(b, ymd) {
  // inclusive check-in, exclusive check-out is common; we make it exclusive on checkout
  const s = (b.check_in || '').slice(0, 10);
  const e = (b.check_out || '').slice(0, 10);
  if (!s || !e) return false;
  return s <= ymd && ymd < e; // exclusive checkout
}
function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function formatMonthTitle(d) {
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  const year = d.getFullYear();
  return `${capitalize(month)} ${year}`;
}
function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1); }
function getBookingColor(b) {
  if (!b) return '#64748B';        // slate-500 default
  if (b.is_block) return '#6B7280'; // gray-500 for Blocks
  if (b.is_hold)  return '#FBBF24'; // amber/yellow for Holds
  const src = (b.source_normalized || b.source || '').toLowerCase();
  if (src === 'airbnb')  return '#FF385C'; // Airbnb brand
  if (src === 'private') return '#1E6F68'; // Teal brand for Private
  return '#64748B'; // fallback
}
// Build bar segments for a month's day grid
function buildSegmentsForDays(days, activeBookings) {
  if (!days?.length) return { segments: [], numWeeks: 0 };
  const gridStart = parseYMDUtc(toISODate(days[0].date));
  const numWeeks = Math.ceil(days.length / 7);
  const toDayIndex = (dateStr) => {
    const d = parseYMDUtc(dateStr);
    const diffMs = d.getTime() - gridStart.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };
  const segments = [];
  for (const b of activeBookings) {
    const s = (b.check_in || '').slice(0,10);
    const e = (b.check_out || '').slice(0,10);
    if (!s || !e) continue;
    const startIdx = Math.max(0, toDayIndex(s));
    const endIdxExcl = Math.min(days.length, toDayIndex(e));
    if (endIdxExcl <= 0 || startIdx >= days.length || startIdx >= endIdxExcl) continue;
    let cur = startIdx;
    while (cur < endIdxExcl) {
      const row = Math.floor(cur / 7) + 1;
      const rowEnd = Math.min(endIdxExcl, (row * 7));
      const colStart = (cur % 7) + 1;
      const rawEnd = (rowEnd % 7 === 0 ? 8 : (rowEnd % 7) + 1); // grid line at START of checkout day
      const isLastSegment = (rowEnd === endIdxExcl);
      const naturalColEnd = isLastSegment ? Math.min(rawEnd + 1, 8) : rawEnd; // include checkout day for last seg

      // Single segment; mark first row to indent visually later
      const isFirst = (cur === startIdx);
      segments.push({
        id: b.id,
        row,
        colStart,
        colEnd: naturalColEnd,
        source: (b.source || '').toLowerCase(),
        color: getBookingColor(b),
        isLast: isLastSegment,
        isFirst,
        isHold: !!b.is_hold,
        isBlock: !!b.is_block,
      });
      cur = rowEnd;
    }
  }
  return { segments, numWeeks };
}