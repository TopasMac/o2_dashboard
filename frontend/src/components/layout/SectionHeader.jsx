import React from 'react';
import PropTypes from 'prop-types';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_GROUPS } from './navConfig';

/**
 * SectionHeader
 * Compact, sticky header that appears at the top of the content area when a nav group is active.
 * Renders: title + (optional icon) on the left, pill-style links, and optional rightActions.
 *
 * Props:
 * - title: string
 * - icon: a Heroicon component OR a pre-rendered React node
 * - links: [{ label, to, href, onClick }]
 * - rightActions: React node (buttons, etc.)
 * - preserveSearch: boolean (if true, appends current query string to internal links)
 * - height: number (default: 48)
 */
export default function SectionHeader({
  title,
  icon,
  links = [],
  rightActions = null,
  preserveSearch = true,
  height = 48,
}) {
  const location = useLocation();

  const pathname = location?.pathname || '';

  // If no explicit title/links provided, try to resolve from NAV_GROUPS based on current route
  let resolvedTitle = title;
  let resolvedLinks = links;

  if ((!resolvedTitle || !resolvedTitle.length) || !Array.isArray(resolvedLinks) || resolvedLinks.length === 0) {
    const groups = NAV_GROUPS ? Object.values(NAV_GROUPS) : [];
    const match = groups.find(
      g => Array.isArray(g.links) && g.links.some(lk => typeof lk.to === 'string' && pathname.startsWith(lk.to))
    );
    if (match) {
      // Fill missing parts from the matched group
      if (!resolvedTitle || !resolvedTitle.length) resolvedTitle = match.label;
      if (!Array.isArray(resolvedLinks) || resolvedLinks.length === 0) resolvedLinks = match.links;

      // If the resolved title equals the currently active link label, prefer the group label.
      // This prevents duplicated text like "Check-ins & Check-outs" appearing both as title and as a link.
      const activeLink = match.links.find(lk => typeof lk.to === 'string' && pathname.startsWith(lk.to));
      if (activeLink && resolvedTitle === (activeLink.label || '')) {
        resolvedTitle = match.label;
      }
    }
  }

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return React.cloneElement(icon, { style: { width: 18, height: 18, ...(icon.props?.style || {}) } });
    try {
      const Comp = icon;
      return <Comp style={{ width: 18, height: 18 }} />;
    } catch {
      return null;
    }
  };

  const toWithSearch = (to) => {
    if (!preserveSearch) return to;
    const search = location?.search || '';
    if (!search) return to;
    // If `to` already contains a query, keep it as-is.
    return typeof to === 'string' && !to.includes('?') ? `${to}${search}` : to;
  };

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        height,
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
        background: '#f7f7f7',
        borderBottom: '1px solid #e6e6e6',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Center: pill links */}
      {Array.isArray(resolvedLinks) && resolvedLinks.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'nowrap',
            minWidth: 'max-content',
          }}
        >
          {resolvedLinks.map((lk, idx) => {
            const label = lk.label || '';
            const baseStyle = {
              display: 'inline-flex',
              alignItems: 'center',
              height: 32,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: '#2a2a2a',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              transition: 'color 120ms ease',
              cursor: 'pointer',
            };
            if (lk.to) {
              return (
                <NavLink
                  key={`${label}-${idx}`}
                  to={toWithSearch(lk.to)}
                  style={({ isActive }) => ({
                    ...baseStyle,
                    color: isActive ? '#0d9488' : '#2a2a2a',
                  })}
                >
                  {label}
                </NavLink>
              );
            }
            if (lk.href) {
              return (
                <a key={`${label}-${idx}`} href={lk.href} style={baseStyle}>
                  {label}
                </a>
              );
            }
            return (
              <button
                key={`${label}-${idx}`}
                onClick={lk.onClick}
                style={{ ...baseStyle, background: 'transparent', border: 'none' }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Right actions */}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          minWidth: 'max-content',
        }}
      >
        {rightActions}
      </div>
    </div>
  );
}

SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.oneOfType([PropTypes.func, PropTypes.node]),
  links: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string,
      href: PropTypes.string,
      onClick: PropTypes.func,
    })
  ),
  rightActions: PropTypes.node,
  preserveSearch: PropTypes.bool,
  height: PropTypes.number,
};
