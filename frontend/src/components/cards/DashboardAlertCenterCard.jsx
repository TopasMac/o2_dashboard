import React, { useState } from 'react';
import { Card, CardContent, Box, Button } from '@mui/material';
import AlertCenter from './AlertCenter';
import AirbnbReviewsCard from './AirbnbReviewsCard';
import useAlerts from '../../hooks/useAlerts';

const DashboardAlertCenterCard = ({ showAirbnbReviews = false }) => {
  const { alerts, dismissAlert, loading } = useAlerts();
  const [tab, setTab] = useState('alerts');
  const [pendingReviews, setPendingReviews] = useState(null);

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
    <Card
      elevation={0}
      sx={{
        height: 420,
        maxWidth: 720,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #dce6e7',
        borderRadius: '16px',
        backgroundColor: '#fff',
        boxShadow: '0 2px 8px rgba(6, 24, 37, 0.06)',
        p: '14px',
      }}
    >
      <Box component="h2" sx={{ m: 0, mb: 1.5, color: '#061825', fontSize: 21, lineHeight: 1.1 }}>
        Alertas
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {[
          { value: 'alerts', label: `Pagos de Servicios (${serviceAlerts.length})` },
          { value: 'notifications', label: `Conflictos de Reservas (${reservationAlerts.length})` },
          ...(showAirbnbReviews ? [{ value: 'reviews', label: pendingReviews === null ? 'Reseñas Airbnb' : `Reseñas Airbnb (${pendingReviews})` }] : []),
        ].map((t) => {
          const active = tab === t.value;
          return (
            <Button
              key={t.value}
              onClick={() => setTab(t.value)}
              size="small"
              aria-pressed={active}
              sx={{
                minWidth: 0,
                px: 1.25,
                py: 0.75,
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'none',
                border: '1px solid',
                borderRadius: '9px',
                borderColor: active ? '#087f80' : '#dce6e7',
                color: active ? '#fff' : '#4c5964',
                backgroundColor: active ? '#087f80' : '#f7fafa',
                '&:hover': {
                  backgroundColor: active ? '#087f80' : '#edf5f5',
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
          minHeight: 0,
          mt: 1.5,
          border: '1px solid #dce6e7',
          borderRadius: '12px',
          p: 1.5,
          '&:last-child': { pb: 1.5 },
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
        {showAirbnbReviews && (
          <Box hidden={tab !== 'reviews'}>
            <AirbnbReviewsCard embedded onPendingCountChange={setPendingReviews} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default DashboardAlertCenterCard;
