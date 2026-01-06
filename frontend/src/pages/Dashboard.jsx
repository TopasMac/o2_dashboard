import api from '../api';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAlerts from '../hooks/useAlerts';
import AlertCenter from '../components/cards/AlertCenter';

import ActivityCard from '../components/cards/ActivityCard';
import NotificationsCard from '../components/cards/NotificationsCard';
import TaskNotificationsCard from '../components/cards/TaskNotificationsCard';
import OccupancyWatchCard from '../components/cards/OccupancyWatchCard';
import DashboardAlertCenterCard from '../components/cards/DashboardAlertCenterCard';
import MonthSummaryCard from '../components/cards/MonthSummaryCard';

import AppShell from '../components/layout/AppShell';
import SectionHeader from '../components/layout/SectionHeader';
import PageScaffold from '../components/layout/PageScaffold';



const formatMoney = (value) => {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  if (isNaN(num)) return '—';
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(num);
  } catch {
    return `${num.toFixed(0)}`;
  }
};

const formatMonthName = (ym) => {
  if (!ym) return '';
  const [year, month] = ym.split('-');
  if (!year || !month) return ym;
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleString('en-US', { year: 'numeric', month: 'long' });
};

const yymm = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;


const Dashboard = () => {
  const navigate = useNavigate();
  const OW_CARD_HEIGHT = 600;
  const ALERTS_HEIGHT = 230;            // fixed height for Alerts card
  const NOTIF_HEIGHT = 400;             // fixed height for Notifications card
  const USE_SINGLE_SUMMARY = true; // hard-disable legacy multi-call effects
  const [unitStats, setUnitStats] = useState({ total: 0, playa: 0, tulum: 0 });
  const [activity, setActivity] = useState({ checkIns: [], checkOuts: [] });
  const [monthEarnings, setMonthEarnings] = useState({
    current: { total: 0, playa: 0, tulum: 0 },
    previous: { total: 0, playa: 0, tulum: 0 },
    ym: '',
    prevYm: ''
  });
  // Alerts/Notifications server state
  const [alertsServer, setAlertsServer] = useState([]);
  const [taskNotifications, setTaskNotifications] = useState([]);
  const [taskNotificationsLoading, setTaskNotificationsLoading] = useState(true);
  const [taskView, setTaskView] = useState('notifications');
  const [taskReloadKey, setTaskReloadKey] = useState(0);
  const { alerts, dismissAlert } = useAlerts({
    serverAlerts: (Array.isArray(alertsServer) && alertsServer.length > 0) ? alertsServer : null,
    autoFetch: !(Array.isArray(alertsServer) && alertsServer.length > 0)
  });
  const [showPrevCommDD, setShowPrevCommDD] = useState(false);
  const [showCurrCommDD, setShowCurrCommDD] = useState(false);
  const [showPrevUnitsDD, setShowPrevUnitsDD] = useState(false);
  const [showCurrUnitsDD, setShowCurrUnitsDD] = useState(false);
  const [reservationsCount, setReservationsCount] = useState({ current: 0, previous: 0 });
  const [reservationsGuests, setReservationsGuests] = useState({ current: 0, previous: 0 });
  const [reviewsStats, setReviewsStats] = useState({
    current: { done: 0, possible: 0 },
    previous: { done: 0, possible: 0 }
  });
  const [showYtdCommDD, setShowYtdCommDD] = useState(false);
  // Helper to safely extract array of members/bookings from API data
  const safeMember = (data) => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.member)) return data.member;
    if (data && Array.isArray(data['hydra:member'])) return data['hydra:member'];
    return [];
  };

  // Helper to get guest count from booking object
  const getGuestCount = (b) => {
    const n = (
      b?.guestCount ?? b?.guests ?? b?.numGuests ?? b?.totalGuests ??
      ((b?.adults ?? 0) + (b?.children ?? 0) + (b?.infants ?? 0))
    );
    const x = typeof n === 'string' ? parseInt(n, 10) : (Number.isFinite(n) ? n : 0);
    return Number.isFinite(x) ? x : 0;
  };

  // Helpers for reviews stats
  const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isReviewMade = (a) => {
    const v = (a?.status ?? a?.action ?? a?.result ?? a?.mark ?? '').toString().toLowerCase();
    if (v === 'made' || v === 'done' || v === 'completed' || v === 'ok' || v === 'reviewed') return true;
    if (a?.done === true) return true;
    return false;
  };
  const getActionBookingId = (a) => (a?.bookingId ?? a?.booking_id ?? (typeof a?.booking === 'object' ? a.booking?.id : a?.booking) ?? a?.reservationId ?? a?.reservation_id ?? null);

  // ================= Extra fixed months state and helpers =================
  const [extraMonths] = useState(['2025-10', '2025-11', '2025-12']);
  const [extraMonthStats, setExtraMonthStats] = useState({}); // { ym: { earnings:{total,playa,tulum}, reservations, guests, reviews:{done,possible} } }
  const [showExtraUnitsDD, setShowExtraUnitsDD] = useState({}); // { ym: boolean }
  const [showExtraCommDD, setShowExtraCommDD] = useState({}); // { ym: boolean }
  const [ytdStats, setYtdStats] = useState({ earnings: { total: 0, playa: 0, tulum: 0 }, reservations: 0, guests: 0, reviews: { done: 0, possible: 0 } });
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  // ========= Single-call Month Summary (server-aggregated) =========
  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const ym = now.toISOString().slice(0, 7);
        const res = await api.get(`/api/month-summary?yearMonth=${encodeURIComponent(ym)}`);
        const data = res?.data || {};
        const p = data?.periods || {};
        const prev = p?.prev || {};
        const curr = p?.current || {};
        const next = p?.next || {};
        const nov  = p?.nov || {};
        const dec  = p?.dec || {};
        const ytd  = p?.ytd || {};

        // Units / Clients (static across periods)
        const units = Number(curr?.units ?? 0);
        const clients = Number(curr?.clients ?? 0);
        setUnitStats({
          total: units,
          playa: unitStats.playa, // keep existing breakdown if any (we don't get city split from summary)
          tulum: unitStats.tulum,
          activeClients: clients
        });

        // Month earnings totals (no city split from summary -> keep 0 for city details)
        setMonthEarnings({
          current: { total: Number(curr?.commissions ?? 0), playa: 0, tulum: 0 },
          previous: { total: Number(prev?.commissions ?? 0), playa: 0, tulum: 0 },
          ym: curr?.label || ym,
          prevYm: prev?.label || ''
        });

        // Reservations / Guests
        setReservationsCount({ current: Number(curr?.reservations ?? 0), previous: Number(prev?.reservations ?? 0) });
        setReservationsGuests({ current: Number(curr?.guests ?? 0), previous: Number(prev?.guests ?? 0) });

        // Reviews
        setReviewsStats({
          current: { done: Number(curr?.reviews?.made ?? 0), possible: Number(curr?.reviews?.total ?? 0) },
          previous: { done: Number(prev?.reviews?.made ?? 0), possible: Number(prev?.reviews?.total ?? 0) }
        });

        // Extra fixed months (try to fill from next/nov/dec)
        const exMap = {};
        const fillExtra = (period, ymKey) => {
          if (!period || !ymKey) return;
          exMap[ymKey] = {
            earnings: { total: Number(period.commissions ?? 0), playa: 0, tulum: 0 },
            reservations: Number(period.reservations ?? 0),
            guests: Number(period.guests ?? 0),
            reviews: { done: Number(period.reviews?.made ?? 0), possible: Number(period.reviews?.total ?? 0) }
          };
        };
        // Map known periods to your fixed keys if they match
        const exKeys = extraMonths || [];
        exKeys.forEach((ymKey) => {
          if (next?.label === ymKey) fillExtra(next, ymKey);
          else if (nov?.label === ymKey) fillExtra(nov, ymKey);
          else if (dec?.label === ymKey) fillExtra(dec, ymKey);
        });
        setExtraMonthStats(exMap);

        // YTD
        setYtdStats({
          earnings: { total: Number(ytd?.commissions ?? 0), playa: 0, tulum: 0 },
          reservations: Number(ytd?.reservations ?? 0),
          guests: Number(ytd?.guests ?? 0),
          reviews: { done: Number(ytd?.reviews?.made ?? 0), possible: Number(ytd?.reviews?.total ?? 0) }
        });

        // Activity (today) from the same summary payload
        const act = data?.activity || {};
        const mapBooking = (b) => ({
          id: b?.id,
          city: b?.city,
          guestName: b?.guest_name ?? b?.guestName ?? b?.guest ?? '',
          checkIn: b?.check_in ?? b?.checkIn ?? null,
          checkOut: b?.check_out ?? b?.checkOut ?? null,
          notes: b?.notes ?? '',
          checkInNotes: b?.check_in_notes ?? b?.checkInNotes ?? '',
          checkOutNotes: b?.check_out_notes ?? b?.checkOutNotes ?? '',
        });
        const checkIns = Array.isArray(act.checkins) ? act.checkins.map(mapBooking) : [];
        const checkOuts = Array.isArray(act.checkouts) ? act.checkouts.map(mapBooking) : [];
        // Provide an explicit date (prefer server date; fallback to today in America/Cancun TZ)
        const tz = 'America/Cancun';
        const todayLocalYmd = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(now); // "YYYY-MM-DD"
        const activityDate = (typeof act.date === 'string' && act.date.length >= 10) ? act.date.slice(0, 10) : todayLocalYmd;
        setActivity({ date: activityDate, checkIns, checkOuts });

        // Alerts from the same summary payload
        const alertsPayload = Array.isArray(data?.alerts?.unpaid) ? data.alerts.unpaid : [];
        setAlertsServer(alertsPayload);

        setSummaryLoaded(true);
      } catch (e) {
        console.error('Failed to load server month summary:', e);
        setSummaryLoaded(false);
      }
    })();
  }, []);

  // Fetch task notifications for the dashboard card, respecting the active view
  useEffect(() => {
    let mounted = true;
    setTaskNotificationsLoading(true);
    (async () => {
      try {
        const res = await api.get(`/api/employee-tasks/notifications?view=${encodeURIComponent(taskView)}`);
        if (!mounted) return;
        const items = Array.isArray(res?.data?.items) ? res.data.items : [];
        setTaskNotifications(items);
      } catch (e) {
        console.error('Failed to load task notifications:', e);
        if (mounted) {
          setTaskNotifications([]);
        }
      } finally {
        if (mounted) {
          setTaskNotificationsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [taskView, taskReloadKey]);

  const handleOpenTaskFromCard = async (item) => {
    if (!item || !item.id) return;

    const isMaintenance = item.isMaintenance === true;
    const isCompleted = (item.status || '') === 'completed';
    const notes = (typeof item.notes === 'string') ? item.notes.trim() : '';

    // Admin rule: completed maintenance with no notes -> archive on click
    if (isMaintenance && isCompleted && notes.length === 0) {
      try {
        // Use dedicated status endpoint (Symfony controller)
        await api.patch(`/api/employee-tasks/${item.id}/status`, { status: 'archived' });
        setTaskReloadKey((k) => k + 1);
      } catch (e) {
        console.error('Failed to archive task from dashboard card:', e);
      }
      return;
    }

    // Admin/Manager rule: completed maintenance WITH notes -> open in EmployeeTasks drawer
    if (isMaintenance && isCompleted && notes.length > 0) {
      navigate('/employee-tasks', {
        state: {
          openTaskId: item.id,
          openTaskSource: 'dashboard-notifications',
        },
      });
      return;
    }

    // Otherwise: no-op on dashboard.
  };

  // Helpers for extra months
  const ymToBounds = (ymStr) => {
    const [year, month] = ymStr.split('-').map(n => parseInt(n, 10));
    const start = new Date(year, month - 1, 1);
    const nextStart = new Date(year, month, 1);
    const fmt = (d) => d.toISOString().slice(0,10);
    return { start, nextStart, startStr: fmt(start), nextStr: fmt(nextStart) };
  };

  // Helper to enumerate months from January to current month
  const listYearMonthsUpToCurrent = (year) => {
    const now = new Date();
    const lastMonthIdx = now.getFullYear() === year ? now.getMonth() : 11; // 0-based
    const out = [];
    for (let m = 0; m <= lastMonthIdx; m++) {
      const mm = String(m + 1).padStart(2, '0');
      out.push(`${year}-${mm}`);
    }
    return out;
  };
  // Compute YTD stats
  useEffect(() => {
    if (USE_SINGLE_SUMMARY) return;
    if (summaryLoaded) return;
    let mounted = true;
    (async () => {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const months = listYearMonthsUpToCurrent(year);
        // Sum earnings per month (total/playa/tulum)
        let earnTotal = 0, earnPlaya = 0, earnTulum = 0;
        for (const ym of months) {
          const e = await fetchEarningsYm(ym);
          earnTotal += e.total || 0;
          earnPlaya += e.playa || 0;
          earnTulum += e.tulum || 0;
        }
        // Reservations/Guests by check-in between Jan 1 and today
        const startStr = `${year}-01-01`;
        const today = new Date();
        const todayStr = today.toISOString().slice(0,10);
        const resvRes = await api.get(`/api/bookings?checkIn[after]=${encodeURIComponent(startStr)}&checkIn[before]=${encodeURIComponent(todayStr)}&pagination=false`);
        const resvItems = safeMember(resvRes.data);
        let reservations = 0, guests = 0;
        for (const b of resvItems) { reservations += 1; guests += getGuestCount(b); }
        // Reviews YTD: all bookings by checkout between YTD start and yesterday
        // For 2025 specifically, start counting only from September 1, 2025
        const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const yesterday = toDateOnly(new Date(new Date().setDate(new Date().getDate() - 1)));
        const yestStr = yesterday.toISOString().slice(0,10);

        // Determine YTD reviews start date
        const reviewsStart = (year === 2025) ? new Date(2025, 8, 1) /* Sept = 8 (0-based) */ : new Date(year, 0, 1);
        const reviewsStartStr = reviewsStart.toISOString().slice(0,10);

        // Fetch bookings by checkout within [reviewsStart, yesterday], no source restriction
        const rbRes = await api.get(`/api/bookings?checkOut[after]=${encodeURIComponent(reviewsStartStr)}&checkOut[before]=${encodeURIComponent(yestStr)}&pagination=false`);
        let ytdBookings = safeMember(rbRes.data);

        // Enforce date-only, and ensure checkOut is within [reviewsStart, yesterday]
        ytdBookings = ytdBookings.filter(b => {
          if (!b?.checkOut) return false;
          const d = toDateOnly(new Date(b.checkOut));
          return d >= toDateOnly(reviewsStart) && d <= toDateOnly(yesterday);
        });

        // Load review actions
        let actions = [];
        try {
          const actRes = await api.get('/api/review_actions?pagination=false');
          actions = safeMember(actRes.data);
        } catch {
          try { const act2 = await api.get('/api/review-actions?pagination=false'); actions = safeMember(act2.data); } catch {}
        }

        // Index actions by booking id; prefer a "made" action when multiple
        const actionByBooking = new Map();
        for (const a of actions) {
          const bid = getActionBookingId(a);
          if (bid == null) continue;
          const existing = actionByBooking.get(bid);
          if (!existing || (isReviewMade(a) && !isReviewMade(existing))) actionByBooking.set(bid, a);
        }
        const ytdDone = ytdBookings.reduce((acc, b) => acc + (isReviewMade(actionByBooking.get(b.id)) ? 1 : 0), 0);
        if (!mounted) return;
        setYtdStats({
          earnings: { total: earnTotal, playa: earnPlaya, tulum: earnTulum },
          reservations, guests,
          reviews: { done: ytdDone, possible: ytdBookings.length }
        });
      } catch (e) {
        console.error('Error computing YTD stats:', e);
        if (mounted) setYtdStats({ earnings: { total: 0, playa: 0, tulum: 0 }, reservations: 0, guests: 0, reviews: { done: 0, possible: 0 } });
      }
    })();
    return () => { mounted = false; };
  }, [summaryLoaded]);

  const fetchEarningsYm = async (ymStr) => {
    const url = `/api/booking_month_slices?yearMonth=${encodeURIComponent(ymStr)}&pagination=false`;
    const res = await api.get(url);
    const items = safeMember(res.data);
    const sumFor = (items, city = null) => {
      let sum = 0;
      for (const x of items) {
        if (city && x.city !== city) continue;
        const v = x.o2_commission_in_month ?? x.o2CommissionInMonth ?? 0;
        const n = typeof v === 'string' ? parseFloat(v) : (v || 0);
        if (!isNaN(n)) sum += n;
      }
      return sum;
    };
    return {
      total: sumFor(items),
      playa: sumFor(items, 'Playa del Carmen'),
      tulum: sumFor(items, 'Tulum'),
    };
  };

  // Compute stats for extra fixed months
  useEffect(() => {
    if (USE_SINGLE_SUMMARY) return;
    if (summaryLoaded) return;
    let mounted = true;
    (async () => {
      try {
        const results = await Promise.all(extraMonths.map(async (ym) => {
          const earnings = await fetchEarningsYm(ym);
          const { start, nextStart, startStr, nextStr } = ymToBounds(ym);
          // Reservations/Guests by check-in
          const resvRes = await api.get(`/api/bookings?checkIn[after]=${encodeURIComponent(startStr)}&checkIn[before]=${encodeURIComponent(nextStr)}&pagination=false`);
          const resvItems = safeMember(resvRes.data);
          // Enforce client-side filter by checkIn in case server ignores params
          const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const monthKept = resvItems.filter(b => {
            const raw = b?.checkIn ?? b?.checkin ?? b?.check_in;
            if (!raw) return false;
            const dt = toDateOnly(new Date(raw));
            return dt >= toDateOnly(start) && dt < toDateOnly(nextStart);
          });
          let reservations = 0; let guests = 0;
          for (const b of monthKept) { reservations += 1; guests += getGuestCount(b); }
          // Determine if this month is in the future
          const now = new Date();
          const nowYm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
          const isFuture = ym > nowYm;
          // Reviews: all bookings with checkout in the month, apply cap to last day minus one (if not future)
          let reviews = { done: 0, possible: 0 };
          if (!isFuture) {
            // Fetch all bookings with checkout in the month, then apply cap to last day minus one
            const rbRes = await api.get(`/api/bookings?checkOut[after]=${encodeURIComponent(startStr)}&checkOut[before]=${encodeURIComponent(nextStr)}&pagination=false`);
            let monthItems = safeMember(rbRes.data);
            const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            monthItems = monthItems.filter(b => {
              if (!b?.checkOut) return false;
              const d = toDateOnly(new Date(b.checkOut));
              return d >= toDateOnly(start) && d < toDateOnly(nextStart);
            });
            const endMinusOne = toDateOnly(new Date(nextStart.getTime() - 24*60*60*1000));
            monthItems = monthItems.filter(b => {
              const d = toDateOnly(new Date(b.checkOut));
              return d <= endMinusOne;
            });
            let actions = [];
            try {
              const actRes = await api.get('/api/review_actions?pagination=false');
              actions = safeMember(actRes.data);
            } catch {
              try { const act2 = await api.get('/api/review-actions?pagination=false'); actions = safeMember(act2.data); } catch {}
            }
            const actionByBooking = new Map();
            for (const a of actions) {
              const bid = getActionBookingId(a);
              if (bid == null) continue;
              const existing = actionByBooking.get(bid);
              if (!existing || (isReviewMade(a) && !isReviewMade(existing))) actionByBooking.set(bid, a);
            }
            const done = monthItems.reduce((acc, b) => acc + (isReviewMade(actionByBooking.get(b.id)) ? 1 : 0), 0);
            reviews = { done, possible: monthItems.length };
          } else {
            reviews = { done: 0, possible: 0 };
          }
          return [ym, { earnings, reservations, guests, reviews }];
        }));
        if (!mounted) return;
        const map = {};
        for (const [ym, stats] of results) map[ym] = stats;
        setExtraMonthStats(map);
      } catch (e) {
        console.error('Error loading extra months:', e);
      }
    })();
    return () => { mounted = false; };
  }, [extraMonths, summaryLoaded]);
  // Fetch review stats: total done / total possible (all bookings).
  useEffect(() => {
    if (USE_SINGLE_SUMMARY) return;
    if (summaryLoaded) return;
    const ym = monthEarnings.ym;
    const prevYm = monthEarnings.prevYm;
    if (!ym || !prevYm) return;

    const bounds = (ymStr) => {
      const [year, month] = ymStr.split('-').map(n => parseInt(n, 10));
      const start = new Date(year, month - 1, 1);
      const nextStart = new Date(year, month, 1);
      return { start, nextStart };
    };

    const { start: curStart, nextStart: curNext } = bounds(ym);
    const { start: prvStart, nextStart: prvNext } = bounds(prevYm);

    const fetchBookingsFor = async (start, end, cutoffToYesterday) => {
      const fmt = (d) => d.toISOString().slice(0,10);
      const url = `/api/bookings?checkOut[after]=${encodeURIComponent(fmt(start))}&checkOut[before]=${encodeURIComponent(fmt(end))}&pagination=false`;
      const res = await api.get(url);
      let items = safeMember(res.data);
      // Enforce month membership and cutoff (only bookings with checkout within the month)
      const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      items = items.filter(b => {
        if (!b?.checkOut) return false;
        const d = toDateOnly(new Date(b.checkOut));
        return d >= toDateOnly(start) && d < toDateOnly(end);
      });
      // Apply cap: for current month use yesterday; for past month use last day minus one
      const today = toDateOnly(new Date());
      const yesterday = new Date(today.getTime() - 24*60*60*1000);
      const endMinusOne = toDateOnly(new Date(end.getTime() - 24*60*60*1000));
      const capDate = cutoffToYesterday ? yesterday : endMinusOne;
      items = items.filter(b => {
        const d = toDateOnly(new Date(b.checkOut));
        return d <= capDate;
      });
      return items;
    };

    const fetchReviewActions = async () => {
      try {
        const res = await api.get('/api/review_actions?pagination=false');
        return safeMember(res.data);
      } catch (e) {
        // Fallback to alternative route naming if needed
        try {
          const res2 = await api.get('/api/review-actions?pagination=false');
          return safeMember(res2.data);
        } catch (e2) {
          console.warn('Review actions endpoint not found, assuming none.');
          return [];
        }
      }
    };

    (async () => {
      try {
        const [curBookings, prvBookings, actions] = await Promise.all([
          fetchBookingsFor(curStart, curNext, true),
          fetchBookingsFor(prvStart, prvNext, false),
          fetchReviewActions(),
        ]);
        // Index actions by bookingId
        const actionByBooking = new Map();
        for (const a of actions) {
          const bid = getActionBookingId(a);
          if (bid == null) continue;
          // prefer a 'made' action if multiple
          const existing = actionByBooking.get(bid);
          if (!existing || (isReviewMade(a) && !isReviewMade(existing))) {
            actionByBooking.set(bid, a);
          } else if (!existing) {
            actionByBooking.set(bid, a);
          }
        }
        const countMade = (list) => list.reduce((acc, b) => acc + (isReviewMade(actionByBooking.get(b.id)) ? 1 : 0), 0);

        const curPossible = curBookings.length;
        const curDone = countMade(curBookings);
        const prvPossible = prvBookings.length;
        const prvDone = countMade(prvBookings);

        setReviewsStats({
          current: { done: curDone, possible: curPossible },
          previous: { done: prvDone, possible: prvPossible }
        });
        // Override for 2025-08: force previous Reviews to 0/0
        if (prevYm === '2025-08') {
          setReviewsStats(rs => ({
            current: rs.current,
            previous: { done: 0, possible: 0 }
          }));
        }
      } catch (e) {
        console.error('Error computing reviews stats:', e);
        setReviewsStats({ current: { done: 0, possible: 0 }, previous: { done: 0, possible: 0 } });
      }
    })();
  }, [monthEarnings.ym, monthEarnings.prevYm, summaryLoaded]);

  // Fetch reservations count and guests for current and previous month (by check-in date)
  useEffect(() => {
    if (USE_SINGLE_SUMMARY) return;
    if (summaryLoaded) return;
    const ym = monthEarnings.ym;
    const prevYm = monthEarnings.prevYm;
    if (!ym || !prevYm) return;

    const monthBounds = (ymStr) => {
      const [year, month] = ymStr.split('-').map(n => parseInt(n, 10));
      const start = new Date(year, month - 1, 1);
      const nextStart = new Date(year, month, 1);
      const fmt = (d) => d.toISOString().slice(0, 10);
      return { start, nextStart, startStr: fmt(start), nextStr: fmt(nextStart) };
    };

    const fetchStats = async (ymStr) => {
      const { start, nextStart, startStr, nextStr } = monthBounds(ymStr);
      const url = `/api/bookings?checkIn[after]=${encodeURIComponent(startStr)}&checkIn[before]=${encodeURIComponent(nextStr)}&pagination=false`;
      const res = await api.get(url);
      const items = safeMember(res.data);
      const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const kept = items.filter(b => {
        const raw = b?.checkIn ?? b?.checkin ?? b?.check_in;
        if (!raw) return false;
        const dt = toDateOnly(new Date(raw));
        return dt >= toDateOnly(start) && dt < toDateOnly(nextStart);
      });
      let count = 0;
      let guests = 0;
      for (const b of kept) {
        count += 1;
        guests += getGuestCount(b);
      }
      return { count, guests };
    };

    (async () => {
      try {
        const [cur, prv] = await Promise.all([
          fetchStats(ym),
          fetchStats(prevYm),
        ]);
        setReservationsCount({ current: cur.count, previous: prv.count });
        setReservationsGuests({ current: cur.guests, previous: prv.guests });
      } catch (e) {
        console.error('Error fetching reservations stats:', e);
        setReservationsCount({ current: 0, previous: 0 });
        setReservationsGuests({ current: 0, previous: 0 });
      }
    })();
  }, [monthEarnings.ym, monthEarnings.prevYm, summaryLoaded]);

  useEffect(() => {
    if (USE_SINGLE_SUMMARY) return;
    if (summaryLoaded) return;
    const fetchUnits = async () => {
      try {
        const response = await api.get('/api/units');
        const data = response.data;
        const activeUnits = data.member.filter(unit => unit.status === 'Active');
        const playaCount = activeUnits.filter(unit => unit.city === 'Playa del Carmen').length;
        const tulumCount = activeUnits.filter(unit => unit.city === 'Tulum').length;
        const activeClientIds = new Set(
          activeUnits.map(u => u.clientId ?? u.client_id ?? (u.client && (u.client.id ?? u.client)))
            .filter(Boolean)
        );
        const activeClients = activeClientIds.size;
        setUnitStats({ total: activeUnits.length, playa: playaCount, tulum: tulumCount, activeClients });
      } catch (error) {
        console.error('Error fetching units:', error);
      }
    };

    fetchUnits();
  }, [summaryLoaded]);

  useEffect(() => {
    if (USE_SINGLE_SUMMARY) return;
    if (summaryLoaded) return;
    const toYm = (d) => d.toISOString().slice(0, 7);
    const now = new Date();
    const ym = toYm(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = toYm(prev);

    const cacheKey = (key) => `monthEarnings:${key}`;

    const safeItems = (data) => {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data['hydra:member'])) return data['hydra:member'];
      if (data && Array.isArray(data.member)) return data.member;
      return [];
    };

    const sumFor = (items, city = null) => {
      let sum = 0;
      for (const x of items) {
        if (city && x.city !== city) continue;
        const v = x.o2_commission_in_month ?? x.o2CommissionInMonth ?? 0;
        const n = typeof v === 'string' ? parseFloat(v) : (v || 0);
        if (!isNaN(n)) sum += n;
      }
      return sum;
    };

    const fetchYm = async (yearMonth) => {
      const url = `/api/booking_month_slices?yearMonth=${encodeURIComponent(yearMonth)}&pagination=false`;
      const res = await api.get(url);
      const items = safeItems(res.data);
      return {
        total: sumFor(items),
        playa: sumFor(items, 'Playa del Carmen'),
        tulum: sumFor(items, 'Tulum'),
      };
    };

    // 1) Try seed from cache for instant paint
    try {
      const curCached = localStorage.getItem(cacheKey(ym));
      const prevCached = localStorage.getItem(cacheKey(prevYm));
      const cur = curCached ? JSON.parse(curCached).data : null;
      const prv = prevCached ? JSON.parse(prevCached).data : null;
      if (cur || prv) {
        setMonthEarnings({
          current: cur || { total: 0, playa: 0, tulum: 0 },
          previous: prv || { total: 0, playa: 0, tulum: 0 },
          ym,
          prevYm
        });
      }
    } catch { /* ignore */ }

    // 2) Fetch fresh data
    (async () => {
      try {
        const [cur, prv] = await Promise.all([fetchYm(ym), fetchYm(prevYm)]);
        setMonthEarnings({ current: cur, previous: prv, ym, prevYm });
        try {
          localStorage.setItem(cacheKey(ym), JSON.stringify({ ts: Date.now(), data: cur }));
          localStorage.setItem(cacheKey(prevYm), JSON.stringify({ ts: Date.now(), data: prv }));
        } catch { /* ignore quota */ }
      } catch (err) {
        console.error('Error fetching month earnings:', err);
      }
    })();
  }, [summaryLoaded]);

  useEffect(() => {
    if (USE_SINGLE_SUMMARY) return;
    const fetchBookings = async () => {
      try {
        const response = await api.get('/api/bookings');
        const allBookings = response.data;

        const today = new Date().toISOString().split('T')[0];

        const checkIns = allBookings.filter(
          b =>
            ['Ongoing', 'Past'].includes(b.status) &&
            new Date(b.checkIn).toISOString().split('T')[0] === today
        );

        const checkOuts = allBookings.filter(
          b =>
            ['Confirmed', 'Past'].includes(b.status) &&
            new Date(b.checkOut).toISOString().split('T')[0] === today
        );

        setActivity({ checkIns, checkOuts });
      } catch (error) {
        console.error('Error fetching bookings:', error);
      }
    };

    fetchBookings();
  }, []);


  return (
    <AppShell sectionHeader={<SectionHeader title="Dashboard" subtitle="Overview" /> }>
      <PageScaffold>
        <MonthSummaryCard />

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <div style={{ maxWidth: 520, width: '100%' }}>
            <DashboardAlertCenterCard />
          </div>
          <div style={{ maxWidth: 420, width: '100%' }}>
            <TaskNotificationsCard
              title="Mis tareas"
              items={taskNotifications}
              loading={taskNotificationsLoading}
              mode="manager"
              view={taskView}
              onChangeView={setTaskView}
              onOpenTask={handleOpenTaskFromCard}
            />
          </div>
          <div style={{ maxWidth: 500, width: '100%' }}>
            <ActivityCard activity={activity} />
          </div>
        </div>

        {/* Occupancy Watch (left) + Alerts (right) in one row */}
        <div
          style={{
            marginTop: '1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'stretch',
            flexWrap: 'wrap',
            minHeight: 0
          }}
        >
          {/* Left: Occupancy Watch */}
          <div style={{ flex: '0 1 820px', maxWidth: 820, minWidth: 360, minHeight: OW_CARD_HEIGHT }}>
            <OccupancyWatchCard />
          </div>
        </div>

      </PageScaffold>
    </AppShell>
  );
};

export default Dashboard;