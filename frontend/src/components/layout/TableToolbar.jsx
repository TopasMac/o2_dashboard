import React from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/**
 * Shared controls area for desktop TableLite pages.
 *
 * `layout="auto"` keeps actions and filters on one row when space allows,
 * while preserving each logical group when the toolbar needs a second row.
 */
export default function TableToolbar({
  title,
  actions,
  filters,
  layout = 'auto',
  'aria-label': ariaLabel = 'Table controls',
}) {
  const theme = useTheme();
  const tokens = theme.hausin;
  const hasTitle = Boolean(title);
  const hasActions = Boolean(actions);
  const hasFilters = Boolean(filters);

  if (!hasTitle && !hasActions && !hasFilters) {
    return null;
  }

  const isStacked = layout === 'stacked';
  const isInline = layout === 'inline';

  return (
    <Box
      component="section"
      aria-label={ariaLabel}
      sx={{
        width: '100%',
        minWidth: 0,
        display: 'flex',
        flexWrap: isInline ? 'nowrap' : 'wrap',
        alignItems: 'center',
        columnGap: 1.5,
        rowGap: 1,
        py: 0.5,
        color: tokens.colors.textPrimary,
        fontSize: tokens.controls.fontSize,
        fontWeight: tokens.controls.fontWeight,
      }}
    >
      {hasTitle && (
        <Typography
          component="h1"
          sx={{
            m: 0,
            minWidth: 0,
            flex: '1 1 auto',
            color: tokens.colors.textPrimary,
            fontSize: '1.25rem',
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>
      )}

      {hasActions && (
        <Box
          role="group"
          aria-label="Table actions"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            flex: hasTitle || isInline ? '0 0 auto' : '0 1 auto',
            marginLeft: hasTitle ? 'auto' : 0,
            whiteSpace: 'nowrap',
          }}
        >
          {actions}
        </Box>
      )}

      {hasFilters && (
        <Box
          role="group"
          aria-label="Table filters"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            flex: isInline ? '1 1 auto' : '1 1 320px',
            marginLeft: hasActions && !isStacked ? 'auto' : 0,
            flexBasis: isStacked ? '100%' : undefined,
            overflowX: 'auto',
            paddingTop: 1.25,
            overscrollBehaviorX: 'contain',
          }}
        >
          {filters}
        </Box>
      )}
    </Box>
  );
}

TableToolbar.propTypes = {
  title: PropTypes.node,
  actions: PropTypes.node,
  filters: PropTypes.node,
  layout: PropTypes.oneOf(['auto', 'inline', 'stacked']),
  'aria-label': PropTypes.string,
};
