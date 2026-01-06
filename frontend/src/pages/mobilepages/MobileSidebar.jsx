import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import useCurrentUserAccess from '../../hooks/useCurrentUserAccess';


// Internal open state (used when `open` prop is not provided)
const useControllableOpen = (propOpen) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const controlled = typeof propOpen === 'boolean';
  const isOpen = controlled ? propOpen : internalOpen;
  const setOpen = controlled ? () => {} : setInternalOpen;
  return { controlled, isOpen, setOpen };
};

/**
 * MobileSidebar
 * -----------------------------------------------------------------------------
 * A lightweight Drawer with a small navigation menu for mobile pages.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - links: Array<{ to: string, label: string }>
 *  - title?: string   (defaults to 'Menu')
 *  - drawerWidth?: number (defaults to 280)
 *
 * Usage:
 *   <MobileSidebar open={open} onClose={handleClose} />
 *
 * You can customize the menu by passing a `links` prop. If not provided,
 * a sensible default list is rendered.
 */
export default function MobileSidebar({
  open,
  onClose,
  links,
  title = undefined,
  drawerWidth = 280,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const { isAdmin, isManager, isEmployee, normArea } = useCurrentUserAccess();

  const isCleaner = normArea === 'cleaner';

  // Simple mobile translations (employees always see Spanish)
  const t = React.useCallback((key, fallback) => {
    if (!isEmployee) return fallback;
    const es = {
      menu: 'Menu',
      dashboard: 'Inicio',
      unitDetails: 'Detalles de Unidades',
      bookings: 'Reservas',
      reservations: 'Reservaciones',
      housekeepers: 'Housekeepers',
      transactions: 'Transacciones',
      cashBalance: 'Registro de Gastos',
      search: 'Search',
      checkInOutView: 'Check‑In/Out View',
    };
    return es[key] || fallback;
  }, [isEmployee]);

  const drawerTitle = title ?? t('menu', 'Menu');

  const { controlled, isOpen, setOpen } = useControllableOpen(open);
  const handleClose = React.useCallback(() => {
    if (onClose) onClose();
    if (!controlled) setOpen(false);
  }, [onClose, controlled, setOpen]);

  const [openMenu, setOpenMenu] = React.useState({});
  const toggleSubmenu = React.useCallback((key) => {
    setOpenMenu((prev) => {
      const willOpen = !prev[key];
      // Allow only one expanded group at a time
      return willOpen ? { [key]: true } : {};
    });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    navigate('/login');
    window.location.reload();
  };

  const defaultLinks = React.useMemo(() => {
    // Cleaners: mobile-only workflow (Unit Details + Check-In/Out View)
    if (isCleaner) {
      return [
        { to: '/m/unit-details', label: t('unitDetails', 'Unit Details') },
        { to: '/m/hk',           label: t('housekeepers', 'Housekeepers') },
      ];
    }

    return [
      { to: '/m/dashboard',         label: t('dashboard', 'Dashboard') },
      { to: '/m/unit-details',      label: t('unitDetails', 'Unit Details') },
      { to: '/m/bookings-calendar', label: t('bookings', 'Bookings') },
      { to: '/m/hk',                label: t('housekeepers', 'Housekeepers') },
      { to: '/m/inventory',         label: 'Unit Inventory' },
      { to: '/m/employee-cash',     label: t('cashBalance', 'Cash Balance') },
    ];
  }, [t, isCleaner]);

  const navLinks = links && Array.isArray(links) && links.length ? links : defaultLinks;

  const bookingChildren = React.useMemo(() => {
    const base = [
      { to: '/m/bookings-calendar', label: t('reservations', 'Reservations') },
      { to: '/m/bookings-search',   label: t('search', 'Search') },
    ];

    // Only Admin/Manager can create or search bookings from mobile.
    // Everyone else (employees, supervisors, cleaners, etc.) only sees Reservations.
    const canSeeBookingActions = isAdmin || isManager;

    if (!canSeeBookingActions) {
      return base.filter(link => link.label === t('reservations', 'Reservations'));
    }

    return base;
  }, [isAdmin, isManager, t]);

  const housekeepingChildren = React.useMemo(() => ([
    { to: '/m/check-activity', label: t('checkInOutView', 'Check‑In/Out View') },
  ]), [t]);

  // Listen for global events to open/close the mobile sidebar
  React.useEffect(() => {
    if (controlled) return; // parent controls visibility
    const onOpenEvt = () => setOpen(true);
    const onCloseEvt = () => setOpen(false);
    window.addEventListener('o2:sidebar:open', onOpenEvt);
    window.addEventListener('o2:sidebar:close', onCloseEvt);
    return () => {
      window.removeEventListener('o2:sidebar:open', onOpenEvt);
      window.removeEventListener('o2:sidebar:close', onCloseEvt);
    };
  }, [controlled, setOpen]);

  // Auto-close after navigation when uncontrolled
  React.useEffect(() => {
    if (!controlled) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <Drawer
      anchor="left"
      open={!!isOpen}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: drawerWidth,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#1E6F68',
          color: '#fff',
        }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 1 }}>
        <IconButton onClick={handleClose} aria-label="Close menu" sx={{ color: '#fff' }}>
          <CloseIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ ml: 1, color: '#fff' }}>{drawerTitle}</Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />

      <List sx={{ py: 0 }}>
        {navLinks.map(({ to, label }) => {
          const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
          const isBookings = to === '/m/bookings-calendar';
          const isHousekeeping = to === '/m/hk';
          const isOpen = openMenu['bookings'] || bookingChildren.some(ch => location.pathname.startsWith(ch.to));
          const isHousekeepingOpen = openMenu['housekeeping'] || housekeepingChildren.some(ch => location.pathname.startsWith(ch.to));
          if (isBookings) {
            return (
              <React.Fragment key={to}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => toggleSubmenu('bookings')}
                    selected={active || isOpen}
                    sx={{
                      color: '#fff',
                      '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    <ListItemText primary={label} />
                    {isOpen ? <ExpandLess sx={{ color: '#fff' }} /> : <ExpandMore sx={{ color: '#fff' }} />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {bookingChildren.map(({ to: cto, label: clabel }) => {
                      const subActive = location.pathname === cto || location.pathname.startsWith(`${cto}/`);
                      return (
                        <ListItem key={cto} disablePadding sx={{ pl: 2 }}>
                          <ListItemButton
                            component={NavLink}
                            to={cto}
                            onClick={handleClose}
                            selected={subActive}
                            sx={{
                              color: '#fff',
                              '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                            }}
                          >
                            <ListItemText primary={clabel} />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          }
          if (isHousekeeping) {
            return (
              <React.Fragment key={to}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => toggleSubmenu('housekeeping')}
                    selected={active || isHousekeepingOpen}
                    sx={{
                      color: '#fff',
                      '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    <ListItemText primary={t('housekeepers', 'Housekeepers')} />
                    {isHousekeepingOpen ? <ExpandLess sx={{ color: '#fff' }} /> : <ExpandMore sx={{ color: '#fff' }} />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={isHousekeepingOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {housekeepingChildren.map(({ to: cto, label: clabel }) => {
                      const subActive = location.pathname === cto || location.pathname.startsWith(`${cto}/`);
                      return (
                        <ListItem key={cto} disablePadding sx={{ pl: 2 }}>
                          <ListItemButton
                            component={NavLink}
                            to={cto}
                            onClick={handleClose}
                            selected={subActive}
                            sx={{
                              color: '#fff',
                              '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                            }}
                          >
                            <ListItemText primary={clabel} />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          }
          if (to === '/m/employee-cash') {
            return (
              <React.Fragment key="transactions-group">
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => toggleSubmenu('transactions')}
                    selected={openMenu['transactions']}
                    sx={{
                      color: '#fff',
                      '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    <ListItemText primary={t('transactions', 'Transactions')} />
                    {openMenu['transactions'] ? <ExpandLess sx={{ color: '#fff' }} /> : <ExpandMore sx={{ color: '#fff' }} />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={openMenu['transactions']} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    <ListItem disablePadding sx={{ pl: 2 }}>
                      <ListItemButton
                        component={NavLink}
                        to="/m/employee-cash"
                        onClick={handleClose}
                        selected={location.pathname === '/m/employee-cash'}
                        sx={{
                          color: '#fff',
                          '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                        }}
                      >
                        <ListItemText primary={t('cashBalance', 'Cash Balance')} />
                      </ListItemButton>
                    </ListItem>
                  </List>
                </Collapse>
              </React.Fragment>
            );
          }
          // default link item
          return (
            <ListItem key={to} disablePadding>
              <ListItemButton
                component={NavLink}
                to={to}
                onClick={handleClose}
                selected={active}
                sx={{
                  color: '#fff',
                  '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.12)' },
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                <ListItemText primary={label} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Box sx={{ flex: 1 }} />

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />

      {/* Footer area */}
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
          Mobile
        </Typography>
        <IconButton aria-label="Sign Out" onClick={handleLogout} sx={{ color: '#fff' }}>
          <LogoutIcon fontSize="small" />
        </IconButton>
      </Box>
    </Drawer>
  );
}