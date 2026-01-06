import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Stack,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import { PlusIcon, DocumentTextIcon, CameraIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import api from '../../api';
import dayjs from 'dayjs';
const fmt = (d) => (d ? (dayjs(d).isValid() ? dayjs(d).format('DD-MM-YYYY') : '—') : '—');

// Mobile entry page for Unit Inventory intake workflow
// - Lists "Onboarding" units
// - Lets user create a new inventory session and navigates to /mobile/inventory/form/:sessionId
export default function MobileInventoryNew() {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);

  const [unitSessions, setUnitSessions] = useState({}); // { [unitId]: { latest, sessions } }
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Load onboarding units
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        // Try to fetch only onboarding units; if the API doesn't support this filter,
        // you can switch to GET /api/units and filter on the client by unit.status === 'Onboarding'
        const res = await api.get('/api/units?status=Onboarding');
        const data = res.data;
        // API Platform returns {"hydra:member":[...]} typically; support both shapes.
        const list = Array.isArray(data) ? data : (data['hydra:member'] || []);
        const clean = list
          .map(u => ({
            id: u.id ?? u['@id']?.split('/').pop(),
            name: u.unitName || u.name || u.unit_name || `Unit #${u.id}`,
            city: u.city || u.location || '',
            status: (u.status || '').toString(),
          }))
          .filter(u => u.id && (u.status?.toLowerCase?.() === 'onboarding' || data.forcedClientSideFilter));
        if (isMounted) setUnits(clean);
      } catch (e) {
        if (isMounted) setError(e.message || 'Failed to load units');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!units || units.length === 0) return;
      try {
        setSessionsLoading(true);
        const entries = await Promise.all(
          units.map(async (u) => {
            try {
              const { data } = await api.get(`/api/unit-inventory/unit/${u.id}/sessions`);
              return [u.id, data];
            } catch {
              return [u.id, { ok: false, sessions: [], latest: null }];
            }
          })
        );
        if (!mounted) return;
        const map = {};
        for (const [id, data] of entries) map[id] = data;
        setUnitSessions(map);
      } finally {
        if (mounted) setSessionsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [units]);

  const handleCreateSession = async (unitId, tab = 'items') => {
    if (!unitId) return;
    try {
      setCreating(true);
      const { data } = await api.post('/api/unit-inventory/session', { unitId: Number(unitId) });
      const sessionId = data?.session?.id;
      if (!sessionId) throw new Error('No session id returned');
      navigate(`/m/inventory/form/${sessionId}?tab=${tab}`);
    } catch (e) {
      setError(e.message || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" component="h1">Onboarding Units</Typography>
      </Stack>
     
      {/* Errors */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Onboarding units list */}
      {!loading && units?.length > 0 && (
        <Box>
          <List sx={{ bgcolor: 'background.paper', borderRadius: 1, overflow: 'hidden' }}>
            {units.map((u, idx) => {
              const sessInfo = unitSessions[u.id];
              const latest = sessInfo?.latest;
              return (
                <React.Fragment key={u.id}>
                  <ListItem
                    disablePadding
                    secondaryAction={
                      latest ? (
                        <Stack direction="row" spacing={1}>
                          <IconButton size="small" edge="end" aria-label="open items"
                            onClick={() => navigate(`/m/inventory/form/${latest.id}?tab=items`)}
                          >
                            <DocumentTextIcon width={20} height={20} />
                          </IconButton>
                          <IconButton size="small" edge="end" aria-label="open photos"
                            onClick={() => navigate(`/m/inventory/form/${latest.id}?tab=photos`)}
                          >
                            <CameraIcon width={20} height={20} />
                          </IconButton>
                          <IconButton
                            size="small"
                            edge="end"
                            aria-label="review and submit"
                            onClick={() => navigate(`/m/inventory/review/${latest.id}`)}
                            title="Review & Submit"
                          >
                            <ClipboardDocumentCheckIcon width={20} height={20} />
                          </IconButton>
                        </Stack>
                      ) : (
                        <IconButton size="small" edge="end" aria-label="create session"
                          disabled={creating}
                          onClick={() => handleCreateSession(u.id, 'items')}
                        >
                          <PlusIcon width={20} height={20} style={{ color: '#1E6F68', fontWeight: 700 }} />
                        </IconButton>
                      )
                    }
                  >
                    <ListItemButton disabled={creating && !latest} onClick={() => latest ? navigate(`/m/inventory/form/${latest.id}?tab=items`) : handleCreateSession(u.id, 'items')}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" noWrap>
                          {u.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {[u.city, (latest?.status || '').toString()].filter(Boolean).join(' · ')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {fmt(latest?.startedAt || latest?.started_at || latest?.createdAt || latest?.created_at)} · {fmt(latest?.submittedAt || latest?.submitted_at)}
                        </Typography>
                      </Box>
                    </ListItemButton>
                  </ListItem>
                  {idx < units.length - 1 && <Divider component="li" />}
                </React.Fragment>
              );
            })}
          </List>
        </Box>
      )}

      {/* Empty state */}
      {!loading && units?.length === 0 && !error && (
        <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 6 }}>
          <Typography variant="body2">No onboarding units found.</Typography>
          <Typography variant="body2">Set a unit status to “Onboarding” to begin.</Typography>
        </Box>
      )}
    </Box>
  );
}