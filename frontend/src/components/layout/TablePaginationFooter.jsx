import React from 'react';
import { Box, IconButton } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/** Dataset-independent controls: server adapters can supply the same metadata.
 * page is zero-based; mount as a sibling of the table's scroll container.
 */
export default function TablePaginationFooter({ page, pageSize, total, totalPages = Math.ceil(total / pageSize), onPageChange }) {
  const start = total ? page * pageSize + 1 : 0;
  const end = Math.min(total, (page + 1) * pageSize);
  const arrowSx = (theme) => ({
    width: 32, height: 32,
    color: theme.hausin.colors.primaryTeal,
    '&:hover': { backgroundColor: alpha(theme.hausin.colors.primaryTeal, 0.08) },
    '&.Mui-disabled': { color: theme.hausin.colors.muted },
  });
  return (
    <Box component="nav" aria-label="Table pagination" sx={(theme) => ({
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 1, px: 2, py: 0.5,
      backgroundColor: theme.palette.common.white,
      borderTop: `1px solid ${theme.hausin.colors.border}`,
      fontSize: theme.hausin.controls.fontSize,
    })}>
      <Box aria-live="polite" sx={(theme) => ({ color: theme.hausin.colors.textSecondary })}>
        {total ? `Showing ${start}–${end} of ${total}` : 'Showing 0 of 0'}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
        <IconButton aria-label="Previous page" disabled={page <= 0 || !total} onClick={() => onPageChange(page - 1)} sx={arrowSx}>
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Box sx={(theme) => ({ color: theme.hausin.colors.textPrimary, fontWeight: 500 })}>
          {total ? page + 1 : 0} / {totalPages}
        </Box>
        <IconButton aria-label="Next page" disabled={!total || page >= totalPages - 1} onClick={() => onPageChange(page + 1)} sx={arrowSx}>
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}
