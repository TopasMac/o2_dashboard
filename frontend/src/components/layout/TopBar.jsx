import React from 'react';
import PropTypes from 'prop-types';
import { BellIcon, MagnifyingGlassIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { NavLink } from 'react-router-dom';

/**
 * TopBar – desktop-wide navigation context and utility header.
 * The surrounding AppShell resolves the current group so the same navigation
 * configuration drives the rail, its hover menu, and this header.
 */
export default function TopBar({
  title,
  links = [],
  rightActions,
  height = 64,
  gutterX = 24,
}) {
  let userName = 'User name';
  try {
    userName = localStorage.getItem('name') || userName;
  } catch {
    // Keep the header usable where browser storage is unavailable.
  }

  return (
    <header
      style={{
        width: '100%',
        gridColumn: '1 / -1',
        background: '#ffffff',
        color: '#172033',
        borderBottom: '1px solid #e5e7eb',
        height,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${gutterX}px`,
        boxSizing: 'border-box',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        gap: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <img
          src="/branding/hausin/hausin-dashboard-horizontal.svg"
          alt="HausIn dashboard"
          style={{
            display: 'block',
            width: 143,
            height: 34,
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: '0 0 112px',
            fontSize: 15,
            lineHeight: '18px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: '#172033',
            textAlign: 'center',
          }}
          title={typeof title === 'string' ? title : undefined}
        >
          {title}
        </div>

        {links.length > 0 && (
          <nav
            aria-label={`${title} pages`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              flex: 1,
              width: 0,
              minWidth: 0,
              maxHeight: 20,
              overflow: 'hidden',
              flexWrap: 'nowrap',
            }}
          >
            {links.map((link) => (
              <NavLink
                key={link.to || link.label}
                to={link.to}
                style={({ isActive }) => ({
                  color: isActive ? '#0f766e' : '#667085',
                  flex: '0 0 auto',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  lineHeight: '16px',
                  padding: 0,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                })}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            width: 220,
            height: 38,
            gap: 8,
            padding: '0 12px',
            color: '#98a2b3',
            background: '#f8fafc',
            border: '1px solid #eaecf0',
            borderRadius: 8,
            boxSizing: 'border-box',
          }}
        >
          <MagnifyingGlassIcon style={{ width: 18, height: 18 }} />
          <input
            aria-label="Search"
            placeholder="Search"
            readOnly
            style={{
              width: '100%',
              padding: 0,
              color: '#475467',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              font: 'inherit',
              fontSize: 14,
            }}
          />
        </label>
        <button
          type="button"
          aria-label="Notifications"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 36,
            height: 36,
            padding: 0,
            color: '#475467',
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
          }}
        >
          <BellIcon style={{ width: 21, height: 21 }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <UserCircleIcon style={{ width: 34, height: 34, color: '#98a2b3', flexShrink: 0 }} />
          <div style={{ minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ color: '#344054', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
              {userName}
            </div>
            <div style={{ color: '#98a2b3', fontSize: 12 }}>Administrator</div>
          </div>
        </div>
        {rightActions || null}
      </div>
    </header>
  );
}

TopBar.propTypes = {
  title: PropTypes.node,
  links: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string.isRequired,
    })
  ),
  rightActions: PropTypes.node,
  height: PropTypes.number,
  gutterX: PropTypes.number,
};
