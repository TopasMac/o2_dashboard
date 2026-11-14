import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';

import api from '../api';
import { BANKS } from '../constants/banks';
import PageScaffoldTable from '../components/layout/PageScaffoldTable';
import TableLite from '../components/layout/TableLite';

const AREA_OPTIONS = [
  { value: 'Playa', label: 'Playa del Carmen' },
  { value: 'Tulum', label: 'Tulum' },
  { value: 'Both', label: 'Both' },
];

const OCCUPATION_OPTIONS = [
  'Handyman',
  'Housekeeper',
  'Plumber',
  'Electrician',
  'AC Technician',
  'Painter',
  'Pest Control',
  'Appliance Repair',
  'Carpenter',
  'Locksmith',
  'Internet / TV',
  'Other',
];

const ENDPOINT = '/api/service-providers';
const BANK_OPTIONS = [...BANKS].sort();
const DEFAULT_FORM = {
  name: '',
  occupation: 'Handyman',
  area: 'Both',
  phone: '',
  whatsapp: '',
  email: '',
  notes: '',
  bankName: '',
  accountHolder: '',
  bankType: '',
  bankNumber: '',
};

function errorMessage(error, fallback) {
  return error?.response?.data?.error || fallback;
}

function optionsWithCurrent(options, current) {
  return current && !options.includes(current) ? [...options, current] : options;
}

export default function ServiceProviders() {
  const [city, setCity] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const listRequest = useRef(0);
  const [copying, setCopying] = useState(false);
  const [copyNotice, setCopyNotice] = useState(null);

  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankEdited, setBankEdited] = useState(false);

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setError('');
    try {
      const params = { city: city || undefined, includeInactive: includeInactive ? '1' : undefined };
      const { data } = await api.get(ENDPOINT, { params });
      if (data?.ok !== true || !Array.isArray(data.providers)) {
        throw new Error('Unexpected directory response');
      }
      if (request === listRequest.current) setRows(data.providers);
    } catch (e) {
      if (request !== listRequest.current) return;
      setRows([]);
      setError(errorMessage(e, 'Could not load service providers. Try refreshing.'));
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [city, includeInactive]);

  useEffect(() => {
    load();
    return () => { listRequest.current += 1; };
  }, [load]);

  const resetBankSection = () => {
    setBankOpen(false);
    setBankEdited(false);
  };

  const openCreate = () => {
    resetBankSection();
    setForm({ ...DEFAULT_FORM, area: city || 'Both' });
    setDialogError('');
    setDialog({ type: 'create' });
  };

  const openEdit = async (row) => {
    resetBankSection();
    setDialogError('');
    setBusy(true);
    setDialog({ type: 'edit', row });
    setForm(null);
    try {
      const { data } = await api.get(`${ENDPOINT}/${row.id}`);
      const provider = data?.provider;
      if (data?.ok !== true || provider?.id !== row.id) throw new Error('Unexpected provider response');
      setForm({
        name: provider.name,
        occupation: provider.occupation,
        area: provider.area,
        phone: provider.phone ?? '',
        whatsapp: provider.whatsapp ?? '',
        email: provider.email ?? '',
        notes: provider.notes ?? '',
        bankName: provider.bank_name ?? '',
        accountHolder: provider.account_holder ?? '',
        bankType: provider.account_number ? 'Card' : provider.clabe ? 'CLABE' : '',
        bankNumber: provider.account_number || provider.clabe || '',
      });
    } catch (e) {
      setDialogError(errorMessage(e, 'Could not load this provider.'));
    } finally {
      setBusy(false);
    }
  };

  const openDeactivate = (row) => {
    setDialogError('');
    setDialog({ type: 'deactivate', row });
  };

  const copyBankDetails = async (row) => {
    setCopying(true);
    setCopyNotice(null);
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard) throw new Error('Clipboard unavailable');

      const text = api.get(`${ENDPOINT}/${row.id}`).then(({ data }) => {
        const provider = data?.provider;
        if (data?.ok !== true || provider?.id !== row.id) throw new Error('Unexpected provider response');

        const digits = (provider.account_number || provider.clabe || '').replace(/\D/g, '');
        const account = digits.match(/.{1,4}/g)?.join(' ') ?? '';
        return [
          `Nombre: ${provider.account_holder ?? ''}`,
          `Banco: ${provider.bank_name ?? ''}`,
          `${provider.account_number ? 'Tarjeta' : 'CLABE'}: ${account}`,
        ].join('\n');
      });

      if (clipboard.write && typeof window.ClipboardItem === 'function') {
        // Start the write during the click, while the provider details are loading.
        const content = text.then((value) => new Blob([value], { type: 'text/plain' }));
        // The browser may reject the write before it reads the content promise.
        content.catch(() => {});
        const item = new window.ClipboardItem({ 'text/plain': content });
        await clipboard.write([item]);
      } else {
        await clipboard.writeText(await text);
      }
      setCopyNotice({ severity: 'success', message: 'Bank details copied.' });
    } catch {
      setCopyNotice({ severity: 'error', message: 'Could not copy bank details.' });
    } finally {
      setCopying(false);
    }
  };

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setForm(DEFAULT_FORM);
  };

  const save = async (event) => {
    event.preventDefault();
    let changes = { isActive: false };
    if (dialog.type !== 'deactivate') {
      const { bankName, accountHolder, bankType, bankNumber, ...providerFields } = form;
      changes = providerFields;
      if (bankOpen || bankEdited) {
        const number = bankNumber.trim().replace(/[\s-]/g, '');
        if (!bankName.trim() || !accountHolder.trim() || !bankType || !/^\d+$/.test(number)) {
          setBankOpen(true);
          setDialogError('Enter an account holder, bank, type, and number using digits.');
          return;
        }
        if (bankEdited) changes = { ...changes, bankName, accountHolder, bankType, bankNumber: number };
      }
    }
    setBusy(true);
    setDialogError('');
    try {
      const response = dialog.type === 'create'
        ? await api.post(ENDPOINT, changes)
        : await api.patch(`${ENDPOINT}/${dialog.row.id}`, changes);
      if (response.data?.ok !== true) throw new Error('Unexpected save response');
      setDialog(null);
      setForm(DEFAULT_FORM);
      await load();
    } catch (e) {
      setDialogError(errorMessage(e, 'Could not save the provider.'));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      accessor: 'name',
      header: 'Provider',
      width: 220,
      filter: { type: 'text', inline: true, placeholder: 'Provider' },
      cell: (row) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'start', lineHeight: 1.25 }}>
          <Box
            component="button"
            type="button"
            aria-label={`Edit ${row.name}`}
            onClick={() => openEdit(row)}
            sx={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--o2-teal, #0d9488)',
              border: 0,
              background: 'none',
              p: 0,
              '&:hover': { color: 'var(--o2-orange, #f97316)', textDecoration: 'underline' },
            }}
          >
            {row.name}
          </Box>
          <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
            {AREA_OPTIONS.find(({ value }) => value === row.area)?.label ?? row.area}
          </Box>
        </Box>
      ),
    },
    {
      accessor: 'occupation',
      header: 'Occupation',
      width: 170,
      filter: { type: 'select', inline: true },
    },
    { accessor: 'whatsapp', header: 'WhatsApp', width: 150 },
    {
      accessor: 'account_holder',
      header: 'Bank Details',
      width: 240,
      render: (holder, row) => {
        const accountSuffix = row.account_number_last_four ? `*...${row.account_number_last_four}` : '';
        const bankLine = [row.bank_name, accountSuffix].filter(Boolean).join(' · ');

        if (!holder && !bankLine) return '—';

        return (
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              {holder && <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{holder}</Box>}
              {bankLine && (
                <Box sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {bankLine}
                </Box>
              )}
            </Box>
            <IconButton
              size="small"
              title="Copy bank details"
              aria-label={`Copy bank details for ${row.name}`}
              disabled={copying}
              onClick={() => copyBankDetails(row)}
            >
              <ContentCopyRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        );
      },
    },
    { accessor: 'notes', header: 'Notes', width: 240 },
    { accessor: 'created_at', header: 'Date Started', width: 145, format: 'date' },
    { accessor: 'is_active', header: 'Active', width: 90, render: (active) => active ? 'Yes' : 'No' },
  ];

  const clearFilters = () => {
    setFilterValues({});
    setCity('');
    setIncludeInactive(false);
  };

  const field = (name) => ({
    value: form[name],
    onChange: (event) => setForm({ ...form, [name]: event.target.value }),
  });
  const bankField = (name) => ({
    value: form[name],
    onChange: (event) => {
      const value = event.target.value;
      setBankEdited(true);
      setForm((current) => ({
        ...current,
        [name]: value,
        ...(name === 'bankType' && current.bankType !== value ? { bankNumber: '' } : {}),
      }));
    },
  });
  const deactivating = dialog?.type === 'deactivate';

  return (
    <PageScaffoldTable
      title="Service Providers"
      sectionKey="management"
      currentPath="/service-providers"
      stickyHeader={
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="contained" onClick={openCreate} sx={{ minWidth: 136, flexShrink: 0 }}>
            + Add Provider
          </Button>
          <Button variant="outlined" onClick={clearFilters} sx={{ minWidth: 122, flexShrink: 0 }}>
            Clear Filters
          </Button>
          <FormControl size="small" sx={{ width: 160, flex: '0 0 160px' }}>
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
      <Box sx={{ flex: 1, minHeight: 0, mt: 2 }}>
        <TableLite
          loading={loading}
          error={error}
          columns={columns}
          rows={rows}
          enableFilters
          filterValues={filterValues}
          onFilterChange={(key, value) => setFilterValues((filters) => ({ ...filters, [key]: value }))}
          defaultStringTransform={null}
          emptyText="No service providers match the current filters."
        />
      </Box>

      <Snackbar open={Boolean(copyNotice)} autoHideDuration={3000} onClose={() => setCopyNotice(null)}>
        <Alert severity={copyNotice?.severity}>{copyNotice?.message}</Alert>
      </Snackbar>

      <Dialog open={Boolean(dialog)} onClose={closeDialog} fullWidth maxWidth="sm">
        <form onSubmit={save} noValidate>
          <DialogTitle>
            {deactivating ? 'Deactivate Service Provider' : dialog?.type === 'edit' ? 'Edit Service Provider' : 'Add Service Provider'}
          </DialogTitle>
          <DialogContent>
            {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
            {deactivating ? (
              <p>{dialog.row.name} will remain available through Include inactive.</p>
            ) : form ? (
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField label="Name" {...field('name')} required slotProps={{ htmlInput: { maxLength: 120 } }} />

                <TextField select label="Occupation" {...field('occupation')}>
                  {[...optionsWithCurrent(OCCUPATION_OPTIONS, form.occupation)]
                    .sort((a, b) => a.localeCompare(b, 'en'))
                    .map((value) => (
                    <MenuItem key={value} value={value}>{value}</MenuItem>
                  ))}
                </TextField>

                <TextField select label="Area" {...field('area')}>
                  {AREA_OPTIONS.map(({ value, label }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="WhatsApp" {...field('whatsapp')} fullWidth slotProps={{ htmlInput: { maxLength: 30 } }} />
                  <TextField label="Phone" {...field('phone')} fullWidth slotProps={{ htmlInput: { maxLength: 30 } }} />
                </Stack>
                <TextField label="Email" {...field('email')} slotProps={{ htmlInput: { maxLength: 120 } }} />
                <Divider />
                <Box>
                  <Button
                    type="button"
                    aria-expanded={bankOpen}
                    aria-controls="provider-bank-details"
                    endIcon={<ExpandMoreRoundedIcon sx={{ transform: bankOpen ? 'rotate(180deg)' : undefined }} />}
                    onClick={() => setBankOpen((open) => !open)}
                  >
                    Bank Details
                  </Button>
                  <Collapse in={bankOpen} id="provider-bank-details">
                    <Stack spacing={2} sx={{ pt: 1 }}>
                      <TextField required label="Account holder" {...bankField('accountHolder')} slotProps={{ htmlInput: { maxLength: 120 } }} />
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField required select label="Bank" {...bankField('bankName')} fullWidth>
                          {optionsWithCurrent(BANK_OPTIONS, form.bankName).map((bank) => (
                            <MenuItem key={bank} value={bank}>{bank}</MenuItem>
                          ))}
                        </TextField>
                        <TextField required select label="Type" {...bankField('bankType')} fullWidth>
                          <MenuItem value="Card">Card</MenuItem>
                          <MenuItem value="CLABE">CLABE</MenuItem>
                        </TextField>
                      </Stack>
                      <TextField
                        required
                        label="Number"
                        {...bankField('bankNumber')}
                        disabled={!form.bankType}
                        slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: form.bankType === 'CLABE' ? 25 : 30 } }}
                      />
                    </Stack>
                  </Collapse>
                </Box>
                <TextField label="Notes" {...field('notes')} multiline minRows={3} />
              </Stack>
            ) : busy ? <p>Loading provider…</p> : null}
          </DialogContent>
          <DialogActions>
            {dialog?.type === 'edit' && dialog.row.is_active && form && (
              <Button
                color="error"
                onClick={() => openDeactivate(dialog.row)}
                disabled={busy}
                sx={{ mr: 'auto' }}
              >
                Deactivate
              </Button>
            )}
            <Button onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="contained" color={deactivating ? 'error' : 'primary'} disabled={busy || (!deactivating && !form?.name.trim())}>
              {deactivating ? 'Deactivate' : dialog?.type === 'edit' ? 'Save' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </PageScaffoldTable>
  );
}
