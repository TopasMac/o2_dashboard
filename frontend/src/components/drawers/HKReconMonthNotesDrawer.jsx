import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HKReconMonthNotesPanel from '../panels/HKReconMonthNotesPanel';

/**
 * HKReconMonthNotesDrawer (Docked Panel)
 *
 * Render as in-flow content (not an overlay) so the reconciliation table stays
 * accessible and can horizontally scroll when width is reduced.
 */
export default function HKReconMonthNotesDrawer({
  open,
  onClose,
  title = 'Month notes',
  city,
  month,
  focusHkCleaningId = null,
  onChanged,
}) {
  if (!open) return null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box
        sx={{
          px: 2,
          height: 41,
          minHeight: 41,
          py: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          background: '#fff',
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            left: 16, // inset line from left edge
            right: 16, // inset line from right edge
            bottom: 0,
            height: '1px',
            backgroundColor: '#e5e7eb',
          },
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close month notes">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2, background: '#fff' }}>
        <HKReconMonthNotesPanel
          city={city}
          month={month}
          focusHkCleaningId={focusHkCleaningId}
          onClose={onClose}
          onChanged={onChanged}
        />
      </Box>
    </Box>
  );
}