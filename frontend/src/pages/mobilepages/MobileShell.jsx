import * as React from 'react';
import { useTranslation } from 'react-i18next';
import MobileSidebar from './MobileSidebar';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import Slide from '@mui/material/Slide';
import AppDrawer from '../../components/common/AppDrawer';
import BlockCalFormRHF from '../../components/forms/BlockCalFormRHF';

/**
 * MobileShell
 * -----------------------------------------------------------------------------
 * A lightweight mobile-only layout wrapper that provides:
 * - Top AppBar with hamburger menu and page title
 * - Left navigation Drawer with a small set of mobile routes
 * - Single scroll parent for page content (avoids nested scrollbars)
 *
 * Usage:
 *   <MobileShell title="Bookings">
 *     ...your mobile page content...
 *   </MobileShell>
 *
 * You can override the default nav links by passing a `links` prop:
 *   const links = [
 *     { to: '/m/bookings', label: 'Bookings' },
 *     { to: '/m/checkins', label: 'Check-ins' },
 *   ];
 *   <MobileShell title="Bookings" links={links}>...</MobileShell>
 */
// NOTE: This shell no longer renders the gray MobileSidebar. Instead, it
// triggers the main green sidebar by dispatching the browser event
// `o2:sidebar:open`. The desktop layout should listen for this event and open
// the primary sidebar; it should also auto-close on navigation for mobile.
export default function MobileShell({
  title,
  titleKey,            // optional i18n key for the AppBar title (preferred over `title`)
  children,
  links,
  rightActions,        // optional React node rendered on the right side of the AppBar
  stickyContent,       // optional React node rendered as a sticky block inside the scroll container
  drawerWidth = 280,   // px
}) {
  const { t } = useTranslation('common');
  const resolvedTitle = titleKey
    ? t(titleKey, { defaultValue: title || '' })
    : (title || '');

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [blockDrawerOpen, setBlockDrawerOpen] = React.useState(false);

  // Ensure strict mobile viewport on iOS/Android without helmet deps
  React.useEffect(() => {
    const CONTENT = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover';
    let tag = document.querySelector('meta[name="viewport"]');
    const prev = tag ? tag.getAttribute('content') : null;
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'viewport');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', CONTENT);
    return () => { if (tag && prev) tag.setAttribute('content', prev); };
  }, []);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    // Lock outer (document) scrolling so only the MobileShell <main> scrolls.
    // This avoids "double scroll" / rubber-band scroll on iOS Safari.
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;

    // Some routes render inside a parent layout/root container that can also scroll.
    // Lock it too so we truly have a single scroll container.
    const rootEl = document.getElementById('root') || document.getElementById('app');
    const prevRootOverflow = rootEl ? rootEl.style.overflow : null;
    const prevRootHeight = rootEl ? rootEl.style.height : null;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;

    const scrollY = window.scrollY || window.pageYOffset || 0;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    if (rootEl) {
      rootEl.style.overflow = 'hidden';
      rootEl.style.height = '100dvh';
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;

      if (rootEl) {
        rootEl.style.overflow = prevRootOverflow ?? '';
        rootEl.style.height = prevRootHeight ?? '';
      }

      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
  }, []);

  React.useEffect(() => {
    const openHandler = () => setBlockDrawerOpen(true);
    window.addEventListener('o2:drawer:block:add', openHandler);
    return () => window.removeEventListener('o2:drawer:block:add', openHandler);
  }, []);

  return (
    <Box
      className="mobile-page"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        inset: 0,
        bgcolor: 'background.default',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        height: '100dvh',
        overflow: 'hidden',
      }}
    >
      {/* Top App Bar */}
      <Slide in={!drawerOpen} direction="down" mountOnEnter unmountOnExit>
        <AppBar
          position="fixed"
          color="default"
          elevation={0}
          sx={{
            bgcolor: '#1E6F68',
            color: '#fff',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowX: 'clip',
            zIndex: (theme) => theme.zIndex.appBar,
          }}
        >
          <Toolbar
            variant="regular"
            sx={{
              minHeight: 56,
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              overflowX: 'clip',
              px: 2,
            }}
          >
            <IconButton
              edge="start"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              size="large"
              sx={{ mr: 1 }}
            >
              <MenuIcon sx={{ color: '#fff' }} />
            </IconButton>

            <Typography variant="h6" noWrap sx={{ flex: 1 }}>
              {resolvedTitle}
            </Typography>

            {rightActions ?? null}

            <IconButton
              aria-label="Refresh"
              size="large"
              onClick={() => {
                window.location.href =
                  window.location.pathname + '?v=' + Date.now();
              }}
              sx={{ ml: 1 }}
            >
              <RefreshIcon sx={{ color: '#fff' }} />
            </IconButton>
          </Toolbar>
        </AppBar>
      </Slide>

      {/* Main content area: non-scrollable shell; inner pages manage their own scroll */}
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          mt: 0, // avoid flex+margin causing outer page scroll (double scrollbar)
          px: 2,
          pb: 2,
          pt: '72px', // reserve AppBar (56px) + 16px gap inside the scroll container
          '--mobile-header-offset': '72px',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {stickyContent ? (
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: (theme) => theme.zIndex.appBar - 1,
              mb: 1.5,
            }}
          >
            {stickyContent}
          </Box>
        ) : null}

        {children}
      </Box>
      {/* Mobile sidebar drawer */}
      <MobileSidebar title="Menu" open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <AppDrawer
        title="Add Block"
        open={blockDrawerOpen}
        onClose={() => setBlockDrawerOpen(false)}
        size="default"
      >
        <BlockCalFormRHF onClose={() => setBlockDrawerOpen(false)} />
      </AppDrawer>
    </Box>
  );
}