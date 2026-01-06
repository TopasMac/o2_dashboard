import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import ActivityCard from '../components/cards/ActivityCard';
import TaskNotificationsCard from '../components/cards/TaskNotificationsCard';
import PageScaffold from '../components/layout/PageScaffold';
import DashboardAlertCenterCard from '../components/cards/DashboardAlertCenterCard';
import AirbnbReviewsCard from '../components/cards/AirbnbReviewsCard';

// --- helpers ---
const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDdMm = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDdMonYy = (d) => `${String(d.getDate()).padStart(2,'0')}-${MONTH_ABBR[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
const fmtIso = (d, end=false) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${end ? '23:59:59' : '00:00:00'}`;
// Review card sizing so exactly 5 rows fit within 250px total height
const REVIEW_CARD_HEIGHT = 250; // outer card height
const REVIEW_HEADER_H = 40;     // header bar (approx; title 16px + 8px vertical padding + border)
const REVIEW_BODY_PAD_V = 24;   // body padding top+bottom (12px + 12px)
const VISIBLE_ROWS = 5;
const ROW_HEIGHT = Math.floor((REVIEW_CARD_HEIGHT - REVIEW_HEADER_H - REVIEW_BODY_PAD_V) / VISIBLE_ROWS);
const toLower = (v) => (v == null ? '' : String(v).toLowerCase());

const parseId = (maybeHydra) => {
  if (maybeHydra && typeof maybeHydra === 'string' && maybeHydra.includes('/')) {
    const parts = maybeHydra.split('/');
    const last = parts[parts.length - 1];
    const n = Number(last);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(maybeHydra);
  return Number.isFinite(n) ? n : null;
};

// Safe parser for date-only strings (avoids UTC timezone shift such as 2025-09-06 becoming previous day locally)
function parseYmd(input) {
  if (!input) return null;
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const s = String(input);
  // Match "YYYY-MM-DD"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    // Construct local-midnight date to avoid timezone drift
    return new Date(y, mo - 1, d);
  }
  // Fallback: parse generic date string and normalize to local date-only
  const dt = new Date(s);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}


function formatGuestName(name) {
  if (!name) return name;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
}


function deriveUnitName(b) {
  // common direct fields
  const direct = b.unitName || b.unit_name || b.listingName || b.propertyName || b.rentalName || b.apartmentName || b.roomName;
  if (direct) return direct;

  // nested structures we’ve seen across integrations
  const nested =
    b.unit?.name || b.unit?.title || b.unit?.displayName ||
    b.listing?.name || b.listing?.title ||
    b.property?.name || b.property?.title ||
    b.rental?.name || b.rental?.title ||
    b.apartment?.name || b.apartment?.title ||
    b.room?.name || b.room?.title;
  if (nested) return nested;

  // sometimes bookings carry a composed label
  if (b?.unit?.code && b?.building?.name) return `${b.building.name} ${b.unit.code}`;

  return null;
}

// API helpers for ReviewAction persistence
async function fetchReviewActionsInRange(startYmd, endYmd) {
  // Uses API Platform filters (DateFilter + SearchFilter) defined on the entity
  const url = `/api/review_actions?pagination=false&checkoutDate[after]=${startYmd}&checkoutDate[before]=${endYmd}&source=Airbnb`;
  const { data } = await api.get(url);
  const list = Array.isArray(data?.member)
    ? data.member
    : (Array.isArray(data?.['hydra:member']) ? data['hydra:member'] : (Array.isArray(data) ? data : []));
  return list.map(a => ({
    id: a.id ?? parseId(a['@id']),
    reservationId: a.reservationId,
    status: a.status,
    skipReason: a.skipReason ?? null,
    actedAt: a.actedAt,
  })).filter(x => x.reservationId != null);
}

async function getReviewActionByReservation(reservationId) {
  const url = `/api/review_actions?pagination=false&reservationId=${reservationId}`;
  const { data } = await api.get(url);
  const list = Array.isArray(data?.member)
    ? data.member
    : (Array.isArray(data?.['hydra:member']) ? data['hydra:member'] : (Array.isArray(data) ? data : []));
  return list.length ? list[0] : null;
}

async function createReviewAction(payload) {
  const { data } = await api.post('/api/review_actions', payload);
  return data;
}

async function patchReviewAction(id, payload) {
  const { data } = await api.patch(`/api/review_actions/${id}`, payload, {
    headers: { 'Content-Type': 'application/merge-patch+json' },
  });
  return data;
}

async function fetchBookingsByCheckout(startDate, endDate) {
  const afterIso = fmtIso(startDate, false);
  const beforeIso = fmtIso(endDate, true);
  const url = `/api/bookings?pagination=false&checkOut[after]=${afterIso}&checkOut[before]=${beforeIso}&source=Airbnb`;
  const { data } = await api.get(url);
  const list = Array.isArray(data?.member)
    ? data.member
    : (Array.isArray(data?.['hydra:member']) ? data['hydra:member'] : (Array.isArray(data) ? data : []));

  // Debug: if many items lack unitName, log one sample so we can add its path
  if (list && list.length) {
    const missing = list.find(x => !deriveUnitName(x));
    if (missing) {
      // eslint-disable-next-line no-console
      console.debug('[ReviewTasksBox] booking missing unitName sample:', missing);
    }
  }

  const apiStart = toDateOnly(startDate); // this is firstOfMonth-1
  const apiEnd = toDateOnly(endDate);     // this is yesterday-1
  return list
    .map(b => ({
      reservationId: b.reservationId ?? b.reservation_id ?? b.id ?? parseId(b['@id']),
      checkoutDate: b.checkOut ?? b.checkoutDate ?? b.checkout_date ?? null,
      unitName: deriveUnitName(b),
    }))
    .filter(x => x.reservationId != null && x.checkoutDate != null)
    .filter(x => {
      // eligibleDate = checkout + 1 day must fall within [firstOfMonth, yesterday]
      const co = parseYmd(x.checkoutDate);
      const eligible = addDays(co, 1);
      // eligible in [apiStart+1, apiEnd+1] is equivalent to co in [apiStart, apiEnd],
      // but we’ll filter by eligible explicitly for clarity against the main window in component:
      return eligible >= addDays(apiStart, 1) && eligible <= addDays(apiEnd, 1);
    });
}



function Chip({ label, intent }) {
  const color = intent === 'ok' ? '#0a7d32' : intent === 'warn' ? '#b26b00' : '#1f4aa8';
  const bg = intent === 'ok' ? '#e8f6ec' : intent === 'warn' ? '#fff4e0' : '#e8f0fe';
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 12,
      padding: '4px 8px',
      borderRadius: 999,
      background: bg,
      color,
      border: `1px solid ${color}33`
    }}>{label}</span>
  );
}


const ManagerDashboard = () => {
  const navigate = useNavigate();

  // Task notifications state (for manager view)
  const [taskItems, setTaskItems] = useState([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskReloadKey, setTaskReloadKey] = useState(0);
  // Load task notifications for managers on mount
  useEffect(() => {
    let cancelled = false;

    const fetchTaskNotifications = async () => {
      setTaskLoading(true);
      try {
        const res = await api.get('/api/employee-tasks/notifications?scope=manager');
        if (!cancelled) {
          const data = res?.data || {};
          setTaskItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch (e) {
        console.warn('Failed to load task notifications for manager dashboard', e);
        if (!cancelled) {
          setTaskItems([]);
        }
      } finally {
        if (!cancelled) {
          setTaskLoading(false);
        }
      }
    };

    fetchTaskNotifications();

    return () => {
      cancelled = true;
    };
  }, [taskReloadKey]);

  const handleOpenTaskFromCard = async (item) => {
    if (!item || !item.id) return;

    const isMaintenance = item.isMaintenance === true;
    const isCompleted = (item.status || '') === 'completed';
    const notes = (typeof item.notes === 'string') ? item.notes.trim() : '';

    // Only apply these special rules to completed maintenance tasks
    if (isMaintenance && isCompleted) {
      if (notes.length === 0) {
        try {
          await api.patch(`/api/employee-tasks/${item.id}/status`, { status: 'archived' });
          setTaskReloadKey((k) => k + 1);
        } catch (e) {
          console.error('Failed to archive task from manager dashboard card:', e);
        }
        return;
      }

      // notes present -> open drawer in EmployeeTasks page
      navigate('/employee-tasks', {
        state: {
          openTaskId: item.id,
          openTaskSource: 'manager-dashboard-notifications',
        },
      });
      return;
    }

    // Otherwise: no-op on manager dashboard
  };

  return (
    <PageScaffold title="Manager Dashboard" currentPath="/manager-dashboard" hideCardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Top row: Inbox (Alertas + Notificaciones) + Tasks */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'stretch',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 0', minWidth: 360, minHeight: 260 }}>
            <div style={{ height: '100%' }}>
              <DashboardAlertCenterCard />
            </div>
          </div>
          <div style={{ flex: '1 1 0', minWidth: 320, minHeight: 260 }}>
            <div style={{ height: '100%' }}>
              <TaskNotificationsCard
                mode="manager"
                items={taskItems}
                loading={taskLoading}
                onOpenTask={handleOpenTaskFromCard}
              />
            </div>
          </div>
        </div>

        {/* Second row: Actividad Hoy + Reseñas Airbnb */}
        <div
          style={{
            display: 'grid',
            gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            alignItems: 'stretch',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <ActivityCard />
          </div>
          <div style={{ minWidth: 0 }}>
            <AirbnbReviewsCard />
          </div>
        </div>
      </div>
    </PageScaffold>
  );
};

export default ManagerDashboard;
