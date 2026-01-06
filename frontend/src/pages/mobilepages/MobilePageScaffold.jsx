import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';

/**
 * MobilePageScaffold
 *
 * Lightweight layout wrapper for mobile pages.
 * Provides:
 * - Consistent header (title + optional left/right actions)
 * - Scrollable content area
 * - Optional padding control
 *
 * Intended to be used inside MobileShell.
 */
export default function MobilePageScaffold({
  title,
  rightAction,
  disablePadding = false,
  disableHeader = false,
  stickyHeader,
  children,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: '#f5f7f8',
      }}
    >
      {/* Content */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          px: 0,
          py: disablePadding ? 0 : 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {stickyHeader && (
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 5,
              bgcolor: '#f5f7f8',
              px: disablePadding ? 0 : 2,
              pb: disablePadding ? 0 : 1,
            }}
          >
            {stickyHeader}
          </Box>
        )}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}