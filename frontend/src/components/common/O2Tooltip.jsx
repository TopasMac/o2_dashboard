import React from 'react';
import Tooltip, { tooltipClasses } from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';

/**
 * O2Tooltip
 *
 * Global tooltip component with Owners2 styling.
 * Usage:
 *  <O2Tooltip title="Some info">
 *    <button>Hover me</button>
 *  </O2Tooltip>
 *
 *  <O2Tooltip
 *    title={(
 *      <div>
 *        <strong>Pedro Teste</strong>
 *        <div>08/12 20:25 • 24h</div>
 *      </div>
 *    )}
 *  >
 *    <span>⏱</span>
 *  </O2Tooltip>
 */
const O2Tooltip = styled(({ className, ...props }) => (
  <Tooltip
    {...props}
    classes={{ popper: className }}
    arrow
  />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: '#111827', // gray-900
    color: '#F9FAFB',            // gray-50
    fontSize: '0.78rem',
    fontWeight: 400,
    padding: '8px 10px',
    borderRadius: 6,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
    maxWidth: 260,
    lineHeight: 1.4,
  },
  [`& .${tooltipClasses.arrow}`]: {
    color: '#111827',
  },
}));

export default O2Tooltip;
