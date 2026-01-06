import React from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { NAV_GROUPS } from './navConfig';

/**
 * TopBar – shared top navigation bar used by AppShell
 * Displays a consistent page title and optional right-side actions.
 */
export default function TopBar({
  title,
  rightActions,
  height = 56,
  railWidth = 64,
  gutterX = 24,
}) {
  const location = useLocation();
  const pathname = location?.pathname || '';

  // Determine group title based on current route
  let resolvedTitle = title;
  if (!resolvedTitle || typeof resolvedTitle === 'string') {
    const groups = NAV_GROUPS ? Object.values(NAV_GROUPS) : [];
    const match = groups.find(g => Array.isArray(g.links) && g.links.some(lk => typeof lk.to === 'string' && pathname.startsWith(lk.to)));
    if (match) {
      resolvedTitle = match.label;
    }
  }

  return (
    <header
      style={{
        width: '100%',
        left: 0,
        gridColumn: '1 / -1',
        background: '#1E6F68',
        color: '#ffffff',
        borderBottom: 'none',
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${gutterX}px`,
        boxSizing: 'border-box',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left block: reserve rail width so title aligns with content */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          aria-hidden
          style={{
            width: railWidth,
            minWidth: railWidth,
            height: 1,
            opacity: 0,
          }}
        />
        <div
          style={{
            fontSize: 20,
            lineHeight: '28px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: '#ffffff',
          }}
          title={typeof resolvedTitle === 'string' ? resolvedTitle : undefined}
        >
          {resolvedTitle}
        </div>
      </div>

      {/* Right actions (optional) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {rightActions || null}
      </div>
    </header>
  );
}

TopBar.propTypes = {
  title: PropTypes.node,
  rightActions: PropTypes.node,
  height: PropTypes.number,
  railWidth: PropTypes.number,
  gutterX: PropTypes.number,
};
