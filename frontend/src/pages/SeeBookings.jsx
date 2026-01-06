import api from '../api';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import TableLite from '../components/layout/TableLite';
import PageScaffold from '../components/layout/PageScaffold';
import { Button, Stack, IconButton, Typography, Box } from '@mui/material';
import BookingNewFormRHF from '../components/forms/BookingNewFormRHF';
import BookingEditFormRHF from '../components/forms/BookingEditFormRHF';
import PaymentConfirmForm from '../components/forms/PaymentConfirmForm';
import BlockCalFormRHF from '../components/forms/BlockCalFormRHF';
import BlockCalEditFormRHF from '../components/forms/BlockCalEditFormRHF';
import { HiOutlineArrowPathRoundedSquare } from 'react-icons/hi2';
import FormDrawer from '../components/common/FormDrawer';
import AppDrawer from '../components/common/AppDrawer';
import { toast } from 'react-toastify';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';

const SeeBookings = () => {
  // Local helper until ../api exposes it everywhere
  const buildAuthHeaders = () => {
    try {
      const token = localStorage.getItem('jwt') || sessionStorage.getItem('jwt') || '';
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch (e) {
      return {};
    }
  };
  const isSoftBooking = (b) => {
    if (!b) return false;
    const src = String(b.source || '').toLowerCase();
    const gt  = String(b.guestType || b.guest_type || '').toLowerCase();
    const st  = String(b.status || '').toLowerCase();
    return src === 'owners2' || gt === 'hold' || gt === 'block' || st === 'hold' || st === 'block';
  };

  // Helper to map a soft booking row to the initial values expected by BlockCalEditFormRHF
  const getSoftInitialValues = (row) => {
    if (!row) return {};
    const gtRaw = row.guestType ?? row.guest_type ?? row.status ?? '';
    const gt = String(gtRaw).toLowerCase();
    const kind = gt.includes('hold') ? 'Hold' : 'Block';

    const base = {
      type: kind,
      unitId: row.unitId,
      unitName: row.unitName || row.unit_name || '',
      notes: row.notes || '',
      bookingDate: row.bookingDate || row.booking_date || '',
      status: row.status || '',
    };

    if (kind === 'Hold') {
      return {
        ...base,
        guest_type: row.guestType || row.guest_type || 'Hold',
        guestName: row.guestName || '',
        guests: row.guests ?? '',
        checkIn: row.checkIn || row.check_in || '',
        checkOut: row.checkOut || row.check_out || '',
        holdPolicy: row.holdPolicy || row.hold_policy || '',
        holdExpiresAt: row.holdExpiresAt || row.hold_expires_at || '',
        holdExpiresAtDisplay: formatDDMMYYYY_HHMM(row.holdExpiresAt || row.hold_expires_at || ''),
        payout: row.payout ?? row.payout_amount ?? '',
        paymentMethod: row.paymentMethod ?? row.payment_method ?? '',
        cleaningFee: row.cleaningFee ?? row.cleaning_fee ?? '',
        commissionPercent: row.commissionPercent ?? row.commission_percent ?? row.commissionPercentage ?? '',
      };
    }

    // Block
    // Prefer the API's display label for blocks (guestName), fallback to legacy guest_type/status
    const rawReason = String(row.guestName || row.guest_name || row.guestType || row.guest_type || row.status || '').toLowerCase().trim();
    let reason = 'Other';
    if (rawReason.includes('clean')) {
      reason = 'Cleaning';
    } else if (rawReason.includes('late') && (rawReason.includes('checkout') || rawReason.includes('check-out') || rawReason.includes('check out'))) {
      reason = 'Late Check-Out';
    } else if (rawReason.includes('maint') || rawReason.includes('repair') || rawReason.includes('fix')) {
      reason = 'Maintenance';
    }

    return {
      ...base,
      start: row.checkIn || row.check_in || '',
      end: row.checkOut || row.check_out || '',
      reason,
    };
  };
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterKey, setFilterKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [paymentBooking, setPaymentBooking] = useState(null);
  const [blockDrawerOpen, setBlockDrawerOpen] = useState(false);
  const [softInitial, setSoftInitial] = useState(null);
  const [softUnits, setSoftUnits] = useState([]);
  const [blockUnitOptions, setBlockUnitOptions] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const today = new Date();
  const defaultYm = today.toISOString().slice(0, 7);
  const [stayFromYm, setStayFromYm] = useState(defaultYm);
  const [stayToYm, setStayToYm] = useState('');

  const deriveRangeFromYm = React.useCallback((ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
    const [y, m] = ym.split('-').map((v) => Number(v));
    if (!y || !m) return null;
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = new Date(y, m, 0);
    const end = endDate.toISOString().slice(0, 10);
    return { start, end };
  }, []);

  const fallbackStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const fallbackEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const defaultRange = React.useMemo(
    () => deriveRangeFromYm(defaultYm) || { start: fallbackStart, end: fallbackEnd },
    [deriveRangeFromYm, defaultYm, fallbackStart, fallbackEnd]
  );
  const stayFromRange = React.useMemo(
    () => deriveRangeFromYm(stayFromYm) || defaultRange,
    [deriveRangeFromYm, stayFromYm, defaultRange]
  );
  const stayToRange = React.useMemo(
    () => (stayToYm ? deriveRangeFromYm(stayToYm) : null),
    [deriveRangeFromYm, stayToYm]
  );
  const stayFromDate = stayFromRange.start;
  const navigate = useNavigate();

  const location = useLocation();

  const cameFromFocusRef = React.useRef(false);

  const view = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('view') || 'basic';
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('focus')) {
      cameFromFocusRef.current = true;
    }
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('view')) {
      params.set('view', 'basic');
      const next = `${location.pathname}?${params.toString()}`;
      navigate(next, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  // Focus query param handling: auto-open drawer when matching booking exists
  const focusId = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('focus');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }, [location.search]);

  useEffect(() => {
    if (!focusId) return;
    if (!bookings || bookings.length === 0) return;

    // If drawer is already open for this booking, do nothing
    if (drawerOpen && selectedBooking && String(selectedBooking.id) === String(focusId)) {
      return;
    }

    const match = bookings.find((b) => String(b.id) === String(focusId));
    if (!match) return;

    setSelectedBooking(match);
    setDrawerOpen(true);
    setHighlightId(match.id);
  }, [focusId, bookings, drawerOpen, selectedBooking]);

  // --- Focus param helpers ---
  const clearFocusParam = React.useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('focus')) return;
    params.delete('focus');
    const search = params.toString();
    const next = search ? `${location.pathname}?${search}` : location.pathname;
    navigate(next, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const closeBookingDrawer = React.useCallback(() => {
    clearFocusParam();
    setDrawerOpen(false);
    setSelectedBooking(null);
    setSoftInitial(null);
    setSoftUnits([]);

    // If this page was first opened with a ?focus=... (e.g. from Alerts),
    // go back to the previous page (Dashboard / Manager Dashboard).
    if (cameFromFocusRef.current) {
      navigate(-1);
    }
  }, [clearFocusParam, navigate]);

  // Toggle between basic/full view by updating query param and bumping filterKey to remount the table
  const toggleView = () => {
    const params = new URLSearchParams(location.search);
    const next = view === 'basic' ? 'full' : 'basic';
    params.set('view', next);
    const newUrl = `${location.pathname}?${params.toString()}`;
    // Use react-router so useLocation() updates and view recomputes
    navigate(newUrl, { replace: true });
    // Force DataTable to remount and pick up columns for the new view
    setFilterKey((k) => k + 1);
  };
  useEffect(() => {
    const handler = (e) => {
      const id = e?.detail?.id;
      if (id) {
        setHighlightId(id);
        // Do not refetch here to avoid resetting row order
      }
    };
    window.addEventListener('datatable:highlight', handler);
    return () => window.removeEventListener('datatable:highlight', handler);
  }, []);

  const formatDDMMYYYY = (raw) => {
    if (!raw) return '';
    let d;
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      // Treat date-only strings as local dates to avoid UTC shift (e.g., America/Cancun)
      const [y, m, day] = raw.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(raw);
    }
    if (isNaN(d)) return String(raw);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const formatDDMMYYYY_HHMM = (raw) => {
    if (!raw) return '';
    // Date instance
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      const dd = String(raw.getDate()).padStart(2, '0');
      const mm = String(raw.getMonth() + 1).padStart(2, '0');
      const yyyy = raw.getFullYear();
      const HH = String(raw.getHours()).padStart(2, '0');
      const MM = String(raw.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
    }
    // Normalize common string forms: "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm[:ss[.sss]Z]"
    const s = String(raw).replace('T', ' ').trim();
    const [datePart, timeRaw] = s.split(' ');
    if (!datePart) return '';
    const [Y, M, D] = datePart.split('-');
    const dd = (D || '').padStart(2, '0');
    const mm = (M || '').padStart(2, '0');
    const yyyy = (Y || '').padStart(4, '0');
    let HHMM = '';
    if (timeRaw) {
      // Keep only HH:mm
      HHMM = timeRaw.slice(0, 5);
    }
    return HHMM ? `${dd}/${mm}/${yyyy} ${HHMM}` : `${dd}/${mm}/${yyyy}`;
  };

  const fetchBookings = React.useCallback(({ fromStart, toEnd } = {}) => {
    const hasCustomRange =
      !!fromStart ||
      !!toEnd ||
      !!stayToRange ||
      (stayFromYm && stayFromYm !== defaultYm);

    const params = {};
    if (hasCustomRange) {
      const hasCheckoutFilter = !!stayToRange || !!toEnd;
      const effectiveFrom = hasCheckoutFilter ? undefined : (fromStart ?? stayFromDate);
      const effectiveTo = toEnd ?? (stayToRange ? stayToRange.end : undefined);
      if (effectiveFrom) params.checkInFrom = effectiveFrom;
      if (effectiveTo) params.checkOutTo = effectiveTo;
    }

    // If a focusId is present in the URL, always include that booking id in the result,
    // even if it falls outside the normal default window or custom range.
    if (focusId) {
      params.focus = focusId;
    }

    setLoading(true);
    api.get('/api/bookings', { params })
      .then((response) => {
        const data = response.data;
        // Do not sort here; sorting is handled in dataForTable (status priority, then check-in)
        setBookings(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching bookings:', error);
        setLoading(false);
      });
  }, [stayFromDate, stayToRange, stayFromYm, defaultYm, focusId]);

  const markAsPaid = async (bookingId, { note, paymentMethod }) => {
    // 1) Optimistic UI: mark as paid locally, set both keys for compatibility
    setBookings(prev => prev.map(b => (
      b.id === bookingId ? { ...b, isPaid: true, paid: true, notes: note, paymentMethod } : b
    )));
    try {
      // 2) Server PUT with both keys
      await api.put(`/api/bookings/${bookingId}`, { isPaid: true, paid: true, notes: note, paymentMethod }, {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      // 3) Revert checkbox on failure + resync
      console.error('Error marking as paid', e);
      toast?.error?.('Could not mark as paid');
      setBookings(prev => prev.map(b => (
        b.id === bookingId ? { ...b, isPaid: false, paid: false } : b
      )));
      fetchBookings();
    }
  };

  const markAsUnpaid = async (bookingId) => {
    // 1) Optimistic UI: unmark locally
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, isPaid: false, paid: false } : b));
    try {
      // 2) Server PUT with both keys
      await api.put(`/api/bookings/${bookingId}`, { isPaid: false, paid: false }, {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      // 3) Revert on failure + notify
      console.error('Error marking as unpaid', e);
      toast?.error?.('Could not mark as unpaid');
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, isPaid: true, paid: true } : b));
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    const loadBlockUnits = async () => {
      try {
        const { data } = await api.get('/api/units?pagination=false');
        const opts = (data || []).map(u => ({
          value: u.id,
          label: u.unitName || u.name || `Unit #${u.id}`,
        }));
        setBlockUnitOptions(opts);
      } catch (e) {
        console.error('Error fetching units for Block form', e);
      }
    };
    loadBlockUnits();
  }, []);

  useEffect(() => {
    const loadSoft = async () => {
      console.log('[SoftEdit] effect fired', { drawerOpen, id: selectedBooking?.id, isSoft: isSoftBooking(selectedBooking) });
      try {
        if (!drawerOpen || !selectedBooking || !isSoftBooking(selectedBooking)) {
          console.log('[SoftEdit] skip: drawerOpen?', drawerOpen, 'hasSelected?', !!selectedBooking, 'isSoft?', isSoftBooking(selectedBooking));
          setSoftInitial(null);
          return;
        }
        const id = selectedBooking?.id;
        let detail = null;
        // Fetch booking detail (JWT-protected)
        console.log('[SoftEdit] fetching detail', id);
        try {
          const { data } = await api.get(`/api/soft-reservations/${id}`, { headers: buildAuthHeaders() });
          detail = data;
        } catch (e) {
          console.warn('[SoftEdit] detail fetch failed, falling back to row', e);
          detail = null;
        }
        // Fetch units for autocomplete
        let unitOpts = [];
        console.log('[SoftEdit] fetching units...');
        try {
          const { data: units } = await api.get('/api/units?pagination=false', { headers: buildAuthHeaders() });
          unitOpts = (units || []).map(u => ({ value: u.id, label: u.unitName || u.name }));
        } catch (e) {
          console.warn('[SoftEdit] units fetch failed, using table rows', e);
          unitOpts = Array.from(new Map(
            (bookings || [])
              .filter(b => b && b.unitId && (b.unitName || b.unit_name))
              .map(b => [b.unitId, { value: b.unitId, label: b.unitName || b.unit_name }])
          ).values());
        }
        console.log('[SoftEdit] units ready', unitOpts?.length);
        setSoftUnits(unitOpts);
        const init = getSoftInitialValues({ ...selectedBooking, ...(detail || {}) });
        console.log('[SoftEdit] initial values', init);
        setSoftInitial(init);
      } catch (err) {
        console.error('[SeeBookings] loadSoft failed', err);
        setSoftInitial(getSoftInitialValues(selectedBooking));
      }
    };
    loadSoft();
  }, [drawerOpen, selectedBooking]);


  useEffect(() => {
    if (highlightId) {
      let attempts = 0;
      const tryHighlight = () => {
        const row = document.querySelector(`[data-row-id=\"${highlightId}\"]`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth' });
          row.classList.add('highlight');
          setTimeout(() => row.classList.remove('highlight'), 2000);
          setHighlightId(null);
        } else if (attempts < 5) {
          attempts++;
          setTimeout(tryHighlight, 150);
        } else {
          setHighlightId(null);
        }
      };
      tryHighlight();
    }
  }, [bookings, highlightId]);


  // Status sort priority: ongoing → upcoming/active → past → cancelled
  const getStatusRank = (s) => {
    const v = String(s || '').toLowerCase().trim();
    // 0: Ongoing / In-house
    if (['ongoing', 'inhouse', 'in house', 'current'].includes(v)) return 0;
    // 1: Upcoming + Active (same weight, sorted by check-in)
    if (['upcoming', 'future', 'scheduled', 'pending', 'active'].includes(v)) return 1;
    // 2: Past
    if (['past', 'completed', 'finished', 'done'].includes(v)) return 2;
    // 3: Cancelled
    if (['cancelled', 'canceled'].includes(v)) return 3;
    // 4: Unknowns last
    return 4;
  };

  // Memoized sorted data for DataTable:
  // Always sort by status priority, then by check-in date ascending as a tiebreaker.
  const normalizeSource = (src) => String(src || '').trim().toLowerCase();

  const dataForTable = React.useMemo(() => {
    // Helpers to normalize check-in / check-out times
    const getCheckInTime = (b) => {
      const v = b.checkIn ?? b.check_in;
      if (!v) return null;
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [y, m, d] = v.split('-').map(Number);
        return new Date(y, m - 1, d).getTime();
      }
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? null : t;
    };
    const getCheckOutTime = (b) => {
      const v = b.checkOut ?? b.check_out;
      if (!v) return null;
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [y, m, d] = v.split('-').map(Number);
        return new Date(y, m - 1, d).getTime();
      }
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const copy = [...bookings];

    // Sort by status priority, then by date:
    // - ongoing / upcoming: check-in ASC (earliest first)
    // - past / cancelled: check-out DESC (latest first)
    copy.sort((a, b) => {
      const ra = getStatusRank(a.status);
      const rb = getStatusRank(b.status);
      if (ra !== rb) return ra - rb;

      // Same status group: decide which date to use
      const checkInA = getCheckInTime(a);
      const checkInB = getCheckInTime(b);
      const checkOutA = getCheckOutTime(a);
      const checkOutB = getCheckOutTime(b);

      // Groups: 0 = ongoing, 1 = upcoming, 2 = past, 3 = cancelled, 4 = unknown
      if (ra === 0 || ra === 1) {
        // Ongoing / Upcoming → earliest check-in first
        if (checkInA == null && checkInB == null) return 0;
        if (checkInA == null) return 1;
        if (checkInB == null) return -1;
        return checkInA - checkInB;
      }

      // Past / Cancelled / Unknown → most recent check-out first
      if (checkOutA == null && checkOutB == null) return 0;
      if (checkOutA == null) return 1;
      if (checkOutB == null) return -1;
      return checkOutB - checkOutA;
    });

    const filteredBySource = sourceFilter
      ? copy.filter((row) => normalizeSource(row.source ?? row.bookingSource ?? row.channel) === sourceFilter)
      : copy;

    const filteredByCity = cityFilter
      ? filteredBySource.filter((row) => {
          const cityRaw = row.city || row.cityLabel || row.city_name || '';
          const normalized = normalizeSource(cityRaw);
          if (normalized === 'playa del carmen') return cityFilter === 'playa';
          return normalized === cityFilter;
        })
      : filteredBySource;

    // No extra month-range slicing on the frontend; use the full backend window.
    return filteredByCity;
  }, [bookings, sourceFilter, cityFilter]);

  // Define fixed field order for columns
  const fieldOrder = [
    'confirmationCode', 'id', 'status',
    'unitName', 'guestName',
    'checkIn',
    'paymentMethod',
    'taxPercent', 'taxAmount', 'netPayout', 'cleaningFee', 'roomFee', 'commissionBase',
    'commissionPercent', 'commissionValue', 'o2Total',
    'netToOwner', 'guestType', 'paymentType',
    'notes', 'checkInNotes', 'checkOutNotes'
  ];

  const basicKeys = [
    'confirmationCode', 'status',
    'unitName', 'guestName',
    'checkIn',
    'paymentMethod',
    'notes', 'checkInNotes', 'checkOutNotes'
  ];

  const columns = bookings.length > 0
    ? (() => {
        // Choose which keys we want based on the view. Do NOT filter by current data;
        // render the full set so view stays consistent even if some rows have nulls.
        const desired = (view === 'basic' ? basicKeys : fieldOrder);
        const keys = [...desired];
        // Ensure these columns are always present even if missing on some rows
        if (!keys.includes('confirmationCode')) keys.unshift('confirmationCode');
        if (!keys.includes('unitName')) keys.push('unitName');
        if (!keys.includes('isPaid')) {
          const payoutIndex = keys.indexOf('payout');
          if (payoutIndex >= 0) {
            keys.splice(payoutIndex + 1, 0, 'isPaid');
          } else {
            keys.push('isPaid');
          }
        }
        const floatKeys = ['payout', 'roomFee', 'taxAmount', 'netPayout', 'commissionValue', 'o2Total', 'clientIncome'];
        return keys.map(originalKey => {
          if (['bookingDate', 'source', 'guests', 'days', 'checkOut', 'payout', 'isPaid'].includes(originalKey)) {
            return null;
          }
          if (originalKey === 'nettoowner') return null;
          return {
            // Support APIs exposing `paid` instead of `isPaid`
            accessor: (() => {
              if (originalKey === 'isPaid') {
                if (!bookings.some(b => ('isPaid' in b)) && bookings.some(b => ('paid' in b))) {
                  return 'paid';
                }
              }
              if (originalKey === 'confirmationCode') {
                if (!bookings.some(b => ('confirmationCode' in b)) && bookings.some(b => ('confirmation_code' in b))) {
                  return 'confirmation_code';
                }
                if (!bookings.some(b => ('confirmationCode' in b)) && bookings.some(b => ('code' in b))) {
                  return 'code';
                }
              }
              if (originalKey === 'guestType') {
                if (!bookings.some(b => ('guestType' in b)) && bookings.some(b => ('guest_type' in b))) {
                  return 'guest_type';
                }
              }
              if (originalKey === 'paymentType') {
                if (!bookings.some(b => ('paymentType' in b)) && bookings.some(b => ('payment_type' in b))) {
                  return 'payment_type';
                }
              }
              if (originalKey === 'netToOwner') {
                if (!bookings.some(b => ('netToOwner' in b)) && bookings.some(b => ('net_to_owner' in b))) {
                  return 'net_to_owner';
                }
                if (!bookings.some(b => ('netToOwner' in b)) && bookings.some(b => ('nettoowner' in b))) {
                  return 'nettoowner';
                }
              }
              return originalKey;
            })(),
            header: (() => {
              switch (originalKey) {
                case 'id': return 'ID';
                case 'unitName': return 'Unit';
                case 'bookingDate': return 'B Date';
                case 'confirmationCode': return 'Bookings';
                case 'source': return 'Source';
                case 'status': return 'Status';
                case 'guestName': return 'Guest';
                case 'guests': return 'Pax';
                case 'city': return 'City';
                case 'checkIn': return 'Stay';
                case 'checkOut': return 'CheckOut';
                case 'days': return '#';
                case 'payout': return 'Payout';
                case 'isPaid': return 'Paid';
                case 'roomFee': return 'Room Fee';
                case 'commissionBase': return 'Base';
                case 'paymentMethod': return 'Payment';
                case 'taxPercent': return 'Tax %';
                case 'taxAmount': return 'Tax';
                case 'netPayout': return 'Net';
                case 'cleaningFee': return 'Cleaning';
                case 'commissionPercent': return 'O2 %';
                case 'commissionValue': return 'O2';
                case 'o2Total': return 'O2 Total';
                // case 'clientIncome': return 'Client Total'; // REMOVED
                case 'netToOwner': return 'Client';
                case 'guestType': return 'Guest';
                case 'paymentType': return 'Type';
                case 'notes': return 'Notes';
                case 'checkInNotes': return 'CheckIn Notes';
                case 'checkOutNotes': return 'CheckOut Notes';
                default: return originalKey;
              }
            })(),
            render: (value, row) => {
              if (originalKey === 'bookingDate') {
                return formatDDMMYYYY(value);
              }
              if (originalKey === 'checkIn') {
                const checkInVal = row.checkIn ?? row.check_in ?? value;
                const checkOutVal = row.checkOut ?? row.check_out ?? '';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                    <span style={{ fontWeight: 600 }}>{formatDDMMYYYY(checkInVal)}</span>
                    {checkOutVal && (
                      <span style={{ fontSize: 12, color: '#475467' }}>
                        {formatDDMMYYYY(checkOutVal)}
                      </span>
                    )}
                  </div>
                );
              }
              if (originalKey === 'confirmationCode') {
                const codeVal = row.confirmationCode ?? row.confirmation_code ?? row.code ?? value ?? '';
                const bookingDateVal =
                  row.bookingDate ??
                  row.booking_date ??
                  row.bookingdate ??
                  null;
                const sourceRaw = (row.source ?? row.bookingSource ?? row.channel ?? '').toString();
                const sourceNorm = sourceRaw.trim().toLowerCase();
                const renderSource = () => {
                  if (!sourceRaw) return null;
                  if (sourceNorm === 'airbnb') {
                    return (
                      <img
                        src="/images/airbnb.png"
                        alt="Airbnb"
                        title="Airbnb"
                        style={{ width: 14, height: 14, objectFit: 'contain' }}
                      />
                    );
                  }
                  if (sourceNorm === 'private' || sourceNorm === 'owners2') {
                    return (
                      <img
                        src="/images/o2icon.svg"
                        alt="Owners2"
                        title="Owners2"
                        style={{ width: 14, height: 14, objectFit: 'contain' }}
                      />
                    );
                  }
                  return (
                    <span style={{ fontSize: 12, color: '#475467' }}>{sourceRaw}</span>
                  );
                };
                const hasDate = Boolean(bookingDateVal);
                const formattedDate = hasDate ? formatDDMMYYYY(bookingDateVal) : '';
                const sourceNode = renderSource();
                const metaPieces = [];
                if (formattedDate) metaPieces.push(<span key="date">{formattedDate}</span>);
                if (formattedDate && sourceNode) {
                  metaPieces.push(<span key="dot" style={{ opacity: 0.45 }}>•</span>);
                }
                if (sourceNode) {
                  metaPieces.push(<span key="src" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{sourceNode}</span>);
                }
                const handleSourceClick = (e) => {
                  e.stopPropagation();
                  if (!sourceNorm) return;
                  setSourceFilter((prev) => (prev === sourceNorm ? '' : sourceNorm));
                };
                return (
                  <button
                    className="confirmation-code"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      textAlign: 'left',
                      width: '100%'
                    }}
                    onClick={() => {
                      setSelectedBooking(row);
                      setDrawerOpen(true);
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{codeVal}</span>
                    {metaPieces.length > 0 && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: '#475467',
                          lineHeight: 1.2,
                        }}
                      >
                        <span
                          role={sourceNode ? 'button' : undefined}
                          onClick={sourceNode ? handleSourceClick : undefined}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: sourceNode ? 'pointer' : 'default',
                          }}
                        >
                          {metaPieces}
                        </span>
                      </span>
                    )}
                  </button>
                );
              }
              if (originalKey === 'status') {
                const v = String(value).toLowerCase();
                const cls = (v === 'active') ? 'ongoing' : v;
                return <span className={`status-pill ${cls}`}><strong>{value}</strong></span>;
              }
              // Handle unitName field rendering
              if (originalKey === 'unitName') {
                const unitLabel = row.unit_name || row.unitName || '-';
                const cityRaw = row.city || row.cityLabel || row.city_name || '';
                const cityLabel = cityRaw === 'Playa del Carmen'
                  ? 'Playa'
                  : cityRaw || '';
                const handleCityClick = (e) => {
                  e.stopPropagation();
                  if (!cityLabel) return;
                  const normalizedCity = cityLabel.toLowerCase();
                  setCityFilter((prev) => (prev === normalizedCity ? '' : normalizedCity));
                };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                    <span style={{ fontWeight: 600 }}>{unitLabel}</span>
                    {cityLabel && (
                      <span
                        style={{ fontSize: 12, color: '#475467', cursor: 'pointer' }}
                        onClick={handleCityClick}
                      >
                        {cityLabel}
                      </span>
                    )}
                  </div>
                );
              }
              if (originalKey === 'guestName') {
                const guestLabel = row.guestName || row.guest_name || '-';
                const pax = row.guests ?? row.pax ?? row.guest_count ?? null;
                const nights = row.days ?? row.nights ?? null;
                const metaPieces = [];
                if (pax != null && pax !== '') metaPieces.push(<span key="pax">{pax} pax</span>);
                if (pax != null && pax !== '' && nights != null && nights !== '') {
                  metaPieces.push(<span key="dot" style={{ opacity: 0.45 }}>•</span>);
                }
                if (nights != null && nights !== '') metaPieces.push(<span key="nights">{nights} nights</span>);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                    <span style={{ fontWeight: 600 }}>{guestLabel}</span>
                    {metaPieces.length > 0 && (
                      <span style={{ fontSize: 12, color: '#475467', display: 'flex', gap: 6 }}>
                        {metaPieces}
                      </span>
                    )}
                  </div>
                );
              }
              if (originalKey === 'taxPercent' || originalKey === 'commissionPercent') {
                return value == null ? '' : `${value}%`;
              }
              if (originalKey === 'paymentMethod') {
                const payoutRaw = row.payout;
                const formatCurrency = (amt) => {
                  const num = Number(amt);
                  if (!Number.isNaN(num)) {
                    return new Intl.NumberFormat('de-DE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(num);
                  }
                  return amt ?? '';
                };
                const formattedPayout = formatCurrency(payoutRaw) || '—';
                const methodRaw = (value ?? '').toString().trim();
                const methodLabel = methodRaw ? methodRaw.charAt(0).toUpperCase() + methodRaw.slice(1).toLowerCase() : '';
                const checked = Boolean(row.isPaid ?? row.paid ?? false);
                const isAirbnb = (row.source === 'Airbnb');
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, alignItems: 'flex-end', textAlign: 'right' }}>
                    <span style={{ fontWeight: 600 }}>{formattedPayout}</span>
                    <span style={{ fontSize: 12, color: '#475467', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      {methodLabel && <span>{methodLabel}</span>}
                      {methodLabel && (
                        <span style={{ opacity: 0.45 }}>•</span>
                      )}
                      <label
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isAirbnb}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = e.target.checked;
                            if (next) {
                              setPaymentBooking(row);
                              setPaymentDrawerOpen(true);
                            } else if (window.confirm('Mark as unpaid?')) {
                              markAsUnpaid(row.id);
                            }
                          }}
                        />
                        <span style={{ color: '#475467' }}>Paid</span>
                      </label>
                    </span>
                  </div>
                );
              }
              // EU currency formatting for money fields
              if ([
                'payout',
                'taxAmount',
                'netPayout',
                'roomFee',
                'commissionBase',
                'commissionValue',
                'o2Total',
                'netToOwner'
              ].includes(originalKey)) {
                const num = Number(value);
                if (!Number.isNaN(num)) {
                  return new Intl.NumberFormat('de-DE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }).format(num);
                }
                return value ?? '';
              }
              return value == null ? '' : String(value);
            },
            // continue with the rest
            ...(() => {
              // Date columns: cap width and tag with class 'date'
              if (['bookingDate', 'checkIn', 'checkOut'].includes(originalKey)) {
                return {
                  filterable: true,
                  filterType: 'monthYear',
                  filterProps: { sx: { width: 110, maxWidth: 110 } },
                  width: 110,
                  headerMaxWidth: 110,
                  headerProps: { className: 'date' },
                  cellProps: { className: 'date', sx: { maxWidth: 110 } },
                  sortable: false
                };
              }
              // Paid column: fixed 87px and centered
              if (originalKey === 'isPaid') {
                return {
                  filterable: false,
                  width: 87,
                  headerProps: { sx: { width: 87, textAlign: 'center' } },
                  cellProps: { align: 'center', sx: { textAlign: 'center', width: 87 } }
                };
              }
              // Ensure small but visible widths for key meta columns
              if (originalKey === 'id') {
                return {
                  filterable: false,
                  width: 80,
                  headerProps: { sx: { width: 80 } },
                  cellProps: { sx: { width: 80 } }
                };
              }
              if (originalKey === 'source') {
                return {
                  filterable: true,
                  filterType: 'select',
                  filterProps: { sx: { minWidth: 90 } },
                  width: 110,
                  headerProps: { sx: { width: 110 } },
                  cellProps: { sx: { width: 110 } }
                };
              }
              if (originalKey === 'confirmationCode') {
                return {
                  filterable: true,
                  filterType: 'text',
                  // Allow the filter input to shrink with the column while keeping a sensible cap
                  filterProps: { placeholder: 'Code', sx: { minWidth: 120, maxWidth: 128, width: '100%' } },
                  width: 140,
                  headerMaxWidth: 140,
                  headerProps: { sx: { width: 140, maxWidth: 140 } },
                  cellProps: { sx: { width: 140, maxWidth: 140, whiteSpace: 'normal' } },
                  truncate: false,
                };
              }
              if (originalKey === 'status') {
                return {
                  filterable: true,
                  filterType: 'select',
                  // keep the control narrower than the header to avoid clipping
                  filterProps: { sx: { width: '100%', maxWidth: 90, minWidth: 80 } },
                  width: 110,
                  headerMaxWidth: 110,
                  headerProps: { sx: { width: 110, maxWidth: 110 } },
                  cellProps: { sx: { width: 110, maxWidth: 110 } }
                };
              }
              // Code (confirmationCode): ensure visible width
              if (originalKey === 'confirmationCode') {
                return {
                  filterable: true,
                  filterProps: { sx: { width: '100%', maxWidth: '128px', minWidth: '120px' } },
                  width: 140,
                  headerMaxWidth: 140,
                  headerProps: { sx: { width: 140, maxWidth: 140 } },
                  cellProps: { sx: { width: 140, maxWidth: 140 } }
                };
              }
              // Pax (guests)
              if (originalKey === 'guests') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 80,
                  headerProps: { sx: { width: 80 } },
                  cellProps: { sx: { width: 80 } }
                };
              }
              // Nights (days)
              if (originalKey === 'days') {
                return {
                  filterable: true,
                  filterType: 'number',
                  filterProps: {
                    inputProps: { style: { textAlign: 'center' } },
                    sx: {
                      /* make the control fill the cell width */
                      '& .MuiFormControl-root, & .MuiInputBase-root, & .MuiOutlinedInput-root': { width: '100%' },
                      /* center the text inside the input */
                      '& .MuiInputBase-input': { textAlign: 'center', paddingLeft: '8px', paddingRight: '8px' },
                      '& .MuiOutlinedInput-input': { textAlign: 'center', paddingLeft: '8px', paddingRight: '8px' },
                      /* hide number spinners which can offset centering in some browsers */
                      '& input[type=number]': { MozAppearance: 'textfield' },
                      '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
                        WebkitAppearance: 'none',
                        margin: 0
                      }
                    }
                  },
                  width: 80,
                  headerProps: {
                    sx: {
                      width: 80,
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      paddingLeft: '12px',
                      paddingRight: '12px'
                    }
                  },
                  cellProps: { sx: { width: 80 } }
                };
              }
              // Payout (payout)
              if (originalKey === 'payout') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 120,
                  headerProps: { sx: { width: 120 } },
                  cellProps: { sx: { width: 120 } }
                };
              }
              // Payment (paymentMethod)
              if (originalKey === 'paymentMethod') {
                return {
                  filterable: true,
                  filterType: 'select',
                  filterProps: {
                    sx: {
                      minWidth: 130,
                      maxWidth: 180,
                      width: '100%',
                      '& .MuiInputBase-root, & .MuiSelect-select, & input': {
                        textAlign: 'right',
                      },
                      '& .MuiInputBase-root': {
                        justifyContent: 'flex-end',
                      },
                    },
                  },
                  width: 180,
                  headerMaxWidth: 180,
                  headerProps: {
                    sx: {
                      width: 180,
                      maxWidth: 180,
                      textAlign: 'right',
                    },
                  },
                  cellProps: {
                    align: 'right',
                    sx: {
                      width: 180,
                      maxWidth: 180,
                      whiteSpace: 'normal',
                      textAlign: 'right',
                    },
                  },
                  truncate: false,
                };
              }
              // Tax (taxAmount)
              if (originalKey === 'taxAmount') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 110,
                  headerProps: { sx: { width: 110 } },
                  cellProps: { sx: { width: 110 } }
                };
              }
              // Net (netPayout)
              if (originalKey === 'netPayout') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 120,
                  headerProps: { sx: { width: 120 } },
                  cellProps: { sx: { width: 120 } }
                };
              }
              // Cleaning (cleaningFee)
              if (originalKey === 'cleaningFee') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 110,
                  headerProps: { sx: { width: 110 } },
                  cellProps: { sx: { width: 110 } }
                };
              }
              // Base (commissionBase)
              // Base (commissionBase)
              if (originalKey === 'commissionBase') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 123,
                  headerProps: { sx: { width: 123 } },
                  cellProps: { sx: { width: 123 } }
                };
              }
              // O2 (commissionValue)
              if (originalKey === 'commissionValue') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 110,
                  headerProps: { sx: { width: 110 } },
                  cellProps: { sx: { width: 110 } }
                };
              }
              // Client (netToOwner)
              if (originalKey === 'netToOwner') {
                return {
                  filterable: true,
                  filterType: 'number',
                  width: 130,
                  headerProps: { sx: { width: 130 } },
                  cellProps: { sx: { width: 130 } }
                };
              }
              // Guest (guestType)
              if (originalKey === 'guestType') {
                return {
                  filterable: true,
                  filterType: 'select',
                  width: 110,
                  headerProps: { sx: { width: 110 } },
                  cellProps: { sx: { width: 110 } }
                };
              }
              // Type (paymentType)
              if (originalKey === 'paymentType') {
                return {
                  filterable: true,
                  filterType: 'select',
                  width: 110,
                  headerProps: { sx: { width: 110 } },
                  cellProps: { sx: { width: 110 } }
                };
              }
              // Ensure Tax % gets a column width regardless of filter type placement
              if (originalKey === 'taxPercent') {
                return {
                  filterable: true,
                  filterProps: { sx: { minWidth: 50 } },
                  width: 97,
                  headerProps: { sx: { width: 97 } },
                  cellProps: { sx: { width: 97 } }
                };
              }
              if (originalKey === 'commissionPercent') {
                return {
                  filterable: true,
                  filterProps: { sx: { Width: 97 } },
                  width: 97,
                  headerProps: { sx: { width: 97 } },
                  cellProps: { sx: { width: 97 } }
                };
              }
              if (originalKey === 'o2Total') {
                return { filterable: true, filterProps: { sx: { minWidth: 100 } }, width: 130 };
              }
              if (originalKey === 'roomFee') {
                return {
                  filterable: true,
                  filterProps: { sx: { minWidth: 80 } },
                  width: 123,
                  headerProps: { sx: { width: 123 } },
                  cellProps: { sx: { width: 123 } }
                };
              }
              // Set specific width, alignment and autocomplete filter for unitName column
              if (originalKey === 'unitName') {
                return {
                  filterable: true,
                  filterType: 'autocomplete',
                  filterProps: { sx: { width: '100%', maxWidth: 160, minWidth: 120 } },
                  width: 160,
                  headerMaxWidth: 160,
                  headerProps: { sx: { width: 160, maxWidth: 160 } },
                  cellProps: { align: 'left', sx: { textAlign: 'left', width: 160, maxWidth: 160 } }
                };
              }
              // Dropdown/select filters for categorical fields
              const selectables = ['status', 'source', 'paymentMethod', 'guest_type', 'payment_type', 'guestType', 'paymentType'];
              if (selectables.includes(originalKey)) {
                if (originalKey === 'source') {
                  return { filterable: true, filterType: 'select', filterProps: { sx: { minWidth: 70 } } };
                }
                if (originalKey === 'paymentMethod') {
                  return { filterable: true, filterType: 'select', filterProps: { sx: { minWidth: 90 } } };
                }
                return { filterable: true, filterType: 'select' };
              }
              // Text filters for common text fields
              const textables = ['guestName', 'unitName', 'notes', 'checkInNotes', 'checkOutNotes'];
              if (textables.includes(originalKey)) {
                if (originalKey === 'guestName') {
                  return {
                    filterable: true,
                    filterProps: { sx: { width: '100%', maxWidth: 200, minWidth: 140 } },
                    width: 200,
                    headerMaxWidth: 200,
                    headerProps: { sx: { width: 200, maxWidth: 200 } },
                    cellProps: { align: 'left', sx: { textAlign: 'left', width: 200, maxWidth: 200 } }
                  };
                }
                if (originalKey === 'notes' || originalKey === 'checkInNotes' || originalKey === 'checkOutNotes') {
                  return {
                    filterable: true,
                    filterProps: {
                      sx: {
                        width: 160,
                        '& .MuiInputBase-input': { paddingLeft: '10px', paddingRight: '10px' },
                        '& .MuiOutlinedInput-input': { paddingLeft: '10px', paddingRight: '10px' }
                      }
                    },
                    width: 160
                  };
                }
                return { filterable: true };
              }
              return {};
            })(),
            ...(
              [
                'payout',
                'roomFee',
                'taxAmount',
                'netPayout',
                'cleaningFee',
                'commissionValue',
                'o2Total'
                // 'clientIncome' removed
              ].includes(originalKey) || originalKey === 'netToOwner' || originalKey === 'commissionBase'
                ? { type: 'currency' }
                : {}
            ),
          };
        }).filter(Boolean);
      })()
    : [];

  // --- Debug: log columns being sent to DataTable (header + accessor) ---
  try {
    const dbg = (columns || []).map((c, i) => ({
      idx: i,
      header: typeof c.header === 'string' ? c.header : (c.header?.toString?.() || ''),
      accessor: typeof c.accessor === 'string' ? c.accessor : (c.accessor?.toString?.() || ''),
    }));
    console.table(dbg);
  } catch (e) {
    // ignore
  }


  const handleClearFilters = () => {
    setFilterKey((prev) => prev + 1);
    setSourceFilter('');
    setCityFilter('');
    setStayFromYm(defaultYm);
    setStayToYm('');
    fetchBookings();
  };

  const actionBar = (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <IconButton
        size="small"
        onClick={toggleView}
        title={view === 'basic' ? 'Show full view' : 'Show basic view'}
      >
        <HiOutlineArrowPathRoundedSquare size={18} />
      </IconButton>
      <Button
        variant="contained"
        onClick={() => {
          setSelectedBooking(null);
          setDrawerOpen(true);
        }}
      >
        + New Booking
      </Button>
      <Button
        variant="outlined"
        onClick={() => setBlockDrawerOpen(true)}
      >
        + New Block
      </Button>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <YearMonthPicker
          value={stayFromYm}
          onChange={(val) => setStayFromYm(val || defaultYm)}
          label="Check-in month"
          sx={{ minWidth: 180, maxWidth: 180 }}
        />
        <YearMonthPicker
          value={stayToYm}
          onChange={(val) => setStayToYm(val || '')}
          label="Check-out month"
          sx={{ minWidth: 180, maxWidth: 180 }}
        />
        <Button
          variant="outlined"
          onClick={handleClearFilters}
        >
          Clear Filters
        </Button>
        {sourceFilter && (
          <Button
            variant="text"
            color="primary"
            onClick={() => setSourceFilter('')}
            sx={{ textTransform: 'none' }}
          >
            Clear source ({sourceFilter})
          </Button>
        )}
        {cityFilter && (
          <Button
            variant="text"
            color="primary"
            onClick={() => setCityFilter('')}
            sx={{ textTransform: 'none' }}
          >
            Clear city ({cityFilter})
          </Button>
        )}
      </Stack>
    </Stack>
  );

  return (
    <PageScaffold
      title="Bookings"
      sectionKey="bookings"
      currentPath="/bookings"
      layout="table"
      stickyHeader={actionBar}
    >
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TableLite
          key={filterKey}
          columns={columns}
          rows={dataForTable}
          loading={loading}
          enableFilters
          optionsSourceRows={bookings}
          defaultStringTransform={null}
        />
      </Box>
        <AppDrawer
          open={drawerOpen}
          onClose={() => {
            // Cancel/close: do not trigger highlight scroll
            closeBookingDrawer();
            fetchBookings();
          }}
          title={selectedBooking
            ? (isSoftBooking(selectedBooking)
                ? (() => {
                    const init = softInitial || getSoftInitialValues(selectedBooking) || {};
                    const unit = init.unitName || selectedBooking.unitName || selectedBooking.unit_name || '';
                    if ((init.type || '').toString() === 'Block') {
                      const reason = init.reason || 'Block';
                      return `Edit ${reason} block for ${unit}`.trim();
                    }
                    // Hold fallback
                    return `Edit Hold for ${unit}`.trim();
                  })()
                : `Edit Booking ${selectedBooking.confirmationCode || ''}`)
            : 'New Booking'}
          showActions
          formId={selectedBooking
            ? (isSoftBooking(selectedBooking) ? 'block-edit-form' : 'booking-edit-form')
            : 'booking-new-form'}
        >
          {drawerOpen && (
            selectedBooking ? (
              isSoftBooking(selectedBooking) ? (
                <BlockCalEditFormRHF
                  initialValues={softInitial || getSoftInitialValues(selectedBooking)}
                  unitOptions={softUnits}
                  loadingUnits={false}
                  onSubmit={async (values) => {
                    try {
                      const id = selectedBooking?.id;
                      if (!id) throw new Error('Missing booking id');

                      // Determine kind (Hold or Block) only to shape payload
                      const kind = (values?.type || softInitial?.type || '').toString();

                      let payload = {};
                      if (kind === 'Hold') {
                        const toNum = (v) => (v === '' || v == null ? undefined : Number(v));
                        const todayYmd = () => {
                          const d = new Date();
                          const y = d.getFullYear();
                          const m = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          return `${y}-${m}-${day}`;
                        };
                        const genO2M = () => {
                          const stamp = Date.now().toString();
                          const suffix = stamp.slice(-6) + Math.floor(Math.random() * 90 + 10); // 8 digits-ish
                          return `O2M${suffix}`;
                        };
                        const selStatus = values.status;

                        // Base payload (shared for any Hold edit)
                        payload = {
                          // map Type → guest_type
                          guest_type: 'Hold',
                          // include booking and unit context (if present)
                          bookingDate: values.bookingDate ?? softInitial?.bookingDate ?? selectedBooking?.bookingDate ?? selectedBooking?.booking_date,
                          unitName: values.unitName ?? softInitial?.unitName ?? selectedBooking?.unitName ?? selectedBooking?.unit_name,
                          // dates (camelCase as requested)
                          checkIn: values.checkIn ?? softInitial?.checkIn ?? selectedBooking?.checkIn ?? selectedBooking?.check_in,
                          checkOut: values.checkOut ?? softInitial?.checkOut ?? selectedBooking?.checkOut ?? selectedBooking?.check_out,
                          // guest & counts
                          guestName: values.guestName ?? undefined,
                          guests: toNum(values.guests),
                          // money-related
                          payout: toNum(values.payout),
                          payment_method: values.paymentMethod ?? selectedBooking?.paymentMethod ?? undefined,
                          cleaningFee: toNum(values.cleaningFee),
                          commission_percent: toNum(values.commissionPercent),
                          // misc
                          notes: values.notes ?? undefined,
                          status: selStatus === 'Cancel' ? 'Cancelled' : selStatus ?? undefined,
                          // Always include the latest policy and expiry in the base payload
                          holdPolicy: values.holdPolicy ?? softInitial?.holdPolicy ?? selectedBooking?.holdPolicy ?? selectedBooking?.hold_policy ?? undefined,
                          holdExpiresAt: values.holdExpiresAt ?? softInitial?.holdExpiresAt ?? selectedBooking?.holdExpiresAt ?? selectedBooking?.hold_expires_at ?? undefined,
                        };

                        // Transitions:
                        if (selStatus === 'Confirm') {
                          payload.action = 'confirm';
                          // Remove any pre-set status; controller/status updater will compute it
                          delete payload.status;
                          // Send canonical guestType, fallback to guestTypeConfirm if needed
                          const gt = values.guestType ?? values.guestTypeConfirm;
                          if (gt) payload.guestType = gt;
                          // Do NOT send source/bookingDate/codes — server is the source of truth
                        } else if (selStatus === 'Extend') {
                          payload.action = 'extend';
                          // keep status out (action drives it)
                          delete payload.status;
                          // explicitly send chosen policy and the live recomputed expiry
                          payload.holdPolicy = values.holdPolicy ?? '24h';
                          payload.holdExpiresAt = values.holdExpiresAt ?? payload.holdExpiresAt;
                        } else if (selStatus === 'Cancel') {
                          payload.status = 'Cancelled';
                        }
                      } else {
                        // Block — send only camelCase fields and guestType (no snake_case, no guest_type)
                        const toJsDate = (v) => (v?.toDate ? v.toDate() : (v?.$d ? v.$d : (v instanceof Date ? v : (v ? new Date(v) : null))));
                        const toYmd = (v) => {
                          if (!v) return undefined;
                          // If already YYYY-MM-DD, keep as-is (prevents TZ drift)
                          if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
                          const d = toJsDate(v);
                          if (!d || Number.isNaN(d.getTime())) return undefined;
                          const y = d.getFullYear();
                          const m = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          return `${y}-${m}-${day}`;
                        };
                        const ci = toYmd(
                          values.start ?? values.checkIn ?? softInitial?.checkIn ?? softInitial?.check_in ?? selectedBooking?.checkIn ?? selectedBooking?.check_in
                        );
                        const co = toYmd(
                          values.end   ?? values.checkOut ?? softInitial?.checkOut ?? softInitial?.check_out ?? selectedBooking?.checkOut ?? selectedBooking?.check_out
                        );
                        const reason =
                          values.reason ||
                          softInitial?.reason ||
                          selectedBooking?.guestName ||
                          selectedBooking?.guestType ||
                          'Other';
                        payload = {
                          status: values.status === 'Cancel' ? 'Cancelled' : values.status ?? undefined,
                          checkIn: ci,
                          checkOut: co,
                          guestName: reason,
                          guestType: 'Block',
                          notes: values.notes ?? '',
                        };
                      }

                      // Strip undefined keys and any accidental foreign keys
                      let clean = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));
                      delete clean.unitId;
                      delete clean.unitName;
                      delete clean.type; // controller infers Block logic from content but we keep safety

                      // Debug: inspect the exact payload sent to API
                      console.log('[SoftEdit] PUT /api/soft-reservations/' + id, JSON.parse(JSON.stringify(clean)));

                      await api.put(`/api/soft-reservations/${id}`, clean, {
                        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() }
        }).filter(Boolean);

                      const idToHighlight = id;
                      setHighlightId(idToHighlight);
                      fetchBookings();
                      closeBookingDrawer();
                      toast?.success?.('Reservation saved');
                    } catch (e) {
                      console.error('Failed to save reservation', e);
                      toast?.error?.('Could not save reservation');
                    }
                  }}
                  onCancel={() => {
                    closeBookingDrawer();
                  }}
                />
              ) : (
                <BookingEditFormRHF
                  formId="booking-edit-form"
                  hideActions
                  initialValues={selectedBooking}
                  unitOptions={Array.from(
                    new Map(
                      (bookings || [])
                        .filter(b => b && b.unitId && b.unitName)
                        .map(b => [b.unitId, { id: b.unitId, label: b.unitName }])
                    ).values()
                  )}
                  loadingUnits={false}
                  availabilityEndpoint="/api/ical/unit-calendar"
                  submitLabel="Save"
                  onSubmit={async (values) => {
                    try {
                      const id = selectedBooking?.id;
                      if (!id) throw new Error('Missing booking id');
                      await api.put(`/api/bookings/${id}`, values, {
                        headers: { 'Content-Type': 'application/json' }
                      });
                      const idToHighlight = id;
                      setHighlightId(idToHighlight);
                      fetchBookings();
                      closeBookingDrawer();
                      toast?.success?.('Booking saved');
                    } catch (e) {
                      console.error('Failed to save booking', e);
                      toast?.error?.('Could not save booking');
                    }
                  }}
                  onCancel={() => {
                    closeBookingDrawer();
                  }}
                />
              )
            ) : (
              <BookingNewFormRHF
                unitOptions={Array.from(
                  new Map(
                    (bookings || [])
                      .filter(b => b && b.unitId && b.unitName)
                      .map(b => [b.unitId, { id: b.unitId, label: b.unitName }])
                  ).values()
                )}
                initialValues={{
                  status: 'Upcoming',
                  paymentMethod: 'platform'
                }}
                formId="booking-new-form"
                hideActions
                submitLabel="Create"
                onSubmit={async (values) => {
                  try {
                    // Pick correct backend endpoint based on booking source
                    const src = String(values?.source || '').toLowerCase();
                    const endpoint = (src === 'airbnb')
                      ? '/api/bookings/manual-airbnb'
                      : '/api/bookings/private-reservation';
                    const resp = await api.post(endpoint, values, {
                      headers: { 'Content-Type': 'application/json' }
                    });
                    const created = resp?.data || {};
                    setHighlightId(created?.id || null);
                    fetchBookings();
                    closeBookingDrawer();
                    toast?.success?.('Booking created');
                  } catch (e) {
                    console.error('Failed to create booking', e);
                    toast?.error?.('Could not create booking');
                  }
                }}
                onCancel={() => {
                  closeBookingDrawer();
                }}
              />
            )
          )}
        </AppDrawer>
        <AppDrawer
          open={blockDrawerOpen}
          onClose={() => {
            setBlockDrawerOpen(false);
          }}
          title={'+ New Block'}
          showActions
          formId="block-cal-form"
        >
          {blockDrawerOpen && (
            <BlockCalFormRHF
              initialType="Block"
              unitOptions={blockUnitOptions}
              onSuccess={(created) => {
                if (created && created.id) setHighlightId(created.id);
                setBlockDrawerOpen(false);
                fetchBookings();
                toast?.success?.('Block/Hold created');
              }}
            />
          )}
        </AppDrawer>
        <FormDrawer
          open={paymentDrawerOpen}
          onClose={() => {
            setPaymentDrawerOpen(false);
            setPaymentBooking(null);
          }}
          title={paymentBooking ? `Confirm Payment ${paymentBooking.confirmationCode || ''}` : 'Confirm Payment'}
        >
          {paymentBooking && (
            <PaymentConfirmForm
              booking={paymentBooking}
              onSubmit={async ({ note, paymentMethod }) => {
                await markAsPaid(paymentBooking.id, { note, paymentMethod });
                setPaymentDrawerOpen(false);
                setPaymentBooking(null);
              }}
              onClose={() => {
                setPaymentDrawerOpen(false);
                setPaymentBooking(null);
              }}
            />
          )}
        </FormDrawer>
    </PageScaffold>
  );

};

export default SeeBookings;
