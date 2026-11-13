import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';

import api from '../api';
import PageScaffoldTable from '../components/layout/PageScaffoldTable';
import TableLite from '../components/layout/TableLite';
import TableLiteTwoLineCell from '../components/layout/TableLiteTwoLineCell';
import YearMonthPicker from '../components/layout/components/YearMonthPicker';

const PATH = '/service-jobs';
const ENDPOINT = '/api/service-jobs';
const monthFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Cancun', year: 'numeric', month: '2-digit',
});
const STATUSES = { pending: 'Pending', done: 'Done', cancelled: 'Cancelled' };
const STATUS_COLORS = { pending: '#D4A017', done: '#1E6F68', cancelled: '#C62828' };
const BILL_TO = { CLIENT: 'Client', OWNERS2: 'Owners2' };
const EMPTY_FORM = {
  scheduledDate: '',
  unitId: '',
  categoryId: '',
  description: '',
  providerId: '',
  status: 'pending',
  bill_to: 'CLIENT',
  notes: '',
};

export default function ServiceJobs() {
  const [month, setMonth] = useState(() => monthFormatter.format(new Date()));
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    let current = true;
    Promise.all([
      api.get(ENDPOINT),
      api.get(ENDPOINT + '/options'),
      api.get('/api/service-providers'),
    ]).then(([list, options, directory]) => {
      const { jobs } = list.data;
      const { units, categories } = options.data;
      const { providers } = directory.data;
      if (![jobs, units, categories, providers].every(Array.isArray)) {
        throw new Error('Unexpected service jobs response.');
      }
      if (current) setData({ jobs, units, categories, providers });
    }).catch(() => {
      if (current) setLoadError('Could not load service jobs.');
    });
    return () => { current = false; };
  }, [loadAttempt]);

  function open(job) {
    setSaveError('');
    setForm(job ? {
      id: job.id,
      scheduledDate: job.scheduledDate,
      unitId: job.unit.id,
      categoryId: job.category.id,
      description: job.description,
      providerId: job.provider?.id ?? '',
      status: job.status,
      bill_to: job.bill_to,
      notes: job.notes ?? '',
    } : EMPTY_FORM);
  }

  function applySavedJob(response) {
    const job = response.data?.job;
    if (!job?.id) throw new Error('Unexpected save response.');
    setData((previous) => ({
      ...previous,
      jobs: [...previous.jobs.filter((row) => row.id !== job.id), job].sort((a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) || a.id - b.id
      ),
    }));
  }

  async function updateStatus(job, nextStatus) {
    if (updatingStatusId !== null || job.status === nextStatus) return;

    setUpdatingStatusId(job.id);
    setStatusError('');
    try {
      const response = await api.patch(ENDPOINT + '/' + job.id, { status: nextStatus });
      applySavedJob(response);
    } catch (error) {
      setStatusError(error.response?.data?.error || 'Could not update the service job status.');
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError('');
    const { id, ...fields } = form;
    const payload = { ...fields, providerId: fields.providerId || null };
    try {
      const response = id
        ? await api.patch(ENDPOINT + '/' + id, payload)
        : await api.post(ENDPOINT, payload);
      applySavedJob(response);
      setForm(null);
    } catch (error) {
      setSaveError(error.response?.data?.error || 'Could not save the service job.');
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      accessor: 'scheduledDate', header: 'Date', width: 140,
      cellStyle: { py: 1, px: 1.5 },
      render: (date, job) => (
        <TableLiteTwoLineCell
          main={date.split('-').reverse().join('-')}
          sub={`HKSJ${String(job.id).padStart(5, '0')}`}
          subTitle="Edit service job"
          onSubClick={updatingStatusId === job.id ? undefined : () => open(job)}
        />
      ),
    },
    {
      accessor: 'unit', header: 'Unit', width: 170,
      render: (unit) => unit.name,
      filter: { type: 'autocomplete', inline: true, placeholder: 'Unit', valueAccessor: (row) => row.unit.name },
    },
    {
      accessor: 'category', header: 'Description', width: 250,
      cellStyle: { py: 1, px: 1.5 },
      render: (category, job) => ({
        primary: job.description,
        meta: `${category.name} * ${BILL_TO[job.bill_to]}`,
      }),
      filter: { type: 'select', inline: true, placeholder: 'Description', valueAccessor: (row) => row.category.name },
    },
    { accessor: 'notes', header: 'Notes', width: 240 },
    {
      accessor: 'provider', header: 'Provider', width: 210,
      render: (provider) => provider?.name ?? 'Unassigned',
      filter: {
        type: 'autocomplete', inline: true, placeholder: 'Provider',
        valueAccessor: (row) => row.provider?.name ?? 'Unassigned',
      },
    },
    {
      accessor: 'status', header: 'Status', width: 140,
      render: (status, job) => (
        <Select
          variant="standard"
          size="small"
          fullWidth
          disableUnderline
          value={status}
          disabled={updatingStatusId !== null}
          onChange={(event) => updateStatus(job, event.target.value)}
          inputProps={{ 'aria-label': `Status for HKSJ${String(job.id).padStart(5, '0')}` }}
          sx={{ color: STATUS_COLORS[status] }}
        >
          {Object.entries(STATUSES).map(([value, label]) => (
            <MenuItem key={value} value={value} sx={{ color: STATUS_COLORS[value] }}>{label}</MenuItem>
          ))}
        </Select>
      ),
    },
  ];

  const visibleJobs = (data?.jobs ?? []).filter((job) =>
    (!month || job.scheduledDate.startsWith(month)) && (!status || job.status === status)
  );
  const selectedJob = data?.jobs.find((job) => job.id === form?.id);
  const activeUnits = data?.units ?? [];
  const existingUnit = selectedJob?.unit;
  const units = existingUnit && !activeUnits.some(({ id }) => id === existingUnit.id)
    ? [...activeUnits, { ...existingUnit, inactive: true }]
    : activeUnits;
  const activeProviders = data?.providers ?? [];
  const existingProvider = selectedJob?.provider;
  const providers = existingProvider && !activeProviders.some(({ id }) => id === existingProvider.id)
    ? [...activeProviders, { ...existingProvider, inactive: true }]
    : activeProviders;
  const categories = data?.categories ?? [];
  const field = (name) => ({
    value: form[name],
    onChange: (event) => {
      const value = event.target.value;
      setForm((previous) => ({ ...previous, [name]: value }));
    },
  });

  return (
    <PageScaffoldTable
      title="Service Jobs"
      sectionKey="housekeepers"
      currentPath={PATH}
      stickyHeader={
        <Stack direction="row" spacing={2} alignItems="center">
          <YearMonthPicker value={month} onChange={setMonth} sx={{ width: 240 }} />
          <TextField
            label="Status" select size="small" value={status}
            onChange={(event) => setStatus(event.target.value)}
            sx={{ width: 150 }}
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
          >
            <MenuItem value="">All</MenuItem>
            {Object.entries(STATUSES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={!data} onClick={() => open()}>
            + Add Service
          </Button>
          {loadError && (
            <Button onClick={() => {
              setLoadError('');
              setLoadAttempt((attempt) => attempt + 1);
            }}>Retry</Button>
          )}
        </Stack>
      }
    >
      {statusError && <Alert severity="error" onClose={() => setStatusError('')}>{statusError}</Alert>}
      <Box sx={{ flex: 1, minHeight: 0, mt: 2 }}>
        <TableLite
          columns={columns}
          rows={visibleJobs}
          height="100%"
          enableFilters
          loading={!data && !loadError}
          error={loadError}
          defaultStringTransform={null}
          emptyText={data?.jobs.length ? "No service jobs match the filters." : "No service jobs scheduled."}
        />
      </Box>

      <Dialog open={Boolean(form)} onClose={saving ? undefined : () => setForm(null)} fullWidth maxWidth="sm">
        {form && (
          <form onSubmit={save}>
            <DialogTitle sx={{ overflowWrap: 'anywhere' }}>
              {selectedJob
                ? `Edit Service Job . ${selectedJob.unit.name} * ${selectedJob.description}`
                : 'Add Service Job'}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                {saveError && <Alert severity="error">{saveError}</Alert>}
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: form.id ? 'repeat(2, minmax(0, 1fr))' : '1fr' } }}>
                  <TextField
                    label="Scheduled Date" type="date" required
                    slotProps={{ inputLabel: { shrink: true } }}
                    {...field('scheduledDate')}
                  />
                  {form.id && (
                    <TextField label="Status" select {...field('status')}>
                      {Object.entries(STATUSES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                    </TextField>
                  )}
                </Box>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: form.id ? 'repeat(2, minmax(0, 1fr))' : '1fr' } }}>
                  <Autocomplete
                    options={units}
                    value={units.find(({ id }) => id === form.unitId) ?? null}
                    getOptionLabel={(unit) => unit.name}
                    getOptionDisabled={(unit) => Boolean(unit.inactive)}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    onChange={(_, unit) => setForm((previous) => ({ ...previous, unitId: unit?.id ?? '' }))}
                    renderInput={(params) => <TextField {...params} label="Unit" required />}
                  />
                  <TextField label="Bill To" select required {...field('bill_to')}>
                    {Object.entries(BILL_TO).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                  </TextField>
                </Box>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: form.id ? 'repeat(2, minmax(0, 1fr))' : '1fr' } }}>
                  <TextField label="Category" select required {...field('categoryId')}>
                    {selectedJob && !categories.some(({ id }) => id === selectedJob.category.id) && (
                      <MenuItem value={selectedJob.category.id}>{selectedJob.category.name}</MenuItem>
                    )}
                    {categories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
                  </TextField>
                  <Autocomplete
                    options={providers}
                    value={providers.find(({ id }) => id === form.providerId) ?? null}
                    getOptionLabel={(provider) => provider.inactive ? provider.name + ' (inactive)' : provider.name}
                    getOptionDisabled={(provider) => Boolean(provider.inactive)}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    onChange={(_, provider) => setForm((previous) => ({ ...previous, providerId: provider?.id ?? '' }))}
                    renderInput={(params) => <TextField {...params} label="Assigned Provider" />}
                  />
                </Box>
                <TextField label="Description" required slotProps={{ htmlInput: { maxLength: 255 } }} {...field('description')} />
                <TextField label="Notes" multiline minRows={2} {...field('notes')} />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={saving} onClick={() => setForm(null)}>Close</Button>
              <Button type="submit" variant="contained" disabled={saving}>Save</Button>
            </DialogActions>
          </form>
        )}
      </Dialog>
    </PageScaffoldTable>
  );
}
