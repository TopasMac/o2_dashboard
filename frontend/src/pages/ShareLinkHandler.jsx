import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Stack,
} from '@mui/material';
import api from '../api';

/**
 * Public bridge page for magic/share links.
 *
 * Flow:
 *  1) Read :token from URL.
 *  2) POST /api/public/share/exchange with { token }.
 *  3) Receive a short-lived JWT + claims; store JWT temporarily.
 *  4) Redirect to the correct page based on claims.share.resourceType.
 *
 * Notes:
 *  - We store the share JWT in sessionStorage under 'o2_share_jwt'.
 *  - We set Authorization header on the shared api client for this browser tab.
 *  - Do not store long-term; this is intentionally short-lived.
 */
export default function ShareLinkHandler() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  const exchangeToken = async () => {
    try {
      setBusy(true);
      setError('');
      const res = await fetch('/api/public/share/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Exchange failed (${res.status})`);
      }
      const data = await res.json();
      if (!data?.ok || !data?.jwt || !data?.claims?.share) {
        throw new Error('Invalid exchange response');
      }

      const jwt = data.jwt;
      const claims = data.claims;
      const share = claims.share;

      // Persist short-lived share JWT for this tab/session only.
      try {
        sessionStorage.setItem('o2_share_jwt', jwt);
      } catch {
        // ignore storage issues, we'll still set header below
      }
      // Set Authorization header for our API client
      api.defaults.headers.common['Authorization'] = `Bearer ${jwt}`;

      // Route by resource type
      const rt = share.resourceType;
      const rid = share.resourceId;

      if (rt === 'unit_inventory_session') {
        // Decide initial tab
        const tab = (Array.isArray(share.scope) && share.scope.includes('photos')) ? 'photos' : 'items';
        navigate(`/m/inventory/form/${rid}?tab=${tab}`, { replace: true });
        return;
      }

      if (rt === 'client_draft') {
        // later: you can read scope for sub-steps
        navigate(`/clients/new?share=1&draftId=${encodeURIComponent(String(rid))}`, { replace: true });
        return;
      }

      // Fallback: go to mobile dashboard with a small hint
      navigate('/m/dashboard', { replace: true });
    } catch (e) {
      setError(e.message || 'Could not process the shared link.');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setError('Missing token');
      setBusy(false);
      return;
    }
    exchangeToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Opening shared link…</Typography>
      {busy && (
        <Stack direction="row" spacing={2} alignItems="center">
          <CircularProgress size={22} />
          <Typography variant="body2" color="text.secondary">
            Verificando acceso temporal…
          </Typography>
        </Stack>
      )}

      {!busy && error && (
        <>
          <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={exchangeToken}>Reintentar</Button>
            <Button variant="outlined" onClick={() => navigate('/login')}>Ir al inicio de sesión</Button>
          </Stack>
        </>
      )}
    </Box>
  );
}
