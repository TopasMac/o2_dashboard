import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageScaffold from '../components/layout/PageScaffold';
import AppDrawer from '../components/common/AppDrawer';
import EditHKCleaningsForm from '../components/forms/HKCleaningsTablePage/EditHKCleaningsForm';
import TableLiteTwoLineCell from '../components/layout/TableLiteTwoLineCell';
import api from '../api';
import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import TextField from '@mui/material/TextField';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';
import IconButton from '@mui/material/IconButton';
import SaveIcon from '@mui/icons-material/Save';


function ymNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const REPORT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reported', label: 'Reported' },
  { value: 'needs_review', label: 'Needs review' },
];

function normalizeReportStatus(v) {
  const raw = (v ?? '').toString().trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'pending') return 'pending';
  if (lower === 'reported') return 'reported';
  if (lower === 'needs_review' || lower === 'needs review') return 'needs_review';
  return ''; // unknown -> empty
}

const statusColor = (v) => {
  if (v === 'reported') return '#1e6f68'; // teal
  if (v === 'needs_review') return '#f97316'; // orange
  return 'text.secondary';
};

export default function HKCleaningsRecon() {
  const [month, setMonth] = useState(ymNow());
  const city = 'Tulum';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState(null);
  const [statusFilter, setStatusFilter] = useState(''); // '' = All

  // Status header filter ('' = All)
  const rowsToRender = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => {
      const s = normalizeReportStatus(r.report_status ?? r.reportStatus) || 'pending';
      return s === statusFilter;
    });
  }, [rows, statusFilter]);

  const canSave = useMemo(() => rows.length > 0, [rows.length]);

  const headerStats = useMemo(() => {
    const toNum = (v) => {
      const n = Number(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };

    const totalRows = rows.length;
    const savedRows = rows.filter((r) => {
      const s = normalizeReportStatus(r.report_status ?? r.reportStatus);
      return s === 'reported';
    }).length;

    let charged = 0;
    let cost = 0;

    for (const r of rows) {
      // Charged comes from service
      charged += toNum(r.charged_cost);

      // Cost = cleaning_cost + laundry_cost (same logic as recomputeTotal)
      cost += toNum(r.cleaning_cost) + toNum(r.laundry_cost);
    }

    const net = charged - cost;

    const fmt = (n) => {
      try {
        return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } catch (e) {
        return n.toFixed(2);
      }
    };

    return {
      totalRows,
      savedRows,
      charged,
      cost,
      net,
      fmt,
    };
  }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({ month, city }).toString();
      const res = await api.get(`/api/hk-reconcile?${q}`);
      const json = res?.data;
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);


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
      report_status: normalizeReportStatus(row.report_status ?? row.reportStatus) || null,
      notes: row.notes ?? null,
    };

    if (!payload.unit_id || Number.isNaN(payload.unit_id)) {
      throw new Error('Unit ID is required');
    }
    if (!payload.service_date) {
      throw new Error('Service date is required');
    }

    const q = new URLSearchParams({ month, city }).toString();
    if (row.__isNew) {
      await api.post(`/api/hk-reconcile?${q}`, payload);
      await load();
      return;
    }

    await api.put(`/api/hk-reconcile/${row.id}?${q}`, payload);
    await load();
  };

  const deleteRow = async (row) => {
    if (row.__isNew) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    const q = new URLSearchParams({ month, city }).toString();
    await api.delete(`/api/hk-reconcile/${row.id}?${q}`);
    await load();
  };

  const openCleaning = async (hkCleaningId) => {
    if (!hkCleaningId) return;
    setErr(null);
    try {
      // Try to fetch the full HK cleaning record (same object shape as HKCleaningsView expects)
      const res = await api.get(`/api/hk-cleanings/${hkCleaningId}`);
      const json = res?.data;
      const rec = json?.data ?? json;
      setEditingCleaning(rec);
    } catch (e) {
      // Fallback: open with minimal data so user can at least see something
      setEditingCleaning({ id: hkCleaningId });
    }
    setEditDrawerOpen(true);
  };

  return (
    <PageScaffold
      title="HK Reconciliation"
      subtitle="Manual housekeeper report (cleaning + laundry) for monthly reconciliation"
      layout="table"
      stickyHeader={
        <Box sx={{ width: '100%' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <YearMonthPicker
              value={month}
              onChange={setMonth}
              label="Month"
              size="small"
              sx={{ width: 180 }}
            />

            <FormControl size="small" sx={{ width: 220 }}>
              <InputLabel id="hk-recon-status">Status</InputLabel>
              <Select
                labelId="hk-recon-status"
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">
                  <Typography variant="body2" color="text.secondary">All</Typography>
                </MenuItem>
                <MenuItem value="pending">
                  <Typography variant="body2" color="text.secondary">Pending</Typography>
                </MenuItem>
                <MenuItem value="reported">
                  <Typography variant="body2" sx={{ color: '#1e6f68' }}>Reported</Typography>
                </MenuItem>
                <MenuItem value="needs_review">
                  <Typography variant="body2" sx={{ color: '#f97316' }}>Needs review</Typography>
                </MenuItem>
              </Select>
            </FormControl>

            {/* Summary metrics block */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                Rows: <b>{headerStats.totalRows}</b> • Saved: <b>{headerStats.savedRows}</b>
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Charged: <b>{headerStats.fmt(headerStats.charged)}</b>
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Cost: <b>{headerStats.fmt(headerStats.cost)}</b>
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  color:
                    headerStats.net > 0
                      ? '#1e6f68'
                      : headerStats.net < 0
                        ? '#dc2626'
                        : 'text.secondary',
                }}
              >
                Net: <b>{headerStats.net >= 0 ? '+' : ''}{headerStats.fmt(headerStats.net)}</b>
              </Typography>
            </Box>

            <Box sx={{ flex: 1 }} />

          </Box>

          {err ? (
            <Typography sx={{ mt: 1, color: 'error.main' }}>
              {err}
            </Typography>
          ) : null}
        </Box>
      }
    >

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, height: 'calc(100vh - 260px)' }}>
        <Paper variant="outlined" sx={{ overflow: 'hidden', width: '100%', display: 'flex', flexDirection: 'column' }}>
          <Divider />
          <TableContainer
            sx={{
              width: '100%',
              overflowX: 'auto',
              maxHeight: '100%',
            }}
          >
            <Table size="small" stickyHeader sx={{ minWidth: 1220, tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700 }}>Cleaning</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700 }}>Unit</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Type</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Expected</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Paid</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Laundry</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Total</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'center' }}>Charged</TableCell>
                <TableCell sx={{ width: 220, minWidth: 220, maxWidth: 220, fontWeight: 700 }}>Notes</TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                  <Select
                    variant="standard"
                    size="small"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    displayEmpty
                    renderValue={(v) => {
                      if (!v) return 'Status';
                      if (v === 'pending') return 'Pending';
                      if (v === 'reported') return 'Reported';
                      if (v === 'needs_review') return 'Needs review';
                      return 'Status';
                    }}
                    sx={{
                      minWidth: 90,
                      fontWeight: 700,
                      '& .MuiSelect-select': {
                        textAlign: 'center',
                        paddingRight: '20px',
                      },
                    }}
                  >
                    <MenuItem value="">
                      <Typography variant="body2" color="text.secondary">All</Typography>
                    </MenuItem>
                    <MenuItem value="pending">
                      <Typography variant="body2" color="text.secondary">Pending</Typography>
                    </MenuItem>
                    <MenuItem value="reported">
                      <Typography variant="body2" sx={{ color: '#1e6f68' }}>Reported</Typography>
                    </MenuItem>
                    <MenuItem value="needs_review">
                      <Typography variant="body2" sx={{ color: '#f97316' }}>Needs review</Typography>
                    </MenuItem>
                  </Select>
                </TableCell>
                <TableCell sx={{ width: 120, minWidth: 120, maxWidth: 120, fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rowsToRender.map((r) => {
                const total = recomputeTotal(r);
                const dirtyTotal = r.total_cost !== total;
                const cleaningCode = r.hk_cleaning_id ? `HK-${r.hk_cleaning_id}` : '—';
                // Format date as dd-mm-yyyy
                const formattedDate = r.service_date
                  ? r.service_date.split('-').reverse().join('-')
                  : '—';

                // Compute charged, total, diff, and color
                const chargedVal = Number(r.charged_cost ?? (dirtyTotal ? total : (r.total_cost ?? total)) ?? 0);
                const totalVal = Number(total ?? 0);
                const diffVal = chargedVal - totalVal;
                const diffColor =
                  diffVal > 0 ? '#1e6f68' : diffVal < 0 ? '#dc2626' : '#6b7280';

                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120 }}>
                      <TableLiteTwoLineCell
                        className="o2-two-line-click"
                        main={formattedDate}
                        sub={
                          r.hk_cleaning_id ? (
                            <span
                              className="o2-cell-meta"
                              onClick={() => openCleaning(r.hk_cleaning_id)}
                            >
                              {cleaningCode}
                            </span>
                          ) : (
                            cleaningCode
                          )
                        }
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, overflow: 'hidden' }}>
                      <Box sx={{ width: 120, minHeight: 40, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                        <Typography
                          variant="body2"
                          color="text.primary"
                          sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}
                        >
                          {r.unit_name ?? ''}
                        </Typography>
                      </Box>
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <Box sx={{ width: 120, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          {r.cleaning_type
                            ? r.cleaning_type.charAt(0).toUpperCase() + r.cleaning_type.slice(1)
                            : '—'}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Expected */}
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <Box sx={{ width: 120, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          {r.expected_cost ?? '—'}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Cleaning cost */}
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <TextField
                        value={r.cleaning_cost ?? ''}
                        onChange={(e) => updateRow(r.id, { cleaning_cost: e.target.value })}
                        size="small"
                        variant="outlined"
                        sx={{ width: 96, mx: 'auto' }}
                        inputProps={{ inputMode: 'decimal', style: { textAlign: 'center' } }}
                      />
                    </TableCell>

                    {/* Laundry */}
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <TextField
                        value={r.laundry_cost ?? ''}
                        onChange={(e) => updateRow(r.id, { laundry_cost: e.target.value })}
                        size="small"
                        variant="outlined"
                        sx={{ width: 96, mx: 'auto' }}
                        inputProps={{ inputMode: 'decimal', style: { textAlign: 'center' } }}
                      />
                    </TableCell>

                    {/* Total */}
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <Box sx={{ width: 120, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          {dirtyTotal ? total : (r.total_cost ?? total)}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Charged (with Diff below) */}
                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <Box sx={{ width: 120, minHeight: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          {chargedVal.toFixed(2)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: diffColor }}>
                          {diffVal >= 0 ? '+' : ''}{diffVal.toFixed(2)}
                        </Typography>
                      </Box>
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 220, minWidth: 220, maxWidth: 220 }}>
                      <TextField
                        value={r.notes ?? ''}
                        onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                        size="small"
                        variant="outlined"
                        sx={{ width: 220 }}
                        placeholder="Optional"
                      />
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'center' }}>
                      <Box sx={{ width: 120, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Select
                          size="small"
                          value={normalizeReportStatus(r.report_status ?? r.reportStatus) || 'pending'}
                          onChange={(e) => updateRow(r.id, { report_status: e.target.value })}
                          sx={{
                            width: 110,
                            color: statusColor(normalizeReportStatus(r.report_status ?? r.reportStatus) || 'pending'),
                            '& .MuiSelect-icon': {
                              color: statusColor(normalizeReportStatus(r.report_status ?? r.reportStatus) || 'pending'),
                            },
                          }}
                        >
                          <MenuItem value="pending">
                            <Typography variant="body2" color="text.secondary">Pending</Typography>
                          </MenuItem>
                          <MenuItem value="reported">
                            <Typography variant="body2" sx={{ color: '#1e6f68' }}>Reported</Typography>
                          </MenuItem>
                          <MenuItem value="needs_review">
                            <Typography variant="body2" sx={{ color: '#f97316' }}>Needs review</Typography>
                          </MenuItem>
                        </Select>
                      </Box>
                    </TableCell>

                    <TableCell sx={{ py: 0.5, width: 120, minWidth: 120, maxWidth: 120, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <IconButton
                        title="Save"
                        size="small"
                        onClick={async () => {
                          try {
                            await saveRow(r);
                          } catch (e) {
                            setErr(e?.response?.data?.message || e?.response?.data?.error || e?.message || String(e));
                          }
                        }}
                        disabled={loading}
                      >
                        <SaveIcon fontSize="small" />
                      </IconButton>

                    </TableCell>
                  </TableRow>
                );
              })}

              {rowsToRender.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={11} sx={{ py: 4 }}>
                    <Typography sx={{ color: 'text.secondary', textAlign: 'center' }}>
                      No lines for this month yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          </TableContainer>
        </Paper>
      </Box>

      {canSave ? null : (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          Tip: select a month and city to review reconciliation lines.
        </Typography>
      )}
      <AppDrawer
        open={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setEditingCleaning(null);
        }}
        title="Edit Cleaning"
        width={520}
      >
        {editingCleaning ? (
          <EditHKCleaningsForm
            cleaning={editingCleaning}
            onSaved={async () => {
              setEditDrawerOpen(false);
              setEditingCleaning(null);
              await load();
            }}
            onCancel={() => {
              setEditDrawerOpen(false);
              setEditingCleaning(null);
            }}
          />
        ) : null}
      </AppDrawer>
    </PageScaffold>
  );
}