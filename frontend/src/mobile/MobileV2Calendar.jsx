import * as React from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import api from '../api';
import BookingEditFormRHF from '../components/forms/BookingEditFormRHF';
import MobileFormDrawer from '../components/common/mobile/MobileFormDrawer';
import {
  BOOKING_COLORS,
  bookingFormToApi,
  bookingsForDate,
  buildCalendarSegments,
  buildMonthGrid,
  formatShortDate,
  getBookingColor,
  getTodayYmd,
  normalizeBookings,
} from './calendarModel';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const CALENDAR_ROW_HEIGHT = 58;

function monthFromYmd(ymd) {
  const [year, month] = ymd.split('-').map(Number);
  return { year, monthIndex: month - 1 };
}

function moveMonth(current, amount) {
  const date = new Date(Date.UTC(current.year, current.monthIndex + amount, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}

function monthTitle({ year, monthIndex }) {
  const label = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function kindLabel(booking) {
  if (booking.isBlock) return 'Bloqueo';
  if (booking.isHold) return 'Hold';
  return booking.source || 'Reservación';
}

function formatPayout(value) {
  if (value === null || value === undefined || value === '') return '–';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(amount);
}

function CompactDetail({ label, value }) {
  const displayValue = String(value || '').trim() || '–';
  return (
    <React.Fragment>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10.5, lineHeight: 1.3 }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        noWrap
        title={displayValue}
        sx={{ minWidth: 0, color: '#314542', fontSize: 10.5, lineHeight: 1.3 }}
      >
        {displayValue}
      </Typography>
    </React.Fragment>
  );
}

export default function MobileV2Calendar() {
  const today = React.useMemo(() => getTodayYmd(), []);
  const [month, setMonth] = React.useState(() => monthFromYmd(today));
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [units, setUnits] = React.useState([]);
  const [unitId, setUnitId] = React.useState('');
  const [bookings, setBookings] = React.useState([]);
  const [unitsLoading, setUnitsLoading] = React.useState(true);
  const [calendarLoading, setCalendarLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [reloadToken, setReloadToken] = React.useState(0);
  const [editBooking, setEditBooking] = React.useState(null);
  const [editOpen, setEditOpen] = React.useState(false);

  const days = React.useMemo(
    () => buildMonthGrid(month.year, month.monthIndex),
    [month]
  );

  React.useEffect(() => {
    let active = true;
    async function loadUnits() {
      try {
        const response = await api.get('/api/units/options');
        const nextUnits = Array.isArray(response.data) ? response.data : [];
        if (!active) return;
        setUnits(nextUnits);
        setUnitId(nextUnits[0]?.id ? String(nextUnits[0].id) : '');
      } catch (requestError) {
        if (active) setError('No pudimos cargar las unidades. Intenta nuevamente.');
      } finally {
        if (active) setUnitsLoading(false);
      }
    }
    loadUnits();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!unitId || days.length === 0) return undefined;
    let active = true;
    async function loadCalendar() {
      setCalendarLoading(true);
      setError('');
      try {
        const response = await api.get('/api/bookings-timeline', {
          params: {
            unitId,
            start: days[0].ymd,
            end: days[days.length - 1].ymd,
          },
        });
        if (active) setBookings(normalizeBookings(response.data));
      } catch (requestError) {
        if (active) setError('No pudimos cargar el calendario. Intenta nuevamente.');
      } finally {
        if (active) setCalendarLoading(false);
      }
    }
    loadCalendar();
    return () => { active = false; };
  }, [days, unitId, reloadToken]);

  const unitOptionsForForm = React.useMemo(
    () => units.map((unit) => ({ id: unit.id, label: unit.unit_name || '' })),
    [units]
  );

  const openEditor = (booking) => {
    if (booking?.isHold || booking?.isBlock) return;
    setEditBooking(booking);
    setEditOpen(true);
  };

  const closeEditor = () => {
    setEditOpen(false);
    setEditBooking(null);
  };

  const saveBooking = async (values) => {
    if (!editBooking?.id) throw new Error('No encontramos la reservación que deseas editar.');
    await api.put(`/api/bookings/${editBooking.id}`, bookingFormToApi(values), {
      headers: { 'Content-Type': 'application/json' },
    });
    closeEditor();
    setReloadToken((current) => current + 1);
  };

  const selectedBookings = React.useMemo(
    () => bookingsForDate(bookings, selectedDate),
    [bookings, selectedDate]
  );
  const calendarSegments = React.useMemo(
    () => buildCalendarSegments(bookings, days),
    [bookings, days]
  );

  const chooseToday = () => {
    setMonth(monthFromYmd(today));
    setSelectedDate(today);
  };

  const changeMonth = (amount) => {
    const next = moveMonth(month, amount);
    setMonth(next);
    setSelectedDate(`${next.year}-${String(next.monthIndex + 1).padStart(2, '0')}-01`);
  };

  return (
    <>
      <Stack spacing={1.25} sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Box>
        <Typography component="h1" variant="h5" sx={{ color: '#173f3b', fontWeight: 800 }}>
          Calendario
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {unitsLoading ? (
        <Skeleton variant="rounded" height={56} />
      ) : (
        <Autocomplete
          fullWidth
          size="small"
          options={units}
          value={units.find((unit) => String(unit.id) === unitId) || null}
          onChange={(_, unit) => setUnitId(unit ? String(unit.id) : '')}
          getOptionLabel={(unit) => `${unit.unit_name}${unit.city ? ` · ${unit.city}` : ''}`}
          isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
          noOptionsText="No encontramos esa unidad"
          clearText="Limpiar"
          openText="Ver unidades"
          closeText="Cerrar"
          renderInput={(params) => (
            <TextField
              {...params}
              label="Unidad"
              placeholder="Escribe para buscar"
              inputProps={{
                ...params.inputProps,
                autoComplete: 'off',
              }}
            />
          )}
        />
      )}

      <Card variant="outlined" sx={{ borderColor: '#d8e4e1', overflow: 'hidden', flexShrink: 0 }}>
        <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '40px 1fr 40px', alignItems: 'center' }}>
            <IconButton aria-label="Mes anterior" onClick={() => changeMonth(-1)}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 800, color: '#173f3b' }}>{monthTitle(month)}</Typography>
              <Typography
                component="button"
                type="button"
                onClick={chooseToday}
                sx={{ border: 0, p: 0, bgcolor: 'transparent', color: '#1E6F68', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Ir a hoy
              </Typography>
            </Box>
            <IconButton aria-label="Mes siguiente" onClick={() => changeMonth(1)}>
              <ChevronRightRoundedIcon />
            </IconButton>
          </Box>

          <Box sx={{ position: 'relative', mt: 1 }}>
            {calendarLoading && (
              <Box sx={{ position: 'absolute', inset: 0, zIndex: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,.7)' }}>
                <CircularProgress size={28} />
              </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {WEEKDAYS.map((weekday, index) => (
                <Typography key={`${weekday}-${index}`} variant="caption" sx={{ py: 0.75, textAlign: 'center', color: 'text.secondary', fontWeight: 800 }}>
                  {weekday}
                </Typography>
              ))}
            </Box>
            <Box sx={{ position: 'relative', height: CALENDAR_ROW_HEIGHT * 6 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {days.map((day) => {
                  const dayBookings = bookingsForDate(bookings, day.ymd);
                  const isSelected = selectedDate === day.ymd;
                  const isToday = today === day.ymd;
                  return (
                    <Box
                      component="button"
                      type="button"
                      aria-label={`${day.ymd}, ${dayBookings.length} registros`}
                      key={day.ymd}
                      onClick={() => setSelectedDate(day.ymd)}
                      sx={{
                        position: 'relative',
                        minWidth: 0,
                        height: CALENDAR_ROW_HEIGHT,
                        px: 0.4,
                        py: 0.5,
                        border: '1px solid #edf1f0',
                        borderRadius: 1,
                        bgcolor: isSelected ? '#e7f3f0' : '#fff',
                        boxShadow: isSelected ? 'inset 0 0 0 2px #1E6F68' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                        display: 'grid',
                        placeItems: 'center',
                        position: 'absolute',
                        top: 2,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 2,
                        width: 21,
                        height: 21,
                        borderRadius: '50%',
                          bgcolor: isToday ? '#1E6F68' : 'transparent',
                          color: isToday ? '#fff' : day.inMonth ? '#263a37' : '#a8b3b1',
                          fontSize: 12,
                          fontWeight: isToday || isSelected ? 800 : 600,
                        }}
                      >
                        {day.day}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {calendarSegments.map((segment, index) => (
                <Box
                  key={`${segment.booking.id}-${segment.row}-${index}`}
                  title={`${segment.booking.guestName}: ${segment.booking.checkIn} – ${segment.booking.checkOut}`}
                  sx={{
                    position: 'absolute',
                    zIndex: 1,
                    pointerEvents: 'none',
                    top: segment.row * CALENDAR_ROW_HEIGHT + 27,
                    left: `calc(${segment.leftPercent}% + 1px)`,
                    width: `calc(${segment.widthPercent}% - 2px)`,
                    height: 17,
                    px: 0.55,
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    borderTopLeftRadius: segment.roundedStart ? 8.5 : 0,
                    borderBottomLeftRadius: segment.roundedStart ? 8.5 : 0,
                    borderTopRightRadius: segment.roundedEnd ? 8.5 : 0,
                    borderBottomRightRadius: segment.roundedEnd ? 8.5 : 0,
                    bgcolor: getBookingColor(segment.booking),
                    color: '#fff',
                    boxShadow: '0 1px 2px rgba(20,45,41,.18)',
                  }}
                >
                  <Typography
                    component="span"
                    noWrap
                    sx={{ color: 'inherit', fontSize: 9.5, lineHeight: 1, fontWeight: 800 }}
                  >
                    {segment.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mt: 1.5, px: 0.5 }}>
            {[
              ['HausIn', BOOKING_COLORS.reservation],
              ['Airbnb', BOOKING_COLORS.airbnb],
              ['Hold', BOOKING_COLORS.hold],
              ['Bloqueo', BOOKING_COLORS.block],
            ].map(([label, color]) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ minHeight: 0, overflowY: 'auto', pb: 0.5 }}>
        <Typography variant="overline" sx={{ color: '#1E6F68', fontWeight: 900 }}>
          {formatShortDate(selectedDate)}
        </Typography>
        {selectedBookings.length === 0 ? (
          <Card variant="outlined" sx={{ mt: 0.5, borderColor: '#dfe8e5' }}>
            <CardContent sx={{ display: 'flex', gap: 1.25, alignItems: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <EventAvailableRoundedIcon sx={{ color: '#63a69f' }} />
              <Box>
                <Typography sx={{ fontWeight: 750 }}>Disponible</Typography>
                <Typography variant="body2" color="text.secondary">Sin registros para este día.</Typography>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {selectedBookings.map((booking) => (
              <Card key={booking.id ?? `${booking.checkIn}-${booking.guestName}`} variant="outlined" sx={{ borderColor: '#dfe8e5', borderLeft: `5px solid ${getBookingColor(booking)}` }}>
                <CardActionArea
                  disabled={booking.isHold || booking.isBlock}
                  onClick={() => openEditor(booking)}
                  aria-label={booking.isHold || booking.isBlock
                    ? `${kindLabel(booking)} de ${booking.guestName}`
                    : `Editar reservación de ${booking.guestName}`}
                  sx={{ textAlign: 'left' }}
                >
                  <CardContent sx={{ py: 1.15, px: 1.5, '&:last-child': { pb: 1.15 } }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 800 }}>{booking.guestName}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.45 }}>
                        <Typography variant="caption" sx={{ color: getBookingColor(booking), fontWeight: 900 }}>
                          {kindLabel(booking)}
                        </Typography>
                        {!booking.isHold && !booking.isBlock && (
                          <EditRoundedIcon aria-hidden="true" sx={{ color: '#1E6F68', fontSize: 17 }} />
                        )}
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
                      {formatShortDate(booking.checkIn)} → {formatShortDate(booking.checkOut)}
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '68px minmax(0, 1fr)',
                        columnGap: 0.75,
                        rowGap: 0.15,
                        mt: 0.55,
                      }}
                    >
                      <CompactDetail label="Payout" value={formatPayout(booking.payout)} />
                      <CompactDetail label="Notas" value={booking.notes} />
                      <CompactDetail label="Check-in" value={booking.checkInNotes} />
                      <CompactDetail label="Check-out" value={booking.checkOutNotes} />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
      </Stack>

      <MobileFormDrawer
        open={editOpen}
        onClose={closeEditor}
        title="Editar reservación"
        headerLink={(
          <IconButton aria-label="Cerrar editor" onClick={closeEditor} sx={{ color: '#fff' }}>
            <CloseRoundedIcon />
          </IconButton>
        )}
        formId="mobile-v2-booking-edit-form"
        FormComponent={BookingEditFormRHF}
        componentKey={editBooking ? `mobile-v2-booking-${editBooking.id}` : 'mobile-v2-booking'}
        mobileVariant="fullscreen"
        contentSx={{ bgcolor: '#f7faf9' }}
        actions={{ saveLabel: 'Guardar', cancelLabel: 'Cancelar', showDelete: false }}
        formProps={{
          formId: 'mobile-v2-booking-edit-form',
          layout: 'mobile',
          initialValues: editBooking ? {
            id: editBooking.id,
            unitId: editBooking.unitId,
            status: editBooking.status || 'Upcoming',
            guestName: editBooking.guestName,
            guests: editBooking.guests ?? '',
            checkIn: editBooking.checkIn,
            checkOut: editBooking.checkOut,
            payout: editBooking.payout ?? '',
            paymentMethod: editBooking.paymentMethod,
            cleaningFee: editBooking.cleaningFee ?? '',
            commissionPercent: editBooking.commissionPercent ?? '',
            notes: editBooking.notes,
            checkInNotes: editBooking.checkInNotes,
            checkOutNotes: editBooking.checkOutNotes,
            source: editBooking.source,
            isPaid: editBooking.isPaid,
          } : {},
          unitOptions: unitOptionsForForm,
          onSubmit: saveBooking,
          onCancel: closeEditor,
          submitLabel: 'Guardar',
        }}
      />
    </>
  );
}
