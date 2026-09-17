import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { getAccessibleMobileFeatures } from './mobileFeatures';

const NAV_ICONS = {
  dashboard: HomeRoundedIcon,
  calendar: CalendarMonthRoundedIcon,
  cleanings: CleaningServicesRoundedIcon,
};

export default function MobileV2Shell({ access, children, disableScroll = false }) {
  const navigate = useNavigate();
  const navigation = getAccessibleMobileFeatures(access);

  React.useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    window.scrollTo(0, 0);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    navigate('/m/login', { replace: true });
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        right: 0,
        left: 0,
        width: '100%',
        maxWidth: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'pan-y pinch-zoom',
        bgcolor: '#f4f7f6',
      }}
    >
      <Container
        component="main"
        maxWidth="sm"
        sx={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflowY: disableScroll ? 'hidden' : 'auto',
          overflowX: 'hidden',
          overscrollBehaviorX: 'none',
          overscrollBehaviorY: 'contain',
          px: 'max(16px, env(safe-area-inset-left), env(safe-area-inset-right))',
          pt: disableScroll
            ? 'max(12px, env(safe-area-inset-top))'
            : 'max(20px, env(safe-area-inset-top))',
          pb: disableScroll ? 1.5 : 2.5,
        }}
      >
        {children}
      </Container>

      <AppBar
        component="footer"
        position="static"
        elevation={5}
        sx={{
          bgcolor: '#1E6F68',
          flexShrink: 0,
          pb: 'env(safe-area-inset-bottom)',
          pl: 'env(safe-area-inset-left)',
          pr: 'env(safe-area-inset-right)',
        }}
      >
        <Toolbar sx={{ minHeight: 60, px: 1.5, justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 72 }}>
            <Typography noWrap sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1.1 }}>
              HausIn
            </Typography>
          </Box>

          <Box component="nav" aria-label="Navegación móvil" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {navigation.map((feature) => {
              const NavigationIcon = NAV_ICONS[feature.id];
              if (!NavigationIcon) return null;
              return (
                <IconButton
                  key={feature.id}
                  component={NavLink}
                  to={feature.path}
                  aria-label={feature.label}
                  title={feature.label}
                  style={({ isActive }) => ({
                    color: isActive ? '#ffffff' : 'rgba(255,255,255,.58)',
                    background: isActive ? 'rgba(255,255,255,.15)' : 'transparent',
                  })}
                >
                  <NavigationIcon />
                </IconButton>
              );
            })}
          </Box>

          <IconButton color="inherit" onClick={handleLogout} aria-label="Salir" title="Salir">
            <LogoutRoundedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
    </Box>
  );
}
