import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import PageScaffoldTable from '../components/layout/PageScaffoldTable';
import TableLite from '../components/layout/TableLite';

const AREA_OPTIONS = [
  { value: 'Playa', label: 'Playa del Carmen' },
  { value: 'Tulum', label: 'Tulum' },
  { value: 'Both', label: 'Both' },
];

const OCCUPATION_OPTIONS = [
  'Handyman',
  'Plumber',
  'Electrician',
  'AC Technician',
  'Painter',
  'Appliance Repair',
  'Carpenter',
  'Locksmith',
  'Internet / TV',
  'Other',
];

function getAuthToken() {
  // Try common keys; keeps this page working even if your auth storage key changes.
  return (
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('jwt') ||
    localStorage.getItem('access_token') ||
    ''
  );
}

async function apiFetch(path, { method = 'GET', body, headers } = {}) {
  const token = getAuthToken();

  const finalHeaders = {
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers || {}),
  };

  const res = await fetch(path, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message = json?.error || json?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}

export default function ServiceProviders() {
  const [city, setCity] = useState(''); // '' | Playa | Tulum
  const [includeInactive, setIncludeInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    occupation: 'Handyman',
    area: 'Both',
    phone: '',
    whatsapp: '',
    email: '',
    notes: '',
  });

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    if (city) qs.set('city', city);
    if (includeInactive) qs.set('includeInactive', '1');
    const s = qs.toString();
    return s ? `?${s}` : '';
  }, [city, includeInactive]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/service-providers${queryString}`);
      setRows(Array.isArray(data?.providers) ? data.providers : []);
    } catch (e) {
      setRows([]);
      setError(e?.message || 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo(
    () => [
      { key: 'provider_id', label: 'ID', width: 110 },
      { key: 'name', label: 'Name', grow: 1 },
      { key: 'occupation', label: 'Occupation', width: 160 },
      { key: 'area', label: 'Area', width: 120 },
      { key: 'whatsapp', label: 'WhatsApp', width: 150 },
      { key: 'phone', label: 'Phone', width: 140 },
      { key: 'email', label: 'Email', width: 220 },
      { key: 'last_job_at', label: 'Last job', width: 160 },
      {
        key: 'is_active',
        label: 'Active',
        width: 90,
        render: (r) => (r?.is_active ? 'Yes' : 'No'),
      },
    ],
    []
  );

  const openCreate = () => {
    setForm({
      name: '',
      occupation: 'Handyman',
      area: city || 'Both',
      phone: '',
      whatsapp: '',
      email: '',
      notes: '',
    });
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (saving) return;
    setCreateOpen(false);
  };

  const onCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name?.trim(),
        occupation: form.occupation,
        area: form.area,
        phone: form.phone?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        email: form.email?.trim() || null,
        notes: form.notes?.trim() || null,
      };

      await apiFetch('/api/service-providers', { method: 'POST', body: payload });
      setCreateOpen(false);
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to create provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageScaffoldTable
      title="Service Providers"
      subtitle="Handymen, plumbers, electricians, etc."
      actions={
        <Button variant="contained" onClick={openCreate}>
          + Add Provider
        </Button>
      }
      filters={
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="sp-city">City</InputLabel>
            <Select
              labelId="sp-city"
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Playa">Playa del Carmen</MenuItem>
              <MenuItem value="Tulum">Tulum</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
            }
            label="Include inactive"
          />

          <Button variant="text" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </Stack>
      }
    >
      {error ? (
        <Box sx={{ mb: 1 }}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Box>
      ) : null}

      <TableLite
        loading={loading}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyText="No service providers found."
      />

      <Dialog open={createOpen} onClose={closeCreate} fullWidth maxWidth="sm">
        <DialogTitle>Add Service Provider</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />

            <FormControl fullWidth>
              <InputLabel id="sp-occ">Occupation</InputLabel>
              <Select
                labelId="sp-occ"
                label="Occupation"
                value={form.occupation}
                onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))}
              >
                {OCCUPATION_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="sp-area">Area</InputLabel>
              <Select
                labelId="sp-area"
                label="Area"
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
              >
                {AREA_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="WhatsApp"
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                fullWidth
              />
            </Stack>

            <TextField
              label="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
            />

            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>

          <Typography variant="caption" sx={{ display: 'block', mt: 2, opacity: 0.75 }}>
            Bank details can be added later when needed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreate} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={onCreate} disabled={saving}>
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageScaffoldTable>
  );
}