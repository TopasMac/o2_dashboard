import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Paper,
  Chip,
  Stack,
  Tooltip,
  CircularProgress,
  Divider,
  Button,
  Snackbar,
  Alert,
} from '@mui/material';
import AppDrawer from '../components/common/AppDrawer';
import PlanSocialPostFormRHF from '../components/forms/PlanSocialPostFormRHF';
import { ChevronLeft, ChevronRight, Today } from '@mui/icons-material';
import dayjs from 'dayjs';

// --- Auth & API helpers (mirrors UnitMedia.jsx pattern) ---
const authHeader = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const API_BASE = (process.env.REACT_APP_BACKEND_BASE || '').replace(/\/$/, '');
const apiUrl = (path) => `${API_BASE}${path}`;

// Simple status chip color mapping
const statusColor = (status) => {
  switch (status) {
    case 'Published':
      return 'success';
    case 'Scheduled':
      return 'primary';
    default:
      return 'default';
  }
};

// Weekday headers (Mon-first layout)
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function SocialCalendar() {
  const [cursor, setCursor] = useState(() => dayjs().startOf('month'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);

  const navigate = useNavigate();

  // --- State for planning drawer and form fields ---
  const [planOpen, setPlanOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const monthLabel = useMemo(() => cursor.format('MMMM YYYY'), [cursor]);

  const range = useMemo(() => {
    const start = cursor.startOf('month');
    const end = cursor.endOf('month');
    return { start, end };
  }, [cursor]);

  const PLAN_FORM_ID = 'plan-social-post-form';
  const defaultPlanDateTime = useMemo(() => cursor.startOf('month').hour(14).minute(0).second(0).format('YYYY-MM-DDTHH:mm'), [cursor]);

  // --- Drawer open/close and submit handlers ---
  const openPlanner = () => {
    setPlanOpen(true);
  };
  const closePlanner = () => setPlanOpen(false);

  const handlePlanSubmit = async ({ post, channel }) => {
    setSubmitting(true);
    try {
      // 1) Create the master SocialPost
      const postRes = await fetch(apiUrl('/api/social_posts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        credentials: 'include',
        body: JSON.stringify(post),
      });
      if (postRes.status === 401) { navigate('/login'); return; }
      if (!postRes.ok) throw new Error(`Failed to create post (${postRes.status})`);
      const postData = await postRes.json();
      const postIri = postData['@id'] || (postData.id ? `/api/social_posts/${postData.id}` : null);
      if (!postIri) throw new Error('Could not resolve created post IRI');

      // 2) Create the SocialPostChannel for scheduling
      const channelRes = await fetch(apiUrl('/api/social_post_channels'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        credentials: 'include',
        body: JSON.stringify({ ...channel, post: postIri }),
      });
      if (channelRes.status === 401) { navigate('/login'); return; }
      if (!channelRes.ok) throw new Error(`Failed to create channel (${channelRes.status})`);

      setSnack({ open: true, message: 'Post planned successfully.', severity: 'success' });
      setPlanOpen(false);
      await fetchData();
    } catch (e) {
      setSnack({ open: true, message: e.message || 'Failed to plan post', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const after = range.start.startOf('day').toISOString();
      const before = range.end.add(1, 'day').startOf('day').toISOString();
      const url = apiUrl(`/api/social_post_channels?dateScheduled[after]=${encodeURIComponent(after)}&dateScheduled[before]=${encodeURIComponent(before)}&order[dateScheduled]=asc`);
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        credentials: 'include',
      });
      if (res.status === 401) { navigate('/login'); return; }
      if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`);
      const data = await res.json();
      const rows = Array.isArray(data['hydra:member']) ? data['hydra:member'] : (Array.isArray(data) ? data : []);
      setItems(rows);
    } catch (e) {
      setError(e.message || 'Error loading calendar');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group items by Y-M-D string
  const itemsByDay = useMemo(() => {
    const map = {};
    for (const it of items) {
      const key = it.dateScheduled ? dayjs(it.dateScheduled).format('YYYY-MM-DD') : '__';
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [items]);

  // Build grid days (Mon-first). Start from Monday before the 1st, finish Sunday after last day
  const gridDays = useMemo(() => {
    const start = range.start.startOf('week').add(1, 'day'); // move to Monday
    const end = range.end.endOf('week').add(1, 'day');
    const days = [];
    let d = start.clone();
    while (d.isBefore(end) || d.isSame(end, 'day')) {
      days.push(d);
      d = d.add(1, 'day');
    }
    return days;
  }, [range]);

  const isToday = (d) => d.isSame(dayjs(), 'day');
  const isOtherMonth = (d) => !d.isSame(cursor, 'month');

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton onClick={() => setCursor((c) => c.subtract(1, 'month'))} aria-label="Prev month">
            <ChevronLeft />
          </IconButton>
          <Typography variant="h6" sx={{ minWidth: 220 }}>{monthLabel}</Typography>
          <IconButton onClick={() => setCursor((c) => c.add(1, 'month'))} aria-label="Next month">
            <ChevronRight />
          </IconButton>
          <Tooltip title="Jump to current month">
            <IconButton onClick={() => setCursor(dayjs().startOf('month'))}>
              <Today />
            </IconButton>
          </Tooltip>
        </Stack>
        {/* New Post button and Legend */}
        <Stack direction="row" spacing={2} alignItems="center">
          <Button variant="contained" onClick={openPlanner}>New Post</Button>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label="Draft" variant="outlined" />
            <Chip size="small" label="Scheduled" color="primary" variant="outlined" />
            <Chip size="small" label="Published" color="success" />
          </Stack>
        </Stack>
      </Stack>

      {/* Weekday headers */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, mb: 1 }}>
        {WEEKDAYS.map((w) => (
          <Box key={w} sx={{ textAlign: 'center', fontWeight: 600, color: 'text.secondary' }}>{w}</Box>
        ))}
      </Box>

      {/* Calendar grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {gridDays.map((d) => {
          const key = d.format('YYYY-MM-DD');
          const dayItems = itemsByDay[key] || [];
          return (
            <Paper key={key} variant="outlined" sx={{ p: 1, minHeight: 120, opacity: isOtherMonth(d) ? 0.55 : 1 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {d.format('DD')}
                </Typography>
                {isToday(d) && (
                  <Chip size="small" label="Today" color="secondary" variant="outlined" />
                )}
              </Stack>
              <Divider sx={{ mb: 0.5 }} />
              <Stack spacing={0.5}>
                {dayItems.length === 0 && (
                  <Typography variant="caption" color="text.secondary">—</Typography>
                )}
                {dayItems.map((it) => (
                  <Chip
                    key={it.id}
                    size="small"
                    variant={it.status === 'Published' ? 'filled' : 'outlined'}
                    color={statusColor(it.status)}
                    label={`${it.platform} · ${(it.post && it.post.title) ? it.post.title : 'Post'}`}
                    sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  />
                ))}
              </Stack>
            </Paper>
          );
        })}
      </Box>

      {loading && (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading…</Typography>
        </Stack>
      )}
      {error && (
        <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>
      )}

      {/* Drawer for planning a new post */}
      <AppDrawer open={planOpen} onClose={closePlanner} title="Plan Social Post">
        <Stack spacing={2} sx={{ p: 2 }}>
          <PlanSocialPostFormRHF
            formId={PLAN_FORM_ID}
            defaultDateTime={defaultPlanDateTime}
            onSubmit={handlePlanSubmit}
            submitting={submitting}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={closePlanner} disabled={submitting}>Cancel</Button>
            <Button variant="contained" type="submit" form={PLAN_FORM_ID} disabled={submitting}>Save</Button>
          </Stack>
        </Stack>
      </AppDrawer>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}