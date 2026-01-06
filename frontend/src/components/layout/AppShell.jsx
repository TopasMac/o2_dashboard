import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import PropTypes from 'prop-types';
import './AppShell.css';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/solid';
import TopBar from './TopBar';
import navConfig, { NAV_GROUPS } from './navConfig';
import { Link, useLocation } from 'react-router-dom';
import SectionHeader from './SectionHeader';

export const containerWidths = {
  narrow: 1120,
  default: 1240,
  wide: 1360,
  data: 1440,
  responsive: 'clamp(1040px, 92vw, 1360px)',
};

/**
 * AppShell
 * A simple, reusable app frame with:
 * - Top bar (title on the left, optional right actions)
 * - Left icon rail (compact vertical navbar)
 * - Centered content area with max width and gutters
 *
 * Usage:
 * <AppShell
 *   title="Housekeepers Transactions"
 *   rightActions={<><Button>Export</Button></>}
 *   railItems={[
 *     { key: 'home', label: 'Home', icon: <HomeIcon />, href: '/' },
 *     { key: 'units', label: 'Units', icon: <BuildingOffice2Icon />, href: '/units' },
 *   ]}
 *   maxWidth={1240} // accepts number or CSS string (e.g., clamp()), containerWidths presets available
 * >
 *   ...page content...
 * </AppShell>
 */
export default function AppShell({
  title,
  rightActions,
  sectionHeader = null,
  children,
  railItems = navConfig,
  maxWidth = 'clamp(1280px, 96vw, 1680px)',
  topBarHeight = 56,
  railWidth = 64,
  gutterX = 30,
  gutterY = 16,
  background = '#f7f7f7',
  fluid = false,
  withCard = true,
  cardScrollable = false,
  contentBg = '#ffffff',
  hideSectionHeader = false,
}) {
  // Role-based filtering for rail items (top-level and submenus)
  const roles = (() => {
    try {
      const raw = localStorage.getItem('roles');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();
  const allowByRole = (item) => !item?.roles || item.roles.some((r) => roles.includes(r));
  const visibleItems = (railItems || [])
    .filter(allowByRole)
    .map((it) => ({
      ...it,
      submenu: Array.isArray(it.submenu) ? it.submenu.filter(allowByRole) : it.submenu,
    }));

  const rootRef = useRef(null);
  const sectionRef = useRef(null);
  const location = useLocation();

  const activeGroup = React.useMemo(() => {
    const path = location?.pathname || '';
    const groups = NAV_GROUPS ? Object.values(NAV_GROUPS) : [];
    const match = groups.find((g) => Array.isArray(g.links) && g.links.some((lk) => typeof lk.to === 'string' && path.startsWith(lk.to)));
    return match || null;
  }, [location?.pathname]);

  useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.style.setProperty('--page-sticky-offset', '0px');
  }, []);

  useEffect(() => {
    const rootEl = rootRef.current;
    const hdr = sectionRef.current;
    if (!rootEl) return;
    const update = () => {
      const h = hdr ? Math.round(hdr.getBoundingClientRect().height) : 0;
      rootEl.style.setProperty('--page-sticky-offset', `${h}px`);
    };
    update();
    let ro;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(update);
      if (hdr) ro.observe(hdr);
    } else {
      window.addEventListener('resize', update);
    }
    return () => {
      if (ro && hdr) ro.unobserve(hdr);
      window.removeEventListener('resize', update);
    };
  }, [sectionHeader]);


  return (
    <div ref={rootRef} style={{
      display: 'grid',
      gridTemplateRows: `${topBarHeight}px 1fr`,
      gridTemplateColumns: `${railWidth}px 1fr`,
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      background: background
    }}>
      {/* Top Bar spans both columns */}
      <div style={{ gridRow: 1, gridColumn: '1 / 3', position: 'sticky', top: 0, zIndex: 50 }}>
        <TopBar
          title={activeGroup?.label || title}
          rightActions={rightActions}
          height={topBarHeight}
          railWidth={railWidth}
          gutterX={gutterX}
        />
      </div>

      {/* Left Icon Rail */}
      <NavRail width={railWidth} items={visibleItems} paddingTop={gutterY} />

      {/* Main content area */}
      <main style={{ gridRow: 2, gridColumn: 2, overflow: 'hidden' }}>
        <div
          style={{
            '--app-shell-max-width': fluid ? '100%' : (typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth),
            '--app-shell-max-height': `calc(100vh - ${topBarHeight + gutterY * 2 + 56}px)`, // more bottom breathing room
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: fluid ? '100%' : 'var(--app-shell-max-width)',
            margin: fluid ? '0' : '0 auto',
            padding: `${gutterY}px ${gutterX}px ${gutterY + 24}px`, // more bottom padding
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {!hideSectionHeader && (
            <div ref={sectionRef} style={{ margin: '0 0 12px 0' }}>
              {sectionHeader ?? (
                <SectionHeader
                  title={activeGroup?.label || title}
                  links={activeGroup?.links || []}
                />
              )}
            </div>
          )}
          {withCard ? (
            <div
              style={{
                background: contentBg,
                borderRadius: 12,
                boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
                border: '1px solid #e6e6e6',
                margin: 0,
                padding: 16,
                flex: 1,
                minHeight: 0,
                overflow: cardScrollable ? 'auto' : 'visible',
              }}
            >
              {children}
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflow: 'visible' }}>
              {children}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

AppShell.propTypes = {
  title: PropTypes.node,
  rightActions: PropTypes.node,
  sectionHeader: PropTypes.node,
  children: PropTypes.node,
  railItems: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string,
      icon: PropTypes.node,
      href: PropTypes.string,
      onClick: PropTypes.func,
      active: PropTypes.bool,
    })
  ),
  maxWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  topBarHeight: PropTypes.number,
  railWidth: PropTypes.number,
  gutterX: PropTypes.number,
  gutterY: PropTypes.number,
  background: PropTypes.string,
  fluid: PropTypes.bool,
  withCard: PropTypes.bool,
  cardScrollable: PropTypes.bool,
  contentBg: PropTypes.string,
  hideSectionHeader: PropTypes.bool,
};

/**
 * NavRail – compact vertical icon-only navbar
 * items: [{ key, label, icon, href, onClick, active }]
 */
function NavRail({ width, items, paddingTop = 24, showSignOut = true }) {
  const location = useLocation();
  const [openKey, setOpenKey] = useState(null);
  const closeRef = useRef(null);
  const openMenu = (key) => {
    if (closeRef.current) clearTimeout(closeRef.current);
    setOpenKey(key);
  };
  const scheduleClose = () => {
    if (closeRef.current) clearTimeout(closeRef.current);
    closeRef.current = setTimeout(() => setOpenKey(null), 120);
  };
  const renderIcon = (IconOrNode) => {
    if (!IconOrNode) return <ArrowLeftOnRectangleIcon style={{ width: 18, height: 18 }} />;
    // If an element was provided, normalize its size
    if (React.isValidElement(IconOrNode)) {
      const prev = IconOrNode.props?.style || {};
      return React.cloneElement(IconOrNode, { style: { width: 18, height: 18, ...prev } });
    }
    // If a component (e.g., heroicon) was provided, instantiate it
    try {
      return React.createElement(IconOrNode, { style: { width: 18, height: 18 } });
    } catch {
      return <ArrowLeftOnRectangleIcon style={{ width: 18, height: 18 }} />;
    }
  };
  const settingsItem = items?.find?.((it) => it.key === 'settings');
  const otherItems = (items || []).filter((it) => it.key !== 'settings');
  const orderedItems = settingsItem ? [...otherItems, settingsItem] : otherItems;
  const renderItem = (it) => {
    const path = location?.pathname || '';
    const target = it.to || it.href || '';
    const routeActive = target && typeof target === 'string' ? path.startsWith(target) : false;
    const isActive = typeof it.active === 'boolean' ? it.active : routeActive;

    const content = (
      <>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: isActive ? '#0d9488' : 'transparent',
            color: isActive ? '#fff' : '#444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 120ms ease',
            border: isActive ? 'none' : '1px solid #e6e6e6',
          }}
        >
          {renderIcon(it.icon)}
        </div>
      </>
    );

    return (
      <div
        key={it.key}
        onMouseEnter={() => it.submenu && it.submenu.length ? openMenu(it.key) : null}
        onMouseLeave={() => it.submenu && it.submenu.length ? scheduleClose() : null}
        onFocus={() => it.submenu && it.submenu.length ? openMenu(it.key) : null}
        onBlur={() => it.submenu && it.submenu.length ? scheduleClose() : null}
        style={{ position: 'relative' }}
      >
        {it.to ? (
          <Link
            to={it.to}
            onClick={it.onClick}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textDecoration: 'none',
              color: 'inherit',
              padding: 6,
              borderRadius: 10,
            }}
          >
            {content}
          </Link>
        ) : it.href ? (
          <a
            href={it.href}
            onClick={it.onClick}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textDecoration: 'none',
              color: 'inherit',
              padding: 6,
              borderRadius: 10,
            }}
          >
            {content}
          </a>
        ) : (
          <button
            onClick={it.onClick}
            style={{
              background: 'none',
              border: 'none',
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              borderRadius: 10,
            }}
          >
            {content}
          </button>
        )}

        {openKey === it.key && Array.isArray(it.submenu) && it.submenu.length > 0 && (
          <div
            onMouseEnter={() => openMenu(it.key)}
            onMouseLeave={scheduleClose}
                    style={{
                      position: 'absolute',
                      left: width + 8,
                      top: 0,
                      background: '#ffffff',
                      border: '1px solid #e6e6e6',
                      borderRadius: 8,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                      padding: 8,
                      minWidth: 220,
                      zIndex: 120,
                      pointerEvents: 'auto',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2, textTransform: 'uppercase', color: '#6b7280', padding: '4px 8px', borderBottom: '1px solid #f1f5f9', marginBottom: 4 }}>
                      {it.label}
                    </div>
            {it.submenu.map((sub, idx) => {
              const SubIcon = sub.icon;
              const row = (
                <div
                  className="navrail-subitem-content"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    transition: 'all 120ms ease',
                    color: '#333',
                    cursor: 'pointer',
                  }}
                >
                  {renderIcon(SubIcon ? <SubIcon /> : null)}
                  <span style={{ fontSize: 13 }}>{sub.label}</span>
                </div>
              );
              if (sub.to) {
                      return (
                        <Link
                          key={`${it.key}-${idx}`}
                          to={sub.to}
                          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                          onClick={() => setOpenKey(null)}
                        >
                          {row}
                        </Link>
                      );
                    }
                    if (sub.href) {
                      return (
                        <a
                          key={`${it.key}-${idx}`}
                          href={sub.href}
                          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                          onClick={() => setOpenKey(null)}
                        >
                          {row}
                        </a>
                );
              }
              return (
                      <button
                        key={`${it.key}-${idx}`}
                        onClick={(e) => { e.preventDefault(); if (typeof sub.onClick === 'function') sub.onClick(); setOpenKey(null); }}
                        style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', width: '100%', display: 'block' }}
                      >
                        {row}
                      </button>
                    );
            })}
          </div>
        )}
      </div>
    );
  };
  return (
    <nav data-appshell-navrail
      style={{
        position: 'relative',
        gridRow: 2,
        gridColumn: 1,
        width,
        minWidth: width,
        borderRight: '1px solid #e6e6e6',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop,
        gap: 4,
        zIndex: 60,
      }}
    >
      {orderedItems && orderedItems.length > 0 ? (
        orderedItems.map((it) => renderItem(it))
      ) : (
        <div style={{ height: 8 }} />
      )}
      <div style={{ flex: 1 }} />
      {showSignOut && (
        <button
          onClick={() => {
            try {
              localStorage.removeItem('jwt');
              sessionStorage.removeItem('jwt');
            } catch {}
            window.location.href = '/logout';
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 6,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: 10,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid #e6e6e6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#444',
            }}
          >
            <ArrowLeftOnRectangleIcon style={{ width: 18, height: 18 }} />
          </div>
        </button>
      )}
    </nav>
  );
}

NavRail.propTypes = {
  width: PropTypes.number.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string,
      icon: PropTypes.node,
      href: PropTypes.string,
      onClick: PropTypes.func,
      active: PropTypes.bool,
    })
  ),
  paddingTop: PropTypes.number,
  showSignOut: PropTypes.bool,
};
