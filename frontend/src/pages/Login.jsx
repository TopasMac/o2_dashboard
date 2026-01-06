import React, { useState } from 'react';
import api from '../api';
import { useNavigate, useLocation } from 'react-router-dom';
import { Container, Box, Avatar, Typography, TextField, Button, Paper, Alert } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

// Minimal JWT parser to extract roles if backend doesn't send them explicitly
function parseJwtRoles(token) {
  try {
    const base = token.split('.')[1];
    const json = JSON.parse(decodeURIComponent(atob(base.replace(/-/g, '+').replace(/_/g, '/')).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('')));
    const roles = json?.roles;
    if (Array.isArray(roles)) return roles;
    if (typeof roles === 'string') return [roles];
    return [];
  } catch (_e) {
    return [];
  }
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const expired = params.get('expired') === '1';
  const disabled = params.get('disabled') === '1';
  const redirectParam = params.get('redirect') ? decodeURIComponent(params.get('redirect')) : null;
  const from = params.get('from') ? decodeURIComponent(params.get('from')) : null;
  const isStandalone =
    (typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    // iOS Safari PWA
    (typeof navigator !== 'undefined' && navigator.standalone === true);

  const isSmallViewport =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    // a bit wider to catch some standalone viewport setups
    (window.matchMedia('(max-width: 768px)').matches ||
     // fallback using innerWidth if matchMedia is unavailable
     (window.innerWidth && window.innerWidth <= 768));

  const isMobileHint =
    location.pathname.startsWith('/m/') ||
    params.get('mobile') === '1' ||
    isStandalone ||
    isSmallViewport;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('loginError') || '';
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await api.post('/api/login_check', { email, password });

      // --- Normalize token from common server responses ---
      const authHeader = response?.headers?.authorization || response?.headers?.Authorization;
      let token = response?.data?.token || response?.data?.accessToken || null;

      // Support Bearer token in header
      if (!token && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
      // Support raw JWT string in body
      if (!token && typeof response?.data === 'string' && response.data.split('.').length === 3) {
        token = response.data;
      }

      if (token) {
        try {
          localStorage.setItem('token', token); // App.jsx expects this exact key
        } catch (e) {
          console.warn('Failed to persist token to localStorage', e);
        }
        if (response?.data?.name) {
          localStorage.setItem('name', response.data.name);
        }
        let rolesArr = [];
        if (response?.data?.roles) {
          rolesArr = Array.isArray(response.data.roles) ? response.data.roles : [response.data.roles];
          localStorage.setItem('roles', JSON.stringify(rolesArr));
        } else if (token) {
          rolesArr = parseJwtRoles(token);
          if (rolesArr.length) {
            localStorage.setItem('roles', JSON.stringify(rolesArr));
          }
        }
        const hasRole = (r) => (rolesArr || []).includes(r);

        // Pick redirect target:
        // 1) explicit ?redirect=...
        // 2) preserved ?from=...
        // 3) mobile context: /m/dashboard
        // 4) role-based default: admins/managers -> /dashboard, clients -> /m/dashboard
        let target = redirectParam || from;
        if (!target) {
          // Prefer mobile dashboard when login is initiated from a mobile context
          if (isMobileHint) {
            target = '/m/dashboard';
          } else if (hasRole('ROLE_MANAGER') && !hasRole('ROLE_ADMIN')) {
            target = '/manager-dashboard';
          } else if (hasRole('ROLE_ADMIN')) {
            target = '/dashboard';
          } else if (hasRole('ROLE_MANAGER')) {
            target = '/manager-dashboard';
          } else if (hasRole('ROLE_CLIENT')) {
            target = '/m/dashboard';
          } else {
            target = '/';
          }
        }

        navigate(target, { replace: true });
        try {
          sessionStorage.removeItem('loginError');
        } catch (_e) {
          // ignore
        }
      } else {
        setError('Login succeeded but no token was returned by the server.');
      }
    } catch (err) {
      const status = err?.response?.status;

      const raw =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        '';
      const msg = typeof raw === 'string' ? raw : String(raw || '');

      // eslint-disable-next-line no-console
      console.log('Login error payload:', {
        status,
        raw,
        msg,
        responseData: err?.response?.data,
      });

      // If backend indicates a disabled account, route to ?disabled=1
      if (status === 403 || msg.toLowerCase().includes('disabled')) {
        try {
          sessionStorage.removeItem('loginError');
        } catch (_e) {
          // ignore
        }

        // Preserve the current shell (desktop vs mobile)
        const base =
          typeof window !== 'undefined' && window.location.pathname.startsWith('/m')
            ? '/m/login'
            : '/login';

        navigate(`${base}?disabled=1`, { replace: true });
        return;
      }

      // Fallback: generic invalid credentials error
      const friendly = 'Invalid email or password';
      setError(friendly);
      try {
        sessionStorage.setItem('loginError', friendly);
      } catch (_e) {
        // ignore
      }
    }
  };

  return (
    <>
      {/* Background: blurred image + teal overlay */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden' }}>
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: -1,
            backgroundColor: '#808080',
          }}
        />
        <Box sx={{ position: 'absolute', inset: 0, background: 'rgba(30,111,104,0.35)' }} />
      </Box>

      <Container component="main" maxWidth="xs" sx={{ px: 2 }}>
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper elevation={3} sx={{ p: 4, width: '100%', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
            <Avatar sx={{ m: 1, bgcolor: '#1E6F68' }}>
              <LockOutlinedIcon fontSize="small" />
            </Avatar>
            <Typography component="h1" variant="h5">Sign in to Owners2</Typography>
          </Box>

          {expired && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Session expired. Please sign in again.
            </Alert>
          )}
          {disabled && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Account disabled
            </Alert>
          )}
          {!disabled && error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{
                mt: 2,
                mb: 1,
                bgcolor: '#1E6F68',
                '&:hover': { bgcolor: '#155E58' }
              }}
            >
              Sign In
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
    </>
  );
}

export default Login;
