import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Collapse,
  Chip,
  Stack,
  Toolbar,
  Tooltip,
  CircularProgress,
  TextField,
  Button,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Refresh, Add } from '@mui/icons-material';
import dayjs from 'dayjs';

// --- Auth & API helpers (mirrors UnitMedia.jsx pattern) ---
const authHeader = () => {
  const t = localStorage.getItem('token'); // NOTE: key is 'token' in our app
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const API_BASE = (process.env.REACT_APP_BACKEND_BASE || '').replace(/\/$/, '');
const apiUrl = (path) => `${API_BASE}${path}`;

// --- Simple helper to format money consistently (EUR style as per Owners2 prefs) ---
const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n
    .toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Compute small colored badge for status
const StatusChip = ({ status }) => {
  const chipProps = {
    size: 'small',
    label: status,
    variant: status === 'Published' ? 'filled' : 'outlined',
    color: status === 'Published' ? 'success' : status === 'Scheduled' ? 'primary' : 'default',
  };
  return <Chip {...chipProps} />;
};

// Row for each SocialPost with expandable channels
function PostRow({ row, onToggle, open, loadChannels, channels, channelsLoading }) {
  const platforms = useMemo(() => {
    if (!channels || channels.length === 0) return [];
    const set = new Set(channels.map((c) => c.platform));
    return Array.from(set);
  }, [channels]);

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={() => onToggle(row.id)} aria-label={open ? 'collapse' : 'expand'}>
            {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
          </IconButton>
        </TableCell>
        <TableCell style={{ fontWeight: 600 }}>{row.title}</TableCell>
        <TableCell>{row.theme || '—'}</TableCell>
        <TableCell>
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {platforms.length > 0
              ? platforms.map((p) => <Chip key={p} size="small" label={p} />)
              : <Chip size="small" variant="outlined" label="No channels" />}
          </Stack>
        </TableCell>
        <TableCell>{row.createdAt ? dayjs(row.createdAt).format('DD-MM-YYYY HH:mm') : '—'}</TableCell>
        <TableCell>{row.updatedAt ? dayjs(row.updatedAt).format('DD-MM-YYYY HH:mm') : '—'}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, borderBottom: open ? '1px solid rgba(224, 224, 224, 1)' : 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ m: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Per-platform schedule & metrics</Typography>
              {channelsLoading ? (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2">Loading channels…</Typography>
                </Stack>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Platform</TableCell>
                      <TableCell>Scheduled</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Reach</TableCell>
                      <TableCell align="right">Clicks</TableCell>
                      <TableCell align="right">Leads</TableCell>
                      <TableCell align="right">Spent</TableCell>
                      <TableCell>Post ID / URL</TableCell>
                      <TableCell>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(channels && channels.length > 0 ? channels : []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.platform}</TableCell>
                        <TableCell>{c.dateScheduled ? dayjs(c.dateScheduled).format('DD-MM-YYYY HH:mm') : '—'}</TableCell>
                        <TableCell><StatusChip status={c.status} /></TableCell>
                        <TableCell align="right">{c.reach ?? '—'}</TableCell>
                        <TableCell align="right">{c.clicks ?? '—'}</TableCell>
                        <TableCell align="right">{c.leads ?? '—'}</TableCell>
                        <TableCell align="right">{c.spent ? formatMoney(c.spent) : '—'}</TableCell>
                        <TableCell style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.platformPostId || '—'}
                        </TableCell>
                        <TableCell style={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.notes || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!channels || channels.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={9}>
                          <Typography variant="body2" color="text.secondary">No channels yet.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function SocialPosts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState({}); // id -> boolean
  const [channelsByPost, setChannelsByPost] = useState({}); // id -> array
  const [channelsLoading, setChannelsLoading] = useState({}); // id -> boolean

  const navigate = useNavigate();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/social_posts?order[updatedAt]=desc'), {
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        credentials: 'include',
      });
      if (res.status === 401) { navigate('/login'); return; }
      if (!res.ok) throw new Error(`Failed to load posts (${res.status})`);
      const data = await res.json();
      const items = Array.isArray(data['hydra:member']) ? data['hydra:member'] : (Array.isArray(data) ? data : []);
      setRows(items);
    } catch (e) {
      setError(e.message || 'Error fetching posts');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const fetchChannels = useCallback(async (postId) => {
    setChannelsLoading((m) => ({ ...m, [postId]: true }));
    try {
      const iri = `/api/social_posts/${postId}`;
      const url = apiUrl(`/api/social_post_channels?post=${encodeURIComponent(iri)}&order[dateScheduled]=asc`);
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...authHeader() }, credentials: 'include' });
      if (res.status === 401) { navigate('/login'); return; }
      if (!res.ok) throw new Error(`Failed to load channels (${res.status})`);
      const data = await res.json();
      const items = Array.isArray(data['hydra:member']) ? data['hydra:member'] : (Array.isArray(data) ? data : []);
      setChannelsByPost((m) => ({ ...m, [postId]: items }));
    } catch (e) {
      setChannelsByPost((m) => ({ ...m, [postId]: [] }));
    } finally {
      setChannelsLoading((m) => ({ ...m, [postId]: false }));
    }
  }, [navigate]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const filteredRows = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.theme || '').toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const toggleExpand = (id) => {
    setExpanded((m) => {
      const next = { ...m, [id]: !m[id] };
      if (!m[id] && !channelsByPost[id]) {
        // just opened and not loaded yet → fetch
        fetchChannels(id);
      }
      return next;
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Toolbar disableGutters sx={{ mb: 2, display: 'flex', gap: 1, justifyContent: 'space-between' }}>
        <Typography variant="h6">Social Posts</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search title/theme…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={fetchPosts}>
              <Refresh />
            </IconButton>
          </Tooltip>
          <Tooltip title="New Post (drawer to be added)">
            <span>
              <Button startIcon={<Add />} variant="contained" disabled>
                New Post
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Toolbar>

      {error && (
        <Paper sx={{ p: 2, mb: 2, border: '1px solid #f5c6cb', background: '#fff5f5' }}>
          <Typography color="error">{error}</Typography>
        </Paper>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Title</TableCell>
                <TableCell>Theme</TableCell>
                <TableCell>Channels</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Stack direction="row" gap={1} alignItems="center" justifyContent="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                      <Typography variant="body2">Loading…</Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <PostRow
                    key={row.id}
                    row={row}
                    onToggle={toggleExpand}
                    open={!!expanded[row.id]}
                    loadChannels={fetchChannels}
                    channels={channelsByPost[row.id]}
                    channelsLoading={!!channelsLoading[row.id]}
                  />
                ))
              )}
              {!loading && filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">No posts found.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}