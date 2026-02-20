import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';

function NotchedCard({ label, sx, children }) {
  const notchLeft = 12;
  const notchWidth = label ? Math.min(160, Math.max(48, String(label).length * 7 + 22)) : 0;

  return (
    <Box sx={{ ...sx }}>
      <Box
        sx={{
          position: 'relative',
          border: '1px solid',
          borderTop: 'none',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          p: 1.5,
        }}
      >
        {/* Top border with a notch opening for the label */}
        {label ? (
          <>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: notchLeft,
                borderTop: '1px solid',
                borderColor: 'divider',
                borderTopLeftRadius: 8,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: notchLeft + notchWidth,
                right: 0,
                borderTop: '1px solid',
                borderColor: 'divider',
                borderTopRightRadius: 8,
              }}
            />
          </>
        ) : (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              borderTop: '1px solid',
              borderColor: 'divider',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
            }}
          />
        )}

        {/* Notched label inline with the top border (no pill border) */}
        {label ? (
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              top: 0,
              left: 12,
              transform: 'translateY(-50%)',
              px: 1,
              fontWeight: 800,
              color: 'text.secondary',
              lineHeight: 1,
            }}
          >
            {label}
          </Typography>
        ) : null}

        {children}
      </Box>
    </Box>
  );
}

/**
 * MiniSummaryCard
 * Compact summary card used inside drawers (Month Workflow style)
 *
 * Props:
 * - label (string)
 * - loading (boolean)
 * - rows: [{ label, value }]
 * - width (number, optional, default 270)
 */
// Note: By default, MiniSummaryCard does not apply bold styling to row values.
// Callers should opt-in to bold on specific values as needed.
export function MiniSummaryCard({
  label = 'Summary',
  loading = false,
  rows = [],
  width = 270,
}) {
  return (
    <NotchedCard label={label} sx={{ width }}>
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 72 }}>
          <CircularProgress size={18} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.5 }}>
          {rows.map((r, idx) => (
            <Box
              key={idx}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Typography variant="body2">{r.label}</Typography>
              <Typography variant="body2">
                {r.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </NotchedCard>
  );
}

/**
 * MiniUnitsCard
 * Compact units/workflow style card used inside drawers
 *
 * Props:
 * - label (string)
 * - loading (boolean)
 * - headerRight (string)
 * - rows: React nodes (already rendered rows)
 * - width (number, optional, default 270)
 * - maxHeight (string, optional, default '60vh')
 */
export function MiniUnitsCard({
  label = 'Units',
  loading = false,
  headerRight = '',
  rows = [],
  width = 270,
  maxHeight = '60vh',
}) {
  return (
    <NotchedCard label={label} sx={{ width }}>
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 72 }}>
          <CircularProgress size={18} />
        </Box>
      ) : (
        <Box sx={{ maxHeight, overflowY: 'auto', mt: 0.5 }}>
          {/* Sticky Header */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              alignItems: 'center',
              px: 0.5,
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              py: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
              Unit
            </Typography>
            {headerRight ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textAlign: 'right', minWidth: 0 }}
              >
                {headerRight}
              </Typography>
            ) : null}
          </Box>

          {/* Rows */}
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.5, py: 1 }}>
              No units.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
              {rows}
            </Box>
          )}
        </Box>
      )}
    </NotchedCard>
  );
}