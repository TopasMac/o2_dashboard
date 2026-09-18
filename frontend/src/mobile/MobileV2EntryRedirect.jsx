import * as React from 'react';
import { Navigate } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import useCurrentUserAccess from '../hooks/useCurrentUserAccess';
import { getMobileV2EntryPath } from './mobileFeatures';

export default function MobileV2EntryRedirect() {
  const access = useCurrentUserAccess();

  if (access.isLoading) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: '#f4f7f6' }}>
        <CircularProgress aria-label="Cargando acceso" size={32} />
      </Box>
    );
  }

  const mobilePath = getMobileV2EntryPath(access);
  return <Navigate to={mobilePath || '/m/v2'} replace />;
}
