import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ElectricBoltRoundedIcon from '@mui/icons-material/ElectricBoltRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import WifiRoundedIcon from '@mui/icons-material/WifiRounded';
import api from '../api';
import MobileFormDrawer from '../components/common/mobile/MobileFormDrawer';
import { getTodayYmd } from './calendarModel';
import {
  buildActivityDateStrip,
  buildDailyActivity,
  formatActivityDate,
} from './activityModel';
import { formatMobileGuestName } from './mobileFormatters';
import { buildMobileServiceAlerts } from './mobileAlertsModel';

const COLORS = {
  teal: '#1E6F68',
  darkTeal: '#173f3b',
  checkIn: '#1E8279',
  checkOut: '#ef4d62',
  cleaning: '#e89b0c',
  muted: '#657572',
};

const CARD_HEADER_STYLES = {
  color: COLORS.darkTeal,
  fontSize: 15,
  fontWeight: 850,
  lineHeight: 1.2,
};

const CITY_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'Playa del Carmen', label: 'Playa' },
  { value: 'Tulum', label: 'Tulum' },
];

const SERVICE_COLORS = {
  CFE: '#d8a600',
  HOA: '#1E8279',
  Internet: '#735aa8',
  Agua: '#2878bd',
};

const DEADLINE_STYLES = {
  overdue: { color: '#a12732', bgcolor: '#fff0f1', borderColor: '#d55b65' },
  today: { color: '#a51f2a', bgcolor: '#ffdfe2', borderColor: '#ef4d62' },
  tomorrow: { color: '#9a5d00', bgcolor: '#fff3d8', borderColor: '#e9a61a' },
  later: { color: '#315d58', bgcolor: '#edf5f3', borderColor: '#9abdb8' },
};

const SERVICE_ICONS = {
  CFE: ElectricBoltRoundedIcon,
  HOA: HomeRoundedIcon,
  Internet: WifiRoundedIcon,
  Agua: WaterDropOutlinedIcon,
};

function TurnoverSummaryIcon({ sx = {} }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.1, ...sx }}>
      <LogoutRoundedIcon sx={{ color: COLORS.checkOut, fontSize: '0.72em' }} />
      <LoginRoundedIcon sx={{ color: COLORS.checkIn, fontSize: '0.72em', ml: -0.35 }} />
    </Box>
  );
}

function SummaryMetric({ icon: Icon, value, label, color, compact = false }) {
  return (
    <Box sx={{ minWidth: 0, textAlign: 'center' }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: compact ? 0.25 : 0.45 }}>
        <Icon sx={{ color, fontSize: compact ? 17 : 21 }} />
        <Typography sx={{ color: '#162b29', fontSize: compact ? 15 : 18, fontWeight: 850, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
      <Typography
        color="text.secondary"
        sx={{ display: 'block', mt: 0.25, fontSize: compact ? 8.5 : 10.5, lineHeight: 1.1 }}
      >
        {label}
      </Typography>
    </Box>
  );
}
function SummaryGrid({ summary, compact = false }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', alignItems: 'start' }}>
      <SummaryMetric icon={TurnoverSummaryIcon} value={summary.turnovers} label="Cambios" color={COLORS.teal} compact={compact} />
      <SummaryMetric icon={LoginRoundedIcon} value={summary.checkIns} label="Entradas" color={COLORS.checkIn} compact={compact} />
      <SummaryMetric icon={LogoutRoundedIcon} value={summary.checkOuts} label="Salidas" color={COLORS.checkOut} compact={compact} />
      <SummaryMetric icon={CleaningServicesRoundedIcon} value={summary.cleanings} label="Limpiezas" color={COLORS.cleaning} compact={compact} />
    </Box>
  );
}

function DetailLine({ label, value }) {
  return (
    <Typography sx={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
      <Box component="span" sx={{ color: '#40514e', fontWeight: 750 }}>{label}:</Box>{' '}
      {String(value || '').trim() || '–'}
    </Typography>
  );
}

function TurnoverEvent({ event, type }) {
  const isCheckout = type === 'checkout';
  const Icon = isCheckout ? LogoutRoundedIcon : LoginRoundedIcon;
  const color = isCheckout ? COLORS.checkOut : COLORS.checkIn;

  return (
    <Box sx={{ minWidth: 0, p: 1, borderRadius: 1.5, bgcolor: isCheckout ? '#fff6f7' : '#f1faf8' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.55 }}>
        <Icon sx={{ color, fontSize: 20, flexShrink: 0 }} />
        <Typography sx={{ minWidth: 0, fontSize: 12.5, fontWeight: 850, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
          {formatMobileGuestName(event?.guest) || 'Sin nombre'}
        </Typography>
      </Box>
      <DetailLine label="Notas" value={event?.notes} />
      <DetailLine label={isCheckout ? 'Check-out' : 'Check-in'} value={event?.detailNotes} />
    </Box>
  );
}

function TurnoverCard({ unit }) {
  return (
    <Card variant="outlined" sx={{ borderColor: '#d9e4e1' }}>
      <CardContent sx={{ p: 1.1, '&:last-child': { pb: 1.1 } }}>
        <Typography sx={{ color: COLORS.darkTeal, fontSize: 13.5, fontWeight: 850, mb: 0.75, overflowWrap: 'anywhere' }}>
          {unit.unitName}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
          <TurnoverEvent event={unit.checkOuts[0]} type="checkout" />
          <TurnoverEvent event={unit.checkIns[0]} type="checkin" />
        </Box>
      </CardContent>
    </Card>
  );
}

function BookingActivityCard({ event, type }) {
  const isCheckout = type === 'checkout';
  const Icon = isCheckout ? LogoutRoundedIcon : LoginRoundedIcon;
  const color = isCheckout ? COLORS.checkOut : COLORS.checkIn;

  return (
    <Card variant="outlined" sx={{ borderColor: '#dfe8e5' }}>
      <CardContent sx={{ p: 1.1, '&:last-child': { pb: 1.1 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 0.7 }}>
          <Icon sx={{ color, fontSize: 20, mt: 0.1 }} />
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: 0.75, mb: 0.45 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 850, overflowWrap: 'anywhere' }}>{event.unitName}</Typography>
              <Typography sx={{ fontSize: 12.5, fontWeight: 750, textAlign: 'right', overflowWrap: 'anywhere' }}>{formatMobileGuestName(event.guest)}</Typography>
            </Box>
            <DetailLine label="Notas" value={event.notes} />
            <DetailLine label={isCheckout ? 'Check-out' : 'Check-in'} value={event.detailNotes} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function CleaningActivityCard({ cleaning }) {
  return (
    <Card variant="outlined" sx={{ borderColor: '#dfe8e5' }}>
      <CardContent sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', gap: 0.7, alignItems: 'center', p: 1.1, '&:last-child': { pb: 1.1 } }}>
        <CleaningServicesRoundedIcon sx={{ color: COLORS.cleaning, fontSize: 20 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 850, overflowWrap: 'anywhere' }}>{cleaning.unitName}</Typography>
          <Typography sx={{ color: COLORS.muted, fontSize: 11.5 }}>{cleaning.typeLabel}</Typography>
        </Box>
        {cleaning.done ? (
          <Chip size="small" label="Completada" sx={{ height: 21, color: '#2f8f62', bgcolor: '#edf8f2', fontSize: 9.5, fontWeight: 800 }} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }) {
  return (
    <Box>
      <Typography sx={{ color: '#243a37', fontSize: 12.5, fontWeight: 850, mb: 0.55 }}>{title}</Typography>
      <Stack spacing={0.7}>{children}</Stack>
    </Box>
  );
}

function CityActivity({ group }) {
  const hasActivity = group.turnovers.length || group.checkouts.length || group.checkins.length || group.cleanings.length;
  if (!hasActivity) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.75 }}>
        <PlaceRoundedIcon sx={{ color: COLORS.teal, fontSize: 20 }} />
        <Typography sx={{ color: COLORS.darkTeal, fontSize: 16, fontWeight: 850 }}>{group.city}</Typography>
      </Box>
      <Stack spacing={1.15}>
        {group.turnovers.length ? (
          <Section title="Salida + entrada">
            {group.turnovers.map((unit) => <TurnoverCard key={`turnover-${unit.unitId || unit.unitName}`} unit={unit} />)}
          </Section>
        ) : null}
        {group.checkouts.length ? (
          <Section title="Salidas">
            {group.checkouts.map((event, index) => <BookingActivityCard key={`checkout-${event.bookingId || index}`} event={event} type="checkout" />)}
          </Section>
        ) : null}
        {group.checkins.length ? (
          <Section title="Entradas">
            {group.checkins.map((event, index) => <BookingActivityCard key={`checkin-${event.bookingId || index}`} event={event} type="checkin" />)}
          </Section>
        ) : null}
        {group.cleanings.length ? (
          <Section title="Limpiezas">
            {group.cleanings.map((cleaning, index) => <CleaningActivityCard key={`cleaning-${cleaning.id || index}`} cleaning={cleaning} />)}
          </Section>
        ) : null}
      </Stack>
    </Box>
  );
}

function ActivityDrawer({ open, onClose, selectedDate, activity }) {
  const [city, setCity] = React.useState('');

  React.useEffect(() => {
    if (!open) setCity('');
  }, [open]);

  const visibleGroups = city
    ? activity.cityGroups.filter((group) => group.city === city)
    : activity.cityGroups;
  const visibleSummary = city
    ? visibleGroups[0]?.summary || { turnovers: 0, checkIns: 0, checkOuts: 0, cleanings: 0 }
    : activity.summary;

  return (
    <MobileFormDrawer
      open={open}
      onClose={onClose}
      title={(
        <Box component="span" sx={{ display: 'block', textAlign: 'left' }}>
          <Box component="span" sx={{ display: 'block', fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>Actividad del día</Box>
          <Box component="span" sx={{ display: 'block', mt: 0.2, fontSize: 11.5, fontWeight: 500, opacity: 0.86 }}>{formatActivityDate(selectedDate)}</Box>
        </Box>
      )}
      headerLink={(
        <IconButton aria-label="Cerrar actividad" onClick={onClose} sx={{ color: '#fff' }}>
          <CloseRoundedIcon />
        </IconButton>
      )}
      showActions={false}
      mobileVariant="fullscreen"
      fullScreenOnMobile={false}
      size="large"
      headerSx={{ justifyContent: 'flex-start', pr: 6 }}
      titleSx={{ width: '100%' }}
      contentSx={{ p: 0, bgcolor: '#f4f7f6' }}
    >
      <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: '#f4f7f6', px: 1.5, pt: 1.25, pb: 1.2, boxShadow: '0 7px 14px rgba(23,63,59,.10)' }}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={city}
          onChange={(_, value) => { if (value !== null) setCity(value); }}
          aria-label="Filtrar actividad por ciudad"
          sx={{ bgcolor: '#fff', mb: 1 }}
        >
          {CITY_FILTERS.map((option) => <ToggleButton key={option.label} value={option.value}>{option.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <Card variant="outlined" sx={{ borderColor: '#dfe8e5' }}>
          <CardContent sx={{ px: 0.7, py: 1, '&:last-child': { pb: 1 } }}>
            <SummaryGrid summary={visibleSummary} />
          </CardContent>
        </Card>
      </Box>

      <Stack spacing={1.6} sx={{ px: 1.5, py: 1.5 }}>
        {visibleGroups.length ? visibleGroups.map((group) => <CityActivity key={group.city} group={group} />) : (
          <Card variant="outlined" sx={{ borderColor: '#dfe8e5' }}>
            <CardContent sx={{ py: 3, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 800 }}>Sin actividad</Typography>
              <Typography variant="body2" color="text.secondary">No hay actividad para esta fecha y ciudad.</Typography>
            </CardContent>
          </Card>
        )}
      </Stack>
    </MobileFormDrawer>
  );
}

function CitySummary({ city, summary }) {
  return (
    <Box sx={{ pt: 1.1, '& + &': { mt: 1.1, borderTop: '1px solid #e8efed' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, mb: 0.75 }}>
        <PlaceRoundedIcon sx={{ color: COLORS.teal, fontSize: 17 }} />
        <Typography sx={{ color: COLORS.darkTeal, fontSize: 12.5, fontWeight: 850 }}>{city}</Typography>
      </Box>
      <SummaryGrid summary={summary} compact />
    </Box>
  );
}

function PlaceholderMetric({ icon: Icon, label }) {
  return (
    <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: 0.45, alignItems: 'center' }}>
      <Icon sx={{ color: COLORS.teal, fontSize: 20, gridRow: '1 / span 2' }} />
      <Typography sx={{ color: '#203936', fontSize: 14, fontWeight: 850, lineHeight: 1 }}>–</Typography>
      <Typography sx={{ color: COLORS.muted, fontSize: 9.5, lineHeight: 1.1 }}>{label}</Typography>
    </Box>
  );
}

function formatSummaryDate(ymd) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  if (!year || !month || !day || !months[month - 1]) return '';
  return `${day} ${months[month - 1]} ${year}`;
}

function SummaryPlaceholderCard({ today }) {
  const metrics = [
    { icon: DescriptionOutlinedIcon, label: 'Reservas' },
    { icon: GroupsOutlinedIcon, label: 'Huéspedes' },
    { icon: HandymanOutlinedIcon, label: 'Servicios' },
    { icon: MessageOutlinedIcon, label: 'Mensajes' },
  ];

  return (
    <Card variant="outlined" sx={{ height: '100%', minHeight: 0, borderColor: '#d9e4e1' }}>
      <CardContent sx={{ height: '100%', boxSizing: 'border-box', px: 1.2, py: 0.85, '&:last-child': { pb: 0.85 } }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.65 }}>
          <Typography sx={CARD_HEADER_STYLES}>Sumario</Typography>
          <Typography sx={{ color: COLORS.muted, fontSize: 10.5, fontWeight: 700 }}>{formatSummaryDate(today)}</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.65 }}>
          {metrics.map((metric) => <PlaceholderMetric key={metric.label} {...metric} />)}
        </Box>
      </CardContent>
    </Card>
  );
}

function formatAlertAmount(amount) {
  if (amount === null || amount === undefined || amount === '') return '';
  const number = Number(amount);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(number);
}

function ServiceAlertRow({ alert, roomy = false }) {
  const Icon = SERVICE_ICONS[alert.service] || NotificationsActiveRoundedIcon;
  const serviceColor = SERVICE_COLORS[alert.service] || COLORS.teal;
  const deadlineStyle = DEADLINE_STYLES[alert.deadlineState] || DEADLINE_STYLES.later;
  const amount = ['HOA', 'Internet'].includes(alert.service) ? formatAlertAmount(alert.amount) : '';
  const amountWidth = roomy ? 68 : 58;
  const deadlineWidth = roomy ? 62 : 52;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `${roomy ? 30 : 23}px minmax(0, 1fr) ${amountWidth}px ${deadlineWidth}px`, columnGap: roomy ? 0.8 : 0.5, alignItems: 'center', py: roomy ? 1 : 0.55, minWidth: 0 }}>
      <Box sx={{ width: roomy ? 29 : 22, height: roomy ? 29 : 22, borderRadius: '50%', display: 'grid', placeItems: 'center', color: serviceColor, bgcolor: `${serviceColor}18` }}>
        <Icon sx={{ fontSize: roomy ? 19 : 15 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: '#203431', fontSize: roomy ? 12.5 : 10.5, fontWeight: 850, lineHeight: 1.18, overflowWrap: 'anywhere' }}>
          {alert.service} · {alert.unitName || 'Unidad'}
        </Typography>
        {alert.detail ? (
          <Typography sx={{ color: COLORS.muted, fontSize: roomy ? 10.5 : 8.5, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{alert.detail}</Typography>
        ) : null}
      </Box>
      <Typography aria-hidden={!amount} sx={{ color: '#253936', fontSize: roomy ? 11.5 : 9.5, fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>{amount}</Typography>
      <Chip
        size="small"
        label={alert.deadlineLabel}
        variant="outlined"
        sx={{ width: deadlineWidth, height: roomy ? 24 : 20, ...deadlineStyle, fontSize: roomy ? 10.5 : 9, fontWeight: 850, '& .MuiChip-label': { px: roomy ? 0.85 : 0.6 } }}
      />
    </Box>
  );
}

function AlertsDrawer({ open, onClose, alerts }) {
  return (
    <MobileFormDrawer
      open={open}
      onClose={onClose}
      title="Alertas"
      headerLink={<IconButton aria-label="Cerrar alertas" onClick={onClose} sx={{ color: '#fff' }}><CloseRoundedIcon /></IconButton>}
      showActions={false}
      mobileVariant="fullscreen"
      fullScreenOnMobile={false}
      size="large"
      contentSx={{ bgcolor: '#f4f7f6', p: 1.5 }}
    >
      <Typography sx={{ color: COLORS.muted, fontSize: 12, mb: 1 }}>Pagos vencidos y próximos 7 días</Typography>
      <Card variant="outlined" sx={{ borderColor: '#dfe8e5' }}>
        <CardContent sx={{ py: 0.7, '&:last-child': { pb: 0.7 } }}>
          {alerts.length ? alerts.map((alert, index) => (
            <Box key={alert.id || `${alert.service}-${alert.unitName}-${alert.dueDate}`} sx={{ borderTop: index ? '1px solid #e7eeec' : 0 }}>
              <ServiceAlertRow alert={alert} roomy />
            </Box>
          )) : <Typography sx={{ py: 3, textAlign: 'center', color: COLORS.muted }}>Sin alertas de servicios.</Typography>}
        </CardContent>
      </Card>
    </MobileFormDrawer>
  );
}

export default function MobileV2Home() {
  const today = React.useMemo(() => getTodayYmd(), []);
  const dateStrip = React.useMemo(() => buildActivityDateStrip(today), [today]);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [reloadToken, setReloadToken] = React.useState(0);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [alertsDrawerOpen, setAlertsDrawerOpen] = React.useState(false);
  const [rawServiceAlerts, setRawServiceAlerts] = React.useState([]);
  const [alertsLoading, setAlertsLoading] = React.useState(true);
  const [alertsError, setAlertsError] = React.useState('');

  React.useEffect(() => {
    let active = true;
    async function loadActivity() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/api/bookings/check-activity', {
          params: { start: selectedDate, end: selectedDate },
        });
        if (active) setRows(Array.isArray(response.data) ? response.data : []);
      } catch (requestError) {
        if (active) setError('No pudimos cargar la actividad. Intenta nuevamente.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadActivity();
    return () => { active = false; };
  }, [selectedDate, reloadToken]);

  React.useEffect(() => {
    let active = true;
    async function loadAlerts() {
      setAlertsLoading(true);
      setAlertsError('');
      try {
        const response = await api.get('/api/dashboard/alerts');
        if (active) setRawServiceAlerts(Array.isArray(response.data?.serviceAlerts) ? response.data.serviceAlerts : []);
      } catch (requestError) {
        if (active) setAlertsError('No pudimos cargar las alertas.');
      } finally {
        if (active) setAlertsLoading(false);
      }
    }
    loadAlerts();
    return () => { active = false; };
  }, [reloadToken]);

  const activity = React.useMemo(() => buildDailyActivity(rows, selectedDate), [rows, selectedDate]);
  const citySummary = React.useMemo(() => Object.fromEntries(
    activity.cityGroups.map((group) => [group.city, group.summary]),
  ), [activity.cityGroups]);
  const emptySummary = { turnovers: 0, checkIns: 0, checkOuts: 0, cleanings: 0 };
  const serviceAlerts = React.useMemo(
    () => buildMobileServiceAlerts(rawServiceAlerts, today, 7),
    [rawServiceAlerts, today],
  );

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: 'auto 76px auto minmax(0, 1fr)', gap: 0.9, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 30 }}>
        <Typography component="h1" sx={{ color: COLORS.darkTeal, fontSize: 20, fontWeight: 850 }}>Inicio</Typography>
        <IconButton aria-label="Actualizar inicio" onClick={() => setReloadToken((value) => value + 1)} disabled={loading || alertsLoading} size="small">
          {loading || alertsLoading ? <CircularProgress size={18} /> : <RefreshRoundedIcon fontSize="small" />}
        </IconButton>
      </Box>

      <SummaryPlaceholderCard today={today} />

      <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', borderColor: '#d9e4e1', overflow: 'hidden' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', boxSizing: 'border-box', px: 1.05, py: 0.9, '&:last-child': { pb: 0.85 } }}>
          <Typography sx={{ ...CARD_HEADER_STYLES, mb: 0.65, flexShrink: 0 }}>
            {selectedDate === today ? 'Actividad hoy' : 'Actividad del día'}
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 0.4, mb: 0.55, flexShrink: 0 }}>
            {dateStrip.map((day) => {
              const selected = day.ymd === selectedDate;
              return (
                <Box
                  component="button"
                  key={day.ymd}
                  aria-label={day.ymd}
                  onClick={() => setSelectedDate(day.ymd)}
                  sx={{
                    border: selected ? `1px solid ${COLORS.teal}` : '1px solid #edf1f0',
                    borderRadius: 1.5,
                    bgcolor: selected ? COLORS.teal : '#f7f9f8',
                    color: selected ? '#fff' : '#52615f',
                    py: 0.4,
                    px: 0,
                    cursor: 'pointer',
                  }}
                >
                  <Typography sx={{ fontSize: 8, fontWeight: 800, lineHeight: 1.05 }}>{day.weekday}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 850, lineHeight: 1.25 }}>{day.day}</Typography>
                </Box>
              );
            })}
          </Box>

          {error ? <Alert severity="error" sx={{ mb: 0.5, py: 0, fontSize: 10 }}>{error}</Alert> : null}
          {loading ? (
            <Stack spacing={0.5} sx={{ minHeight: 0, flex: 1 }}>
              <Skeleton variant="rounded" height={42} />
              <Skeleton variant="rounded" height={44} />
              <Skeleton variant="rounded" height={44} />
            </Stack>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Card variant="outlined" sx={{ borderColor: '#e2eae8', bgcolor: '#f9fbfa' }}>
                <CardContent sx={{ px: 0.45, py: 0.55, '&:last-child': { pb: 0.55 } }}>
                  <SummaryGrid summary={activity.summary} compact />
                </CardContent>
              </Card>
              <Box>
                <CitySummary city="Playa del Carmen" summary={citySummary['Playa del Carmen'] || emptySummary} />
                <CitySummary city="Tulum" summary={citySummary.Tulum || emptySummary} />
              </Box>
              <Box
                component="button"
                type="button"
                onClick={() => setDrawerOpen(true)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: 0,
                  borderTop: '1px solid #e8efed',
                  bgcolor: 'transparent',
                  color: COLORS.teal,
                  fontSize: 13,
                  fontWeight: 850,
                  textAlign: 'left',
                  mt: 0.45,
                  pt: 0.5,
                  px: 0,
                  cursor: 'pointer',
                }}
              >
                Ver actividad
                <ChevronRightRoundedIcon fontSize="small" />
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ height: '100%', minHeight: 0, borderColor: '#dfe8e5', overflow: 'hidden' }}>
        <CardContent sx={{ height: '100%', minHeight: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', px: 1.1, py: 0.8, '&:last-child': { pb: 0.75 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, flexShrink: 0 }}>
            <NotificationsActiveRoundedIcon sx={{ color: '#c58a16', fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Typography sx={CARD_HEADER_STYLES}>Alertas</Typography>
              <Typography sx={{ color: COLORS.muted, fontSize: 9.5 }}>Pagos de servicios</Typography>
            </Box>
            <Chip size="small" label={serviceAlerts.length} variant="outlined" sx={{ height: 20, color: COLORS.teal, borderColor: '#9bc1bc', fontSize: 9.5, fontWeight: 800 }} />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', mt: 0.2 }}>
            {alertsLoading ? <Skeleton variant="rounded" height="100%" /> : null}
            {!alertsLoading && alertsError ? <Typography sx={{ color: '#a33b43', fontSize: 10, mt: 1 }}>{alertsError}</Typography> : null}
            {!alertsLoading && !alertsError && serviceAlerts.length ? serviceAlerts.slice(0, 6).map((alert, index) => (
              <Box key={alert.id || `${alert.service}-${alert.unitName}-${alert.dueDate}`} sx={{ borderTop: index ? '1px solid #e7eeec' : 0 }}>
                <ServiceAlertRow alert={alert} roomy />
              </Box>
            )) : null}
            {!alertsLoading && !alertsError && !serviceAlerts.length ? <Typography sx={{ color: COLORS.muted, fontSize: 10.5, textAlign: 'center', mt: 1.3 }}>Sin alertas próximas.</Typography> : null}
          </Box>

          <Box
            component="button"
            type="button"
            onClick={() => setAlertsDrawerOpen(true)}
            sx={{ width: '100%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 0, borderTop: '1px solid #e8efed', bgcolor: 'transparent', color: COLORS.teal, fontSize: 11, fontWeight: 850, textAlign: 'left', pt: 0.45, px: 0, cursor: 'pointer' }}
          >
            Ver todas las alertas
            <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
        </CardContent>
      </Card>

      <ActivityDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selectedDate={selectedDate}
        activity={activity}
      />
      <AlertsDrawer open={alertsDrawerOpen} onClose={() => setAlertsDrawerOpen(false)} alerts={serviceAlerts} />
    </Box>
  );
}
