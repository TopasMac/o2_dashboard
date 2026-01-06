import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import FormDrawer from '../components/common/FormDrawer';
import EditClientForm from '../components/forms/EditClientForm';
import ClientForm from '../components/forms/ClientForm';
import TableLite from '../components/layout/TableLite';
import PageScaffold from '../components/layout/PageScaffold';
import { Button, Stack, Link as MuiLink, Box } from '@mui/material';

const formatDate = (value) => {
  if (!value) return '';
  const datePart = String(value).split('T')[0];
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
};

const formatLanguage = (value) => {
  if (!value) return '';
  const v = String(value).toLowerCase();
  if (v === 'es') return 'Esp';
  if (v === 'en') return 'Eng';
  return value;
};

const INITIAL_FILTERS = {
  clientCode: '',
  name: '',
  language: '',
  dob: '',
  phone: '',
  email: '',
  bankName: '',
  bankOwner: '',
  bankAccount: '',
  comments: '',
  startingDate: '',
};

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [filterValues, setFilterValues] = useState(() => ({ ...INITIAL_FILTERS }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClients = () => {
    setLoading(true);
    setError(null);
    api
      .get('/api/clients')
      .then((response) => {
        const d = response.data;
        const list = Array.isArray(d?.['hydra:member'])
          ? d['hydra:member']
          : Array.isArray(d?.member)
          ? d.member
          : Array.isArray(d?.items)
          ? d.items
          : Array.isArray(d)
          ? d
          : [];
        const sorted = [...list].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
        setClients(sorted);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching clients:', err);
        setError('Failed to load clients');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedClientId(null);
    fetchClients(); // refresh table
  };

  const handleClearFilters = () => {
    setFilterValues({ ...INITIAL_FILTERS });
  };

  const languageOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        (clients || [])
          .map((c) => c.language)
          .filter((lang) => lang !== null && lang !== undefined && lang !== '')
      )
    );
    return values
      .map((val) => ({
        value: val,
        label: formatLanguage(val),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [clients]);

  const columns = useMemo(
    () => [
      {
        header: 'Name',
        accessor: 'name',
        width: 220,
        filter: { type: 'text', inline: true },
        render: (value, row) => {
          const lang = formatLanguage(row.language);
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600 }}>{value || '—'}</span>
              <MuiLink
                component="button"
                type="button"
                sx={{
                  fontSize: 12,
                  color: '#0f766e',
                  '&:hover': { color: 'orange' },
                  textDecoration: 'none',
                  textAlign: 'left',
                  alignSelf: 'flex-start',
                }}
                onClick={() => {
                  setSelectedClientId(row.id);
                  setDrawerOpen(true);
                }}
              >
                {row.clientCode || '—'}
                {lang ? ` • ${lang}` : ''}
              </MuiLink>
            </Box>
          );
        },
      },
      {
        header: 'DOB',
        accessor: 'dob',
        width: 140,
        format: formatDate,
        filter: { type: 'text', inline: true, placeholder: 'YYYY-MM-DD' },
      },
      {
        header: 'Contacts',
        accessor: 'phone',
        width: 220,
        filter: { type: 'text', inline: true, placeholder: 'Phone / Email' },
        render: (_value, row) => (
          <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span>{row.phone || '—'}</span>
            {row.email && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>{row.email}</span>
            )}
          </Box>
        ),
      },
      {
        header: 'Bank Info',
        accessor: 'bankName',
        width: 240,
        filter: { type: 'text', inline: true, placeholder: 'Bank / Owner / Account' },
        render: (_value, row) => {
          const acctRaw = row.bankAccount || '';
          const masked = (() => {
            if (!acctRaw) return '';
            const digits = String(acctRaw).replace(/\s+/g, '');
            if (!digits) return '';
            const tail = digits.slice(-3);
            return `*...${tail}`;
          })();
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600 }}>{row.bankName || '—'}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {row.bankOwner || '—'}
                {masked ? ` • ${masked}` : ''}
              </span>
            </Box>
          );
        },
      },
      { header: 'Comments', accessor: 'comments', width: 220, filter: { type: 'text', inline: true } },
      {
        header: 'Starting Date',
        accessor: 'startingDate',
        width: 140,
        format: formatDate,
        filter: { type: 'text', inline: true, placeholder: 'YYYY-MM-DD' },
      },
    ],
    [languageOptions]
  );

  const stickyHeader = (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button
        variant="contained"
        onClick={() => {
          setSelectedClientId(null);
          setDrawerOpen(true);
        }}
      >
        + New Client
      </Button>
      <Button variant="outlined" onClick={handleClearFilters}>
        Clear Filters
      </Button>
    </Stack>
  );

  return (
    <PageScaffold
      title="Clients"
      sectionKey="management"
      currentPath="/clients"
      layout="table"
      stickyHeader={stickyHeader}
    >
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TableLite
          columns={columns}
          rows={clients}
          loading={loading}
          error={error}
          enableFilters
          filterValues={filterValues}
          onFilterChange={(key, value) => {
            setFilterValues((prev) => ({
              ...prev,
              [key]: value || '',
            }));
          }}
          optionsSourceRows={clients}
          defaultStringTransform={null}
        />
      </Box>
      <FormDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        title={selectedClientId ? 'Edit Client' : 'New Client'}
        width={600}
      >
        {selectedClientId
          ? <EditClientForm clientId={selectedClientId} onClose={handleDrawerClose} />
          : <ClientForm onClose={handleDrawerClose} />}
      </FormDrawer>
    </PageScaffold>
  );
};

export default Clients;
