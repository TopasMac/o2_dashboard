import React, { useEffect, useState, useMemo } from 'react';
import api from '../api';
import TableLite from '../components/layout/TableLite';
import AppDrawer from '../components/common/AppDrawer';
import PageScaffold from '../components/layout/PageScaffold';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';
import OccWNoteModal from '../components/modals/OccWNoteModal';
import { Tabs, Tab, Stack, Box, TextField, MenuItem, IconButton } from '@mui/material';

import ClearIcon from '@mui/icons-material/Clear';

export default function AccountingRecords() {
  // --- table state
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sort, setSort] = useState('fechaOn');
  const [dir, setDir] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- view/tab state: espiral vs santander
  const [view, setView] = useState('espiral'); // 'espiral' | 'santander'

  // --- shared month/year selection (default: previous calendar month, formatted as 'YYYY-MM')
  const [yearMonth, setYearMonth] = useState(() => {
    const today = new Date();
    let year = today.getFullYear();
    let month = today.getMonth() + 1; // 1-12, current month
    // Default to previous calendar month
    if (month === 1) {
      month = 12;
      year -= 1;
    } else {
      month -= 1;
    }
    const mm = String(month).padStart(2, '0');
    return `${year}-${mm}`;
  });

  const getDateRangeForYearMonth = (ym) => {
    if (typeof ym !== 'string' || !ym.includes('-')) {
      return {};
    }
    const [yStr, mStr] = ym.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) {
      return {};
    }
    // First day of the month
    const first = new Date(year, month - 1, 1);
    // Last day of the month: day 0 of next month
    const last = new Date(year, month, 0);

    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    return {
      dateFrom: fmt(first),
      dateTo: fmt(last),
    };
  };

  // --- santander table state
  const [santanderRows, setSantanderRows] = useState([]);
  const [santanderTotal, setSantanderTotal] = useState(0);
  const [santanderPage, setSantanderPage] = useState(1);
  const [santanderPerPage, setSantanderPerPage] = useState(25);
  const [santanderSort, setSantanderSort] = useState('fecha');
  const [santanderDir, setSantanderDir] = useState('desc');
  const [santanderLoading, setSantanderLoading] = useState(false);
  const [santanderError, setSantanderError] = useState(null);
  // --- santander checked filter: 'all' | 'checked' | 'unchecked'
  const [santanderCheckedFilter, setSantanderCheckedFilter] = useState('all');

  // --- santander note modal state
  const [santanderNoteModalOpen, setSantanderNoteModalOpen] = useState(false);
  const [santanderSelectedEntry, setSantanderSelectedEntry] = useState(null);
  const [santanderNoteDraft, setSantanderNoteDraft] = useState('');

  // --- drawer/import state (won't run automatically)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const onFileChange = (e) => setFile(e.target.files?.[0] || null);

  const [santanderSummary, setSantanderSummary] = useState(null);

  const santanderChipLabel = useMemo(() => {
    if (!santanderSummary) return null;
    const created = santanderSummary.created ?? 0;
    const updated = santanderSummary.updated ?? 0;
    const items = santanderSummary.items ?? 0;

    // Prefer explicit created/updated counts; fall back to items when both are zero
    if (created && updated) {
      return `${created} NEW · ${updated} UPDATED`;
    }
    if (created) {
      return `${created} NEW`;
    }
    if (updated) {
      return `${updated} UPDATED`;
    }
    if (items) {
      return `${items} ITEMS`;
    }
    return '0 CHANGES';
  }, [santanderSummary]);

  const fmtMoney = (v) => (
    v === null || v === undefined || v === '' || Number.isNaN(Number(v))
      ? '-'
      : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  const fmtDDMMYYYY = (val) => {
    if (!val) return '-';
    const s = String(val).trim();
    // ISO Y-m-d
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) { const [, y, mm, dd] = m; return `${dd}-${mm}-${y}`; }
    // D-m-Y or M-d-Y with dashes
    m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m) {
      let [ , a, b, y ] = m; // a-b-y could be D-M-Y or M-D-Y
      const ai = parseInt(a, 10), bi = parseInt(b, 10);
      // If ambiguous (both <=12) or clearly MM-DD (a<=12 & b>12) => swap to D-M-Y
      if ((ai <= 12 && bi <= 12) || (ai <= 12 && bi > 12)) { [a, b] = [b, a]; }
      return `${a}-${b}-${y}`;
    }
    // D/m/Y or M/d/Y with slashes
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      let [ , a, b, y ] = m;
      const ai = parseInt(a, 10), bi = parseInt(b, 10);
      if ((ai <= 12 && bi <= 12) || (ai <= 12 && bi > 12)) { [a, b] = [b, a]; }
      return `${a}-${b}-${y}`;
    }
    // Fallback: return as-is
    return s;
  };

  const columns = [
    { header: 'Date', accessor: 'fechaOn' },
    { header: 'Concepto', accessor: 'concepto' },
    { header: 'Monto', accessor: 'monto' },
    { header: 'Depósito', accessor: 'deposito' },
    { header: 'Comisión', accessor: 'comision' },
    { header: 'Saldo', accessor: 'saldo' },
  ];

  const santanderColumns = [
    { header: 'Date', accessor: 'fecha' },
    { header: 'Concept', accessor: 'concept', maxWidth: 400 },
    { header: 'Amount', accessor: 'deposito' },
    { header: 'Checked', accessor: 'checked' },
    { header: 'Notes', accessor: 'notes' },
  ];

  const mappedRows = rows.map((r) => {
    const isAbono = r.tipoMovimiento === 'Abono';
    const dep = r.deposito != null ? Number(r.deposito) : null;
    const com = r.comision != null ? Number(r.comision) : null;
    // Prefer backend-provided monto_contable; fallback to legacy 'monto' if present
    const montoRaw = r.montoContable != null ? Number(r.montoContable) : (r.monto != null ? Number(r.monto) : null);
    const saldo = r.saldo != null ? Number(r.saldo) : null;

    return {
      ...r,
      isActive: r.isActive ? 'Yes' : 'No',
      deposito: r.reconPayoutId ? (
        <span style={{ color: '#1E6F68', fontWeight: 500 }}>
          {isAbono ? (dep == null ? '-' : fmtMoney(dep)) : '-'}
        </span>
      ) : (isAbono ? (dep == null ? '-' : fmtMoney(dep)) : '-'),
      comision: com == null ? '-' : fmtMoney(com),
      fechaOn: r.reconPayoutId ? (
        <span style={{ color: '#1E6F68', fontWeight: 500 }}>{fmtDDMMYYYY(r.fechaOn)}</span>
      ) : fmtDDMMYYYY(r.fechaOn),
      concepto: r.reconPayoutId ? (
        <span style={{ color: '#1E6F68', fontWeight: 500 }}>{r.concepto}</span>
      ) : r.concepto,
      monto: r.reconPayoutId ? (
        <span style={{ color: '#1E6F68', fontWeight: 500 }}>{montoRaw == null ? '-' : fmtMoney(montoRaw)}</span>
      ) : (montoRaw == null ? '-' : fmtMoney(montoRaw)),
      saldo: saldo == null ? '-' : fmtMoney(saldo),
    };
  });

  const filteredRows = useMemo(() => {
    if (santanderCheckedFilter === 'checked') {
      return mappedRows.filter((r) => !!r.reconCheckedAt);
    }
    if (santanderCheckedFilter === 'unchecked') {
      return mappedRows.filter((r) => !r.reconCheckedAt);
    }
    return mappedRows;
  }, [mappedRows, santanderCheckedFilter]);

  const openSantanderNoteModal = (entry) => {
    if (!entry) return;
    setSantanderSelectedEntry(entry);
    setSantanderNoteDraft(entry.notes || '');
    setSantanderNoteModalOpen(true);
  };

  const handleSantanderCheckboxClick = (entry) => {
    if (!entry) return;
    // For now: whenever user checks the box, open the note modal.
    // (Uncheck / persistence can be wired to an API later.)
    if (!entry.checked) {
      openSantanderNoteModal(entry);
    } else {
      // In a later iteration we can support unchecking + clearing note.
      openSantanderNoteModal(entry);
    }
  };

  const handleSantanderNotesClick = (entry) => {
    if (!entry) return;
    openSantanderNoteModal(entry);
  };

  const filteredSantanderRows = useMemo(() => {
    if (santanderCheckedFilter === 'checked') {
      return santanderRows.filter((r) => !!r.checked);
    }
    if (santanderCheckedFilter === 'unchecked') {
      return santanderRows.filter((r) => !r.checked);
    }
    return santanderRows;
  }, [santanderRows, santanderCheckedFilter]);

  const mappedSantanderRows = filteredSantanderRows.map((r) => {
    const dep = r.deposito != null ? Number(r.deposito) : null;
    const isChecked = !!r.checked;
    const tealStyle = isChecked
      ? { color: '#1E6F68', fontWeight: 500 }
      : {};

    return {
      ...r,
      // API returns fechaOn in Y-m-d; fall back to any existing fecha if needed
      fecha: (
        <span style={tealStyle}>
          {r.fechaOn ? fmtDDMMYYYY(r.fechaOn) : fmtDDMMYYYY(r.fecha)}
        </span>
      ),
      concept: (
        <span style={tealStyle}>
          {r.concept ?? ''}
        </span>
      ),
      deposito: (
        <span style={tealStyle}>
          {dep == null ? '-' : fmtMoney(dep)}
        </span>
      ),
      checked: (
        <input
          type="checkbox"
          checked={!!r.checked}
          onChange={(e) => {
            e.stopPropagation();
            handleSantanderCheckboxClick(r);
          }}
        />
      ),
      notes: (
        <span
          style={{
            cursor: 'pointer',
            color: isChecked || r.notes ? '#1E6F68' : 'inherit',
            fontWeight: isChecked ? 500 : undefined,
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleSantanderNotesClick(r);
          }}
        >
          {r.notes || ''}
        </span>
      ),
    };
  });

  // --- fetch list (simple list mode: always fetch large single page)
  const loadTable = async (overrides = {}) => {
    setLoading(true);
    setError(null);
    try {
      const monthRange = getDateRangeForYearMonth(yearMonth);
      const params = {
        activeOnly: 1,
        ...monthRange,
        sort,
        dir,
        ...overrides,
        // Always fetch a single large page; TableLite will show all rows without pagination
        page: 1,
        perPage: 1000,
      };
      const { data } = await api.get('/api/accounting/import', { params });
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  };

  const loadSantanderTable = async (overrides = {}) => {
    setSantanderLoading(true);
    setSantanderError(null);
    try {
      // Parse 'YYYY-MM' into numeric year/month for the backend
      let ymYear = undefined;
      let ymMonth = undefined;
      if (typeof yearMonth === 'string' && yearMonth.includes('-')) {
        const [yStr, mStr] = yearMonth.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        if (!Number.isNaN(y) && !Number.isNaN(m)) {
          ymYear = y;
          ymMonth = m;
        }
      }

      // v1: Santander credits endpoint returns a flat list in `items`
      const { data } = await api.get('/api/accounting/santander/credits', {
        params: {
          year: ymYear,
          month: ymMonth,
          // In future we can add filters like accountLast4 or unchecked here.
          ...overrides,
        },
      });
      const items = data.items || [];
      setSantanderRows(items);
      setSantanderTotal(items.length);
    } catch (e) {
      setSantanderError(
        e?.response?.data?.message || e?.message || 'Failed to load Santander entries'
      );
    } finally {
      setSantanderLoading(false);
    }
  };

  useEffect(() => {
    loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, sort, dir, yearMonth]);

  useEffect(() => {
    if (view === 'santander') {
      loadSantanderTable();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, santanderPage, santanderPerPage, santanderSort, santanderDir, yearMonth]);

  // --- manual import (only when user clicks)
  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);

      let url;
      if (view === 'espiral') {
        // Existing accountant import (Espiral)
        url = `/api/imports/accountant?dryRun=${dryRun ? 1 : 0}`;
      } else if (view === 'santander') {
        // New Santander bank import endpoint
        url = '/api/accounting/santander/import';
      } else {
        // Fallback: default to accountant import
        url = `/api/imports/accountant?dryRun=${dryRun ? 1 : 0}`;
      }

      const { data } = await api.post(url, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(data);
      // Capture Santander summary (batches, items, created, updated) for tab pill
      if (view === 'santander') {
        const summary = data?.result || data;
        if (summary && (summary.items != null || summary.created != null)) {
          setSantanderSummary(summary);
        }
      }

      if (view === 'espiral') {
        // For Espiral, keep existing behavior: on real import, refresh and close
        if (!dryRun) {
          setPage(1);
          await loadTable({ page: 1 });
          setDrawerOpen(false);
          setFile(null);
        }
      } else if (view === 'santander') {
        // For Santander, just close the drawer and reset file for now
        setDrawerOpen(false);
        setFile(null);
        // When Santander list view is implemented, we can also trigger a reload here.
      }
    } catch (e) {
      setResult(null);
      // keep any previous error visible only in the drawer context
    } finally {
      setUploading(false);
    }
  };

  // Style rows whose reconCheckedAt is not null
  const styledRows = filteredRows.map((r) => ({
    ...r,
    _rowClass: r.reconCheckedAt ? 'bg-teal-50' : '',
  }));

  return (
    <PageScaffold
      title="Accounting — Import & Records"
      layout="table"
      withCard
      headerPlacement="inside"
    >
      {/* Drawer for import / dry-run. Not called on load. */}
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Import accountant file">
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} className="block" />

            {view === 'espiral' && (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                Dry Run (analyze only)
              </label>
            )}

            <button
              onClick={upload}
              disabled={uploading || !file}
              className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {uploading
                ? 'Uploading…'
                : view === 'espiral'
                  ? (dryRun ? 'Analyze File' : 'Import File')
                  : 'Import File'}
            </button>
          </div>

          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Rows read', result?.rowsRead],
                  ['No date', result?.rowsWithNoDate],
                  ['Unparsed', result?.unparsedDates],
                  ['Inserted', result?.inserted],
                  ['Duplicates', result?.duplicates],
                  ['Superseded', result?.superseded],
                ].map(([label, val]) => (
                  <div key={label} className="rounded border p-3 bg-white shadow-sm">
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="text-xl font-semibold">{String(val ?? 0)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2">
                <h3 className="text-sm font-medium mb-2">Detected changes</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full border">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-2 text-left border">#</th>
                        <th className="p-2 text-left border">Group Key</th>
                        <th className="p-2 text-left border">Previous ID</th>
                        <th className="p-2 text-left border">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result?.changes || []).map((c, i) => (
                        <tr key={`${c.groupKey}-${i}`} className="odd:bg-white even:bg-gray-50">
                          <td className="p-2 border">{i + 1}</td>
                          <td className="p-2 border font-mono text-xs break-all">{c.groupKey}</td>
                          <td className="p-2 border">{c.previousId ?? '-'}</td>
                          <td className="p-2 border text-sm">{c.summary}</td>
                        </tr>
                      ))}
                      {(!result?.changes || result?.changes.length === 0) && (
                        <tr>
                          <td className="p-3 text-gray-500" colSpan={4}>No changes detected.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!result && (
            <div className="text-sm text-gray-500">Select a file and click Analyze or Import.</div>
          )}
        </div>
      </AppDrawer>

      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, pb: 2 }}>
        {/* Header row: Month picker + Espiral / Santander tabs (similar to AirbnbPayoutsRecon) */}
        <div className="mb-3">
          <Stack
            direction="row"
            alignItems="center"
            spacing={3}
            sx={{ pb: 2 }}
          >
            <Box sx={{ width: 240, maxWidth: 240 }}>
              <YearMonthPicker
                label="Month"
                value={yearMonth}
                onChange={setYearMonth}
              />
            </Box>

            <Tabs
              value={view}
              onChange={(event, newValue) => setView(newValue)}
              sx={{
                minHeight: 36,
                '& .MuiTabs-indicator': { backgroundColor: '#1E6F68' },
                '& .MuiTab-root': {
                  minHeight: 36,
                  textTransform: 'uppercase',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  paddingLeft: 2,
                  paddingRight: 2,
                  fontWeight: 500,
                },
                '& .MuiTab-root.Mui-selected': {
                  color: '#1E6F68',
                  fontWeight: 700,
                },
                '& .MuiTab-root:not(:last-of-type)': {
                  position: 'relative',
                  paddingRight: 4,
                  marginRight: 2,
                },
                '& .MuiTab-root:not(:last-of-type)::after': {
                  content: '"|"',
                  position: 'absolute',
                  right: -2,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(0,0,0,0.38)',
                  fontWeight: 400,
                  pointerEvents: 'none',
                },
              }}
            >
              <Tab label="ESPIRAL" value="espiral" />
              <Tab
                value="santander"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {santanderChipLabel && (
                      <Box
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: 999,
                          bgcolor: 'rgba(30,111,104,0.08)',
                          fontSize: 11,
                          fontWeight: 500,
                          color: '#1E6F68',
                        }}
                      >
                        {santanderChipLabel}
                      </Box>
                    )}
                    <span>SANTANDER</span>
                  </Box>
                }
              />
            </Tabs>

            {/* Checked filter (applies to Espiral & Santander views) */}
            <Box sx={{ minWidth: 140 }}>
              <TextField
                select
                size="small"
                label="Status"
                value={santanderCheckedFilter}
                onChange={(e) => setSantanderCheckedFilter(e.target.value)}
                SelectProps={{
                  displayEmpty: true,
                  renderValue: (val) => {
                    if (val === 'checked') return 'Checked';
                    if (val === 'unchecked') return 'Unchecked';
                    return 'All';
                  },
                }}
                InputProps={{
                  endAdornment: santanderCheckedFilter !== 'all' ? (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSantanderCheckedFilter('all');
                      }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  ) : null,
                }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="checked">Checked</MenuItem>
                <MenuItem value="unchecked">Unchecked</MenuItem>
              </TextField>
            </Box>

            {/* Spacer to push Select CSV to the right */}
            <Box sx={{ flexGrow: 1 }} />

            {/* Right-aligned Select CSV control (mirrors AirbnbPayoutsRecon layout) */}
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 whitespace-nowrap"
              >
                Select CSV
              </button>
              <span className="text-xs text-gray-500 max-w-xs truncate">
                {file ? file.name : 'No file selected'}
              </span>
            </Stack>
          </Stack>
        </div>

        {/* Table region: takes remaining height, TableLite owns scroll just like Units page */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {/* ESPIRAL VIEW (simple list mode) */}
          {view === 'espiral' && (
            <>
              {/* Error banner (no manual filters; Espiral always shows active entries) */}
              <div className="mb-3">
                {error && (
                  <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
                    {error}
                  </div>
                )}
              </div>

              {/* Shared TableLite grid (Espiral records, simple list mode) */}
              <div>
                <TableLite
                  columns={columns}
                  rows={styledRows}
                  loading={loading}
                  sortKey={sort}
                  sortDir={dir}
                  onSortChange={(key, direction) => {
                    setSort(key);
                    setDir(direction);
                    loadTable({ sort: key, dir: direction });
                  }}
                />
              </div>
            </>
          )}

          {view === 'santander' && (
            <>
              {santanderError && (
                <div className="mb-3 p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
                  {santanderError}
                </div>
              )}
              <div>
                <TableLite
                  columns={santanderColumns}
                  rows={mappedSantanderRows}
                  loading={santanderLoading}
                  sortKey={santanderSort}
                  sortDir={santanderDir}
                  onSortChange={(key, direction) => {
                    setSantanderSort(key);
                    setSantanderDir(direction);
                    loadSantanderTable({ sort: key, dir: direction });
                  }}
                />
              </div>
            </>
          )}
        </Box>
      </Box>
      <OccWNoteModal
        open={santanderNoteModalOpen}
        note={santanderNoteDraft}
        onClose={() => setSantanderNoteModalOpen(false)}
        onSave={async (newNote) => {
          if (!santanderSelectedEntry) {
            setSantanderNoteModalOpen(false);
            return;
          }

          try {
            await api.patch(
              `/api/accounting/santander/${santanderSelectedEntry.id}`,
              {
                checked: true,
                notes: newNote || '',
              }
            );
            // Reload Santander table for the current month/view
            await loadSantanderTable();
          } catch (e) {
            // Basic error logging; could be enhanced with a toast/alert later
            // eslint-disable-next-line no-console
            console.error('Failed to update Santander entry', e);
          } finally {
            setSantanderNoteModalOpen(false);
            setSantanderSelectedEntry(null);
          }
        }}
      />
    </PageScaffold>
  );
}