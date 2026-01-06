import React, { useState } from 'react';
import { Card, CardContent, Box, Button } from '@mui/material';
import AlertCenter from './AlertCenter';
import useAlerts from '../../hooks/useAlerts';

/**
 * DashboardAlertCenterCard
 *
 * Unified dashboard card that groups:
 *  - System / operational alerts (AlertCenter)
 *  - Email / iCal notifications (NotificationsCard)
 *
 * Intended to be used on both:
 *  - Admin dashboard
 *  - Manager dashboard
 *
 * For now, Alerts and Notifications each manage their own internal fetching
 * (via useAlerts and NotificationsCard's own logic). If we later want to
 * centralize fetching, we can add props like `alerts`, `notificationsItems`
 * and wire them as serverItems.
 */
const DashboardAlertCenterCard = () => {
  const { alerts, dismissAlert, loading } = useAlerts();
  const [tab, setTab] = useState('alerts');

  const serviceAlerts = alerts.filter((a) =>
    [
      // Legacy types (if any still exist)
      'cfe-missing-payment',
      'internet-missing-payment',
      'hoa-missing-payment',
      'water-missing-payment',
      // New unified service-payment alert types
      'service-payment-overdue',
      'service-payment-due-soon',
      'service-payment-mismatch',
    ].includes(a.type)
  );

  const reservationAlerts = alerts.filter((a) =>
    ['booking-unpaid', 'booking-ical-conflict'].includes(a.type)
  );

  return (
    <Card sx={{ height: 420, display: 'flex', flexDirection: 'column', maxWidth: 720 }}>
      {/* Teal header, similar to TaskNotificationsCard */}
      <Box
        sx={{
          backgroundColor: '#1E6F68',
          color: '#fff',
          px: 1.5,
          py: 1.25,             // increased from 1
          minHeight: 42,        // ensure consistent height with Tasks
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTopLeftRadius: 1,
          borderTopRightRadius: 1,
        }}
      >
        <Box sx={{ fontWeight: 600, fontSize: 14 }}>Alertas</Box>
        <Box sx={{ fontSize: 12, opacity: 0.9 }}>
          {alerts.length > 0
            ? `${alerts.length} item${alerts.length !== 1 ? 's' : ''}`
            : 'Sin alertas'}
        </Box>
      </Box>

      {/* Tabs row, mimicking TaskNotificationsCard style */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          borderBottom: '1px solid #e0e0e0',
          px: 1.5,
          pt: 0.5,
          gap: 1,
        }}
      >
        {[
          { value: 'alerts', label: `Pagos de Servicios (${serviceAlerts.length})` },
          { value: 'notifications', label: `Conflictos de Reservas (${reservationAlerts.length})` },
        ].map((t) => {
          const active = tab === t.value;
          return (
            <Button
              key={t.value}
              onClick={() => setTab(t.value)}
              size="small"
              sx={{
                minWidth: 0,
                px: 1,
                py: 0.25,
                fontSize: 14,
                textTransform: 'none',
                borderRadius: 0,
                borderBottom: active ? '2px solid #1E6F68' : '2px solid transparent',
                color: active ? '#1E6F68' : 'text.secondary',
                backgroundColor: 'transparent',
                '&:hover': {
                  backgroundColor: 'transparent',
                  color: active ? '#1E6F68' : '#1E6F68', // green on hover for non-selected
                },
              }}
            >
              {t.label}
            </Button>
          );
        })}
      </Box>

      <CardContent
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          pt: 1.5,
          pb: 1.5,
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            pt: 0.5,
            display: tab === 'alerts' ? 'block' : 'none',
          }}
        >
          <AlertCenter
            alerts={serviceAlerts}
            dismissAlert={dismissAlert}
            loading={loading}
            embedded
          />
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            pt: 0.5,
            display: tab === 'notifications' ? 'block' : 'none',
          }}
        >
          {reservationAlerts.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <AlertCenter
                alerts={reservationAlerts}
                dismissAlert={dismissAlert}
                loading={loading}
                embedded
              />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default DashboardAlertCenterCard;
