import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import useCurrentUserAccess from '../hooks/useCurrentUserAccess';
import { canAccessMobileFeature } from './mobileFeatures';

export default function MobileV2AccessGate({ feature, children }) {
  const access = useCurrentUserAccess();

  if (access.isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: '#f4f7f6',
        }}
      >
        <CircularProgress aria-label="Cargando acceso" size={32} />
      </Box>
    );
  }

  if (!canAccessMobileFeature(access, feature)) {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: '#f4f7f6', p: 2, pt: 8 }}>
        <Alert severity="warning">
          Tu cuenta no tiene acceso a esta página móvil.
        </Alert>
      </Box>
    );
  }

  return typeof children === 'function' ? children(access) : children;
}
