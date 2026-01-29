import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageScaffold from '../components/layout/PageScaffold';
import {
  Box,
  Button,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';

function getJwtToken() {
  // Try a few common storage keys used across the app
  const candidates = [
    () => localStorage.getItem('token'),
    () => localStorage.getItem('jwt'),
    () => sessionStorage.getItem('token'),
    () => sessionStorage.getItem('jwt'),
    () => (typeof window !== 'undefined' ? window.__O2_JWT__ : null),
  ];
  for (const fn of candidates) {
    try {
      const v = fn();
      if (v && typeof v === 'string' && v.length > 20) return v;
    } catch (e) {
      // ignore
    }
  }
  return null;
}

async function apiFetch(url, { method = 'GET', body = null } = {}) {
  const token = getJwtToken();
  const headers = {
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body === null ? null : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    // leave json null
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json;
}

function ymNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function HKCleaningsRecon() {
  const [month, setMonth] = useState(ymNow());
  const [city, setCity] = useState('Tulum');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const canSave = useMemo(() => rows.length > 0, [rows.length]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({ month, city }).toString();
      const json = await apiFetch(`/api/hk-reconcile?${q}`);
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [month, city]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = () => {
    const tempId = `new-${Date.now()}`;
    setRows((prev) => [
      {
        id: tempId,
        unit_id: '',
        unit_name: '',
        service_date: `${month}-01`,
        cleaning_cost: '0.00',
        laundry_cost: '0.00',
        total_cost: '0.00',
        notes: '',
        __isNew: true,
      },
      ...prev,
    ]);
  };

  const updateRow = (id, patch) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  const recomputeTotal = (row) => {
    const c = parseFloat(String(row.cleaning_cost ?? '0').replace(',', '.')) || 0;
    const l = parseFloat(String(row.laundry_cost ?? '0').replace(',', '.')) || 0;
    return (c + l).toFixed(2);
  };

  const saveRow = async (row) => {
    const payload = {
      month,
      city,
      unit_id: Number(row.unit_id),
      service_date: row.service_date,
      cleaning_cost: row.cleaning_cost === '' ? '0' : String(row.cleaning_cost),
      laundry_cost: row.laundry_cost === '' ? '0' : String(row.laundry_cost),
      notes: row.notes ?? null,
    };

    if (!payload.unit_id || Number.isNaN(payload.unit_id)) {
      throw new Error('Unit ID is required');
    }
    if (!payload.service_date) {
      throw new Error('Service date is required');
    }

    if (row.__isNew) {
      await apiFetch('/api/hk-reconcile', { method: 'POST', body: payload });
      await load();
      return;
    }

    await apiFetch(`/api/hk-reconcile/${row.id}`, { method: 'PUT', body: payload });
    await load();
  };

  const deleteRow = async (row) => {
    if (row.__isNew) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    await apiFetch(`/api/hk-reconcile/${row.id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <PageScaffold
      title="HK Reconciliation"
      subtitle="Manual housekeeper report (cleaning + laundry) for monthly reconciliation"
    >
      <Typography variant="h5" sx={{ mb: 1 }}>
        HK Reconciliation (Manual Report)
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Enter the housekeeper’s month-end report lines (cleaning + laundry). We’ll compare these later with HK Cleanings.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            label="Month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            size="small"
            sx={{ width: 180 }}
            inputProps={{ 'aria-label': 'Month' }}
          />

          <FormControl size="small" sx={{ width: 220 }}>
            <InputLabel id="hk-recon-city">City</InputLabel>
            <Select
              labelId="hk-recon-city"
              value={city}
              label="City"
              onChange={(e) => setCity(e.target.value)}
            >
              <MenuItem value="Tulum">Tulum</MenuItem>
              <MenuItem value="Playa del Carmen">Playa del Carmen</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flex: 1 }} />

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={load}
            disabled={loading}
          >
            Refresh
          </Button>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addRow}
          >
            Add line
          </Button>
        </Box>

        {err ? (
          <Typography sx={{ mt: 1, color: 'error.main' }}>
            {err}
          </Typography>
        ) : null}
      </Paper>

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1">
            {city} — {month}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Rows: {rows.length}{loading ? ' (loading...)' : ''}
          </Typography>
        </Box>
        <Divider />

        <Box sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1220 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 160, fontWeight: 700 }}>Unit</TableCell>
                <TableCell sx={{ width: 140, fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700, textAlign: 'center' }}>Cleaning</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700, textAlign: 'center' }}>Laundry</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700, textAlign: 'center' }}>Total</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700, textAlign: 'center' }}>Expected</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700, textAlign: 'center' }}>Charged</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700, textAlign: 'center' }}>Diff</TableCell>
                <TableCell sx={{ minWidth: 220, fontWeight: 700 }}>Notes</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((r) => {
                const total = recomputeTotal(r);
                const dirtyTotal = r.total_cost !== total;

                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ py: 0.5 }}>
                      <TextField
                        value={r.unit_name ?? ''}
                        size="small"
                        variant="outlined"
                        sx={{ width: 150 }}
                        placeholder="(auto later)"
                        disabled
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5 }}>
                      <TextField
                        type="date"
                        value={r.service_date ?? `${month}-01`}
                        onChange={(e) => updateRow(r.id, { service_date: e.target.value })}
                        size="small"
                        variant="outlined"
                        sx={{ width: 150 }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, textAlign: 'center' }}>
                      <TextField
                        value={r.cleaning_cost ?? ''}
                        onChange={(e) => updateRow(r.id, { cleaning_cost: e.target.value })}
                        size="small"
                        variant="outlined"
                        sx={{ width: 110 }}
                        inputProps={{ inputMode: 'decimal', style: { textAlign: 'center' } }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, textAlign: 'center' }}>
                      <TextField
                        value={r.laundry_cost ?? ''}
                        onChange={(e) => updateRow(r.id, { laundry_cost: e.target.value })}
                        size="small"
                        variant="outlined"
                        sx={{ width: 110 }}
                        inputProps={{ inputMode: 'decimal', style: { textAlign: 'center' } }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, textAlign: 'center' }}>
                      <TextField
                        value={dirtyTotal ? total : (r.total_cost ?? total)}
                        size="small"
                        variant="outlined"
                        sx={{ width: 110 }}
                        inputProps={{ style: { textAlign: 'center' } }}
                        disabled
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, textAlign: 'center' }}>
                      <TextField
                        value={r.expected_cost ?? '—'}
                        size="small"
                        variant="outlined"
                        sx={{ width: 110 }}
                        inputProps={{ style: { textAlign: 'center' } }}
                        disabled
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, textAlign: 'center' }}>
                      <TextField
                        value={r.charged_cost ?? (dirtyTotal ? total : (r.total_cost ?? total))}
                        size="small"
                        variant="outlined"
                        sx={{ width: 110 }}
                        inputProps={{ style: { textAlign: 'center' } }}
                        disabled
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, textAlign: 'center' }}>
                      <TextField
                        value={r.diff ?? '—'}
                        size="small"
                        variant="outlined"
                        sx={{ width: 110 }}
                        inputProps={{ style: { textAlign: 'center' } }}
                        disabled
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5 }}>
                      <TextField
                        value={r.notes ?? ''}
                        onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                        size="small"
                        variant="outlined"
                        sx={{ width: '100%' }}
                        placeholder="Optional"
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <IconButton
                        title="Save"
                        size="small"
                        onClick={async () => {
                          try {
                            await saveRow(r);
                          } catch (e) {
                            setErr(e?.message || String(e));
                          }
                        }}
                        disabled={loading}
                      >
                        <SaveIcon fontSize="small" />
                      </IconButton>

                      <IconButton
                        title="Delete"
                        size="small"
                        onClick={async () => {
                          try {
                            await deleteRow(r);
                          } catch (e) {
                            setErr(e?.message || String(e));
                          }
                        }}
                        disabled={loading}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}

              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 4 }}>
                    <Typography sx={{ color: 'text.secondary', textAlign: 'center' }}>
                      No lines for this month yet. Click <b>Add line</b> to start.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Box>

        <Divider />

        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={load}
            disabled={loading}
          >
            Reload
          </Button>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addRow}
          >
            Add line
          </Button>
        </Box>
      </Paper>

      {canSave ? null : (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          Tip: enter Unit ID and Date first, then costs. Unit name will be auto-resolved in a later step.
        </Typography>
      )}
    </PageScaffold>
  );
}