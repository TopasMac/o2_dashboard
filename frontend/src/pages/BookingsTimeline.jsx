import React, { useMemo, useEffect, useState, useRef } from 'react';
import './BookingsTimeline.css';
import { getBookingsTimeline } from '../api/bookingsTimeline';
import AppDrawer from '../components/common/AppDrawer';
import BookingEditFormRHF from '../components/forms/BookingEditFormRHF';
import BlockCalEditFormRHF from '../components/forms/BlockCalEditFormRHF';
import BookingNewFormRHF from '../components/forms/BookingNewFormRHF';
import BlockCalFormRHF from '../components/forms/BlockCalFormRHF';
import api from '../api';
import { Button, TextField, MenuItem, Stack, Typography, Autocomplete } from '@mui/material';
import PageScaffold from '../components/layout/PageScaffold';
import O2Tooltip from '../components/common/O2Tooltip';

/**
 * BookingsTimeline.jsx
 * Lightweight OSS timeline (no premium deps) using pure CSS Grid.
 * - One row per Unit (resource column at left)
 * - Columns for each day of the selected month
 * - Booking bars span check-in -> check-out
 *
 * Next steps (later): wire API data, tooltips, month/week switch, colors by source
 */

// ---- Helpers: date utils (native Date, no deps) ----
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0); // last day
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const isSameDay = (a, b) => a.toDateString() === b.toDateString();
const clampDate = (date, min, max) => (date < min ? min : date > max ? max : date);

// Returns array of Date objects for every day in [firstDay..lastDay]
function buildMonthDays(baseDate) {
  const first = startOfMonth(baseDate);
  const last = endOfMonth(baseDate);
  const days = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    days.push(new Date(d));
  }
  return days;
}

// Returns array of Date objects for every day in a continuous range
function buildDaysRange(startDate, totalDays) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const days = [];
  for (let i = 0; i < totalDays; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

// Parse 'YYYY-MM-DD' as a *local* date (no timezone shift)
function parseYMDLocal(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split('-').map((n) => Number(n));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Convert a date to column index inside the month (0-based)
function dayIndexInMonth(date, monthDays) {
  const first = monthDays[0];
  const diffMs = new Date(date).setHours(0, 0, 0, 0) - new Date(first).setHours(0, 0, 0, 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function buildDaysBetween(startDate, endDate) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const days = [];
  for (let d = new Date(start); d <= endDate; d = addDays(d, 1)) {
    days.push(new Date(d));
  }
  return days;
}

// Simple date-range overlap check: [start1, end1) vs [start2, end2)
function rangesOverlap(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

// Coerce various API shapes into a flat array
function coerceList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.member)) return value.member;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
}


// --- Added helpers for month formatting ---
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleString(undefined, { month: 'long', year: 'numeric' });

// Format a number as money: $1.234,56
function fmtMoney(val) {
  if (val == null || val === '') return '';
  const n = Number(val);
  if (!isFinite(n)) return '';
  const fixed = n.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${withDots},${dec}`;
}

const DAY_WIDTH = 80;
const RESOURCE_COL_WIDTH = 180;
const DAY_PARTS = 3;
const DAY_PART_WIDTH = DAY_WIDTH / DAY_PARTS;

export default function BookingsTimeline() {
  // Rolling window: include 1 month back through current month + 3 months
  const rangeEndInit = useMemo(() => endOfMonth(addMonths(new Date(), 3)), []);
  const rangeStartInit = useMemo(() => startOfMonth(addMonths(new Date(), -1)), []);
  const [viewStart, setViewStart] = useState(rangeStartInit);
  const [viewEnd, setViewEnd] = useState(rangeEndInit);
  const scrollRef = useRef(null);

  const [visibleMonth, setVisibleMonth] = useState(() => monthLabel(new Date()));

  const [searchTerm, setSearchTerm] = useState('');
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const [availCheckIn, setAvailCheckIn] = useState('');
  const [availCheckOut, setAvailCheckOut] = useState('');
  const [availCity, setAvailCity] = useState('All');
  const [availType, setAvailType] = useState('Any');
  const [availabilityFilter, setAvailabilityFilter] = useState(null);

  // Effect: On mount, read search from URL query string and initialize state if present
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('q');
      if (fromUrl) setSearchTerm(fromUrl);
    } catch {}
  }, []);

  // Effect: Write search to URL query string on change (without navigation)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (!searchTerm) params.delete('q'); else params.set('q', searchTerm);
      const qs = params.toString();
      const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } catch {}
  }, [searchTerm]);

  // Added handlers
  const handleToday = () => {
    const today = new Date();
    const begin = startOfMonth(addMonths(today, -1));
    const end = endOfMonth(addMonths(today, 3));
    setViewStart(begin);
    setViewEnd(end);
    // Clear any active search so the timeline looks like the initial load
    setSearchTerm('');
    // Clear any active availability filter and drawer fields
    setAvailabilityFilter(null);
    setAvailCheckIn('');
    setAvailCheckOut('');
    setAvailCity('All');
    setAvailType('Any');

    // After state updates, re-center the scroll so "today" is visible
    // Use the same math as the initial auto-scroll effect
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const newDays = buildDaysBetween(begin, end);
      const idx = newDays.findIndex((d) => isSameDay(d, today));
      if (idx < 0) return;
      const target = Math.max(0, RESOURCE_COL_WIDTH + ((idx - 3) * DAY_WIDTH));
      scrollRef.current.scrollLeft = target;
    });
  };

  const days = useMemo(() => buildDaysBetween(viewStart, viewEnd), [viewStart, viewEnd]);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  const [rawBookings, setRawBookings] = useState([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [editorKind, setEditorKind] = useState('booking'); // 'booking' | 'blockHold'
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState('choose'); // choose | booking | block
  const [createUnit, setCreateUnit] = useState(null);
  const [createDate, setCreateDate] = useState(null);
  const openEditor = (b) => {
    // Decide which editor to open based on Hold/Block flags
    const sourceClass = String(b.sourceNormalized || b.source || '').toLowerCase();
    const guestTypeLower = String(b.guestType || '').toLowerCase();
    const isHold = sourceClass === 'hold' || guestTypeLower === 'hold';
    const isBlock = sourceClass === 'block' || guestTypeLower === 'block';
    setSelectedBooking(b);
    setEditorKind(isHold || isBlock ? 'blockHold' : 'booking');
    setEditorOpen(true);
  };
  const closeEditor = () => setEditorOpen(false);
  const resetCreateDrawer = () => {
    setCreateOpen(false);
    setCreateStep('choose');
    setCreateUnit(null);
    setCreateDate(null);
  };
  const openCreate = (unit, date) => {
    setCreateUnit(unit);
    setCreateDate(date);
    setCreateStep('choose');
    setCreateOpen(true);
  };
  const fmtDate = (d) => {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const fmtDisplayDate = (d) => d instanceof Date && !isNaN(d) ? d.toLocaleDateString() : '';


  useEffect(() => {
    getBookingsTimeline()
      .then(setRawBookings)
      .catch((err) => console.error('Failed to load bookings timeline:', err));
  }, []);

  const refreshTimeline = async () => {
    try {
      const data = await getBookingsTimeline();
      setRawBookings(data);
    } catch (e) {
      console.error('Refresh timeline failed', e);
    }
  };

  // Handler: Check availability for given dates/city/type and adjust view
  const handleAvailabilitySubmit = (event) => {
    event.preventDefault();
    if (!availCheckIn || !availCheckOut) return;

    const start = parseYMDLocal(availCheckIn);
    const end = parseYMDLocal(availCheckOut);
    if (!start || !end || end <= start) return;

    // Use normalized bookings within the current window
    const nonCancelled = normalizedBookings;

    // 1) Units that match city/type from the drawer
    const candidateUnits = allUnitsFromRaw.filter((u) => {
      if (availCity && availCity !== 'All' && (u.city || '') !== availCity) return false;
      if (availType && availType !== 'Any' && (u.type || '') !== availType) return false;
      return true;
    });

    // 2) Keep only those with NO overlapping bookings in that period
    //    Treat Hold / Block entries as NOT blocking availability
    const availableUnitNames = new Set(
      candidateUnits
        .filter((u) => {
          const bookingsForUnit = nonCancelled.filter((b) => {
            if (b.unitName !== u.name) return false;
            const src = String(b.sourceNormalized || b.source || '').toLowerCase();
            const guestType = String(b.guestType || '').toLowerCase();
            // Ignore holds and blocks when computing conflicts
            if (src === 'hold' || src === 'block') return false;
            if (guestType === 'hold' || guestType === 'block') return false;
            return true;
          });
          const hasConflict = bookingsForUnit.some((b) =>
            rangesOverlap(b.checkIn, b.checkOut, start, end)
          );
          return !hasConflict;
        })
        .map((u) => u.name)
    );

    setAvailabilityFilter({
      start,
      end,
      city: availCity,
      type: availType,
      availableUnitNames,
    });

    // Adjust timeline view: show the full month of the check-in date
    const newViewStart = startOfMonth(start);
    const newViewEnd = endOfMonth(start);

    setViewStart(newViewStart);
    setViewEnd(newViewEnd);

    setAvailabilityOpen(false);
  };
  // Memo: all units from rawBookings, before any month/city filtering
  const allUnitsFromRaw = useMemo(() => {
    const list = coerceList(rawBookings);
    const map = new Map();
    for (const r of list) {
      const unitName = r.unit_name || r.unitName || r.unit || r.listing_name || r.listingName;
      if (!unitName) continue;
      const city = r.city || '';
      const type = r.unit_type || r.unitType || r.type || '';
      const unitId = r.unit_id || r.unitId || null; // numeric FK from API, if present
      const unitCode = r.unit_code || r.unitCode || unitName;

      // Use numeric unitId as the stable key when available, otherwise fall back to unitName
      const key = unitId ?? unitName;

      if (!map.has(key)) {
        map.set(key, {
          id: unitId ?? key, // this is what BlockCalFormRHF will receive as defaultUnitId
          name: unitName,
          city,
          type,
          unit_code: unitCode,
        });
      } else {
        const cur = map.get(key);
        if (!cur.type && type) cur.type = type; // fill type if missing
        if (!cur.city && city) cur.city = city; // keep city if we have it
        if (!cur.unit_code && unitCode) cur.unit_code = unitCode;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawBookings]);

  const normalizedBookings = useMemo(() => {
    const list = coerceList(rawBookings);
    const items = list.map((r) => {
      const checkIn = r.check_in || r.checkIn || r.start_date || r.startDate;
      const checkOut = r.check_out || r.checkOut || r.end_date || r.endDate;
      const unitName = r.unit_name || r.unitName || r.unit || r.listing_name || r.listingName;
      const guest = r.guest_name || r.guestName || r.guest || r.name;

      // Raw source (platform/payment origin)
      const sourceRaw = r.source || r.booking_source || r.bookingSource || '';
      // Semantic source (used for UI coloring / Hold / Block)
      const sourceNormInitial = r.source_normalized || sourceRaw;

      const status = r.status || r.booking_status || r.bookingStatus;

      const inDate = checkIn
        ? (typeof checkIn === 'string' ? parseYMDLocal(checkIn) : new Date(checkIn))
        : null;
      const outDate = checkOut
        ? (typeof checkOut === 'string' ? parseYMDLocal(checkOut) : new Date(checkOut))
        : null;

      const inValid = inDate instanceof Date && !isNaN(inDate);
      const outValid = outDate instanceof Date && !isNaN(outDate);
      if (!inValid || !outValid) return null;
      if (outDate <= inDate) return null;

      // --- Normalize guestType / holdExpiresAt and source ---
      const guestType = r.guest_type || r.guestType || '';
      const holdExpiresAt = r.hold_expires_at || r.holdExpiresAt || null;
      const holdPolicy = r.hold_policy || r.holdPolicy || '';

      let normalizedSource = sourceNormInitial || '';
      const gtLower = String(guestType || '').toLowerCase();
      let srcLower = String(normalizedSource || '').toLowerCase();

      // If source is empty or Owners2, derive from guest_type
      if (!normalizedSource || srcLower === 'owners2') {
        if (gtLower === 'hold') {
          normalizedSource = 'Hold';
        } else if (gtLower === 'block') {
          normalizedSource = 'Block';
        }
        srcLower = String(normalizedSource || '').toLowerCase();
      }

      // Also, if source_normalized/raw already says Hold/Block (any casing), keep that
      if (srcLower === 'hold') {
        normalizedSource = 'Hold';
      } else if (srcLower === 'block') {
        normalizedSource = 'Block';
      }

      // Flags derived from guestType + normalized source
      const isHold = gtLower === 'hold' || srcLower === 'hold';
      const isBlock = gtLower === 'block' || srcLower === 'block';

      return {
        id: r.id ?? r.booking_id ?? r.bookingId,
        source: sourceRaw,              // raw: 'Airbnb', 'Owners2', etc.
        sourceNormalized: normalizedSource, // semantic: 'Airbnb', 'Private', 'Hold', 'Block'
        status,
        unitName,
        city: r.city,
        guest,
        guests: r.guests ?? r.num_guests ?? null,
        checkIn: inDate,
        checkOut: outDate,
        commissionBase: r.commission_base ?? r.commissionBase ?? null,
        reservationCode: r.confirmation_code || r.reservation_code || r.reservationCode || null,
        payout: r.payout ?? null,
        cleaningFee: r.cleaning_fee ?? null,
        notes: r.notes ?? '',
        checkInNotes: r.check_in_notes ?? r.checkInNotes ?? '',
        checkOutNotes: r.check_out_notes ?? r.checkOutNotes ?? '',
        commissionPercent: r.commission_percent ?? r.commissionPercent ?? null,
        paymentMethod: r.payment_method || r.paymentMethod || null,
        isPaid: r.is_paid ?? r.isPaid ?? false,
        unitId: r.unit_id ?? r.unitId ?? null,
        bookingDate: r.booking_date || r.bookingDate || null,
        guestType,
        holdExpiresAt,
        holdPolicy,
        isHold,
        isBlock,
      };
    }).filter(Boolean);
    const nonCancelled = items.filter(b => {
      const s = String(b.status || '').toLowerCase();
      if (s.startsWith('cancel')) return false;
      if (s === 'expired') return false;
      return true;
    });

    const overlapped = nonCancelled.filter(b => b.checkIn <= lastDay && b.checkOut >= firstDay);
    return overlapped;
  }, [rawBookings, firstDay, lastDay]);

  const searchLower = useMemo(() => (searchTerm || '').toLowerCase(), [searchTerm]);



  const units = useMemo(() => {
    let list = allUnitsFromRaw;

    // If an availability filter is active, restrict to those units
    if (availabilityFilter && availabilityFilter.availableUnitNames) {
      const set = availabilityFilter.availableUnitNames;
      list = list.filter((u) => set.has(u.name));
    }

    if (!searchLower) return list;

    // First apply the existing text filter
    let filtered = list.filter((u) => {
      const haystack = [
        u.name,
        u.city,
        u.listingName,
        u.clientName,
        u.type,
        u.unit_code,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchLower);
    });

    // If user is searching for "1 Bdr", order by city: Playa first, then Tulum, then others
    const isOneBdrSearch = /1\s*bdr/i.test(searchLower);
    if (isOneBdrSearch && filtered.length > 0) {
      const cityRank = (city) => {
        const c = (city || '').toLowerCase();
        if (c === 'playa del carmen' || c === 'playa') return 1;
        if (c === 'tulum') return 2;
        return 3;
      };
      filtered = [...filtered].sort((a, b) => {
        const ra = cityRank(a.city);
        const rb = cityRank(b.city);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    }

    return filtered;
  }, [allUnitsFromRaw, searchLower, availabilityFilter]);

  const filteredBookings = useMemo(() => {
    if (!searchLower) return normalizedBookings;

    // Units that passed the search filter (left column)
    const visibleUnitNames = new Set(units.map((u) => u.name));

    return normalizedBookings.filter((b) => {
      // Direct text match on booking fields
      const haystack = [
        b.unitName,
        b.city,
        b.listingName,
        b.clientName,
        b.guest,
        b.reservationCode,
      ].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(searchLower)) return true;

      // Or: booking belongs to one of the visible units
      if (visibleUnitNames.has(b.unitName)) return true;

      return false;
    });
  }, [normalizedBookings, searchLower, units]);

  const unitOptions = useMemo(() => {
    const map = new Map();
    for (const b of normalizedBookings) {
      if (b.unitId && b.unitName && !map.has(b.unitId)) {
        map.set(b.unitId, { id: b.unitId, label: b.unitName });
      }
    }
    return Array.from(map.values());
  }, [normalizedBookings]);

  const cityOptions = useMemo(() => {
    const set = new Set();
    allUnitsFromRaw.forEach((u) => {
      if (u.city) set.add(u.city);
    });
    return Array.from(set).sort();
  }, [allUnitsFromRaw]);

  const typeOptions = useMemo(() => {
    const set = new Set();
    allUnitsFromRaw.forEach((u) => {
      if (u.type) set.add(u.type);
    });
    return Array.from(set).sort();
  }, [allUnitsFromRaw]);

  const bookingsByUnit = useMemo(() => {
    const map = new Map();
    // Pre-seed map with known units using their id (numeric when available)
    for (const u of units) {
      map.set(u.id, []);
    }
    for (const b of filteredBookings) {
      const key = b.unitId ?? b.unitName;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(b);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.checkIn - b.checkIn);
    return map;
  }, [units, filteredBookings]);

  const searchOptions = useMemo(() => {
    const set = new Set();
    normalizedBookings.forEach((b) => {
      if (b.unitName) set.add(b.unitName);
      if (b.city) set.add(b.city);
      if (b.listingName) set.add(b.listingName);
      if (b.type) set.add(b.type);
    });
    allUnitsFromRaw.forEach((u) => {
      if (u.name) set.add(u.name);
      if (u.city) set.add(u.city);
      if (u.listingName) set.add(u.listingName);
      if (u.unit_code) set.add(u.unit_code);
      if (u.type) set.add(u.type);
    });
    return Array.from(set);
  }, [normalizedBookings, allUnitsFromRaw]);

  const gridTemplateColumns = useMemo(() => {
    const dayCols = days.map(() => `repeat(${DAY_PARTS}, ${DAY_PART_WIDTH}px)`).join(' ');
    return `${RESOURCE_COL_WIDTH}px ${dayCols}`;
  }, [days]);

  const headGridTemplateColumns = useMemo(() => {
    const dayCols = days.map(() => `repeat(${DAY_PARTS}, ${DAY_PART_WIDTH}px)`).join(' ');
    return `${RESOURCE_COL_WIDTH}px ${dayCols}`;
  }, [days]);

  // Unified grid intrinsic width: left col (resource) + DAY_WIDTH per day
  const gridMinWidth = useMemo(() => RESOURCE_COL_WIDTH + (days.length * DAY_WIDTH), [days.length]);

  // Today marker (if in current month)
  const todayIdx = days.findIndex(d => isSameDay(d, new Date()));
  // Scroll to show today minus ~3 days on load/update
  useEffect(() => {
    if (!scrollRef.current) return;
    if (todayIdx < 0) return;
    const target = Math.max(0, RESOURCE_COL_WIDTH + ((todayIdx - 3) * DAY_WIDTH));
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = target;
      }
    });
  }, [todayIdx, days.length]);

  // Effect: update visibleMonth based on horizontal scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !days.length) return;

    const handleScroll = () => {
      const { scrollLeft, clientWidth } = el;
      // Horizontal center position (px) inside the scroll area
      const centerX = scrollLeft + clientWidth / 2;
      // Offset relative to the start of the days area (skip resource column)
      const relX = Math.max(0, centerX - RESOURCE_COL_WIDTH);
      const approxIndex = Math.floor(relX / DAY_WIDTH);
      const idx = Math.min(Math.max(approxIndex, 0), days.length - 1);
      const date = days[idx];
      if (!date) return;
      const label = monthLabel(date);
      setVisibleMonth((prev) => (prev === label ? prev : label));
    };

    // Initialize once when days change
    handleScroll();

    el.addEventListener('scroll', handleScroll);
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [days]);


  const LEGEND_COLORS = { Airbnb: '#F57C4D', Private: '#1E6F68', Block: '#9AA3A7' };

  const stickyHeader = (
    <Stack spacing={1.5} sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ flexWrap: 'wrap', alignItems: { md: 'center' } }}
      >
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, minWidth: 160, pl: 2 }}
        >
          {visibleMonth}
        </Typography>
        <Autocomplete
          size="small"
          options={searchOptions}
          freeSolo
          value={searchTerm}
          onInputChange={(_, v) => setSearchTerm(v)}
          sx={{ minWidth: { xs: '100%', sm: 240 }, maxWidth: 360 }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search listings…"
              placeholder="Playa, 1 Bdr, 5aLia_13"
              variant="outlined"
            />
          )}
        />
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button
            type="button"
            onClick={() => openCreate(null, null)}
            variant="outlined"
            sx={{
              borderColor: '#1E6F68',
              color: '#1E6F68',
              backgroundColor: 'transparent',
              borderRadius: 0,
              textTransform: 'none',
              fontWeight: 600,
              px: 2.5,
              py: 1,
              '&:hover': { borderColor: '#155E58', backgroundColor: 'transparent' },
            }}
          >
            New booking
          </Button>
          <Button
            type="button"
            onClick={() => setAvailabilityOpen(true)}
            variant="outlined"
            sx={{
              borderColor: '#2563eb',
              color: '#2563eb',
              backgroundColor: 'transparent',
              borderRadius: 0,
              textTransform: 'none',
              fontWeight: 600,
              px: 2.5,
              py: 1,
              '&:hover': { borderColor: '#1d4ed8', backgroundColor: 'transparent' },
            }}
          >
            Check availability
          </Button>
          <Button
            type="button"
            onClick={handleToday}
            variant="outlined"
            sx={{
              borderColor: '#e67e22',
              color: '#e67e22',
              backgroundColor: 'transparent',
              borderRadius: 0,
              textTransform: 'none',
              fontWeight: 600,
              px: 2.5,
              py: 1,
              '&:hover': { borderColor: '#c76a16', backgroundColor: 'transparent' },
            }}
          >
            Today
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );

  return (
    <PageScaffold
      sectionKey="bookings"
      currentPath="/bookings-timeline"
      stickyHeader={stickyHeader}
    >
      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
      <div className="bt-card">
        {/* Scroll wrapper to handle many days */}
        <div
          className="bt-scroll"
          ref={scrollRef}
          style={{ maxHeight: 630, overflowX: 'auto', overflowY: 'auto' }}
        >
          {/* Sticky top header for day columns */}
          <div className="bt-days-head-wrap">
            <div
                className="bt-days-head"
                style={{
                  '--bt-days': days.length,
                  '--bt-day-width': `${DAY_WIDTH}px`,
                  '--bt-resource-width': `${RESOURCE_COL_WIDTH}px`,
                  gridTemplateColumns: headGridTemplateColumns,
                  gap: 0,
                  background: '#f8f9f9',
                  backgroundImage: `repeating-linear-gradient(to right, var(--bt-border) 0, var(--bt-border) 1px, transparent 1px, transparent ${DAY_WIDTH}px)`,
                  backgroundSize: `${DAY_WIDTH}px 100%`,
                  backgroundPosition: `${RESOURCE_COL_WIDTH}px 0`,
                }}
              >
                <div className="bt-corner">{units.length} Listings</div>
                {days.map((d, idx) => (
                  <div
                    key={`day-head-${idx}`}
                    className={`bt-day-head ${isSameDay(d, new Date()) ? 'bt-today' : ''}`}
                    style={{
                      gridColumn: `${(idx * DAY_PARTS) + 2} / ${(idx * DAY_PARTS) + 2 + DAY_PARTS}`,
                    }}
                    title={d.toDateString()}
                  >
                    {d.getDate()}
                  </div>
                ))}
            </div>
          </div>
            <div className="bt-grid" style={{ minWidth: `${gridMinWidth}px` }}>
              {/* Unified body rows: one .bt-row per unit */}
            <div
              className="bt-body"
              style={{
                '--bt-days': days.length,
                '--bt-day-width': `${DAY_WIDTH}px`,
                '--bt-resource-width': `${RESOURCE_COL_WIDTH}px`,
                gap: 0,
                backgroundImage: `repeating-linear-gradient(to right, var(--bt-border) 0, var(--bt-border) 1px, transparent 1px, transparent ${DAY_WIDTH}px)`,
                backgroundSize: `${DAY_WIDTH}px 100%`,
                backgroundPosition: `${RESOURCE_COL_WIDTH}px 0`,
              }}
            >
                {units.map((unit) => (
                  <UnitRow
                    key={unit.id}
                    unit={unit}
                    bookings={bookingsByUnit.get(unit.id) || []}
                    days={days}
                    gridTemplateColumns={gridTemplateColumns}
                    todayIdx={todayIdx}
                    onBarClick={(b) => openEditor(b)}
                    onDayClick={(day) => openCreate(unit, day)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Stack>

      <AppDrawer
        open={createOpen}
        onClose={resetCreateDrawer}
        title={createStep === 'choose'
          ? `Add item — ${createUnit?.name || ''}`
          : createStep === 'booking'
            ? `New Booking — ${createUnit?.name || ''}`
            : `New Block/Hold — ${createUnit?.name || ''}`}
        width={560}
        showActions={createStep !== 'choose'}
        formId={createStep === 'booking' ? 'booking-new-form' : (createStep === 'block' ? 'block-cal-form' : undefined)}
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
            initialUnit={createUnit ? { id: createUnit.id, label: createUnit.name, city: createUnit.city } : null}
            initialCheckIn={createDate ? fmtDate(createDate) : ''}
            initialCheckOut={createDate ? fmtDate(addDays(createDate, 1)) : ''}
            onSaved={async () => {
              await refreshTimeline();
              resetCreateDrawer();
            }}
            onCancel={resetCreateDrawer}
          />
        )}

        {createStep === 'block' && (
          <BlockCalFormRHF
            defaultUnitId={createUnit?.id}
            defaultUnitName={createUnit?.name || createUnit?.label}
            initialType="Hold"
            initialStartDate={createDate ? fmtDate(createDate) : ''}
            initialEndDate={createDate ? fmtDate(addDays(createDate, 1)) : ''}
            onSuccess={async () => {
              await refreshTimeline();
              resetCreateDrawer();
            }}
          />
        )}
      </AppDrawer>

      <AppDrawer
        open={editorOpen}
        onClose={closeEditor}
        title={editorKind === 'blockHold'
          ? `Edit Block/Hold — ${selectedBooking?.unitName || ''}`
          : `Edit Booking — ${selectedBooking?.reservationCode || selectedBooking?.guest || ''}`}
        width={520}
        showActions
        formId={editorKind === 'blockHold' ? 'block-cal-edit-form' : 'booking-edit-form'}
      >
        {selectedBooking && editorKind === 'booking' && (
          <BookingEditFormRHF
            initialValues={{
              id: selectedBooking.id,
              reservationCode: selectedBooking.reservationCode || '',
              unitId: selectedBooking.unitId || undefined,
              status: selectedBooking.status || '',
              guestName: selectedBooking.guest || '',
              guests: selectedBooking.guests || undefined,
              checkIn: fmtDate(selectedBooking.checkIn),
              checkOut: fmtDate(selectedBooking.checkOut),
              payout: selectedBooking.payout ?? '',
              paymentMethod: selectedBooking.paymentMethod || '',
              cleaningFee: selectedBooking.cleaningFee ?? '',
              commissionPercent: selectedBooking.commissionPercent ?? '',
              notes: selectedBooking.notes || '',
              checkInNotes: selectedBooking.checkInNotes || '',
              checkOutNotes: selectedBooking.checkOutNotes || '',
              source: selectedBooking.source || '',
              isPaid: !!selectedBooking.isPaid,
            }}
            unitOptions={unitOptions}
            loadingUnits={false}
            onSubmit={async (values) => {
              try {
                const id = selectedBooking?.id;
                if (!id) throw new Error('Missing booking id');

                // Resolve unitName from selected unitId (fallback to existing)
                const resolvedUnit = unitOptions.find(u => Number(u.id) === Number(values.unitId));
                const unitName = resolvedUnit?.label ?? selectedBooking?.unitName ?? null;

                // Build camelCase payload to match working forms
                const payload = {
                  reservationCode: values.reservationCode || null,
                  unitId: values.unitId ?? null,
                  unitName,
                  status: values.status || null,
                  guestName: values.guestName || null,
                  guests: values.guests != null && values.guests !== '' ? Number(values.guests) : null,
                  checkIn: values.checkIn || null,
                  checkOut: values.checkOut || null,
                  payout: values.payout != null && values.payout !== '' ? Number(String(values.payout).replace(/,/g, '.')) : null,
                  paymentMethod: values.paymentMethod || null,
                  cleaningFee: values.cleaningFee != null && values.cleaningFee !== '' ? Number(String(values.cleaningFee).replace(/,/g, '.')) : null,
                  commissionPercent: values.commissionPercent != null && values.commissionPercent !== '' ? Number(String(values.commissionPercent).replace(/,/g, '.')) : null,
                  notes: values.notes || '',
                  checkInNotes: values.checkInNotes || '',
                  checkOutNotes: values.checkOutNotes || '',
                  isPaid: !!values.isPaid,
                };

                await api.put(`/api/bookings/${id}`, payload, {
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                });

                await refreshTimeline();
                closeEditor();
              } catch (e) {
                console.error('Update booking failed', e);
                // keep drawer open so user can fix
              }
            }}
            onCancel={closeEditor}
            submitLabel="Save"
          />
        )}
        {selectedBooking && editorKind === 'blockHold' && (
          <BlockCalEditFormRHF
            initialValues={(() => {
              const isHold = !!selectedBooking.isHold;
              const isBlock = !!selectedBooking.isBlock && !isHold;

              if (isHold) {
                // Hold edit: keep using hold-specific fields
                return {
                  id: selectedBooking.id,
                  unitId: selectedBooking.unitId ?? null,
                  unitName: selectedBooking.unitName ?? '',
                  type: 'Hold',
                  status: selectedBooking.status || 'Active',
                  guestName: selectedBooking.guest || '',
                  guestType: selectedBooking.guestType || 'Hold',
                  checkIn: fmtDate(selectedBooking.checkIn),
                  checkOut: fmtDate(selectedBooking.checkOut),
                  payout: selectedBooking.payout ?? '',
                  paymentMethod: selectedBooking.paymentMethod || '',
                  holdPolicy: selectedBooking.holdPolicy || '',
                  holdExpiresAt: selectedBooking.holdExpiresAt || '',
                  notes: selectedBooking.notes || '',
                  bookingDate: selectedBooking.bookingDate || '',
                };
              }

              // Block edit: map reason/start/end from booking data
              return {
                id: selectedBooking.id,
                unitId: selectedBooking.unitId ?? null,
                unitName: selectedBooking.unitName ?? '',
                type: 'Block',
                status: selectedBooking.status || 'Active',
                // Reason: use guest name (e.g. "Cleaning") as the human label
                reason: selectedBooking.guest || 'Other',
                start: fmtDate(selectedBooking.checkIn),
                end: fmtDate(selectedBooking.checkOut),
                notes: selectedBooking.notes || '',
                bookingDate: selectedBooking.bookingDate || '',
              };
            })()}
            onSubmit={async (out) => {
              try {
                const id = selectedBooking?.id;
                if (!id) throw new Error('Missing booking id');
                await api.put(`/api/bookings/${id}`, out, {
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                });
                await refreshTimeline();
                closeEditor();
              } catch (e) {
                console.error('Update block/hold failed', e);
                // keep drawer open so user can fix
              }
            }}
            onCancel={closeEditor}
            submitLabel="Save"
          />
        )}
      </AppDrawer>

      {/* Drawer for availability search */}
      <AppDrawer
        open={availabilityOpen}
        onClose={() => setAvailabilityOpen(false)}
        title="Check availability"
        width={420}
      >
        <Stack
          spacing={2}
          component="form"
          onSubmit={handleAvailabilitySubmit}
        >
          <TextField
            label="Check-in"
            type="date"
            value={availCheckIn}
            onChange={(e) => setAvailCheckIn(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Check-out"
            type="date"
            value={availCheckOut}
            onChange={(e) => setAvailCheckOut(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            select
            label="City"
            value={availCity}
            onChange={(e) => setAvailCity(e.target.value)}
            fullWidth
          >
            <MenuItem value="All">All cities</MenuItem>
            {cityOptions.map((city) => (
              <MenuItem key={city} value={city}>
                {city}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Type"
            value={availType}
            onChange={(e) => setAvailType(e.target.value)}
            fullWidth
          >
            <MenuItem value="Any">Any type</MenuItem>
            {typeOptions.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ pt: 1 }}>
            <Button onClick={() => setAvailabilityOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">
              Apply
            </Button>
          </Stack>
        </Stack>
      </AppDrawer>
    </PageScaffold>
  );
}

function UnitRow({ unit, bookings, days, gridTemplateColumns, todayIdx, onBarClick, onDayClick }) {
  // Single column per day; gridTemplateColumns provided from parent
  return (
    <div
      className="bt-row"
      style={{ gridTemplateColumns, gridTemplateRows: '1fr', alignItems: 'center' }}
    >
      {/* Resource column (left) */}
      <div className="bt-resource-cell" style={{ gridColumn: '1 / 2', gridRow: '1 / 2', alignSelf: 'center' }}>
        <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{unit.name}</div>
        {(() => {
          const shortCity = (unit.city || '') === 'Playa del Carmen' ? 'Playa' : (unit.city || '');
          const typeLabel = unit.type || '';
          return (
            <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.2 }}>
              {typeLabel ? `${typeLabel} • ${shortCity}` : shortCity}
            </div>
          );
        })()}
      </div>

      {/* Today marker (if inside this window) */}
      {todayIdx >= 0 && (
        <div
          aria-hidden
          className="bt-today-line"
          style={{
            gridColumn: `${(todayIdx * DAY_PARTS) + 2} / ${(todayIdx * DAY_PARTS) + 2 + DAY_PARTS}`,
            gridRow: '1 / 2',
            justifySelf: 'center',
            alignSelf: 'stretch',
          }}
        />
      )}

      {/* Clickable day cells to start a new booking/block */}
      {days.map((d, idx) => (
        <button
          key={`day-hit-${unit.id}-${idx}`}
          type="button"
          className="bt-day-hit"
          style={{
            gridColumn: `${(idx * DAY_PARTS) + 2} / ${(idx * DAY_PARTS) + 2 + DAY_PARTS}`,
            gridRow: '1 / 2',
          }}
          onClick={() => onDayClick?.(d)}
          title={`New booking/block on ${d.toDateString()}`}
        />
      ))}

      {/* Booking bars for this unit (resource-aware indexing) */}
      {bookings.map((b, i) => (
        <BookingBar key={i} booking={b} days={days} onClick={() => onBarClick?.(b)} />
      ))}
    </div>
  );
}

function BookingBar({ booking, days, onClick }) {
  const first = days[0];
  const last = days[days.length - 1];

  const start = clampDate(booking.checkIn, first, last);
  const end = clampDate(booking.checkOut, first, last);

  // Compute single-day column math: 1 column per day
  const sDay = dayIndexInMonth(start, days);
  const eDay = dayIndexInMonth(end, days);
  let startIdx = 2 + (sDay * DAY_PARTS) + (DAY_PARTS - 1); // last third of check-in day
  let endIdx = 2 + (eDay * DAY_PARTS) + 1; // first third of checkout day
  const minLine = 2;
  const maxLine = 2 + (days.length * DAY_PARTS);
  startIdx = Math.max(minLine, Math.min(startIdx, maxLine));
  endIdx = Math.max(minLine, Math.min(endIdx, maxLine + 1));
  if (endIdx < startIdx + 1) endIdx = startIdx + 1;

  // Skip if nothing to render (e.g., checkout on/before first visible day)
  if (booking.checkOut <= first) return null;
  if (startIdx >= endIdx) return null;

  const nights = Math.max(1, Math.round((booking.checkOut - booking.checkIn) / (1000 * 60 * 60 * 24)));
  // --- Hold/Block aware class & tooltip (mirrored logic) ---
  const rawSourceClass = (booking.sourceNormalized || booking.source || '').toLowerCase();
  const guestTypeLower = String(booking.guestType || '').toLowerCase();
  const isHold = rawSourceClass === 'hold' || guestTypeLower === 'hold';
  const isBlock = rawSourceClass === 'block' || guestTypeLower === 'block';

  const guestName = booking.guest || '';
  const guestFirst = (guestName || '').split(' ')[0] || '';
  const nightsPart = `${nights}n`;
  const notesStr = (booking.notes || '').trim();

  // Hold-specific: format expiry date and policy
  const holdExpiresRaw = booking.holdExpiresAt;
  let holdExpiresLabel = '';
  if (holdExpiresRaw) {
    const str = String(holdExpiresRaw).replace('T', ' ');
    // expect "YYYY-MM-DD HH:MM:SS" or similar
    const [datePart, timeFull] = str.trim().split(/\s+/);
    if (datePart) {
      const [y, m, d] = datePart.split('-').map(Number);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        const dd = String(d).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const timeShort = (timeFull || '').slice(0, 5); // HH:MM
        holdExpiresLabel = timeShort ? `${dd}/${mm} ${timeShort}` : `${dd}/${mm}`;
      } else {
        holdExpiresLabel = datePart;
      }
    } else {
      holdExpiresLabel = str;
    }
  }
  const holdPolicyLabel = booking.holdPolicy || '';

  let label;
  if (isHold) {
    // HOLD bars: [icon] dd/mm HH:MM • policy (no "Expires:" prefix)
    const textParts = [];
    if (holdExpiresLabel) {
      textParts.push(holdExpiresLabel);
    }
    if (holdPolicyLabel) {
      textParts.push(holdPolicyLabel);
    }
    const text = textParts.length > 0 ? textParts.join(' • ') : 'Hold';
    label = (
      <>
        <span className="bt-hold-icon" aria-hidden="true">⏱</span>
        <span>{text}</span>
        {notesStr && (
          <span
            style={{
              marginLeft: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span className="bt-notes-icon" aria-hidden="true">✎</span>
            <span>{notesStr}</span>
          </span>
        )}
      </>
    );
  } else if (isBlock) {
    // Blocks: [icon] guest_name • notes (if any)
    const parts = [];
    if (guestName) parts.push(guestName);
    if (notesStr) parts.push(notesStr);
    const text = parts.length > 0 ? parts.join(' • ') : 'Block';
    label = (
      <>
        <span className="bt-block-icon" aria-hidden="true">⨂</span>
        <span>{text}</span>
      </>
    );
  } else {
    const payoutStr = booking.payout != null ? ` • ${fmtMoney(booking.payout)}` : '';
    label = `${guestFirst} • ${nightsPart}${payoutStr}`;
  }

  const barClass = isHold
    ? 'hold'
    : (isBlock
        ? 'block'
        : (['airbnb', 'private'].includes(rawSourceClass) ? rawSourceClass : ''));

  // Tooltip content (JSX) using global O2Tooltip styles
  let tooltipContent;
  if (isHold) {
    const payoutStr = booking.payout != null ? fmtMoney(booking.payout) : '';
    tooltipContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="bt-hold-icon" aria-hidden="true">⏱</span>
          <span>{holdExpiresLabel || 'Hold'}{holdPolicyLabel ? ` • ${holdPolicyLabel}` : ''}</span>
        </div>
        {guestName && (
          <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Guest: {guestName}</div>
        )}
        <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
          {payoutStr || '$0,00'}
          {notesStr && (
            <span
              style={{
                marginLeft: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span className="bt-notes-icon" aria-hidden="true">✎</span>
              <span>{notesStr}</span>
            </span>
          )}
        </div>
      </div>
    );
  } else if (isBlock) {
    tooltipContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="bt-block-icon" aria-hidden="true">⨂</span>
          <span>Block</span>
        </div>
        {guestName && (
          <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Reason: {guestName}</div>
        )}
        {notesStr && (
          <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Notes: {notesStr}</div>
        )}
        {booking.unitName && (
          <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Unit: {booking.unitName}</div>
        )}
      </div>
    );
  } else {
    const payoutStr = booking.payout != null ? fmtMoney(booking.payout) : '';
    tooltipContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {booking.unitName && (
          <div style={{ fontWeight: 500 }}>{booking.unitName}</div>
        )}
        {guestName && (
          <div style={{ fontSize: '0.8rem' }}>Guest: {guestName}</div>
        )}
        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
          {nightsPart}
          {payoutStr && ` • ${payoutStr}`}
          {booking.sourceNormalized && ` • ${booking.sourceNormalized}`}
        </div>
      </div>
    );
  }

  const contClasses = [
    'bt-bar',
    barClass
  ].filter(Boolean).join(' ');

  return (
    <O2Tooltip title={tooltipContent} placement="top">
      <div
        className={contClasses}
        onClick={onClick}
        style={{
          gridColumn: `${startIdx} / ${endIdx}`,
          gridRow: '1 / 2',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          minWidth: 0,
          cursor: 'pointer'
        }}
      >
        <span className="bt-bar-text">{label}</span>
      </div>
    </O2Tooltip>
  );
}

// Variant for right-side timeline: no resource column, grid math starts at col 1
// NOTE: This still uses the no-resource-column, two-half-day math and can be updated later.
function BookingBarRight({ booking, days, onClick }) {
  const first = days[0];
  const last = days[days.length - 1];

  // Clamp for visible rendering
  const start = clampDate(booking.checkIn, first, last);
  const end = clampDate(booking.checkOut, first, last);

  // Continuation flags (if booking crosses the visible window)
  const continuedLeft = booking.checkIn < first;
  const continuedRight = booking.checkOut > last;

  // Two half-columns per day; with no resource column the indices shift by -1 compared to body rows.
  const sDay = dayIndexInMonth(start, days);
  const eDay = dayIndexInMonth(end, days);
  let startIdx = (sDay * 2) + (continuedLeft ? 1 : 2);
  // Shift start one half-day later if not continued from left (no resource col math)
  if (!continuedLeft) {
    startIdx += 1; // move to the right half of check-in day
  }
  let endIdx     = (eDay * 2) + (continuedRight ? 3 : 2);
  // Extend checkout end one extra day (one half-column) if not continuing right, clamp to last grid line (no resource col)
  if (!continuedRight) {
    const maxLine = 1 + (days.length * 2); // no resource column
    endIdx = Math.min(endIdx + 1, maxLine);
  }
  if (booking.checkOut < first) return null;
  if (startIdx >= endIdx) return null;

  const nights = Math.max(1, Math.round((booking.checkOut - booking.checkIn) / (1000 * 60 * 60 * 24)));
  // --- Hold/Block aware class & tooltip (mirrored logic) ---
  const rawSourceClass = (booking.source || '').toLowerCase();
  const guestTypeLower = String(booking.guestType || '').toLowerCase();
  const isHold = rawSourceClass === 'hold' || guestTypeLower === 'hold';
  const isBlock = rawSourceClass === 'block' || guestTypeLower === 'block';

  const guestName = booking.guest || '';
  const guestFirst = (guestName || '').split(' ')[0] || '';
  const nightsPart = `${nights}n`;
  const notesStr = (booking.notes || '').trim();

  let label;
  if (isHold) {
    // Standardized HOLD label: "HOLD • GuestName • 3n" or "HOLD • 3n" if no guest
    label = guestFirst
      ? `HOLD • ${guestFirst} • ${nightsPart}`
      : `HOLD • ${nightsPart}`;
  } else if (isBlock) {
    // Blocks: [icon] guest_name • notes (if any)
    const parts = [];
    if (guestName) parts.push(guestName);
    if (notesStr) parts.push(notesStr);
    const text = parts.length > 0 ? parts.join(' • ') : 'Block';
    label = (
      <>
        <span className="bt-block-icon" aria-hidden="true">⨂</span>
        <span>{text}</span>
      </>
    );
  } else {
    const payoutStr = booking.payout != null ? ` • ${fmtMoney(booking.payout)}` : '';
    label = `${guestFirst} • ${nightsPart}${payoutStr}`;
  }

  const barClass = isHold
    ? 'hold'
    : (isBlock
        ? 'block'
        : (['airbnb', 'private'].includes(rawSourceClass) ? rawSourceClass : ''));

  let titleText = `${booking.guest} • ${booking.source} • ${nights} night(s)`;
  if (isHold) {
    titleText = `${booking.guest} • Hold`;
  } else if (isBlock) {
    titleText = `${booking.guest} • Block`;
  } else if (booking.payout != null) {
    titleText += ` • ${fmtMoney(booking.payout)}`;
  }

  const contClasses = [
    'bt-bar',
    barClass,
    continuedLeft ? 'continued-left' : '',
    continuedRight ? 'continued-right' : ''
  ].filter(Boolean).join(' ');

  return (
    <O2Tooltip title={titleText} placement="top">
      <div
        className={contClasses}
        data-continued-left={continuedLeft || undefined}
        data-continued-right={continuedRight || undefined}
        onClick={onClick}
        style={{ gridColumn: `${startIdx} / ${endIdx}`, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0, cursor: 'pointer' }}
      >
        <span className="bt-bar-text">{label}</span>
      </div>
    </O2Tooltip>
  );
}
