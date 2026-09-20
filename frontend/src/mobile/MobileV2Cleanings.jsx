import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import VpnKeyRoundedIcon from '@mui/icons-material/VpnKeyRounded';
import api from '../api';
import MobileFormDrawer from '../components/common/mobile/MobileFormDrawer';
import { getTodayYmd } from './calendarModel';
import {
  addDaysYmd,
  buildCleaningDateStrip,
  buildDailyCleaningCards,
  getCleaningTypeLabel,
  summarizeCleaningCards,
} from './cleaningsModel';
import { formatMobileGuestName } from './mobileFormatters';

const CITY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'Playa del Carmen', label: 'Playa' },
  { value: 'Tulum', label: 'Tulum' },
];

function getCityScope(access) {
  const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
  const normalizedCity = String(access?.normCity || '').toLowerCase();
  const canSeeAll = Boolean(
    access?.isAdmin
    || normalizedCity === 'general'
    || permissions.includes('city.all')
    || permissions.includes('city.general')
  );

  if (canSeeAll) return { canSeeAll: true, city: '' };
  if (normalizedCity.includes('tulum') || permissions.includes('city.tulum')) {
    return { canSeeAll: false, city: 'Tulum' };
  }
  return { canSeeAll: false, city: 'Playa del Carmen' };
}

function formatSelectedDate(ymd) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  const formatted = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function SummaryItem({ value, label, color }) {
  return (
    <Box sx={{ minWidth: 0, textAlign: 'center' }}>
      <Typography sx={{ color, fontSize: 19, fontWeight: 850, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>{label}</Typography>
    </Box>
  );
}

function EventLine({ type, event }) {
  const isCheckOut = type === 'checkout';
  const Icon = isCheckOut ? LogoutRoundedIcon : LoginRoundedIcon;
  const color = isCheckOut ? '#d64f61' : '#2f8f62';
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: 0.75, alignItems: 'start' }}>
      <Icon sx={{ color, fontSize: 18, mt: 0.1 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontSize: 12.5, fontWeight: 700 }}>
          {isCheckOut ? 'Salida' : 'Entrada'}{event.guest ? ` · ${formatMobileGuestName(event.guest)}` : ''}
        </Typography>
        <Typography
          variant="caption"
          noWrap
          title={event.notes || '–'}
          color="text.secondary"
          sx={{ display: 'block', fontSize: 10.5 }}
        >
          Notas: {event.notes || '–'}
        </Typography>
      </Box>
    </Box>
  );
}

function CleaningTypeLine({ cleaningType }) {
  const label = getCleaningTypeLabel(cleaningType) || 'Limpieza';
  const normalizedType = String(cleaningType || '').trim().toLowerCase().replaceAll('_', '-');
  const isCheckout = normalizedType === 'checkout' || normalizedType === 'owner';
  const color = normalizedType === 'refresh'
    ? '#2f8794'
    : normalizedType === 'mid-stay' || normalizedType === 'midstay'
      ? '#7658a5'
      : normalizedType === 'redo' || normalizedType === 're-do'
        ? '#c06b32'
        : '#d64f61';
  const Icon = isCheckout ? LogoutRoundedIcon : CleaningServicesRoundedIcon;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: 0.75, alignItems: 'center' }}>
      <Icon sx={{ color, fontSize: 18 }} />
      <Typography variant="body2" sx={{ fontSize: 12.5, fontWeight: 700 }}>
        {label}
      </Typography>
    </Box>
  );
}

function AccessDetail({ label, value, copyable = false, copied = false, onCopy }) {
  const displayValue = String(value || '').trim() || '–';
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 1, py: 0.9 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10.5, lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography sx={{ color: '#233936', fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>
          {displayValue}
        </Typography>
      </Box>
      {copyable && displayValue !== '–' ? (
        <IconButton
          size="small"
          aria-label="Copiar contraseña de Wi-Fi"
          onClick={() => onCopy(displayValue)}
          sx={{ color: copied ? '#2f8f62' : '#1E6F68' }}
        >
          {copied ? <CheckRoundedIcon fontSize="small" /> : <ContentCopyRoundedIcon fontSize="small" />}
        </IconButton>
      ) : null}
    </Box>
  );
}

function AccessPanel({ card, open, onClose }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copyWifiPassword = async (value) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
    } catch (error) {
      setCopied(false);
    }
  };

  const access = card?.access || {};
  return (
    <MobileFormDrawer
      open={open}
      onClose={onClose}
      title="Acceso a la unidad"
      showActions={false}
      mobileVariant="fullscreen"
      headerLink={(
        <IconButton aria-label="Cerrar información de acceso" onClick={onClose} sx={{ color: '#fff' }}>
          <CloseRoundedIcon />
        </IconButton>
      )}
      contentSx={{ p: 2 }}
    >
      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ color: '#173f3b', fontSize: 17, fontWeight: 850 }}>{card?.unitName || 'Unidad'}</Typography>
        <Typography variant="body2" color="text.secondary">{card?.city || '–'}</Typography>
      </Box>

      <Typography sx={{ color: '#1E6F68', fontSize: 12, fontWeight: 850 }}>UBICACIÓN</Typography>
      <AccessDetail label="Condominio" value={access.condoName} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2 }}>
        <AccessDetail label="Número de unidad" value={access.unitNumber} />
        <AccessDetail label="Piso" value={access.unitFloor} />
      </Box>
      <Divider sx={{ my: 0.75 }} />

      <Typography sx={{ color: '#1E6F68', fontSize: 12, fontWeight: 850, mt: 1 }}>ACCESO</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2 }}>
        <AccessDetail label="Tipo" value={access.accessType} />
        <AccessDetail label="Código" value={access.accessCode} />
      </Box>
      <AccessDetail label="Código del condominio" value={access.condoDoorCode} />
      <Divider sx={{ my: 0.75 }} />

      <Typography sx={{ color: '#1E6F68', fontSize: 12, fontWeight: 850, mt: 1 }}>WI-FI</Typography>
      <AccessDetail label="Red" value={access.wifiName} />
      <AccessDetail
        label={copied ? 'Contraseña · Copiada' : 'Contraseña'}
        value={access.wifiPassword}
        copyable
        copied={copied}
        onCopy={copyWifiPassword}
      />
    </MobileFormDrawer>
  );
}

function CleaningPanel({ card, open, onClose, onSaved }) {
  const [notes, setNotes] = React.useState('');
  const [markCompleted, setMarkCompleted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setNotes(card?.cleanerNotes || '');
    setMarkCompleted(Boolean(card?.cleaningDone));
    setError('');
  }, [card, open]);

  const save = async () => {
    if (!card?.cleaningId || saving) return;
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('checklistData', JSON.stringify([]));
      formData.append('notes', notes.trim());

      const shouldComplete = !card.cleaningDone && markCompleted;
      const action = shouldComplete ? 'submit-checklist' : 'save-checklist-draft';
      await api.post(`/api/hk-cleanings/${card.cleaningId}/${action}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSaved();
    } catch (requestError) {
      setError('No pudimos guardar los cambios. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileFormDrawer
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Actualizar limpieza"
      formId="mobile-v2-cleaning-update-form"
      showActions
      actions={{
        saveLabel: saving ? 'Guardando…' : 'Guardar',
        cancelLabel: 'Cancelar',
        saveDisabled: saving,
        cancelDisabled: saving,
      }}
      mobileVariant="fullscreen"
      headerLink={(
        <IconButton aria-label="Cerrar limpieza" onClick={onClose} disabled={saving} sx={{ color: '#fff' }}>
          <CloseRoundedIcon />
        </IconButton>
      )}
      contentSx={{ p: 2 }}
    >
      <Box
        component="form"
        id="mobile-v2-cleaning-update-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ color: '#173f3b', fontSize: 17, fontWeight: 850 }}>{card?.unitName || 'Unidad'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {getCleaningTypeLabel(card?.cleaningType) || 'Limpieza'} · {card?.city || '–'}
        </Typography>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}

      <TextField
        label="Notas limpieza"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        multiline
        minRows={4}
        fullWidth
        disabled={saving}
      />

      {card?.cleaningDone ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, color: '#2f8f62' }}>
          <CheckRoundedIcon fontSize="small" />
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>Limpieza completada</Typography>
        </Box>
      ) : (
        <ToggleButton
          value="completed"
          selected={markCompleted}
          onChange={() => setMarkCompleted((selected) => !selected)}
          disabled={saving}
          fullWidth
          sx={{
            mt: 1.5,
            minHeight: 46,
            borderRadius: '8px !important',
            border: '1.5px solid #9fb4b0 !important',
            color: '#385b56',
            bgcolor: '#fff',
            fontSize: 13,
            fontWeight: 750,
            gap: 0.75,
            textTransform: 'none',
            '&.Mui-selected': {
              color: '#fff',
              bgcolor: '#2f8f62',
              borderColor: '#2f8f62 !important',
            },
            '&.Mui-selected:hover': { bgcolor: '#287a54' },
          }}
        >
          <CheckRoundedIcon fontSize="small" />
          {markCompleted ? 'Completada al guardar' : 'Marcar como completada'}
        </ToggleButton>
      )}

      </Box>
    </MobileFormDrawer>
  );
}

function CleaningCard({ card, onOpenAccess, onOpenCleaning }) {
  const hasCleaning = Boolean(card.cleaningId || card.checkOuts.length > 0);
  const status = card.cleaningDone ? 'Completada' : card.cleaningId ? 'Pendiente' : 'Por crear';
  const statusColor = card.cleaningDone ? '#2f8f62' : '#c58a16';

  return (
    <Card variant="outlined" sx={{ borderColor: '#dfe8e5', borderLeft: `4px solid ${statusColor}` }}>
      <CardContent sx={{ px: 1.25, py: 1.1, '&:last-child': { pb: 1.1 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start', mb: 0.85 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 14, fontWeight: 850 }}>{card.unitName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>{card.city}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, flexShrink: 0 }}>
            <IconButton
              size="small"
              aria-label={`Ver acceso de ${card.unitName}`}
              onClick={() => onOpenAccess(card)}
              sx={{ color: '#1E6F68', p: 0.55 }}
            >
              <VpnKeyRoundedIcon sx={{ fontSize: 19 }} />
            </IconButton>
            <Chip
              size="small"
              label={status}
              clickable={Boolean(card.cleaningId)}
              onClick={card.cleaningId ? () => onOpenCleaning(card) : undefined}
              sx={{
                height: 22,
                color: statusColor,
                borderColor: statusColor,
                bgcolor: `${statusColor}10`,
                fontWeight: 750,
                fontSize: 10.5,
              }}
              variant="outlined"
            />
          </Box>
        </Box>

        <Stack spacing={0.65}>
          {card.checkOuts.length === 0 && card.cleaningId ? (
            <CleaningTypeLine cleaningType={card.cleaningType} />
          ) : null}
          {card.checkOuts.map((event, index) => <EventLine key={`out-${event.bookingId || index}`} type="checkout" event={event} />)}
          {card.checkIns.map((event, index) => <EventLine key={`in-${event.bookingId || index}`} type="checkin" event={event} />)}
        </Stack>

        {card.cleaningId ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontSize: 10.5, mt: 0.65, pl: '28px', whiteSpace: 'pre-wrap' }}
          >
            <Box component="span" sx={{ display: 'block' }}>Coment: {card.cleaningNotes || '-'}</Box>
            <Box component="span" sx={{ display: 'block' }}>Notas: {card.cleanerNotes || '-'}</Box>
          </Typography>
        ) : null}

        {hasCleaning ? (
          <Box sx={{ mt: 0.9, pt: 0.75, borderTop: '1px solid #eef2f1', display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <PersonOutlineRoundedIcon sx={{ color: '#697976', fontSize: 16 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>
              {card.assignedCleaner ? `Asignada a ${card.assignedCleaner}` : 'Sin asignar'}
            </Typography>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function MobileV2Cleanings({ access }) {
  const today = React.useMemo(() => getTodayYmd(), []);
  const scope = React.useMemo(() => getCityScope(access), [access]);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [city, setCity] = React.useState(scope.city);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [reloadToken, setReloadToken] = React.useState(0);
  const [accessCard, setAccessCard] = React.useState(null);
  const [cleaningCard, setCleaningCard] = React.useState(null);

  React.useEffect(() => {
    if (!scope.canSeeAll) setCity(scope.city);
  }, [scope]);

  React.useEffect(() => {
    let active = true;
    async function loadActivity() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/api/bookings/check-activity', {
          params: {
            start: selectedDate,
            end: selectedDate,
            ...(city ? { city } : {}),
          },
        });
        if (active) setRows(Array.isArray(response.data) ? response.data : []);
      } catch (requestError) {
        if (active) setError('No pudimos cargar las limpiezas. Intenta nuevamente.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadActivity();
    return () => { active = false; };
  }, [selectedDate, city, reloadToken]);

  const dateStrip = React.useMemo(() => buildCleaningDateStrip(selectedDate), [selectedDate]);
  const cards = React.useMemo(() => buildDailyCleaningCards(rows, selectedDate), [rows, selectedDate]);
  const summary = React.useMemo(() => summarizeCleaningCards(cards), [cards]);
  const groupedCards = React.useMemo(() => cards.reduce((groups, card) => {
    const key = card.city || 'Sin ciudad';
    if (!groups[key]) groups[key] = [];
    groups[key].push(card);
    return groups;
  }, {}), [cards]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
        <Box>
          <Typography component="h1" sx={{ color: '#173f3b', fontSize: 18, fontWeight: 850, lineHeight: 1.15 }}>
            Limpiezas
          </Typography>
        </Box>
        <IconButton aria-label="Actualizar limpiezas" onClick={() => setReloadToken((value) => value + 1)} disabled={loading}>
          {loading ? <CircularProgress size={20} /> : <RefreshRoundedIcon />}
        </IconButton>
      </Box>

      <Card variant="outlined" sx={{ borderColor: '#d9e4e1', mb: 1.25 }}>
        <CardContent sx={{ px: 1, py: 1, '&:last-child': { pb: 1 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 36px', alignItems: 'center', mb: 0.6 }}>
            <IconButton size="small" aria-label="Día anterior" onClick={() => setSelectedDate(addDaysYmd(selectedDate, -1))}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800 }}>{formatSelectedDate(selectedDate)}</Typography>
              {selectedDate !== today ? (
                <Typography component="button" onClick={() => setSelectedDate(today)} sx={{ border: 0, p: 0, bgcolor: 'transparent', color: '#1E6F68', fontSize: 11, fontWeight: 750, cursor: 'pointer' }}>
                  Ir a hoy
                </Typography>
              ) : null}
            </Box>
            <IconButton size="small" aria-label="Día siguiente" onClick={() => setSelectedDate(addDaysYmd(selectedDate, 1))}>
              <ChevronRightRoundedIcon />
            </IconButton>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.4 }}>
            {dateStrip.map((day) => {
              const selected = day.ymd === selectedDate;
              const isToday = day.ymd === today;
              return (
                <Box
                  component="button"
                  key={day.ymd}
                  aria-label={day.ymd}
                  onClick={() => setSelectedDate(day.ymd)}
                  sx={{
                    border: selected ? '1px solid #1E6F68' : '1px solid transparent',
                    borderRadius: 1.5,
                    bgcolor: selected ? '#e8f3f1' : 'transparent',
                    color: selected ? '#155d56' : '#52615f',
                    py: 0.45,
                    px: 0,
                    cursor: 'pointer',
                  }}
                >
                  <Typography sx={{ fontSize: 9.5, fontWeight: 750, lineHeight: 1.1 }}>{day.weekday}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: isToday || selected ? 850 : 650, lineHeight: 1.4 }}>{day.day}</Typography>
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {scope.canSeeAll ? (
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={city}
          onChange={(_, value) => { if (value !== null) setCity(value); }}
          aria-label="Filtrar por ciudad"
          sx={{ mb: 1.25, bgcolor: '#fff' }}
        >
          {CITY_OPTIONS.map((option) => <ToggleButton key={option.label} value={option.value}>{option.label}</ToggleButton>)}
        </ToggleButtonGroup>
      ) : null}

      <Card variant="outlined" sx={{ borderColor: '#dfe8e5', mb: 1.25 }}>
        <CardContent sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', px: 1.25, py: 1, '&:last-child': { pb: 1 } }}>
          <SummaryItem value={summary.checkOuts} label="Salidas" color="#d64f61" />
          <SummaryItem value={summary.checkIns} label="Entradas" color="#2f8f62" />
          <SummaryItem value={`${summary.completed}/${summary.cleanings}`} label="Limpiezas" color="#1E6F68" />
        </CardContent>
      </Card>

      {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}

      {loading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((item) => <Skeleton key={item} variant="rounded" height={116} />)}
        </Stack>
      ) : cards.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: '#dfe8e5' }}>
          <CardContent sx={{ textAlign: 'center', py: 3 }}>
            <CleaningServicesRoundedIcon sx={{ color: '#7aa49f', fontSize: 32, mb: 0.5 }} />
            <Typography sx={{ fontWeight: 800 }}>Sin actividad</Typography>
            <Typography variant="body2" color="text.secondary">No hay entradas, salidas o limpiezas para este día.</Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.25}>
          {Object.entries(groupedCards).map(([cityName, cityCards]) => (
            <Box key={cityName}>
              {(scope.canSeeAll && !city) ? (
                <Typography sx={{ color: '#1E6F68', fontSize: 12, fontWeight: 850, mb: 0.55 }}>{cityName}</Typography>
              ) : null}
              <Stack spacing={0.8}>
                {cityCards.map((card) => (
                  <CleaningCard
                    key={`${card.unitId}-${card.unitName}`}
                    card={card}
                    onOpenAccess={setAccessCard}
                    onOpenCleaning={setCleaningCard}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <AccessPanel card={accessCard} open={Boolean(accessCard)} onClose={() => setAccessCard(null)} />
      <CleaningPanel
        card={cleaningCard}
        open={Boolean(cleaningCard)}
        onClose={() => setCleaningCard(null)}
        onSaved={() => {
          setCleaningCard(null);
          setReloadToken((value) => value + 1);
        }}
      />
    </Box>
  );
}
